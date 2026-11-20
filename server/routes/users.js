import { allowRoles, canManageRole } from '../middleware/roleAccess.js';
import { notifyAccountBlocked } from '../services/sessionEvents.js';
import { refreshEmployeeCategories } from '../services/employeeCategory.js';
import { rollbackTransaction } from '../utils/transactions.js';
import { isHttpUrl, isPositiveIntegerString } from '../../shared/validation.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';

import pool from '../config/db.js';
import requireAuth from '../middleware/authMiddleware.js';

const router = Router();
router.use(requireAuth, allowRoles('developer', 'manager', 'admin'));

const allowedRoles = ['manager', 'admin', 'employee'];

function isValidPhotoUrl(value) {
    if (value === null) return true;
    if (typeof value !== 'string') return false;

    return isHttpUrl(value);
}

function normalizePhotoUrl(value) {
    return typeof value === 'string'
        ? value.trim() || null
        : value;
}

function validateAccountFields({
    displayName,
    username,
    role,
    isActive,
    customPhotoUrl,
}) {
    if (
        typeof displayName !== 'string' ||
        typeof username !== 'string' ||
        !displayName.trim() ||
        !username.trim()
    ) {
        return 'Заполните имя и логин';
    }

    if (
        displayName.trim().length > 150 ||
        username.trim().length > 150
    ) {
        return 'Имя или логин слишком длинные';
    }

    if (!allowedRoles.includes(role)) {
        return 'Недопустимая роль пользователя';
    }

    if (typeof isActive !== 'boolean') {
        return 'Некорректный статус пользователя';
    }

    if (
        !isValidPhotoUrl(customPhotoUrl) ||
        (customPhotoUrl && customPhotoUrl.length > 2048)
    ) {
        return 'Укажите корректный URL аватарки';
    }

    return null;
}

async function insertYclientsLinks(client, userId, links) {
    for (const link of links) {
        await client.query(
            `INSERT INTO user_yclients_links (
                user_id,
                branch_id,
                yclients_staff_id
             )
             VALUES ($1, $2, $3)`,
            [userId, link.branchId, link.staffId]
        );
    }
}

async function findRoleId(client, role) {
    const result = await client.query(
        'SELECT id FROM roles WHERE name = $1 LIMIT 1',
        [role]
    );

    return result.rows[0]?.id ?? null;
}

async function findUser(client, userId) {
    const result = await client.query(
        `SELECT
            u.id,
            u.username,
            u.display_name AS "displayName",
                u.calculation_category AS "calculationCategory",
            u.is_active AS "isActive",
            u.custom_photo_url AS "customPhotoUrl",
            u.yclients_photo_url AS "yclientsPhotoUrl",
            COALESCE(
                NULLIF(u.custom_photo_url, ''),
                NULLIF(u.yclients_photo_url, '')
            ) AS photo,
            r.name AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1
           AND r.name != 'developer'
         LIMIT 1`,
        [userId]
    );

    return result.rows[0] || null;
}

function validateYclientsLinks(links) {
    if (!Array.isArray(links) || links.length > 100) {
        return {
            error: 'Некорректный список привязок YCLIENTS',
        };
    }

    const branchIds = new Set();
    const normalizedLinks = [];

    for (const link of links) {
        if (
            !link ||
            !Number.isSafeInteger(link.branchId) ||
            link.branchId <= 0 ||
            !isPositiveIntegerString(link.staffId)
        ) {
            return {
                error: 'Некорректные данные привязки YCLIENTS',
            };
        }

        let staffId;

        try {
            staffId = BigInt(link.staffId);
        } catch {
            return {
                error: 'Некорректный YCLIENTS ID сотрудника',
            };
        }

        if (
            staffId <= 0n ||
            staffId > 9223372036854775807n
        ) {
            return {
                error: 'YCLIENTS ID выходит за допустимый диапазон',
            };
        }

        if (branchIds.has(link.branchId)) {
            return {
                error: 'Один филиал нельзя указать дважды',
            };
        }

        branchIds.add(link.branchId);

        normalizedLinks.push({
            branchId: link.branchId,
            staffId: link.staffId,
        });
    }

    return {
        branchIds,
        normalizedLinks,
    };
}

function handleDatabaseError(error, res, fallbackMessage) {
    console.error(fallbackMessage, error);

    if (error.code === '23505') {
        return res.status(409).json({
            message: 'Логин или привязка YCLIENTS уже используются',
        });
    }

    if (error.code === '23503') {
        return res.status(400).json({
            message: 'Указанная связанная запись не найдена',
        });
    }

    return res.status(500).json({
        message: fallbackMessage,
    });
}

