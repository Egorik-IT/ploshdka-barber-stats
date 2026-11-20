import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pool from '../config/db.js';

test('a fresh isolated schema supports all migrations and repeated migration runs', {skip:process.env.RUN_DB_TESTS!=='1'}, async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('CREATE SCHEMA codex_schema_test');
        await client.query('SET LOCAL search_path TO codex_schema_test');
        for (let run=0;run<2;run++) for (const name of ['000_core.sql','001_yclients_directory.sql','002_operations.sql']) {
            await client.query(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
        }
        const roles=await client.query('SELECT name FROM roles');
        assert.equal(roles.rowCount,4);
        const user=await client.query("INSERT INTO users(username,password_hash,display_name,role_id) SELECT 'test','hash','Test',id FROM roles WHERE name='employee' RETURNING id");
        assert.ok(user.rows[0].id);
        await client.query("INSERT INTO audit_events(actor_id,method,path,status) VALUES($1,'PATCH','/users/1',200)",[user.rows[0].id]);
        await client.query("INSERT INTO user_sessions(sid,sess,expire) VALUES('test','{}',NOW())");
    } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
});
