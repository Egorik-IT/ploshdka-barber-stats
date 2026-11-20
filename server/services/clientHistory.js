import pool from '../config/db.js';
import { cachedReport } from './reports.js';
import { fetchCollection, requestYclients } from './yclientsApi.js';

const jobs = new Map();
const day = 86400000;

// Only fields needed for client retention statistics, without notes and payment details.
function compactRecord(record) {
    return {
        id: record.id, staff_id: record.staff_id, date: record.date || record.datetime,
        attendance: record.attendance, deleted: record.deleted,
        client: record.client ? { id: record.client.id, phone: record.client.phone } : null,
    };
}

export function clientHistory(branch, end, staffId) {
    const company = branch.yclientsCompanyId;
    const prefix = staffId ? `client-history-staff:${company}:${staffId}:` : `client-history:${company}:`;
    const key = `${prefix}${end}`;
    const previous = jobs.get(key);
    if (previous && (previous.status === 'running' || Date.now() - previous.startedAt < day)) {
        if (previous.status === 'error') jobs.delete(key);
        return previous;
    }
    for (const [id, job] of jobs) {
        if (job.status !== 'running' && Date.now() - job.startedAt >= day) jobs.delete(id);
    }
    if ([...jobs.values()].filter(item => item.status === 'running').length >= 4) {
        return { status: 'error', message: 'Уже загружаются четыре отчёта истории. Повторите запрос позже.' };
    }
    if (jobs.size >= 100) {
        const oldest = [...jobs].find(([, item]) => item.status !== 'running');
        if (oldest) jobs.delete(oldest[0]);
    }
    const job = { status: 'running', count: 0, branch: branch.name, startedAt: Date.now() };
    jobs.set(key, job);
    void (async () => {
        // A report for an earlier date reuses a later complete snapshot.
        const { rows } = await pool.query(
            `SELECT data FROM yclients_report_cache
             WHERE cache_key LIKE $1 AND cache_key >= $2
               AND updated_at > NOW() - INTERVAL '24 hours'
             ORDER BY cache_key LIMIT 1`, [`${prefix}%`, key]
        );
        if (rows[0]) return rows[0].data.filter(record => record.date?.slice(0, 10) <= end);
        return cachedReport(key, () => fetchCollection(page => cachedReport(
            `history-page:${company}:${staffId || 'all'}:${end}:${page}`,
            async () => {
                const result = await requestYclients(`/records/${company}?start_date=2000-01-01&end_date=${end}&page=${page}&count=1000${staffId ? `&staff_id=${staffId}` : ''}`);
                return { data: result.data.map(compactRecord), meta: result.meta };
            }, day
        ), { onProgress: count => { job.count = count; } }), day);
    })().then(records => Object.assign(job, { status: 'done', records }))
        .catch(error => Object.assign(job, { status: 'error', message: error.message }));
    return job;
}
