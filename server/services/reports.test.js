import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeEmployee, serviceAmount, sales, validatePeriod } from './reports.js';
test('services exclude goods; product sales belong to seller and handle returns',()=>{
 const datasets=[{branch:{id:1,name:'Test'},openingTime:'10:00',schedule:[{staff_id:2,date:'2026-10-01',slots:[{from:'12:00',to:'20:00'}]}],records:[{staff_id:2,date:'2026-10-01 13:00:00',attendance:1,services:[{cost_to_pay:1000}],goods_transactions:[{cost:500}]}],goods:[{type_id:1,master:{id:2},amount:-2,cost:500,loyalty_certificate_id:'0'},{type_id:1,master:{id:2},amount:1,cost:100},{type_id:1,master:{id:3},amount:-1,cost:900},{type_id:2,master:{id:2},amount:-1,cost:900}]}];
 const s=summarizeEmployee(datasets,[{branch_id:1,yclients_staff_id:'2'}]);
 assert.equal(s.services,1000);assert.equal(s.products,400);assert.equal(s.units,1);assert.equal(s.hours,8);assert.equal(s.days[0].cleaning,false);
 assert.equal(serviceAmount(datasets[0].records[0]),1000);
 assert.equal(sales([{type_id:1,loyalty_certificate_id:123}]).length,0);
});
test('invalid and excessive periods rejected',()=>{
 for(const [a,b]of [['2026-02-30','2026-03-01'],['2026-03-01','2026-02-01'],['2020-01-01','2026-01-01']])assert.throws(()=>validatePeriod(a,b));
 validatePeriod('2026-10-01','2026-10-31');
});
