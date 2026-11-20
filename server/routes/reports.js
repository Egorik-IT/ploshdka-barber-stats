import { reportFreshness, recordFreshness } from '../services/reportFreshness.js';
import { dailyActivity } from '../services/reportCharts.js';
import { allowRoles, isManager, reportView } from '../middleware/roleAccess.js';
import { dayOverview } from '../services/dayOverview.js';
import { calculationProfiles } from '../services/calculationProfiles.js';
import { serviceKey, uniqueServices } from '../../shared/services.js';
import { summarizeClients } from '../services/clientStatistics.js';
import { Router } from 'express';
import pool from '../config/db.js';
import requireAuth from '../middleware/authMiddleware.js';
import { branchData, validatePeriod, summarizeEmployee, serviceAmount, isVisit, sales } from '../services/reports.js';
import { rankingSalary } from '../services/rankingSalary.js';
import { clientHistory } from '../services/clientHistory.js';
const router = Router(); router.use(requireAuth, reportView, reportFreshness);
router.get('/employees', async (req, res) => {
    try {
        let users = await calculationProfiles();
        if (req.user.role === 'employee') users = users.filter(user => String(user.id) === String(req.user.id));
        if (!isManager(req.user)) users = users.map(user => String(user.id) === String(req.user.id) ? user :
            { id: user.id, displayName: user.displayName, role: user.role, category: user.category, categoryLabel: user.categoryLabel });
        res.json({ users });
    } catch (error) { fail(res, error); }
});
async function context(req) {
    const { start, end } = req.query; validatePeriod(start, end);
    const { rows: branches } = await pool.query(`SELECT id,name,yclients_company_id::text AS "yclientsCompanyId" FROM branches WHERE is_active AND yclients_company_id IS NOT NULL`);
    const { rows: links } = await pool.query('SELECT user_id,branch_id,yclients_staff_id::text FROM user_yclients_links');
    return { start, end, branches, links };
}
function fail(res, error) { res.status(error.status || 502).json({ message: error.message || 'Не удалось загрузить отчёт' }); }
router.get('/day', async (req, res) => {
    try {
        const date = req.query.date;
        validatePeriod(date, date);
        const { rows: branches } = await pool.query(`SELECT id,name,yclients_company_id::text AS "yclientsCompanyId" FROM branches WHERE is_active AND yclients_company_id IS NOT NULL ORDER BY name`);
        const { rows: links } = await pool.query('SELECT branch_id,yclients_staff_id::text FROM user_yclients_links WHERE user_id=$1', [req.session.userId]);
        const own = req.reportView === 'barber';
        const datasets = [];
        for (const branch of branches) {
            const staffIds = links.filter(link => String(link.branch_id) === String(branch.id)).map(link => link.yclients_staff_id);
            if (own && !staffIds.length) continue;
            datasets.push(await branchData(branch, date, date, { staffIds: own ? staffIds : [], includeGoods: req.reportView === 'manager' }));
        }
        const { rows: staff } = await pool.query('SELECT branch_id,yclients_staff_id::text,name,full_name,position,specialization FROM yclients_staff_cache');
        res.json({ ...dayOverview(datasets, staff, own ? links : null), date, linked: links.length > 0 });
    } catch (error) { fail(res, error); }
});
router.get('/employee', async (req, res) => {
    if (req.user.role === 'employee' && req.query.userId && String(req.query.userId) !== String(req.user.id)) {
        return res.status(403).json({ message: 'Доступна только собственная статистика' });
    }
    try {
        const ctx = await context(req); const userId = String(req.query.userId || req.session.userId);
        const links = ctx.links.filter(l => String(l.user_id) === userId);
        if (!links.length) return res.status(400).json({ message: 'У сотрудника нет привязки к YCLIENTS' });
        let history = [];
        if (req.query.statistics === 'true') {
            const jobs = ctx.branches.map(branch => ({ branch, job: clientHistory(branch, ctx.end) }));
            const failed = jobs.find(({ job }) => job.status === 'error');
            if (failed) throw new Error(failed.job.message);
            if (jobs.some(({ job }) => job.status === 'running')) {
                return res.status(202).json({ pending: true, progress: jobs.map(({ job }) => ({ branch: job.branch, count: job.count, status: job.status })) });
            }
            for (const { job } of jobs) recordFreshness(job.startedAt, true);
            history = jobs.flatMap(({ branch, job }) => job.records.map(record => ({ ...record, branchId: branch.id })));
        }
        const statistics = req.query.statistics === 'true';
        const datasets = [];
        for (const branch of ctx.branches) {
            const staffIds = links.filter(link => String(link.branch_id) === String(branch.id)).map(link => link.yclients_staff_id);
            if (!statistics && !staffIds.length) continue;
            datasets.push(await branchData(branch, ctx.start, ctx.end, {
                staffIds: statistics ? [] : staffIds,
                includeSchedule: staffIds.length > 0,
                includeGoods: staffIds.length > 0,
            }));
        }
        const result = summarizeEmployee(datasets.filter(data => links.some(link => String(link.branch_id) === String(data.branch.id))), links);
        if (req.query.statistics === 'true') {
            const { rows: networkSettings } = await pool.query("SELECT data FROM calculation_settings WHERE scope='network'");
            result.activeMonths = networkSettings[0]?.data.activeMonths ?? 6;
            const periodRecords = datasets.flatMap(data => data.records.map(record => ({ ...record, branchId: data.branch.id })));
            result.clients = summarizeClients(history, periodRecords, links, ctx.start, ctx.end, result.activeMonths);
            result.activity = dailyActivity(result.records, ctx.start, ctx.end).map(({ revenue: _revenue, ...day }) => day);
        }
        const profile = (await calculationProfiles()).find(user => String(user.id) === userId);
        if (req.user.role === 'admin' && userId !== String(req.user.id)) {
            delete result.days;
            delete result.services;
        }
        const canSeeCommission = isManager(req.user) || userId === String(req.user.id);
        res.json({ ...result, records: undefined, employeeName: profile?.displayName, commissionPercent: canSeeCommission ? profile?.rates.productPercent ?? null : null, generatedAt: new Date().toISOString() });
    } catch (error) { fail(res, error); }
});
router.get('/finance', allowRoles('manager', 'developer'), async (req, res) => {
    try {
        const ctx = await context(req); let services = 0, products = 0;
        const records = [];
        const branchTotals = [];
        for (const branch of ctx.branches.filter(b => !req.query.branchId || String(b.id) === req.query.branchId)) {
            const data = await branchData(branch, ctx.start, ctx.end, { includeSchedule: false });
            const branchServices = data.records.filter(isVisit).reduce((sum, r) => sum + serviceAmount(r), 0);
            const branchProducts = sales(data.goods).reduce((sum, g) => sum + (Number(g.amount) > 0 ? -1 : 1) * Math.abs(Number(g.cost || 0)), 0);
            services += branchServices;
            products += branchProducts;
            records.push(...data.records);
            branchTotals.push({ id: branch.id, label: branch.name, value: branchServices + branchProducts });
        }
        const scope = `${req.query.branchId || 'all'}:${ctx.start}:${ctx.end}`;
        const { rows } = await pool.query('SELECT data FROM finance_entries WHERE scope=$1', [scope]);
        res.json({ services, products, total: services + products, activity: dailyActivity(records, ctx.start, ctx.end), branchTotals, entries: rows[0]?.data || { barbers: 0, admins: 0, other: 0 } });
    } catch (error) { fail(res, error); }
});
router.put('/finance', allowRoles('manager', 'developer'), async (req, res) => {
    try {
        validatePeriod(req.body.start, req.body.end); const entries = {};
        for (const key of ['barbers', 'admins', 'other']) { const value = req.body.entries?.[key]; if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9) return res.status(400).json({ message: 'Некорректная сумма расходов' }); entries[key] = value; }
        const scope = `${req.body.branchId || 'all'}:${req.body.start}:${req.body.end}`;
        await pool.query(`INSERT INTO finance_entries(scope,data) VALUES($1,$2) ON CONFLICT(scope) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`, [scope, entries]); res.json(entries);
    } catch (error) { fail(res, error); }
});
router.get('/ranking', allowRoles('admin', 'manager', 'developer'), async (req, res) => {
    try {
        const ctx = await context(req);
        const datasets = [];
        for (const branch of ctx.branches) datasets.push(await branchData(branch, ctx.start, ctx.end));
        const profiles = await calculationProfiles();
        const { rows: catalog } = await pool.query(`SELECT d.branch_id, d.external_id AS id, d.data->>'title' AS title
            FROM yclients_directory d JOIN branches b ON b.id=d.branch_id AND b.yclients_company_id=d.company_id
            WHERE d.kind='services' AND b.is_active`);
        const titles = new Map(catalog.map(s => [`${s.branch_id}:${s.id}`, s.title]));
        const includeSalary = req.reportView === 'manager';
        const rows = profiles.filter(user => ctx.links.some(link => String(link.user_id) === String(user.id))).map(user => {
            const data = summarizeEmployee(datasets, ctx.links.filter(link => String(link.user_id) === String(user.id)));
            const serviceCounts = {};
            for (const record of data.records.filter(isVisit)) for (const service of record.services || []) {
                const title = titles.get(`${record.branchId}:${service.id}`) || service.title;
                const key = serviceKey(title);
                if (key) {
                    serviceCounts[key] = (serviceCounts[key] || 0) + Number(service.amount ?? 1);
                    catalog.push({ title });
                }
            }
            const salaryResult = includeSalary ? rankingSalary(data, user, ctx.start, ctx.end) : {};
            return {
                id: user.id, name: user.displayName, category: user.category, categoryLabel: user.categoryLabel, hours: data.hours, products: data.products,
                services: Object.values(serviceCounts).reduce((sum, count) => sum + count, 0), serviceCounts, ...salaryResult
            };
        });
        res.json({ rows, services: uniqueServices(catalog) });
    } catch (error) { fail(res, error); }
});
export default router;
