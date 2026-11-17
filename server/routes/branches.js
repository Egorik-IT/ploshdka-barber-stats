
import { Router } from 'express';

import pool from '../config/db.js';
import requireAuth from '../middleware/authMiddleware.js';
import { rollbackTransaction } from '../utils/transactions.js';
import { isPositiveIntegerString as isValidId } from '../../shared/validation.js';

const router = Router();

const MAX_BIGINT = 9223372036854775807n;
const YCLIENTS_API_URL = 'https://api.yclients.com/api/v1';

// ======================================
// ОБЩИЕ ФУНКЦИИ
// ======================================

function validateBranch(body) {
    const { name, yclientsCompanyId, isActive } = body ?? {};

    if (
        typeof name !== 'string' ||
        !name.trim() ||
        name.trim().length > 150
    ) {
        return {
            error: 'Название филиала должно содержать от 1 до 150 символов',
        };
    }

    if (typeof isActive !== 'boolean') {
        return {
            error: 'Некорректный статус филиала',
        };
    }

    let companyId = null;

    if (
        yclientsCompanyId !== null &&
        yclientsCompanyId !== undefined &&
        yclientsCompanyId !== ''
    ) {
        if (
            typeof yclientsCompanyId !== 'string' ||
            !isValidId(yclientsCompanyId)
        ) {
            return {
                error: 'YCLIENTS Company ID должен быть положительным числом',
            };
        }

        if (BigInt(yclientsCompanyId) > MAX_BIGINT) {
            return {
                error: 'YCLIENTS Company ID слишком большой',
            };
        }

        companyId = yclientsCompanyId;
    }

    return {
        data: {
            name: name.trim(),
            companyId,
            isActive,
        },
    };
}

function cleanText(value, maxLength = null) {
    if (typeof value !== 'string') {
        return null;
    }

    const result = value.trim();

    if (!result) {
        return null;
    }

    return maxLength
        ? result.slice(0, maxLength)
        : result;
}

function firstNonEmpty(...values) {
    for (const value of values) {
        const text = cleanText(value);

        if (text) {
            return text;
        }
    }

    return null;
}

function normalizeBigintId(value) {
    const text = String(value ?? '');

    if (!isValidId(text)) {
        return null;
    }

    try {
        if (BigInt(text) > MAX_BIGINT) {
            return null;
        }
    } catch {
        return null;
    }

    return text;
}

function normalizeDate(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const date = value.trim().slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return null;
    }

    const parsed = new Date(`${date}T00:00:00Z`);

    if (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
    ) {
        return null;
    }

    return date;
}


function getFullName(staff) {
    const employee = staff.employee || {};

    const surname = cleanText(employee.surname, 255);
    const firstName = cleanText(employee.firstname, 255);
    const patronymic = cleanText(employee.patronymic, 255);

    const fullName = [
        surname,
        firstName,
        patronymic,
    ].filter(Boolean).join(' ');

    return fullName ||
        cleanText(employee.name, 255) ||
        cleanText(staff.name, 255);
}



function normalizeStaff(staff) {
    if (!staff || typeof staff !== 'object') {
        return null;
    }

    const staffId = normalizeBigintId(staff.id);

    if (!staffId) {
        return null;
    }

    const name = cleanText(staff.name, 255);

    if (!name) {
        return null;
    }

    const employee =
        staff.employee && typeof staff.employee === 'object'
            ? staff.employee
            : {};

    const user =
        staff.user && typeof staff.user === 'object'
            ? staff.user
            : {};

    const surname = cleanText(employee.surname, 255);
    const firstName = cleanText(employee.firstname, 255);
    const patronymic = cleanText(employee.patronymic, 255);

    const position = firstNonEmpty(
        typeof staff.position === 'string'
            ? staff.position
            : staff.position?.title
    );

    const photoUrl = firstNonEmpty(
        staff.avatar_big,
        staff.avatar
    );

    const phone = firstNonEmpty(
        employee.phone,
        staff.phone,
        user.phone
    );

    const email = firstNonEmpty(
        staff.email,
        user.email
    );

    // Новый API возвращает is_fired и is_deleted.
    // Числовой fired используем как дополнительный признак.
    const isFired =
        staff.is_fired === true ||
        staff.fired === 1 ||
        staff.fired === '1';

    const isDeleted = staff.is_deleted === true;

    return {
        staffId,
        name,
        fullName: getFullName(staff),
        surname,
        firstName,
        patronymic,
        phone: phone?.slice(0, 50) ?? null,
        email: email?.slice(0, 255) ?? null,
        position: position?.slice(0, 255) ?? null,
        specialization: cleanText(staff.specialization),
        photoUrl,
        yclientsUserId: normalizeBigintId(
            staff.user_id ?? user.id
        ),
        yclientsEmployeeId: normalizeBigintId(
            employee.id
        ),
        isFired,
        isDeleted,
        isActive: !isFired && !isDeleted,
        dismissalDate: normalizeDate(staff.dismissal_date),
        dismissalReason: cleanText(staff.dismissal_reason),
    };
}

