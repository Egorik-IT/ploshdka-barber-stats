import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../config/db.js';
import clientsRoutes from '../routes/clients.js';
import settingsRoutes from '../routes/settings.js';
import reportsRoutes from '../routes/reports.js';
import { syncDirectory } from './yclientsDirectory.js';
import { refreshEmployeeCategories } from './employeeCategory.js';
import { calculationProfiles } from './calculationProfiles.js';

test('directory replacement, rollback, branch isolation and clients API', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
    const client = await pool.connect();
    const originalQuery = pool.query;
    let server;
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`INSERT INTO branches (name,yclients_company_id,is_active)
            VALUES ('__directory_transaction_test__',987654321,true) RETURNING id,yclients_company_id::text AS "yclientsCompanyId"`);
        const branch = rows[0];
        let clients = [{ id: 1, name: 'Тест % _', phone: '000', comment: 'Комментарий карточки' }, { id: 2, name: 'Другой' }];
        let fail = false;
        const request = async (path, body) => {
            if (path.startsWith('/clients/')) return { data: clients, meta: { total_count: clients.length } };
            if (path.includes('services')) {
                if (fail) throw new Error('upstream failed');
                return { data: [{ id: 3, title: 'Услуга' }], meta: { total_count: 1 } };
            }
            assert.equal(body, undefined);
            return { data: [] };
        };
        assert.deepEqual(await syncDirectory(client, branch, undefined, request), { clients: 2, services: 1, goods: 0 });
        await syncDirectory(client, branch, undefined, request);
        let count = await client.query('SELECT count(*)::integer AS n FROM yclients_directory WHERE branch_id=$1', [branch.id]);
        assert.equal(count.rows[0].n, 3, 'repeat sync does not duplicate data');
        await client.query('SAVEPOINT before_failure');
        clients = [];
        fail = true;
        await assert.rejects(syncDirectory(client, branch, undefined, request), /upstream failed/);
        await client.query('ROLLBACK TO SAVEPOINT before_failure');
        count = await client.query("SELECT count(*)::integer AS n FROM yclients_directory WHERE branch_id=$1 AND kind='clients'", [branch.id]);
        assert.equal(count.rows[0].n, 2, 'rollback preserves previous clients');

        // Route queries share this transaction; no fixture or real client data is committed.
        pool.query = client.query.bind(client);
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => { if (req.headers['x-test-session']) req.session = { userId: req.headers['x-test-session']==='yes'?1:Number(req.headers['x-test-session']) }; next(); });
        app.use('/api/clients', clientsRoutes);
        app.use('/api/settings', settingsRoutes);
        app.use('/api/reports', reportsRoutes);
        server = app.listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        const base = `http://127.0.0.1:${server.address().port}/api/clients`;
        assert.equal((await fetch(base)).status, 401);
        const get = query => fetch(`${base}?${query}`, { headers: { 'x-test-session': 'yes' } });
        assert.equal((await get('branchId=invalid')).status, 400);
        let response = await get(new URLSearchParams({ branchId: branch.id, search: '% _' }));
        let result = await response.json();
        assert.equal(response.status, 200);
        assert.equal(result.total, 1, 'search escapes SQL wildcard characters');
        assert.equal(result.clients[0].id, '1');
        assert.equal(result.clients[0].comment, 'Комментарий карточки');
        result=await (await get(new URLSearchParams({branchId:branch.id,search:'карточки'}))).json();
        assert.equal(result.total,1,'comment search is available');
        const update=await fetch(`${base}/1/card?branchId=${branch.id}`,{method:'PATCH',headers:{'x-test-session':'yes','Content-Type':'application/json'},body:JSON.stringify({photoUrl:'https://example.com/photo.jpg'})});
        assert.equal(update.status,200);
        const stored=await client.query('SELECT photo_url FROM client_photo_overrides WHERE company_id=$1 AND client_id=$2',[branch.yclientsCompanyId,'1']);
        assert.equal(stored.rows[0].photo_url,'https://example.com/photo.jpg');
        const settingsUrl=`http://127.0.0.1:${server.address().port}/api/settings`;
        let setting=await fetch(settingsUrl+'/personal',{method:'PUT',headers:{'x-test-session':'yes','Content-Type':'application/json'},body:JSON.stringify({rate:150,servicePercent:40,productPercent:10,cleaningRate:200,seniorBonus:1000,contentBonus:500})});
        assert.equal(setting.status,200);
        setting=await fetch(settingsUrl,{headers:{'x-test-session':'yes'}});
        assert.equal((await setting.json()).personal.rate,150);
        const financeUrl=`http://127.0.0.1:${server.address().port}/api/reports/finance`;
        const financeBody={branchId:branch.id,start:'2026-10-01',end:'2026-10-31',entries:{barbers:10000,admins:2000,other:300}};
        const saveFinance=body=>fetch(financeUrl,{method:'PUT',headers:{'x-test-session':'yes','Content-Type':'application/json'},body:JSON.stringify(body)});
        assert.equal((await saveFinance(financeBody)).status,200);
        const finance=await client.query('SELECT data FROM finance_entries WHERE scope=$1',[`${branch.id}:2026-10-01:2026-10-31`]);
        assert.deepEqual(finance.rows[0].data,financeBody.entries);
        assert.equal((await saveFinance({...financeBody,entries:{...financeBody.entries,other:-1}})).status,400);
        assert.equal((await saveFinance({...financeBody,end:'2026-02-30'})).status,400);
        await client.query(`INSERT INTO yclients_directory(branch_id,company_id,kind,external_id,data) VALUES($1,$2,'clients','999','{"id":"999","name":"","display_name":""}')`,[branch.id,branch.yclientsCompanyId]);
        result=await (await get(`branchId=${branch.id}&incomplete=true`)).json();
        assert.equal(result.total,1);
        assert.equal(result.clients[0].id,'999');
        result = await (await get(`branchId=${branch.id}&page=2`)).json();
        assert.equal(result.clients.length, 0);
        assert.equal(result.total, 2);
        await client.query(`INSERT INTO yclients_directory(branch_id,company_id,kind,external_id,data) VALUES
            ($1,$2,'clients','1000','{"name":" -- ... — "}'),
            ($1,$2,'clients','1001','{"name":"","display_name":"Иван"}')`,[branch.id,branch.yclientsCompanyId]);
        result=await (await get(`branchId=${branch.id}&incomplete=true`)).json();
        assert.equal(result.total,2,'punctuation-only names are incomplete');
        result=await (await get(`branchId=${branch.id}`)).json();
        assert.equal(result.total,3,'Cyrillic display name is a complete name');
        for (const [query, total] of [['incomplete=false',3],['incomplete=true',2],['incomplete=false&search=карточки',1],['incomplete=true&search=Иван',0]]) {
            const counted=await (await get(`branchId=${branch.id}&countOnly=true&${query}`)).json();
            assert.equal(counted.total,total,'collapsed branch badge follows tab and search filters');
            assert.deepEqual(counted.clients,[],'count-only requests do not load client rows');
        }

        const created=await client.query(`INSERT INTO users(username,password_hash,display_name,role_id,is_active)
            SELECT $1,'test-only','__category_test__',id,true FROM roles WHERE name='employee' LIMIT 1 RETURNING id`,[`__category_test_${branch.id}`]);
        const testUser=created.rows[0].id;
        const employeeHeaders = { 'x-test-session': String(testUser) };
        const employeeProfiles = await fetch(`${base.replace('/clients', '/reports')}/employees`, { headers: employeeHeaders });
        assert.equal(employeeProfiles.status, 200);
        assert.deepEqual((await employeeProfiles.json()).users.map(user => user.id), [testUser]);
        const employeeSettings = await fetch(settingsUrl, { headers: employeeHeaders });
        assert.equal(employeeSettings.status, 200);
        assert.equal('network' in await employeeSettings.json(), false, 'network settings are not sent to employee browsers');
        await client.query(`INSERT INTO yclients_report_cache(cache_key,data) VALUES($1,$2)
            ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`,
            [`client-card:${branch.yclientsCompanyId}:1`, JSON.stringify({id:1,name:'Test',phone:'000',spent:5000,paid:4000,balance:1000,card:'123',discount:10,custom_fields:{secret:'hidden'}})]);
        const employeeCardResponse = await fetch(`${base}/1/card?branchId=${branch.id}`, { headers: employeeHeaders });
        assert.equal(employeeCardResponse.status, 200);
        const employeeCard = (await employeeCardResponse.json()).data;
        assert.equal(employeeCard.phone, '000');
        for (const field of ['spent', 'paid', 'balance', 'card', 'discount', 'custom_fields']) {
            assert.equal(field in employeeCard, false, `${field} must not reach the employee browser`);
        }
        await client.query(`INSERT INTO yclients_staff_cache(branch_id,yclients_staff_id,name,specialization,phone)
            VALUES($1,999999,'Test','Барбер эксперт','000')`,[branch.id]);
        await client.query('INSERT INTO user_yclients_links(user_id,branch_id,yclients_staff_id) VALUES($1,$2,999999)',[testUser,branch.id]);
        await refreshEmployeeCategories(client,[testUser]);
        let profile=(await calculationProfiles()).find(user=>user.id===testUser);
        assert.equal(profile.category,'expert');
        const approvedUrl = `${settingsUrl}/employees/${testUser}`;
        const saveApproved = data => fetch(approvedUrl, {method:'PUT',headers:{'x-test-session':'yes','Content-Type':'application/json'},body:JSON.stringify(data)});
        await client.query(`INSERT INTO calculation_settings(scope,data) VALUES('network',$1)
            ON CONFLICT(scope) DO UPDATE SET data=EXCLUDED.data`, [{expert:{rate:200,servicePercent:40,productPercent:10}}]);
        await client.query(`INSERT INTO calculation_settings(scope,data) VALUES($1,$2)
            ON CONFLICT(scope) DO UPDATE SET data=EXCLUDED.data`, [`user:${testUser}`,{rate:999,servicePercent:99}]);
        profile=(await calculationProfiles()).find(user=>user.id===testUser);
        assert.equal(profile.rates.servicePercent,40,'unapproved personal settings never change official rates');
        assert.equal(profile.rates.rate,200);
        assert.equal((await saveApproved({rate:250,servicePercent:45,productPercent:0})).status,200);
        profile=(await calculationProfiles()).find(user=>user.id===testUser);
        assert.deepEqual(profile.rates,{rate:250,servicePercent:45,productPercent:0});
        assert.equal((await saveApproved({rate:null,servicePercent:null,productPercent:0})).status,200);
        profile=(await calculationProfiles()).find(user=>user.id===testUser);
        assert.deepEqual(profile.rates,{rate:200,servicePercent:40,productPercent:0},'blank fields inherit category, explicit zero survives');
        assert.equal((await saveApproved({servicePercent:101})).status,400);
        const rejected = await fetch(approvedUrl,{method:'PUT',headers:{...employeeHeaders,'Content-Type':'application/json'},body:JSON.stringify({servicePercent:100})});
        assert.equal(rejected.status,403,'employee cannot approve own rate');
        profile=(await calculationProfiles()).find(user=>user.id===testUser);
        assert.equal(profile.rates.servicePercent,40,'failed updates preserve approved settings');
        assert.equal(profile.yclientsLinks[0].staffId,'999999');
        assert.equal(profile.yclientsLinks[0].phone,'000');
        await client.query("UPDATE yclients_staff_cache SET specialization='Администратор' WHERE branch_id=$1",[branch.id]);
        await refreshEmployeeCategories(client,[testUser]);
        profile=(await calculationProfiles()).find(user=>user.id===testUser);
        assert.equal(profile.category,'admin','category follows YCLIENTS rather than application access role');
        assert.equal(profile.rates.servicePercent,undefined);
        assert.ok('productPercent' in profile.rates);
        await client.query('UPDATE yclients_staff_cache SET specialization=NULL,position=NULL WHERE branch_id=$1',[branch.id]);
        await refreshEmployeeCategories(client,[testUser]);
        profile=(await calculationProfiles()).find(user=>user.id===testUser);
        assert.equal(profile.category,null,'missing specialization clears the stored category instead of defaulting to barber');
        const {rows:otherBranches}=await client.query(`INSERT INTO branches(name,yclients_company_id,is_active)
            VALUES('__client_history_other__',987654323,true) RETURNING id`);
        const otherBranch=otherBranches[0].id;
        await client.query(`INSERT INTO yclients_directory(branch_id,company_id,kind,external_id,data)
            VALUES($1,987654323,'clients','10','{"id":10,"name":"Test","phone":"000"}')`,[otherBranch]);
        const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Moscow'});
        for(const [company,clientId,name] of [['987654321','1','First'],['987654323','10','Second']]) {
            await client.query(`INSERT INTO yclients_report_cache(cache_key,data) VALUES($1,$2)
                ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`,
                [`client-visits:${company}:${clientId}:${today}`,JSON.stringify([
                    {id:101,date:'2026-01-01 10:00:00',attendance:1,staff:{name},services:[{title:'Стрижка',cost_to_pay:1000}]},
                    {id:102,date:'2026-01-02 10:00:00',attendance:-1,staff:{name},services:[]},
                ])]);
        }
        const historyResponse=await fetch(`${base}/1/history?branchId=${branch.id}`,{headers:{'x-test-session':'yes'}});
        assert.equal(historyResponse.status,200);
        const history=(await historyResponse.json()).visits;
        assert.equal(history.length,2,'history matches the phone across branches and excludes no-shows');
        assert.equal(new Set(history.map(visit=>visit.id)).size,2,'record IDs are scoped to branch');
        assert.deepEqual(history.map(visit=>visit.staffName).sort(),['First','Second']);
        const activeResponse=await fetch(`${base}?branchId=${branch.id}`,{headers:{'x-test-session':String(testUser)}});
        assert.equal(activeResponse.status,200);
        await client.query('UPDATE users SET is_active=false WHERE id=$1',[testUser]);
        const blockedResponse=await fetch(`${base}?branchId=${branch.id}`,{headers:{'x-test-session':String(testUser)}});
        assert.equal(blockedResponse.status,401,'a previously issued session cannot access data after account blocking');
        await client.query('UPDATE branches SET yclients_company_id=987654322 WHERE id=$1', [branch.id]);
        result = await (await get(`branchId=${branch.id}`)).json();
        assert.equal(result.total, 0, 'changing company never shows old company clients');
    } finally {
        pool.query = originalQuery;
        if (server) await new Promise(resolve => server.close(resolve));
        await client.query('ROLLBACK');
        client.release();
        await pool.end();
    }
});
