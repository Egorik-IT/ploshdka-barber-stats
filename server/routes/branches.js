import { allowRoles } from '../middleware/roleAccess.js';
import { refreshEmployeeCategories } from '../services/employeeCategory.js';

import { Router } from 'express';

import pool from '../config/db.js';
import { requestYclients, integrationError } from '../services/yclientsApi.js';
import { fetchDirectory, saveDirectory } from '../services/yclientsDirectory.js';
import requireAuth from '../middleware/authMiddleware.js';
import { rollbackTransaction } from '../utils/transactions.js';
import { isPositiveIntegerString as isValidId } from '../../shared/validation.js';

const router = Router();
const syncJobs = new Map();

const MAX_BIGINT = 9223372036854775807n;


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
    const payload = await requestYclients(`/company/${companyId}/staff`);

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
                (SELECT synced_at FROM yclients_directory_sync d WHERE d.branch_id=b.id
                    AND d.company_id=b.yclients_company_id) AS "directorySyncedAt",
                (SELECT COUNT(*)::integer FROM yclients_directory d WHERE d.branch_id=b.id
                    AND d.company_id=b.yclients_company_id AND kind='clients') AS "clientCount",
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
            branches: result.rows.map(branch => ({ ...branch, syncJob: syncJobs.get(String(branch.id)) || null })),
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

router.post('/', requireAuth, allowRoles('manager', 'developer'), async (req, res) => {
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

router.patch('/:id', requireAuth, allowRoles('manager', 'developer'), async (req, res) => {
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

export async function synchronizeBranch(branchId, full = false, onProgress = () => {}) {

    if (!isValidId(branchId)) {
        throw integrationError('Некорректный ID филиала', 400);
    }

    let client;
    let locked = false;
    let transaction = false;

    try {
        client = await pool.connect();

        const lock = await client.query('SELECT pg_try_advisory_lock(147222, $1::integer) AS locked', [branchId]);
        locked = lock.rows[0].locked;
        if (!locked) throw integrationError('Филиал уже синхронизируется', 409);

        // Блокируем филиал от одновременной синхронизации.
        const branchResult = await client.query(
            `SELECT
                id,
                name,
                yclients_company_id::text AS "yclientsCompanyId"
             FROM branches
             WHERE id = $1
               AND is_active = TRUE
`,
            [branchId]
        );

        const branch = branchResult.rows[0];

        if (!branch) {

            throw integrationError('Активный филиал не найден', 404);
        }

        if (!branch.yclientsCompanyId) {

            throw integrationError('У филиала не указан YCLIENTS Company ID', 400);
        }

        // Получаем сотрудников из нового API.
        // При ошибке запроса транзакция будет отменена.
        onProgress('staff', 0);
        const staff = await fetchYclientsStaff(
            branch.yclientsCompanyId
        );

        const snapshots = full ? await fetchDirectory(branch, onProgress) : null;
        await client.query('BEGIN');
        transaction = true;
        const current = await client.query('SELECT id FROM branches WHERE id=$1 AND is_active AND yclients_company_id=$2 FOR UPDATE NOWAIT', [branchId, branch.yclientsCompanyId]);
        if (!current.rowCount) throw integrationError('Филиал изменился во время загрузки. Повторите синхронизацию.', 409);
        // Помечаем отсутствующих в полном списке сотрудников, не удаляя привязки.
        await client.query('UPDATE yclients_staff_cache SET is_active=false WHERE branch_id=$1 AND NOT (yclients_staff_id=ANY($2::bigint[]))', [branchId, staff.map(employee => employee.staffId)]);

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

        const linkedUsers = await client.query('SELECT DISTINCT user_id FROM user_yclients_links WHERE branch_id=$1', [branchId]);
        await refreshEmployeeCategories(client, linkedUsers.rows.map(row => row.user_id));
        const counts = full ? await saveDirectory(client, branch, snapshots) : {};

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

        return {
            counts,
            message: full ? 'Справочники YCLIENTS успешно синхронизированы' : 'Сотрудники YCLIENTS успешно синхронизированы',
            branchId: Number(branchId),
            staffCount: staff.length,
            activeCount,
            firedCount,
            deletedCount,
            staffSyncedAt: updatedBranch.rows[0].staffSyncedAt,
        };
    } catch (error) {
        if (transaction) await rollbackTransaction(
            client,
            'Ошибка отката синхронизации:'
        );

        if (error.code === '55P03') throw integrationError('Филиал уже синхронизируется или редактируется', 409);
        throw error;
    } finally {
        if (client) {
            try { if (locked) await client.query('SELECT pg_advisory_unlock(147222, $1::integer)', [branchId]); }
            finally { client.release(); }
        }
    }
}

function sendSyncError(res, error) {
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Не удалось синхронизировать филиал' });
}

router.post('/:id/sync-staff', requireAuth, allowRoles('manager', 'developer'), async (req, res) => {
    try { res.json(await synchronizeBranch(req.params.id)); }
    catch (error) { sendSyncError(res, error); }
});

router.post('/:id/sync', requireAuth, allowRoles('manager', 'developer'), async (req, res) => {
    const id = req.params.id;
    if (!isValidId(id)) return res.status(400).json({ message: 'Некорректный ID филиала' });
    const previous = syncJobs.get(id);
    if (previous?.status === 'running') return res.status(202).json(previous);
    if (previous && Date.now() - previous.startedAt < 60000) {
        return res.status(429).json({ message: 'Повторная синхронизация доступна через минуту после запуска' });
    }
    try {
        const result = await pool.query('SELECT id FROM branches WHERE id=$1 AND is_active AND yclients_company_id IS NOT NULL', [id]);
        if (!result.rowCount) return res.status(400).json({ message: 'Укажите YCLIENTS Company ID активного филиала' });
        if (syncJobs.get(id)?.status === 'running') return res.status(202).json(syncJobs.get(id));
        const job = { status: 'running', stage: 'staff', count: 0, startedAt: Date.now() };
        syncJobs.set(id, job);
        res.status(202).json(job);
        // Задача продолжает работать после ухода пользователя со страницы.
        void synchronizeBranch(id, true, (stage, count) => Object.assign(job, { stage, count }))
            .then(result => Object.assign(job, { status: 'done', result }))
            .catch(error => Object.assign(job, {
                status: 'error', message: error.status ? error.message : 'Синхронизация не завершена. Предыдущие данные сохранены.',
            }));
    } catch (error) { sendSyncError(res, error); }
});

export default router;
