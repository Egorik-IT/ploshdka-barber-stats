import { isVisit, serviceAmount, sales } from './reports.js';
import { staffCategory, calculationCategories } from '../../shared/calculationSettings.js';

export function dayOverview(datasets, staffCache, ownLinks = null) {
    const groups = [], branches = [];
    for (const data of datasets) {
        const branchId = String(data.branch.id);
        const permitted = ownLinks ? new Set(ownLinks.filter(link=>String(link.branch_id)===branchId).map(link=>String(link.yclients_staff_id))) : null;
        const records = data.records.filter(record=>!Number(record.deleted)&&(!permitted||permitted.has(String(record.staff_id))));
        const scheduled = data.schedule.filter(day=>day.slots?.length);
        const ids = new Set([...scheduled.map(day=>String(day.staff_id)),...records.map(record=>String(record.staff_id))]);
        for (const staffId of ids) {
            if (permitted&&!permitted.has(staffId)) continue;
            const cached = staffCache.find(staff=>String(staff.branch_id)===branchId&&String(staff.yclients_staff_id)===staffId);
            const appointments = records.filter(record=>String(record.staff_id)===staffId);
            const category = staffCategory(cached||{});
            if (!permitted && category==='admin') continue;
            groups.push({branchId:data.branch.id,branchName:data.branch.name,staffId,
                name:cached?.full_name||cached?.name||appointments[0]?.staff?.name||`Сотрудник ${staffId}`,
                categoryLabel:calculationCategories[category]||'',
                slots:scheduled.filter(day=>String(day.staff_id)===staffId).flatMap(day=>day.slots),
                records:appointments.map(record=>({id:record.id,date:record.date||record.datetime,client:record.client,
                    services:(record.services||[]).map(service=>service.title).filter(Boolean),amount:serviceAmount(record),
                    attendance:Number(record.attendance),paymentStatus:record.payment_status,
                    paidFull:Number(record.paid_full)===1||['paid_full','paid_over'].includes(record.payment_status)}))
                    .sort((a,b)=>a.date.localeCompare(b.date))});
        }
        branches.push({id:data.branch.id,name:data.branch.name,appointments:records.length,completed:records.filter(isVisit).length,
            services:records.filter(isVisit).reduce((sum,record)=>sum+serviceAmount(record),0),
            products:sales(data.goods||[]).reduce((sum,item)=>sum+(Number(item.amount)>0?-1:1)*Math.abs(Number(item.cost||0)),0)});
    }
    return {groups,branches};
}
