import pool from '../config/db.js';

export function auditLog(req, res, next) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        res.once('finish', () => {
            // Не сохраняем тела запросов, пароли, токены и cookie.
            void pool.query(`INSERT INTO audit_events(actor_id,method,path,status) VALUES($1,$2,$3,$4)`,
                [req.user?.id || req.session?.userId || null, req.method, req.path.slice(0, 500), res.statusCode])
                .catch(() => console.error('Не удалось записать событие аудита'));
        });
    }
    next();
}
