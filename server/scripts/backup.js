import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve(process.env.BACKUP_DIR || 'backups');
await mkdir(directory, { recursive: true, mode: 0o700 });
const file = path.join(directory, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
const command = process.env.PG_DUMP_PATH || 'pg_dump';
const child = spawn(command, ['--format=custom', '--no-owner', '--no-acl', '--file', file], {
    windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGDATABASE: process.env.DB_NAME,
        PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD },
});
child.stderr.on('data', () => {}); // Не выводим параметры подключения.
child.on('error', () => { console.error('Не удалось запустить pg_dump. Укажите PG_DUMP_PATH.'); process.exitCode = 1; });
child.on('close', async code => {
    if (code !== 0) { console.error('Резервная копия не создана. Проверьте доступ к БД и pg_dump.'); process.exitCode = 1; return; }
    const result = await stat(file);
    console.log(`Резервная копия: ${file} (${result.size} байт). Храните её вне каталога сайта.`);
});
