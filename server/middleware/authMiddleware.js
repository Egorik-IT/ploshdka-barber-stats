
import pool from '../config/db.js';

export default async function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({
            message: 'Необходима авторизация',
        });
    }

    try {
        const { rows } = await pool.query(`SELECT u.id, u.is_active, r.name AS role
            FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`, [req.session.userId]);
        if (!rows[0]?.is_active) {
            req.session.destroy?.(() => {});
            res.clearCookie('ploshdka.sid', { path: '/' });
            return res.status(401).json({ message: 'Аккаунт заблокирован или удалён' });
        }
        if (!['developer', 'manager', 'admin', 'employee'].includes(rows[0].role)) {
            return res.status(403).json({ message: 'Неизвестная роль аккаунта' });
        }
        req.user = { id: rows[0].id, role: rows[0].role };
        next();
    } catch {
        res.status(503).json({ message: 'Не удалось проверить сессию. Повторите запрос.' });
    }
}
