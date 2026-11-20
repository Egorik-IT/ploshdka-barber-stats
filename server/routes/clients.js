import { clientVisits } from '../services/clientVisits.js';
import { Router } from 'express';
import pool from '../config/db.js';
import requireAuth from '../middleware/authMiddleware.js';
import { isPositiveIntegerString, isHttpUrl } from '../../shared/validation.js';
import { cachedReport } from '../services/reports.js';
import { requestYclients } from '../services/yclientsApi.js';

function visibleCard(card, role) {
    if (role !== 'employee') return card;
    const fields = ['id', 'name', 'display_name', 'surname', 'patronymic', 'phone', 'email', 'comment', 'birth_date', 'sex', 'visits', 'categories', 'avatar', 'avatar_big', 'photo', 'last_change_date', 'importance'];
    return { ...card, data: Object.fromEntries(fields.filter(key => key in card.data).map(key => [key, card.data[key]])) };
}

const router = Router();
router.get('/', requireAuth, async (req, res) => {
    const branchId = req.query.branchId;
    const page = Number(req.query.page || 1);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 150) : '';
    if (!isPositiveIntegerString(branchId) || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
        return res.status(400).json({ message: 'Некорректный филиал или номер страницы' });
    }
    // Поиск подстроки, а не пользовательского SQL-шаблона.
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    try {
        const result = await pool.query(`WITH matched AS (
            SELECT d.external_id, d.data FROM yclients_directory d
            JOIN branches b ON b.id=d.branch_id AND b.yclients_company_id=d.company_id
            WHERE b.is_active AND b.id=$1 AND d.kind='clients'
            AND (concat_ws('',data->>'display_name',data->>'name',data->>'surname',data->>'patronymic') !~ '[[:alpha:]]')=$5
            AND ($2='' OR concat_ws(' ',data->>'surname',data->>'name',data->>'patronymic',
                data->>'display_name',data->>'phone',data->>'email',data->>'comment') ILIKE $3)
        ), selected AS (
            SELECT external_id AS id, data->>'display_name' AS "displayName", data->>'name' AS name, data->>'surname' AS surname,
                data->>'patronymic' AS patronymic, data->>'phone' AS phone,
                data->>'email' AS email, data->>'comment' AS comment
            FROM matched ORDER BY lower(data->>'name'), external_id LIMIT $6 OFFSET $4
        ) SELECT (SELECT count(*)::integer FROM matched) AS total,
            COALESCE((SELECT jsonb_agg(selected) FROM selected),'[]'::jsonb) AS clients`,
        [branchId, search, pattern, (page - 1) * 50, req.query.incomplete === 'true', req.query.countOnly === 'true' ? 0 : 50]);
        const data = result.rows[0];
        res.json({ ...data, page, pageSize: 50 });
    } catch {
        res.status(500).json({ message: 'Не удалось загрузить клиентов' });
    }
});
router.use('/:id', requireAuth, async (req, res, next) => {
    if (!isPositiveIntegerString(req.params.id) || !isPositiveIntegerString(req.query.branchId)) return res.status(400).json({ message: 'Некорректный клиент' });
    try {
        const result = await pool.query(`SELECT b.yclients_company_id::text AS company_id, $2::text AS external_id, d.data,
            COALESCE(p.photo_url,'') AS "customPhotoUrl"
            FROM branches b LEFT JOIN yclients_directory d ON d.branch_id=b.id AND d.company_id=b.yclients_company_id AND d.kind='clients' AND d.external_id=$2
            LEFT JOIN client_photo_overrides p ON p.company_id=b.yclients_company_id AND p.client_id=$2
            WHERE b.is_active AND b.id=$1 AND b.yclients_company_id IS NOT NULL`, [req.query.branchId, req.params.id]);
        if (!result.rowCount) return res.status(404).json({ message: 'Филиал не найден' });
        const card=result.rows[0];
        if (!card.data) card.data=await cachedReport(`client-card:${card.company_id}:${card.external_id}`,async()=>
            (await requestYclients(`/client/${card.company_id}/${card.external_id}`,undefined,'object')).data);
        req.clientCard = result.rows[0]; next();
    } catch { res.status(500).json({ message: 'Не удалось загрузить карточку' }); }
});
router.get('/:id/card', async (req, res) => {
    try {
        const card=req.clientCard;
        const data=await cachedReport(`client-card:${card.company_id}:${card.external_id}`,async()=>
            (await requestYclients(`/client/${card.company_id}/${card.external_id}`,undefined,'object')).data);
        res.json(visibleCard({...card,data}, req.user.role));
    } catch { res.json(visibleCard({...req.clientCard,warning:'YCLIENTS недоступен. Показаны сохранённые данные.'}, req.user.role)); }
});
router.get('/:id/history', async (req,res) => {
    try {
        const visits = await clientVisits(req.clientCard,req.query.branchId);
        res.json({ visits: req.user.role === 'employee' ? visits.map(({ amount: _amount, ...visit }) => visit) : visits });
    }
    catch { res.status(502).json({message:'Не удалось загрузить историю посещений. Закройте и повторно откройте историю.'}); }
});
router.patch('/:id/card', async (req, res) => {
    const url = req.body?.photoUrl;
    if (typeof url !== 'string' || url.length > 2048 || (url.trim() && !isHttpUrl(url.trim()))) return res.status(400).json({ message: 'Укажите ссылку http/https или оставьте поле пустым' });
    try {
        await pool.query(`INSERT INTO client_photo_overrides(company_id,client_id,photo_url) VALUES($1,$2,$3)
            ON CONFLICT(company_id,client_id) DO UPDATE SET photo_url=EXCLUDED.photo_url`, [req.clientCard.company_id, req.clientCard.external_id, url.trim()]);
        res.json({ customPhotoUrl: url.trim() });
    } catch { res.status(500).json({ message: 'Не удалось сохранить фото' }); }
});
export default router;
