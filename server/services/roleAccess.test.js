import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../config/db.js';
import users from '../routes/users.js';
import reports from '../routes/reports.js';
import settings from '../routes/settings.js';
import branches from '../routes/branches.js';
import { canManageRole } from '../middleware/roleAccess.js';
import { createLoginLimit } from '../middleware/loginLimit.js';

test('login throttling normalizes usernames and expires without trusting forwarded headers', () => {
    let time = 0;
    const limit = createLoginLimit({ now: () => time, windowMs: 1000 });
    let passed = 0;
    let status = null;
    const res = { setHeader() {}, status(value) { status = value; return this; }, json() {} };
    const req = { ip: '127.0.0.1', body: { username: ' Employee ' } };
    for (let i = 0; i < 10; i++) limit(req, res, () => passed++);
    req.body.username = 'employee';
    limit(req, res, () => passed++);
    assert.equal(passed, 10);
    assert.equal(status, 429);
    time = 1001;
    limit(req, res, () => passed++);
    assert.equal(passed, 11);
});

test('account hierarchy cannot promote an administrator or edit a peer manager', () => {
    assert.equal(canManageRole({ role: 'admin' }, 'employee'), true);
    assert.equal(canManageRole({ role: 'admin' }, 'manager'), false);
    assert.equal(canManageRole({ role: 'manager' }, 'admin'), true);
    assert.equal(canManageRole({ role: 'manager' }, 'manager'), false);
    assert.equal(canManageRole({ role: 'developer' }, 'manager'), true);
    assert.equal(canManageRole({ role: 'developer' }, 'developer'), false);
});

test('real API routes reject forged roles and unauthorized reads and writes before loading data', async () => {
    const originalQuery = pool.query;
    const roles = { 1: 'employee', 2: 'admin', 3: 'manager', 4: 'developer' };
    const accounts = Object.entries(roles).map(([id, role]) => ({ id: Number(id), role }));
    pool.query = async (sql, values) => {
        if (sql.includes('u.is_active, r.name AS role')) {
            const role = roles[values[0]];
            return { rows: role ? [{ id: values[0], role, is_active: true }] : [] };
        }
        if (sql.includes('ORDER BY u.id ASC')) return { rows: accounts };
        if (sql.includes('u.username') && sql.includes('LIMIT 1')) {
            return { rows: accounts.filter(user => user.id === Number(values[0])) };
        }
        throw new Error('Unexpected data access: ' + sql);
    };
    const app = express();
    app.use(express.json());
    // Only this test fixture injects a session; production uses express-session.
    app.use((req, res, next) => {
        if (req.headers['x-test-id']) req.session = { userId: Number(req.headers['x-test-id']) };
        next();
    });
    app.use('/users', users);
    app.use('/reports', reports);
    app.use('/settings', settings);
    app.use('/branches', branches);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(id, path, method = 'GET', body) {
        return fetch(base + path, { method, headers: { 'x-test-id': String(id), 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined });
    }
    try {
        assert.equal((await fetch(base + '/users')).status, 401);
        for (const [id, path, method, body] of [
            [1, '/users'], [1, '/users/2', 'PATCH', { role: 'manager' }],
            [1, '/users', 'POST', { role: 'employee' }],
            [2, '/users', 'POST', { role: 'manager' }],
            [2, '/users/3'], [3, '/users/3'],
            [2, '/users/1', 'PATCH', { role: 'manager' }],
            [1, '/reports/finance'], [2, '/reports/finance'],
            [1, '/reports/finance', 'PUT', {}],
            [1, '/reports/employee?userId=2'],
            [1, '/reports/ranking'], [2, '/reports/ranking?view=manager'],
            [1, '/reports/day?view=manager'], [1, '/reports/day?view=admin'],
            [1, '/settings/network', 'PUT', { role: 'developer' }],
            [2, '/settings/network', 'PUT', {}],
            [1, '/settings/employees/1', 'PUT', { servicePercent: 100 }],
            [2, '/settings/employees/1', 'PUT', { servicePercent: 100 }],
            [1, '/branches', 'POST', {}], [2, '/branches/1', 'PATCH', {}],
            [1, '/branches/1/sync', 'POST', {}], [2, '/branches/1/sync-staff', 'POST', {}],
        ]) {
            assert.equal((await request(id, path, method, body)).status, 403, `${id}: ${method || 'GET'} ${path}`);
        }
        for (const [id, expected] of [[2, ['employee']], [3, ['employee', 'admin']], [4, ['employee', 'admin', 'manager']]]) {
            const response = await request(id, '/users');
            assert.equal(response.status, 200);
            assert.deepEqual((await response.json()).users.map(user => user.role), expected);
        }
    } finally {
        await new Promise(resolve => server.close(resolve));
        pool.query = originalQuery;
    }
});
