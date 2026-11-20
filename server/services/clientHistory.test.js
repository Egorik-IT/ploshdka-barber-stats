import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/db.js';
import { clientHistory } from './clientHistory.js';

test('history resumes cached pages after failure and reuses complete snapshots for earlier periods', async () => {
    const originalQuery = pool.query, originalFetch = globalThis.fetch;
    const originalPartner = process.env.YCLIENTS_PARTNER_TOKEN, originalUser = process.env.YCLIENTS_USER_TOKEN;
    const cache = new Map(), requests = [];
    let fail = true;
    const wait = async job => {
        while (job.status === 'running') await new Promise(resolve => setTimeout(resolve, 5));
        return job;
    };
    try {
        process.env.YCLIENTS_PARTNER_TOKEN = 'test'; process.env.YCLIENTS_USER_TOKEN = 'test';
        pool.query = async (sql, values) => {
            if (sql.includes('cache_key LIKE')) {
                const entry = [...cache].find(([key]) => key.startsWith('client-history:') && key >= values[1]);
                return { rows: entry ? [entry[1]] : [] };
            }
            if (sql.startsWith('SELECT')) return { rows: cache.has(values[0]) ? [cache.get(values[0])] : [] };
            assert.match(sql, /^INSERT INTO yclients_report_cache/);
            cache.set(values[0], { data: JSON.parse(values[1]), updated_at: new Date() });
            return { rows: [] };
        };
        globalThis.fetch = async url => {
            assert.ok(url.startsWith('https://api.yclients.com/api/v1/records/987654321?'));
            const page = Number(new URL(url).searchParams.get('page')); requests.push(page);
            if (page === 2 && fail) return new Response('', { status: 503 });
            return Response.json({ success: true, data: [{ id: page, staff_id: 1, date: page === 1 ? '2026-10-01' : '2026-10-31', attendance: 1, client: { id: page, phone: '000', comment: 'not needed' }, services: [{ cost: 1000 }] }], meta: { total_count: 2 } });
        };
        const branch = { id: 1, name: 'Test', yclientsCompanyId: '987654321' };
        assert.equal((await wait(clientHistory(branch, '2026-10-31'))).status, 'error');
        assert.equal(clientHistory(branch, '2026-10-31').status, 'error'); // report the error before retrying
        fail = false;
        const complete = await wait(clientHistory(branch, '2026-10-31'));
        assert.equal(complete.status, 'done');
        assert.deepEqual(requests, [1, 2, 2, 2, 2]);
        assert.equal(complete.records.length, 2);
        assert.equal(complete.records[0].services, undefined);
        assert.equal(complete.records[0].client.comment, undefined);
        const earlier = await wait(clientHistory(branch, '2026-10-15'));
        assert.equal(earlier.records.length, 1);
        assert.deepEqual(requests, [1, 2, 2, 2, 2]);
    } finally {
        pool.query = originalQuery; globalThis.fetch = originalFetch;
        if (originalPartner === undefined) delete process.env.YCLIENTS_PARTNER_TOKEN; else process.env.YCLIENTS_PARTNER_TOKEN = originalPartner;
        if (originalUser === undefined) delete process.env.YCLIENTS_USER_TOKEN; else process.env.YCLIENTS_USER_TOKEN = originalUser;
    }
});
