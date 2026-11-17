
import { Router } from 'express';

import pool from '../config/db.js';
import requireAuth from '../middleware/authMiddleware.js';

const router = Router();

// Получение сохранённых сотрудников всех филиалов
router.get('/', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s.branch_id AS "branchId",
                s.yclients_staff_id::text AS "staffId",

                s.name,
                s.full_name AS "fullName",

                s.surname,
                s.first_name AS "firstName",
                s.patronymic,

                s.phone,
                s.email,

                s.position,
                s.specialization,

                s.photo_url AS "photoUrl",

                s.is_active AS "isActive",
                s.is_fired AS "isFired",
                s.is_deleted AS "isDeleted",

                b.name AS "branchName"

            FROM yclients_staff_cache s

            JOIN branches b
                ON b.id = s.branch_id

            WHERE s.is_active = TRUE
              AND s.is_fired = FALSE
              AND s.is_deleted = FALSE
              AND b.is_active = TRUE

            ORDER BY
                b.name,
                COALESCE(s.full_name, s.name)
        `);

        res.json({
            staff: result.rows,
        });
    } catch (error) {
        console.error(
            'Ошибка получения сотрудников YCLIENTS:',
            error
        );

        res.status(500).json({
            message: 'Не удалось получить сотрудников YCLIENTS',
        });
    }
});

export default router;
