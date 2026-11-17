import { loadPermissionOverrides } from '../utils/permissions.js';

import { Router } from 'express';
import bcrypt from 'bcryptjs';

import pool from '../config/db.js';
import requireAuth from '../middleware/authMiddleware.js';

const router = Router();

function serializeUser(user, permissionsOverride) {
    return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        photo: user.custom_photo_url || user.yclients_photo_url || null,
        permissionsOverride,
    };
}

// ======================================
// ВХОД В АККАУНТ
// POST /api/auth/login
// ======================================

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (
            typeof username !== 'string' ||
            typeof password !== 'string' ||
            !username.trim() ||
            !password
        ) {
            return res.status(400).json({
                message: 'Введите логин и пароль',
            });
        }

        // Ищем пользователя в PostgreSQL
        const result = await pool.query(
            `SELECT
                u.id,
                u.username,
                u.password_hash,
                u.display_name,
                u.is_active,
                u.custom_photo_url,
                u.yclients_photo_url,
                r.name AS role
             FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE LOWER(u.username) = LOWER($1)
             LIMIT 1`,
            [username.trim()]
        );

        const user = result.rows[0];

        // Проверяем существование и статус аккаунта
        if (!user || !user.is_active) {
            return res.status(401).json({
                message: 'Неверный логин или пароль',
            });
        }

        // Проверяем пароль через bcrypt
        const passwordValid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordValid) {
            return res.status(401).json({
                message: 'Неверный логин или пароль',
            });
        }

        // Получаем индивидуальные настройки
        const permissionsOverride =
            await loadPermissionOverrides(pool, user.id);

        // Создаём новую сессию
        req.session.regenerate((error) => {
            if (error) {
                console.error(error);

                return res.status(500).json({
                    message: 'Ошибка создания сессии',
                });
            }

            req.session.userId = user.id;

            req.session.save((error) => {
                if (error) {
                    console.error(error);

                    return res.status(500).json({
                        message: 'Ошибка сохранения сессии',
                    });
                }

                res.json({
                    message: 'Вход выполнен успешно',
                    user: serializeUser(user, permissionsOverride),
                });
            });
        });

    } catch (error) {
        console.error('Ошибка авторизации:', error);

        res.status(500).json({
            message: 'Внутренняя ошибка сервера',
        });
    }
});

// ======================================
// ПОЛУЧЕНИЕ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
// GET /api/auth/me
// ======================================

router.get('/me', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                u.id,
                u.username,
                u.display_name,
                u.is_active,
                u.custom_photo_url,
                u.yclients_photo_url,
                r.name AS role
             FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.id = $1`,
            [req.session.userId]
        );

        const user = result.rows[0];

        if (!user || !user.is_active) {
            return res.status(401).json({
                message: 'Аккаунт недоступен',
            });
        }

        const permissionsOverride =
            await loadPermissionOverrides(pool, user.id);

        res.json({
            user: serializeUser(user, permissionsOverride),
        });

    } catch (error) {
        console.error('Ошибка получения пользователя:', error);

        res.status(500).json({
            message: 'Не удалось получить данные пользователя',
        });
    }
});

// ======================================
// ВЫХОД ИЗ АККАУНТА
// POST /api/auth/logout
// ======================================

router.post('/logout', (req, res) => {
    if (!req.session) {
        return res.json({
            message: 'Выход выполнен',
        });
    }

    req.session.destroy((error) => {
        if (error) {
            console.error(error);

            return res.status(500).json({
                message: 'Ошибка выхода из аккаунта',
            });
        }

        res.clearCookie('ploshdka.sid', {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
        });

        res.json({
            message: 'Выход выполнен успешно',
        });
    });
});

export default router;
