import pool from '../config/db.js';
import { ensureDirectorySchema } from '../services/directorySchema.js';
try {
    await ensureDirectorySchema();
    console.log('Схема БД готова');
} catch (error) {
    console.error('Миграция не выполнена:', error.message);
    process.exitCode = 1;
} finally { await pool.end(); }
