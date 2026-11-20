import test from 'node:test';
import assert from 'node:assert/strict';
import { dayOverview } from './dayOverview.js';
import { rankingSalary } from './rankingSalary.js';

test('day overview includes empty working shifts, excludes cancelled records and isolates own staff ID', () => {
    const records=[
        {id:1,staff_id:2,date:'2026-11-19 12:00:00',attendance:0,services:[{title:'Стрижка',cost_to_pay:1500}]},
        {id:2,staff_id:3,date:'2026-11-19 11:00:00',attendance:1,services:[{cost_to_pay:2000}]},
        {id:3,staff_id:2,date:'2026-11-19 13:00:00',deleted:true,services:[]},
    ];
    const datasets=[{branch:{id:1,name:'Test'},records,goods:[],schedule:[{staff_id:2,slots:[{from:'10:00',to:'20:00'}]},{staff_id:4,slots:[{from:'10:00',to:'20:00'}]}]}];
    const own=dayOverview(datasets,[],[{branch_id:1,yclients_staff_id:'2'}]);
    assert.equal(own.groups.length,1);
    assert.equal(own.groups[0].records.length,1);
    assert.equal(own.groups[0].records[0].amount,1500);
    const all=dayOverview(datasets,[]);
    assert.equal(all.groups.length,3);
    assert.equal(all.groups.find(group=>group.staffId==='4').records.length,0);
    assert.equal(all.branches[0].services,2000,'only completed services contribute to revenue');
});

test('ranking orders by commission rather than minimum or cosmetics and shows both amounts', () => {
    const data={days:[{hours:10,services:1000}],products:99999};
    const result=rankingSalary(data,{category:'barber',rates:{rate:200,servicePercent:40,productPercent:50}});
    assert.equal(result.commission,400);
    assert.equal(result.salaryBreakdown.hourlyMinimum,2000);
    const noMinimum=rankingSalary(data,{category:'barber',rates:{rate:null,servicePercent:40}});
    assert.equal(noMinimum.commission,400);
    assert.equal(noMinimum.salaryBreakdown.hourlyMinimum,null);
});
