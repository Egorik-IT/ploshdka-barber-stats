import pool from '../config/db.js';
import { cachedReport, isVisit, serviceAmount } from './reports.js';
import { fetchCollection, requestYclients } from './yclientsApi.js';

export async function clientVisits(card, branchId) {
    const phone = String(card.data.phone || '').replace(/\D/g, '');
    const { rows: matches } = await pool.query(`SELECT b.id AS "branchId",b.name AS "branchName",
        b.yclients_company_id::text AS company,d.external_id AS "clientId"
        FROM yclients_directory d JOIN branches b ON b.id=d.branch_id AND b.yclients_company_id=d.company_id
        WHERE b.is_active AND d.kind='clients' AND
          (($1<>'' AND regexp_replace(COALESCE(d.data->>'phone',''),'[^0-9]','','g')=$1)
            OR (b.id=$2 AND d.external_id=$3))`, [phone, branchId, card.external_id]);
    if (!matches.some(item => String(item.branchId) === String(branchId) && item.clientId === card.external_id)) {
        const { rows } = await pool.query('SELECT name FROM branches WHERE id=$1', [branchId]);
        matches.push({branchId,branchName:rows[0]?.name,company:card.company_id,clientId:card.external_id});
    }
    const today = new Date().toLocaleDateString('sv-SE', {timeZone:'Europe/Moscow'});
    const visits = new Map();
    for (const match of matches) {
        const records = await cachedReport(`client-visits:${match.company}:${match.clientId}:${today}`, () => fetchCollection(page =>
            requestYclients(`/records/${match.company}?client_id=${match.clientId}&start_date=2000-01-01&end_date=${today}&page=${page}&count=200`)));
        for (const record of records.filter(isVisit)) {
            visits.set(`${match.branchId}:${record.id}`, {id:`${match.branchId}:${record.id}`,date:record.date||record.datetime,
                branchName:match.branchName,staffName:record.staff?.name||'Сотрудник не указан',
                services:(record.services||[]).map(service=>service.title).filter(Boolean),amount:serviceAmount(record)});
        }
    }
    return [...visits.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
