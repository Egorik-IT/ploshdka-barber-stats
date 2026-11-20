import { allowRoles, isManager } from '../middleware/roleAccess.js';
import { calculationProfiles } from '../services/calculationProfiles.js';
import { Router } from 'express';
import pool from '../config/db.js';
import requireAuth from '../middleware/authMiddleware.js';
import { calculationCategories, emptyCalculationSettings, fieldsForCategory, normalizeCalculationSettings } from '../../shared/calculationSettings.js';

import { isPositiveIntegerString } from '../../shared/validation.js';

const router = Router();
router.use(requireAuth);
router.get('/', async (req, res) => {
    try {
        const personalScope = `user:${req.session.userId}`;
        const { rows } = await pool.query('SELECT scope,data FROM calculation_settings WHERE scope=$1 OR scope=$2', ['network', personalScope]);
        const network = rows.find(row => row.scope === 'network')?.data || {};
        const profiles = await calculationProfiles();
        const profile = profiles.find(user => String(user.id) === String(req.session.userId));
        res.json({ employees: isManager(req.user) ? profiles.filter(user => user.role !== 'developer') : undefined, profile, personalCategory: profile?.category ?? null, personal: rows.find(row => row.scope === personalScope)?.data || emptyCalculationSettings(),
            network: !isManager(req.user) ? undefined : { ...Object.fromEntries(Object.keys(calculationCategories).map(key => [key, network[key] || emptyCalculationSettings()])), activeMonths: network.activeMonths ?? 6 } });
    } catch { res.status(500).json({ message: 'Не удалось загрузить настройки' }); }
});
router.put('/employees/:id', allowRoles('manager', 'developer'), async (req, res) => {
    if (!isPositiveIntegerString(req.params.id)) return res.status(400).json({ message: 'Некорректный сотрудник' });
    try {
        const { rows } = await pool.query(`SELECT u.calculation_category AS category FROM users u
            JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.is_active AND r.name<>'developer'`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ message: 'Сотрудник не найден' });
        if (!rows[0].category) return res.status(400).json({ message: 'Сначала определите категорию сотрудника в YCLIENTS' });
        let normalized;
        try { normalized = normalizeCalculationSettings(req.body); }
        catch (error) { return res.status(400).json({ message: error.message }); }
        const data = Object.fromEntries(fieldsForCategory(rows[0].category).map(([key]) => [key, normalized[key]]));
        await pool.query(`INSERT INTO calculation_settings(scope,data) VALUES($1,$2)
            ON CONFLICT(scope) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`, [`approved:${req.params.id}`, data]);
        res.json(data);
    } catch { res.status(500).json({ message: 'Не удалось сохранить ставки сотрудника' }); }
});

router.put('/:scope', async (req, res) => {
    if (req.params.scope === 'network' && !isManager(req.user)) return res.status(403).json({ message: 'Настройки сети доступны руководителю' });
    if (!['personal','network'].includes(req.params.scope)) return res.status(400).json({ message: 'Неизвестные настройки' });
    let data;
    try { data = req.params.scope === 'personal' ? normalizeCalculationSettings(req.body)
        : Object.fromEntries(Object.keys(calculationCategories).map(key => [key, normalizeCalculationSettings(req.body?.[key])]));
        if (req.params.scope === 'network') {
            const months=Number(req.body.activeMonths??6);
            if (!Number.isInteger(months)||months<1||months>120) throw new Error('Срок активности: от 1 до 120 месяцев');
            data.activeMonths=months;
        }
    } catch (error) { return res.status(400).json({ message: error.message }); }
    try {
        const scope = req.params.scope === 'personal' ? `user:${req.session.userId}` : 'network';
        await pool.query(`INSERT INTO calculation_settings(scope,data) VALUES($1,$2)
            ON CONFLICT(scope) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`, [scope,data]);
        res.json(data);
    } catch { res.status(500).json({ message: 'Не удалось сохранить настройки' }); }
});
export default router;