// ======================================
// GET /api/users
// ======================================

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                u.id,
                u.username,
                u.display_name AS "displayName",
                u.calculation_category AS "calculationCategory",
                u.is_active AS "isActive",
                COALESCE(
                    NULLIF(u.custom_photo_url, ''),
                    NULLIF(u.yclients_photo_url, '')
                ) AS photo,
                r.name AS role
            FROM users u
            JOIN roles r ON r.id = u.role_id
            WHERE r.name != 'developer'
            ORDER BY u.id ASC
        `);

        res.json({ users: result.rows.filter(user => canManageRole(req.user, user.role)) });
    } catch (error) {
        handleDatabaseError(
            error,
            res,
            'Не удалось получить список пользователей'
        );
    }
});

// ======================================
// GET /api/users/branches
// Обязательно выше маршрута /:id
// ======================================

router.get('/branches', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name
            FROM branches
            WHERE is_active = TRUE
            ORDER BY name ASC, id ASC
        `);

        res.json({ branches: result.rows });
    } catch (error) {
        handleDatabaseError(
            error,
            res,
            'Не удалось получить филиалы'
        );
    }
});

// ======================================
// POST /api/users
// ======================================

router.post('/', async (req, res) => {
    if (!canManageRole(req.user, req.body?.role)) return res.status(403).json({ message: 'Нельзя создавать пользователя с этой ролью' });
    let client;

    try {
        const {
            displayName,
            username,
            password,
            role,
            isActive,
            customPhotoUrl = null,
            yclientsLinks = [],
        } = req.body ?? {};

        const photoUrl = normalizePhotoUrl(customPhotoUrl);

        const validationError = validateAccountFields({
            displayName,
            username,
            role,
            isActive,
            customPhotoUrl: photoUrl,
        });

        if (validationError) {
            return res.status(400).json({
                message: validationError,
            });
        }

        if (typeof password !== 'string' || !password) {
            return res.status(400).json({
                message: 'Укажите пароль',
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: 'Пароль должен содержать минимум 8 символов',
            });
        }

        const linksValidation = validateYclientsLinks(yclientsLinks);

        if (linksValidation.error) {
            return res.status(400).json({
                message: linksValidation.error,
            });
        }

        const { branchIds, normalizedLinks } = linksValidation;

        const passwordHash = await bcrypt.hash(password, 12);

        client = await pool.connect();
        await client.query('BEGIN');

        const roleId = await findRoleId(client, role);

        if (!roleId) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: 'Выбранная роль не найдена',
            });
        }

        if (normalizedLinks.length > 0) {
            const branchResult = await client.query(
                `SELECT id
                 FROM branches
                 WHERE id = ANY($1::integer[])
                   AND is_active = TRUE`,
                [[...branchIds]]
            );

            if (branchResult.rows.length !== branchIds.size) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: 'Один или несколько филиалов недоступны',
                });
            }
        }

        const result = await client.query(
            `INSERT INTO users (
                username,
                password_hash,
                display_name,
                role_id,
                is_active,
                custom_photo_url
             )
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
                username.trim(),
                passwordHash,
                displayName.trim(),
                roleId,
                isActive,
                photoUrl,
            ]
        );

        const userId = result.rows[0].id;

        await insertYclientsLinks(client, userId, normalizedLinks);
        await refreshEmployeeCategories(client, [userId]);

        const newUser = await findUser(client, userId);

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Пользователь успешно создан',
            user: {
                ...newUser,
                yclientsLinks: normalizedLinks,
            },
        });
    } catch (error) {
        await rollbackTransaction(client);

        handleDatabaseError(
            error,
            res,
            'Не удалось создать пользователя'
        );
    } finally {
        if (client) client.release();
    }
});

// ======================================
// GET /api/users/:id
// ======================================

router.get('/:id', async (req, res) => {
    const userId = req.params.id;

    if (!isPositiveIntegerString(userId)) {
        return res.status(400).json({
            message: 'Некорректный ID пользователя',
        });
    }

    try {
        const user = await findUser(pool, userId);

        if (!user) {
            return res.status(404).json({
                message: 'Пользователь не найден',
            });
        }

        if (!canManageRole(req.user, user.role)) return res.status(403).json({ message: 'Нет доступа к этому аккаунту' });

        const linksResult = await pool.query(
            `SELECT
                l.branch_id AS "branchId",
                b.name AS "branchName",
                l.yclients_staff_id::text AS "staffId"
             FROM user_yclients_links l
             JOIN branches b ON b.id = l.branch_id
             WHERE l.user_id = $1
             ORDER BY b.name ASC, l.id ASC`,
            [userId]
        );

        res.json({
            user: {
                ...user,
                yclientsLinks: linksResult.rows,
            },
        });
    } catch (error) {
        handleDatabaseError(
            error,
            res,
            'Не удалось получить профиль пользователя'
        );
    }
});

// ======================================
// PATCH /api/users/:id
// ======================================

router.patch('/:id', async (req, res) => {
    if (!canManageRole(req.user, req.body?.role)) return res.status(403).json({ message: 'Нельзя назначить эту роль' });
    const userId = req.params.id;

    if (!isPositiveIntegerString(userId)) {
        return res.status(400).json({
            message: 'Некорректный ID пользователя',
        });
    }

    let client;

    try {
        const {
            displayName,
            username,
            role,
            isActive,
            customPhotoUrl = null,
            password = '',
            yclientsLinks = [],
        } = req.body ?? {};

        const photoUrl = normalizePhotoUrl(customPhotoUrl);

        const validationError = validateAccountFields({
            displayName,
            username,
            role,
            isActive,
            customPhotoUrl: photoUrl,
        });

        if (validationError) {
            return res.status(400).json({
                message: validationError,
            });
        }

        if (typeof password !== 'string') {
            return res.status(400).json({
                message: 'Некорректный пароль',
            });
        }

        if (password && password.length < 8) {
            return res.status(400).json({
                message: 'Новый пароль должен содержать минимум 8 символов',
            });
        }

        const linksValidation = validateYclientsLinks(yclientsLinks);

        if (linksValidation.error) {
            return res.status(400).json({
                message: linksValidation.error,
            });
        }

        const { branchIds, normalizedLinks } = linksValidation;

        const passwordHash = password
            ? await bcrypt.hash(password, 12)
            : null;

        client = await pool.connect();
        await client.query('BEGIN');

        // Системный аккаунт developer не редактируем.
        // Целевая роль повторно проверяется под блокировкой строки.
        const existingResult = await client.query(
            `SELECT u.id, r.name AS role
             FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.id = $1
               AND r.name != 'developer'
             FOR UPDATE OF u`,
            [userId]
        );

        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                message: 'Пользователь не найден',
            });
        }

        if (!canManageRole(req.user, existingResult.rows[0].role)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Нет доступа к этому аккаунту' });
        }

        const roleId = await findRoleId(client, role);

        if (!roleId) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: 'Выбранная роль не найдена',
            });
        }

        await client.query(
            `UPDATE users
             SET
                display_name = $1,
                username = $2,
                role_id = $3,
                is_active = $4,
                custom_photo_url = $5,
                password_hash = COALESCE($6, password_hash),
                updated_at = NOW()
             WHERE id = $7`,
            [
                displayName.trim(),
                username.trim(),
                roleId,
                isActive,
                photoUrl,
                passwordHash,
                userId,
            ]
        );

        // Проверяем существование филиалов, но не требуем,
        // чтобы они были активны. Старые привязки сохраняются.
        if (normalizedLinks.length > 0) {
            const existingBranches = await client.query(
                `SELECT id
                 FROM branches
                 WHERE id = ANY($1::integer[])`,
                [[...branchIds]]
            );

            if (existingBranches.rows.length !== branchIds.size) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: 'Один или несколько филиалов не найдены',
                });
            }
        }

        // Обновляем привязки YCLIENTS.
        // Если сотрудник исчез из справочника YCLIENTS,
        // это само по себе не удаляет привязку.
        // Удаляются только те привязки, которые пользователь
        // убрал в редакторе.
        await client.query(
            'DELETE FROM user_yclients_links WHERE user_id = $1',
            [userId]
        );

        await insertYclientsLinks(client, userId, normalizedLinks);
        await refreshEmployeeCategories(client, [userId]);

        if (!isActive || password) await client.query("DELETE FROM user_sessions WHERE sess->>'userId'=$1", [String(userId)]);
        const updatedUser = await findUser(client, userId);
        await client.query('COMMIT');
        if (!isActive || password) notifyAccountBlocked(userId);

        res.json({
            message: 'Изменения сохранены',
            user: {
                ...updatedUser,
                yclientsLinks: normalizedLinks,
            },
        });
    } catch (error) {
        await rollbackTransaction(client);

        handleDatabaseError(
            error,
            res,
            'Не удалось сохранить пользователя'
        );
    } finally {
        if (client) client.release();
    }
});

export default router;