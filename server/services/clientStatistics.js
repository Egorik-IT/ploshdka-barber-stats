import { isVisit } from './reports.js';

function identity(record) {
    return String(record.client?.phone || '').replace(/\D/g, '') || `${record.branchId}:${record.client?.id}`;
}
function visitDate(record) {
    return (record.date || record.datetime || '').slice(0,10);
}
function shiftMonths(date, months) {
    const shifted=new Date(`${date}T00:00:00Z`);
    const day=shifted.getUTCDate();
    shifted.setUTCDate(1);
    shifted.setUTCMonth(shifted.getUTCMonth()+months);
    const monthEnd=new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth()+1,0)).getUTCDate();
    shifted.setUTCDate(Math.min(day,monthEnd));
    return shifted.toISOString().slice(0,10);
}

export function summarizeClients(history, periodRecords, links, start, end, activeMonths) {
    const staff=new Set(links.map(link=>`${link.branch_id}:${link.yclients_staff_id}`));
    const belongsToEmployee=record=>staff.has(`${record.branchId}:${record.staff_id}`);
    const current=periodRecords.filter(record=>belongsToEmployee(record)&&visitDate(record)>=start&&visitDate(record)<=end);
    // The period response is fresher than the daily history cache and replaces its dates.
    const records=[...history.filter(record=>visitDate(record)<start),...periodRecords.filter(record=>visitDate(record)>=start&&visitDate(record)<=end)];
    const clients=new Map();
    for(const record of records) {
        if(!isVisit(record)||!record.client?.id||!visitDate(record))continue;
        const id=identity(record);
        if(!clients.has(id))clients.set(id,[]);
        clients.get(id).push(record);
    }
    const atStart=shiftMonths(start,-activeMonths);
    const atEnd=shiftMonths(end,-activeMonths);
    const result={regular:0,lost:0,new:0,noShows:0,regularVisited:0,returned:0};
    const lastTwoAreOwn = visits => visits.length >= 2 && visits.slice(-2).every(belongsToEmployee);
    const regularAt = (visits, cutoff) => lastTwoAreOwn(visits) && visitDate(visits.at(-2)) > cutoff;
    for(const visits of clients.values()) {
        visits.sort((a,b)=>(a.date || a.datetime).localeCompare(b.date || b.datetime) || String(a.id || '').localeCompare(String(b.id || ''), undefined, {numeric:true}));
        if(lastTwoAreOwn(visits) && visitDate(visits.at(-1))<=atEnd)result.lost++;
        else if(regularAt(visits,atEnd))result.regular++;
        const dates=visits.filter(belongsToEmployee).map(visitDate);
        const before=dates.filter(date=>date<start);
        const during=dates.filter(date=>date>=start);
        if(!during.length)continue;
        if(!before.length)result.new++;
        if(regularAt(visits.filter(record=>visitDate(record)<start),atStart))result.regularVisited++;
        const returned=dates.some((date,index)=>index>0&&date>=start&&date>=shiftMonths(dates[index-1],activeMonths));
        if(returned)result.returned++;
    }
    result.noShows=current.filter(record=>!Number(record.deleted)&&Number(record.attendance)===-1).length;
    return result;
}
