import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCollection } from './yclientsApi.js';

test('loads all pages even when a page is smaller than requested', async () => {
    const pages = [];
    const items = await fetchCollection(async page => {
        pages.push(page);
        return { data: [{ id: page }], meta: { total_count: 3 } };
    });
    assert.deepEqual(pages, [1, 2, 3]);
    assert.deepEqual(items.map(item => item.id), ['1', '2', '3']);
});
test('goods pagination without total ends on an empty page', async () => {
    const result = await fetchCollection(async page => ({ data: page < 3 ? [{ good_id: String(page) }] : [] }));
    assert.equal(result.length, 2);
});
test('rejects repeated pages and incomplete responses', async () => {
    await assert.rejects(fetchCollection(async () => ({ data: [{ id: 1 }] })), /повторяет/);
    await assert.rejects(fetchCollection(async () => ({ data: [], meta: { total_count: 3 } })), /неполный/);
    await assert.rejects(fetchCollection(async () => ({ data: [{ id: 1 }], meta: { total_count: 3 } }), { paginated: false }), /неполный/);
});
test('rejects invalid identifiers and malformed collections', async () => {
    for (const id of [null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 'bad']) {
        await assert.rejects(fetchCollection(async () => ({ data: [{ id }] })));
    }
    await assert.rejects(fetchCollection(async () => ({ data: {} })));
});
test('accepts empty directory and preserves large string IDs', async () => {
    assert.deepEqual(await fetchCollection(async () => ({ data: [], meta: { total_count: 0 } })), []);
    const result = await fetchCollection(async () => ({ data: [{ id: '9223372036854775807' }] }), { paginated: false });
    assert.equal(result[0].id, '9223372036854775807');
});
test('propagates page failures instead of returning partial results', async () => {
    await assert.rejects(fetchCollection(async page => {
        if (page === 2) throw new Error('API unavailable');
        return { data: [{ id: 1 }] };
    }), /API unavailable/);
});
