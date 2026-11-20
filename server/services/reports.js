import { recordFreshness } from './reportFreshness.js';
import pool from '../config/db.js';
import { fetchCollection, requestYclients } from './yclientsApi.js';

const running = new Map();
export async function cachedReport(key, load, ttl = 900000) {
    if (running.has(key)) {
        const result = await running.get(key);
        recordFreshness(result.updatedAt, result.cached);
        return result.data;
    }
    const promise = (async () => {
        const { rows } = await pool.query('SELECT data,updated_at FROM yclients_report_cache WHERE cache_key=$1', [key]);
        if (rows[0] && Date.now()-new Date(rows[0].updated_at).getTime()<ttl) return { data: rows[0].data, updatedAt: rows[0].updated_at, cached: true };
        const data = await load();
        await pool.query(`INSERT INTO yclients_report_cache(cache_key,data) VALUES($1,$2)
            ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`, [key,JSON.stringify(data)]);
        return { data, updatedAt: new Date(), cached: false };
    })();
    running.set(key,promise);
    try { const result = await promise; recordFreshness(result.updatedAt, result.cached); return result.data; } finally { running.delete(key); }
}
export function validatePeriod(start,end) {
    const valid = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
    if (!valid(start)||!valid(end)||start>end||Date.parse(end)-Date.parse(start)>366*86400000) throw Object.assign(new Error('Выберите корректный период не более года'),{status:400});
}
export async function branchData(branch,start,end,{includeSchedule=true,includeGoods=true,staffIds=[]}={}) {
    const company=branch.yclientsCompanyId;
    const records=[];
    for (const staffId of staffIds.length ? [...new Set(staffIds)] : [null]) {
        records.push(...await cachedReport(`records:${company}:${start}:${end}${staffId ? `:staff:${staffId}` : ''}`, () =>
            fetchCollection(page => requestYclients(`/records/${company}?start_date=${start}&end_date=${end}&page=${page}&count=200${staffId ? `&staff_id=${staffId}` : ''}`))));
    }
    const goods=includeGoods?await cachedReport(`goods:${company}:${start}:${end}`,()=>fetchCollection(page=>requestYclients(`/storages/transactions/${company}?start_date=${start}&end_date=${end}&page=${page}&count=100`))):[];
    if (!includeSchedule) return {branch,records,goods};
    const schedule=await cachedReport(`schedule:${company}:${start}:${end}`,async()=>{
        const items=[];
        for(let cursor=new Date(start+'T00:00:00Z');cursor<=new Date(end+'T00:00:00Z');cursor=new Date(cursor.getTime()+31*86400000)) {
            const finish=new Date(Math.min(cursor.getTime()+30*86400000,Date.parse(end))).toISOString().slice(0,10);
            items.push(...(await requestYclients(`/company/${company}/staff/schedule?start_date=${cursor.toISOString().slice(0,10)}&end_date=${finish}`)).data);
        }
        return items;
    });
    const companyInfo=await cachedReport(`company:${company}`,async()=>{
        const data=(await requestYclients(`/company/${company}`,undefined,'object')).data;
        return {schedule:data.schedule};
    },86400000);
    const starts=[...String(companyInfo.schedule||'').matchAll(/(\d{1,2}:\d{2})\s*[-–]\s*\d{1,2}:\d{2}/g)].map(m=>m[1].padStart(5,'0'));
    return {branch,records,goods,schedule,openingTime:starts.length===1?starts[0]:null};
}
export function serviceAmount(record) {
    return (record.services||[]).reduce((sum,item)=>sum+Number(item.cost_to_pay??item.cost??0),0);
}
export function isVisit(record) { return !Number(record.deleted) && Number(record.attendance)===1; }
export function sales(goods) { return goods.filter(item=>Number(item.type_id)===1&&!Number(item.deleted)&&!Number(item.loyalty_abonement_id)&&!Number(item.loyalty_certificate_id)); }
export function summarizeEmployee(datasets,links) {
    let products=0,units=0;const days=[];const records=[];
    for(const data of datasets) {
        const ids=new Set(links.filter(link=>String(link.branch_id)===String(data.branch.id)).map(link=>String(link.yclients_staff_id)));
        const selected=data.records.filter(item=>ids.has(String(item.staff_id)));
        records.push(...selected.map(item=>({...item,branchId:data.branch.id})));
        const byDate=new Map();
        const opening=new Map();
        for(const day of data.schedule)for(const slot of day.slots||[]) opening.set(day.date,[opening.get(day.date)||'99:99',slot.from].sort()[0]);
        for(const day of data.schedule.filter(item=>ids.has(String(item.staff_id)))) {
            const slots=day.slots||[];if(!slots.length)continue;
            const minutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
            const hours=slots.reduce((sum,slot)=>sum+Math.max(0,minutes(slot.to)-minutes(slot.from))/60,0);
            const from=slots.map(s=>s.from).sort()[0];const to=slots.map(s=>s.to).sort().at(-1);
            const id=`${data.branch.id}:${day.staff_id}:${day.date}`;
            byDate.set(day.date,{id,date:day.date,hours,from,to,services:0,cleaning:from<=(data.openingTime||opening.get(day.date)),branchName:data.branch.name});
        }
        for(const record of selected.filter(isVisit)) {
            const date=(record.date||record.datetime).slice(0,10);
            const day=byDate.get(date)||{id:`${data.branch.id}:${date}`,date,hours:0,services:0,cleaning:false,branchName:data.branch.name};
            day.services+=serviceAmount(record);byDate.set(date,day);
        }
        days.push(...byDate.values());
        for(const item of sales(data.goods).filter(item=>ids.has(String(item.master?.id??item.master_id)))) {
            const sign=Number(item.amount)>0?-1:1;
            products+=sign*Math.abs(Number(item.cost||0));units+=sign*Math.abs(Number(item.amount||0));
        }
    }
    return {days:days.sort((a,b)=>a.date.localeCompare(b.date)),products,units,records,hours:days.reduce((sum,d)=>sum+d.hours,0),services:days.reduce((sum,d)=>sum+d.services,0)};
}
