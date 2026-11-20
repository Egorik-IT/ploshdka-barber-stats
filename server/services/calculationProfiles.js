import pool from '../config/db.js';
import { calculationCategories, resolveCalculationRates } from '../../shared/calculationSettings.js';

export async function calculationProfiles() {
    const { rows: users } = await pool.query(`SELECT u.id, u.username, u.calculation_category AS category, u.display_name AS "displayName", r.name AS role,
        COALESCE(NULLIF(u.custom_photo_url,''),NULLIF(u.yclients_photo_url,'')) AS photo
        FROM users u JOIN roles r ON r.id=u.role_id WHERE u.is_active ORDER BY u.display_name`);
    const { rows: links } = await pool.query(`SELECT l.user_id, l.branch_id AS "branchId", b.name AS "branchName",
        l.yclients_staff_id::text AS "staffId", COALESCE(NULLIF(s.full_name,''),s.name) AS name,
        s.phone, s.email, s.position, s.specialization, s.photo_url AS photo
        FROM user_yclients_links l JOIN branches b ON b.id=l.branch_id
        LEFT JOIN yclients_staff_cache s ON s.branch_id=l.branch_id AND s.yclients_staff_id=l.yclients_staff_id
        ORDER BY b.name,l.id`);
    const { rows: settings } = await pool.query('SELECT scope,data FROM calculation_settings');
    const network = settings.find(row => row.scope === 'network')?.data || {};
    return users.map(user => {
        const category = user.category;
        const approvedRates = settings.find(row => row.scope === `approved:${user.id}`)?.data || {};
        const defaults = network[category] || {};
        const rates = resolveCalculationRates(category, approvedRates, defaults);
        const yclientsLinks=links.filter(link=>String(link.user_id)===String(user.id));
        return { ...user, photo:user.photo||yclientsLinks.find(link=>link.photo)?.photo||null, yclientsLinks,
            category, categoryLabel: calculationCategories[category] || 'Категория не определена', rates, approvedRates, networkRates: defaults };
    });
}
