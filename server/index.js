import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeConfig, cookieOptions } from './config/runtime.js';
import { httpSecurity } from './middleware/httpSecurity.js';
import { auditLog } from './middleware/auditLog.js';

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
import clientsRoutes from './routes/clients.js';
import settingsRoutes from './routes/settings.js';
import reportsRoutes from './routes/reports.js';
import { ensureDirectorySchema } from './services/directorySchema.js';

dotenv.config();

const app = express();
const config = runtimeConfig();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(httpSecurity(config));

// Проверяем наличие секретного ключа
if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET не указан в .env');
}

app.use(cors({
    origin: config.origins,
    credentials: true,
}));

app.use(express.json({ limit: '100kb' }));

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
        ...cookieOptions(),
        maxAge: 1000 * 60 * 60 * 8,
        path: '/',
    },
}));

app.use('/api', auditLog);

// Подключаем маршруты авторизации
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/yclients-staff', yclientsStaffRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportsRoutes);

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
        await pool.query('SELECT 1');

        res.json({
            status: 'OK',
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: 'ERROR',
            message: 'Ошибка подключения к базе данных',
        });
    }
});

app.use('/api', (req, res) => res.status(404).json({ message: 'Маршрут API не найден' }));
if (config.production) {
    const dist = fileURLToPath(new URL('../dist/', import.meta.url));
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500;
    res.status(status).json({ message: status === 400 ? 'Некорректный JSON' : status === 413 ? 'Слишком большой запрос' : 'Внутренняя ошибка сервера' });
});

await ensureDirectorySchema();
// Удаляем только истёкшие снимки отчётов, не справочники и не финансовые данные.
const cleanCache = () => pool.query("DELETE FROM yclients_report_cache WHERE updated_at < NOW() - INTERVAL '7 days'").catch(() => console.error('Не удалось очистить кэш'));
void cleanCache();
const maintenance = setInterval(cleanCache, 86400000);
maintenance.unref();

const server = app.listen(config.port, config.host, () => {
    console.log(`Сервер запущен на порту ${config.port}`);
});
function shutdown() {
    clearInterval(maintenance);
    server.close(() => void pool.end());
    setTimeout(() => process.exit(0), 10000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
