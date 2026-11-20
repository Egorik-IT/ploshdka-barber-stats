import { staffCategory } from '../../shared/calculationSettings.js';

export function categoryFromLinks(staff) {
    const categories = new Set(staff.map(staffCategory).filter(Boolean));
    return categories.size === 1 ? [...categories][0] : null;
}

// Run in the same transaction as link changes or branch synchronization.
export async function refreshEmployeeCategories(client, userIds = null) {
    const { rows } = await client.query(`SELECT u.id, l.yclients_staff_id AS "linkedStaffId", s.position, s.specialization
        FROM users u LEFT JOIN user_yclients_links l ON l.user_id=u.id
        LEFT JOIN yclients_staff_cache s ON s.branch_id=l.branch_id AND s.yclients_staff_id=l.yclients_staff_id
        WHERE ($1::integer[] IS NULL OR u.id=ANY($1::integer[]))`, [userIds]);
    const grouped = new Map();
    for (const row of rows) {
        if (!grouped.has(row.id)) grouped.set(row.id, []);
        if (row.linkedStaffId != null) grouped.get(row.id).push(row);
    }
    for (const [id, staff] of grouped) {
        const category = categoryFromLinks(staff);
        await client.query('UPDATE users SET calculation_category=$2 WHERE id=$1 AND calculation_category IS DISTINCT FROM $2', [id, category]);
    }
}
