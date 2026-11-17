
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

import pool from './config/db.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import branchesRoutes from './routes/branches.js';
import yclientsStaffRoutes from './routes/yclientsStaff.js';

dotenv.config();

const app = express();
const PORT = 3001;

// Проверяем наличие секретного ключа
if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET не указан в .env');
}

app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
}));

app.use(express.json());

// Подключаем хранилище сессий PostgreSQL
const PgSession = connectPgSimple(session);

app.use(session({
    store: new PgSession({
        pool: pool,
        tableName: 'user_sessions',
        createTableIfMissing: true,
    }),

    name: 'ploshdka.sid',
    secret: process.env.SESSION_SECRET,

    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 8,
        path: '/',
    },
}));

// Подключаем маршруты авторизации
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/yclients-staff', yclientsStaffRoutes);

// Проверка сервера
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Сервер работает',
    });
});

// Проверка PostgreSQL
app.get('/api/health/db', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT current_database() AS database'
        );

        res.json({
            status: 'OK',
            database: result.rows[0].database,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: 'ERROR',
            message: 'Ошибка подключения к базе данных',
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