// ======================================
// ПОЛУЧЕНИЕ СОТРУДНИКОВ ИЗ YCLIENTS
// ======================================

async function fetchYclientsStaff(companyId) {
    const partnerToken = process.env.YCLIENTS_PARTNER_TOKEN;
    const userToken = process.env.YCLIENTS_USER_TOKEN;

    if (!partnerToken || !userToken) {
        const error = new Error(
            'Не настроены YCLIENTS_PARTNER_TOKEN или YCLIENTS_USER_TOKEN'
        );

        error.status = 503;
        throw error;
    }

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        20000
    );

    let response;

    try {
        response = await fetch(
            `${YCLIENTS_API_URL}/company/${companyId}/staff`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/vnd.yclients.v2+json',
                    Authorization:
                        `Bearer ${partnerToken}, User ${userToken}`,
                },
                signal: controller.signal,
            }
        );
    } catch (error) {
        const requestError = new Error(
            error.name === 'AbortError'
                ? 'YCLIENTS не ответил за 20 секунд'
                : 'Не удалось подключиться к YCLIENTS'
        );

        requestError.status = 502;
        throw requestError;
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        const error = new Error(
            response.status === 401 || response.status === 403
                ? 'YCLIENTS отклонил запрос. Проверь токены и доступ к компании'
                : `YCLIENTS вернул ошибку HTTP ${response.status}`
        );

        error.status = 502;
        throw error;
    }

    let payload;

    try {
        payload = await response.json();
    } catch {
        const error = new Error(
            'YCLIENTS вернул некорректный JSON'
        );

        error.status = 502;
        throw error;
    }

    if (
        !payload ||
        payload.success === false ||
        !Array.isArray(payload.data)
    ) {
        const error = new Error(
            'YCLIENTS вернул неожиданный формат списка сотрудников'
        );

        error.status = 502;
        throw error;
    }

    const staffById = new Map();

    for (const item of payload.data) {
        const normalized = normalizeStaff(item);

        if (!normalized) {
            const error = new Error(
                'YCLIENTS вернул сотрудника с некорректным ID или именем. Синхронизация отменена'
            );

            error.status = 502;
            throw error;
        }

        staffById.set(normalized.staffId, normalized);
    }

    return [...staffById.values()];
}

// ======================================
// СПИСОК ФИЛИАЛОВ
// GET /api/branches
// ======================================

