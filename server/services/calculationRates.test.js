import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCalculationRates } from '../../shared/calculationSettings.js';
import { calculateSalary } from '../../shared/salary.js';
import { rankingSalary } from './rankingSalary.js';

test('approved rates supply the same commission to calculator and ranking; personal trials stay separate', () => {
    const rates = resolveCalculationRates('barber', { servicePercent: 45, productPercent: 0 }, { rate: 200, servicePercent: 40, productPercent: 10 });
    const trial = resolveCalculationRates('barber', { servicePercent: 99 }, rates);
    assert.equal(trial.servicePercent, 99);
    assert.equal(rates.servicePercent, 45);
    assert.equal(rates.productPercent, 0);
    const days = [{date:'2026-11-01',hours:8,services:10000}];
    const ranking = rankingSalary({days}, {category:'barber',rates});
    const salary = calculateSalary({type:'services',mode:'period',start:'2026-11-01',end:'2026-11-01',days,rate:rates.rate,percent:rates.servicePercent});
    assert.equal(ranking.commission, 4500);
    assert.equal(salary, 4500);
    assert.equal(ranking.salaryBreakdown.hourlyMinimum, 1600);
    assert.equal(resolveCalculationRates('barber').servicePercent, null);
    assert.equal(resolveCalculationRates('admin', {servicePercent:50}).servicePercent, undefined);
});
