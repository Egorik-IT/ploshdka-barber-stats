import { cookieOptions } from '../config/runtime.js';

import { Router } from 'express';
import { createLoginLimit } from '../middleware/loginLimit.js';
import bcrypt from 'bcryptjs';

import pool from '../config/db.js';
import requireAuth from '../middleware/authMiddleware.js';
import { watchSession } from '../services/sessionEvents.js';

const router = Router();

router.get('/events', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': connected\n\n');
    watchSession(req.session.userId, res);
    const heartbeat = setInterval(async () => {
        try {
            const { rows } = await pool.query('SELECT is_active FROM users WHERE id=$1', [req.session.userId]);
            if (!rows[0]?.is_active) {
                res.write('event: blocked\ndata: {}\n\n');
                res.end();
            } else res.write(': heartbeat\n\n');
        } catch { res.end(); }
    }, 15000);
    res.on('close', () => clearInterval(heartbeat));
});

function serializeUser(user) {
    return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        calculationCategory: user.calculation_category,
        photo: user.custom_photo_url || user.yclients_photo_url || null,
    };
}

// ======================================
// ВХОД В АККАУНТ
// POST /api/auth/login
// ======================================

router.post('/login', createLoginLimit(), async (req, res) => {
    try {
        const { username, password } = req.body || {};

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
                u.calculation_category,
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
                    user: serializeUser(user),
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
                u.calculation_category,
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

        res.json({
            user: serializeUser(user),
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

        res.clearCookie('ploshdka.sid', cookieOptions());

        res.json({
            message: 'Выход выполнен успешно',
        });
    });
});

export default router;
