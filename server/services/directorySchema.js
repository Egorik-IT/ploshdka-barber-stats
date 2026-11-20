import { readFile } from 'node:fs/promises';
import pool from '../config/db.js';
import { refreshEmployeeCategories } from './employeeCategory.js';

export async function ensureDirectorySchema() {
    const migrations = ['000_core.sql', '001_yclients_directory.sql', '002_operations.sql'];
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(147221, 1)');
        for (const migration of migrations) {
            await client.query(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
        }
        await refreshEmployeeCategories(client);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
