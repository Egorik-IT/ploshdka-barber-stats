import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeClients } from './clientStatistics.js';

test('client cohorts use employee history, visit status and a clamped calendar cutoff', () => {
    const visit = (id, date, extra = {}) => ({ branchId: 1, staff_id: 2, date, attendance: 1, client: { id, phone: String(id) }, ...extra });
    const history = [
        visit(1, '2026-01-01'), visit(1, '2026-02-28'), // lost at the exact calendar cutoff
        visit(2, '2025-01-01'), // one visit is not a lost regular
        visit(3, '2026-01-01', { branchId: 3, staff_id: 9 }), visit(3, '2026-03-10'), // already visited another branch
        visit(4, '2026-03-12'), visit(4, '2026-03-15'), // new and regular, counted once
        visit(5, '2026-03-20', { attendance: -1 }),
        visit(6, '2026-03-20', { deleted: '1' }),
        visit(7, '2026-04-10'), // outside report
    ];
    const current = history.filter(record => record.date >= '2026-03-01' && record.date <= '2026-03-31');
    assert.deepEqual(summarizeClients(history, current, [{ branch_id: 1, yclients_staff_id: 2 }], '2026-03-01', '2026-03-31', 1), { regular: 1, lost: 1, new: 2, noShows: 1, regularVisited: 0, returned: 0 });
});

test('period metrics distinguish established regulars, returns and new clients without counting visits twice', () => {
    const visit=(id,date,extra={})=>({branchId:1,staff_id:2,date,attendance:1,client:{id,phone:String(id)},...extra});
    const history=[visit(1,'2026-08-01'),visit(1,'2026-09-01'),visit(2,'2026-05-10'),visit(3,'2025-01-01'),
        visit(4,'2026-11-03'),visit(5,'2026-05-11'),visit(6,'2026-01-01',{staff_id:9})];
    const current=[visit(1,'2026-11-02'),visit(1,'2026-11-06'),visit(2,'2026-11-10'),visit(2,'2026-11-15'),
        visit(4,'2026-11-03'),visit(4,'2026-11-04'),visit(5,'2026-11-10'),visit(6,'2026-11-12'),
        visit(7,'2026-11-13',{attendance:-1}),visit(8,'2026-11-14',{deleted:true})];
    const result=summarizeClients(history.reverse(),current.reverse(),[{branch_id:1,yclients_staff_id:2}],'2026-11-01','2026-11-19',6);
    assert.deepEqual(result,{regular:3,lost:0,new:2,noShows:1,regularVisited:1,returned:1});
    // The base at the end stays the same when only the start date changes.
    const short=summarizeClients([...history,...current],current.filter(r=>r.date>='2026-11-11'),[{branch_id:1,yclients_staff_id:2}],'2026-11-11','2026-11-19',6);
    assert.equal(short.regular,result.regular);
    assert.equal(short.lost,result.lost);
    assert.equal(short.returned,0);
    assert.equal(short.new,1);
});

test('two latest visits across branches determine loyalty, with both visits inside the active window', () => {
    const visit = (id, date, extra = {}) => ({branchId:1,staff_id:2,date,attendance:1,client:{id,phone:String(id)},...extra});
    const history = [
        visit(1,'2026-07-01'),visit(1,'2026-08-01'), // regular
        visit(2,'2026-04-01'),visit(2,'2026-05-20'), // lost exactly six months
        visit(3,'2026-01-01'),visit(3,'2026-08-01'), // recent return, not yet regular
        visit(4,'2026-07-01'),visit(4,'2026-08-01'), // subsequently went elsewhere
        visit(5,'2026-01-01'),visit(5,'2026-02-01'),visit(5,'2026-03-01',{staff_id:9}), // not this employee's lost client
        visit(6,'2026-07-01'),visit(6,'2026-08-01',{staff_id:9}),visit(6,'2026-09-01'), // alternating masters
        visit(7,'2026-07-01'),visit(7,'2026-08-01'),
    ];
    const current = [visit(4,'2026-11-01',{branchId:3,staff_id:9}),
        visit(7,'2026-11-01',{staff_id:9,attendance:-1}),visit(7,'2026-11-02',{staff_id:9,deleted:1})];
    const result = summarizeClients(history,current,[{branch_id:1,yclients_staff_id:2}],'2026-11-01','2026-11-20',6);
    assert.equal(result.regular,2);
    assert.equal(result.lost,1);
});

test('return after six calendar months clamps month end and ignores cancelled visits', () => {
    const visit=(date,attendance=1)=>({branchId:1,staff_id:2,date,attendance,client:{id:1}});
    const result=summarizeClients([visit('2025-08-31'),visit('2026-01-01',-1)],[visit('2026-02-28')],
        [{branch_id:1,yclients_staff_id:2}],'2026-02-01','2026-02-28',6);
    assert.equal(result.returned,1);
    assert.equal(result.new,0);
});
