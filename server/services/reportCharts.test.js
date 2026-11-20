import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyActivity } from './reportCharts.js';

test('chart counts completed visits, service quantities and no-shows separately and fills empty dates', () => {
    const records = [
        { date: '2026-11-01 10:00:00', attendance: 1, services: [{ amount: 2, cost_to_pay: 600 }, { cost: 100 }] },
        { datetime: '2026-11-01T11:00:00+03:00', attendance: '1', services: [{ amount: 1, cost_to_pay: 0, cost: 500 }] },
        { date: '2026-11-01', attendance: -1, services: [{ cost: 900 }] },
        { date: '2026-11-01', attendance: 0, services: [{ cost: 900 }] },
        { date: '2026-11-02', attendance: 1, deleted: 1, services: [{ cost: 900 }] },
        { date: '2026-11-02', attendance: -1, deleted: 1 },
        { date: '2026-10-31', attendance: 1, services: [{ cost: 900 }] },
    ];
    const original = structuredClone(records);
    assert.deepEqual(dailyActivity(records, '2026-11-01', '2026-11-02'), [
        { date: '2026-11-01', visits: 2, noShows: 1, services: 4, revenue: 700 },
        { date: '2026-11-02', visits: 0, noShows: 0, services: 0, revenue: 0 },
    ]);
    assert.deepEqual(records, original);
    assert.equal(dailyActivity([], '2026-01-01', '2026-12-31').length, 365);
});