router.get('/', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                b.id,
                b.name,
                b.yclients_company_id::text AS "yclientsCompanyId",
                b.is_active AS "isActive",
                b.staff_synced_at AS "staffSyncedAt",
                (
                    SELECT COUNT(*)::integer
                    FROM yclients_staff_cache s
                    WHERE s.branch_id = b.id
                      AND s.is_active = TRUE
                ) AS "staffCount"
            FROM branches b
            ORDER BY b.id ASC
        `);

        res.json({
            branches: result.rows,
        });
    } catch (error) {
        console.error('Ошибка получения филиалов:', error);

        res.status(500).json({
            message: 'Не удалось получить список филиалов',
        });
    }
});

// ======================================
// СОЗДАНИЕ ФИЛИАЛА
// POST /api/branches
// ======================================

router.post('/', requireAuth, async (req, res) => {
    const validation = validateBranch(req.body);

    if (validation.error) {
        return res.status(400).json({
            message: validation.error,
        });
    }

    const { name, companyId, isActive } = validation.data;

    try {
        const result = await pool.query(
            `INSERT INTO branches (
                name,
                yclients_company_id,
                is_active
             )
             VALUES ($1, $2, $3)
             RETURNING
                id,
                name,
                yclients_company_id::text AS "yclientsCompanyId",
                is_active AS "isActive"`,
            [name, companyId, isActive]
        );

        res.status(201).json({
            message: 'Филиал успешно добавлен',
            branch: result.rows[0],
        });
    } catch (error) {
        console.error('Ошибка создания филиала:', error);

        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Филиал с таким YCLIENTS Company ID уже существует',
            });
        }

        res.status(500).json({
            message: 'Не удалось добавить филиал',
        });
    }
});

// ======================================
// РЕДАКТИРОВАНИЕ ФИЛИАЛА
// PATCH /api/branches/:id
// ======================================

router.patch('/:id', requireAuth, async (req, res) => {
    const branchId = req.params.id;

    if (!isValidId(branchId)) {
        return res.status(400).json({
            message: 'Некорректный ID филиала',
        });
    }

    const validation = validateBranch(req.body);

    if (validation.error) {
        return res.status(400).json({
            message: validation.error,
        });
    }

    const { name, companyId, isActive } = validation.data;

    try {
        const result = await pool.query(
            `UPDATE branches
             SET
                name = $1,
                yclients_company_id = $2,
                is_active = $3,
                updated_at = NOW()
             WHERE id = $4
             RETURNING
                id,
                name,
                yclients_company_id::text AS "yclientsCompanyId",
                is_active AS "isActive"`,
            [name, companyId, isActive, branchId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Филиал не найден',
            });
        }

        res.json({
            message: 'Филиал успешно обновлён',
            branch: result.rows[0],
        });
    } catch (error) {
        console.error('Ошибка обновления филиала:', error);

        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Этот YCLIENTS Company ID уже используется другим филиалом',
            });
        }

        res.status(500).json({
            message: 'Не удалось обновить филиал',
        });
    }
});

// ======================================
// СОТРУДНИКИ ФИЛИАЛА ИЗ БАЗЫ
// GET /api/branches/:id/staff
// ======================================

router.get('/:id/staff', requireAuth, async (req, res) => {
    const branchId = req.params.id;

    if (!isValidId(branchId)) {
        return res.status(400).json({
            message: 'Некорректный ID филиала',
        });
    }

    try {
        const branchResult = await pool.query(
            `SELECT
                id,
                name,
                staff_synced_at AS "staffSyncedAt"
             FROM branches
             WHERE id = $1`,
            [branchId]
        );

        if (branchResult.rows.length === 0) {
            return res.status(404).json({
                message: 'Филиал не найден',
            });
        }

        const result = await pool.query(
            `SELECT
                yclients_staff_id::text AS "staffId",
                name,
                full_name AS "fullName",
                surname,
                first_name AS "firstName",
                patronymic,
                phone,
                email,
                position,
                specialization,
                photo_url AS "photoUrl",
                is_active AS "isActive",
                is_fired AS "isFired",
                is_deleted AS "isDeleted",
                dismissal_date AS "dismissalDate",
                dismissal_reason AS "dismissalReason",
                synced_at AS "syncedAt"
             FROM yclients_staff_cache
             WHERE branch_id = $1
               AND is_active = TRUE
             ORDER BY COALESCE(full_name, name) ASC`,
            [branchId]
        );

        res.json({
            branch: branchResult.rows[0],
            staff: result.rows,
        });
    } catch (error) {
        console.error('Ошибка получения сотрудников:', error);

        res.status(500).json({
            message: 'Не удалось получить сотрудников филиала',
        });
    }
});

// ======================================
// РУЧНАЯ СИНХРОНИЗАЦИЯ YCLIENTS
// POST /api/branches/:id/sync-staff
// ======================================

router.post('/:id/sync-staff', requireAuth, async (req, res) => {
    const branchId = req.params.id;

    if (!isValidId(branchId)) {
        return res.status(400).json({
            message: 'Некорректный ID филиала',
        });
    }

    let client;

    try {
        client = await pool.connect();

        await client.query('BEGIN');

        // Блокируем филиал от одновременной синхронизации.
        const branchResult = await client.query(
            `SELECT
                id,
                name,
                yclients_company_id::text AS "yclientsCompanyId"
             FROM branches
             WHERE id = $1
               AND is_active = TRUE
             FOR UPDATE`,
            [branchId]
        );

        const branch = branchResult.rows[0];

        if (!branch) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                message: 'Активный филиал не найден',
            });
        }

        if (!branch.yclientsCompanyId) {
            await client.query('ROLLBACK');

            return res.status(400).json({
                message: 'У филиала не указан YCLIENTS Company ID',
            });
        }

        // Получаем сотрудников из нового API.
        // При ошибке запроса транзакция будет отменена.
        const staff = await fetchYclientsStaff(
            branch.yclientsCompanyId
        );

        // Сохраняем всех полученных сотрудников,
        // включая уволенных и удалённых.
        for (const employee of staff) {
            await client.query(
                `INSERT INTO yclients_staff_cache (
                    branch_id,
                    yclients_staff_id,
                    name,
                    full_name,
                    surname,
                    first_name,
                    patronymic,
                    phone,
                    email,
                    position,
                    specialization,
                    photo_url,
                    yclients_user_id,
                    yclients_employee_id,
                    is_fired,
                    is_deleted,
                    dismissal_date,
                    dismissal_reason,
                    is_active,
                    synced_at
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15,
                    $16, $17, $18, $19, NOW()
                )
                ON CONFLICT (branch_id, yclients_staff_id)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    full_name = EXCLUDED.full_name,
                    surname = EXCLUDED.surname,
                    first_name = EXCLUDED.first_name,
                    patronymic = EXCLUDED.patronymic,
                    phone = EXCLUDED.phone,
                    email = EXCLUDED.email,
                    position = EXCLUDED.position,
                    specialization = EXCLUDED.specialization,
                    photo_url = EXCLUDED.photo_url,
                    yclients_user_id = EXCLUDED.yclients_user_id,
                    yclients_employee_id = EXCLUDED.yclients_employee_id,
                    is_fired = EXCLUDED.is_fired,
                    is_deleted = EXCLUDED.is_deleted,
                    dismissal_date = EXCLUDED.dismissal_date,
                    dismissal_reason = EXCLUDED.dismissal_reason,
                    is_active = EXCLUDED.is_active,
                    synced_at = NOW()`,
                [
                    branchId,
                    employee.staffId,
                    employee.name,
                    employee.fullName,
                    employee.surname,
                    employee.firstName,
                    employee.patronymic,
                    employee.phone,
                    employee.email,
                    employee.position,
                    employee.specialization,
                    employee.photoUrl,
                    employee.yclientsUserId,
                    employee.yclientsEmployeeId,
                    employee.isFired,
                    employee.isDeleted,
                    employee.dismissalDate,
                    employee.dismissalReason,
                    employee.isActive,
                ]
            );
        }

        // Обновляем время синхронизации филиала.
        const updatedBranch = await client.query(
            `UPDATE branches
             SET
                staff_synced_at = NOW(),
                updated_at = NOW()
             WHERE id = $1
             RETURNING
                staff_synced_at AS "staffSyncedAt"`,
            [branchId]
        );

        // Считаем действующих и уволенных в текущем ответе.
        const activeCount = staff.filter(
            employee => employee.isActive
        ).length;

        const firedCount = staff.filter(
            employee => employee.isFired
        ).length;

        const deletedCount = staff.filter(
            employee => employee.isDeleted
        ).length;

        await client.query('COMMIT');

        res.json({
            message: 'Сотрудники YCLIENTS успешно синхронизированы',
            branchId: Number(branchId),
            staffCount: staff.length,
            activeCount,
            firedCount,
            deletedCount,
            staffSyncedAt: updatedBranch.rows[0].staffSyncedAt,
        });
    } catch (error) {
        await rollbackTransaction(
            client,
            'Ошибка отката синхронизации:'
        );

        console.error(
            'Ошибка синхронизации YCLIENTS:',
            error
        );

        res.status(error.status || 500).json({
            message: error.status
                ? error.message
                : 'Не удалось синхронизировать сотрудников',
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

export default router;
