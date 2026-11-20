import 'dotenv/config';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import pool from '../config/db.js';

const file = process.argv[2];
if (!file) throw new Error('Укажите файл: npm run db:verify-backup -- backups/имя.dump');
await access(file);
const database = `codex_restore_${randomBytes(8).toString('hex')}`;
let created = false;
let check;
try {
    // Только новая случайная БД; рабочая БД никогда не является целью восстановления.
    await pool.query(`CREATE DATABASE "${database}"`);
    created = true;
    await new Promise((resolve, reject) => {
        const child = spawn(process.env.PG_RESTORE_PATH || 'pg_restore',
            ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', database, path.resolve(file)], {
                windowsHide: true, stdio: 'ignore',
                env: { ...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT,
                    PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD },
            });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve() : reject(new Error('pg_restore завершился с ошибкой')));
    });
    check = new pg.Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database});
    for (const table of ['users','roles','branches','calculation_settings','finance_entries']) {
        await check.query(`SELECT count(*) FROM ${table}`);
    }
    console.log('Копия восстановлена в отдельную временную БД; основные таблицы читаются.');
} catch (error) {
    console.error('Проверка восстановления не пройдена:', error.message);
    process.exitCode = 1;
} finally {
    if (check) await check.end();
    if (created) await pool.query(`DROP DATABASE "${database}"`);
    await pool.end();
}
