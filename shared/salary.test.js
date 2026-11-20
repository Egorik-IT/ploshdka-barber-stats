import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSalary, sumSalaries } from './salary.js';

const period = { start: '2026-11-01', end: '2026-11-30' };
const services = {
    ...period, type: 'services', rate: 200, percent: 50, mode: 'period',
    days: [
        { date: '2026-11-01', hours: 8, services: 1000 },
        { date: '2026-11-02', hours: 2, services: 4000 },
    ],
};

test('сравнение итогов периода отличается от суммы дневных максимумов', () => {
    assert.equal(calculateSalary(services), 2500);
    assert.equal(calculateSalary({ ...services, mode: 'daily' }), 3600);
});

test('несколько строк одной даты объединяются до дневного сравнения', () => {
    const days = services.days.map(day => ({ ...day, date: '2026-11-01' }));
    assert.equal(calculateSalary({ ...services, mode: 'daily', days }), 2500);
});

test('косметика и свободные начисления складываются с оплатой услуг', () => {
    const products = calculateSalary({ ...period, type: 'products', amount: 5000, percent: 10 });
    const manual = calculateSalary({ ...period, type: 'manual', amount: 750 });
    assert.equal(sumSalaries([calculateSalary(services), products, manual]), 3750);
});

test('администратор: часы, только отмеченные уборки и надбавки', () => {
    assert.equal(calculateSalary({
        ...period, type: 'admin', rate: 200, cleaningRate: 300, bonus: 1000,
        days: [
            { date: '2026-11-01', hours: 8, cleaning: true },
            { date: '2026-11-02', hours: 6, cleaning: false },
        ],
    }), 4100);
});

test('округление результата до копеек и точное сложение отображаемых сумм', () => {
    assert.equal(calculateSalary({ ...period, type: 'products', amount: 100.05, percent: 10 }), 10.01);
    assert.equal(sumSalaries([0.1, 0.2]), 0.3);
});

test('ноль допустим, незаполненные и неверные значения отклоняются', () => {
    assert.equal(calculateSalary({ ...period, type: 'manual', amount: 0 }), 0);
    for (const amount of ['', ' ', null, undefined, -1, Infinity, NaN, true]) {
        assert.throws(() => calculateSalary({ ...period, type: 'manual', amount }));
    }
    assert.throws(() => calculateSalary({ ...services, percent: 101 }));
    assert.throws(() => calculateSalary({ ...services, mode: 'unknown' }));
    assert.throws(() => calculateSalary({ ...services, days: [] }));
});

test('неверные даты, обратный период и смены вне периода отклоняются', () => {
    assert.throws(() => calculateSalary({ ...services, start: '2026-02-30' }));
    assert.throws(() => calculateSalary({ ...services, start: '2026-12-01' }));
    assert.throws(() => calculateSalary({ ...services, end: '2026-11-01' }));
});

test('исходные данные расчёта не изменяются', () => {
    const original = structuredClone(services);
    calculateSalary(services);
    assert.deepEqual(services, original);
});
