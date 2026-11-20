import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { httpSecurity } from '../middleware/httpSecurity.js';
import { runtimeConfig } from '../config/runtime.js';

test('production refuses missing HTTPS origins or short session secrets', () => {
    assert.throws(() => runtimeConfig({NODE_ENV:'production'}));
    assert.throws(() => runtimeConfig({NODE_ENV:'production',APP_ORIGINS:'http://example.com',SESSION_SECRET:'x'.repeat(40)}));
    assert.throws(() => runtimeConfig({NODE_ENV:'production',APP_ORIGINS:'https://example.com',SESSION_SECRET:'short'}));
    const config = runtimeConfig({NODE_ENV:'production',APP_ORIGINS:'https://example.com',SESSION_SECRET:'x'.repeat(40)});
    assert.equal(config.trustProxy, false);
    assert.equal(config.host, '127.0.0.1');
});

test('writes require a custom header and reject foreign and opaque origins', async () => {
    const app = express();
    app.use(httpSecurity({origins:['https://example.com'],production:true}));
    app.post('/api/write', (req,res) => res.json({ok:true}));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/write`;
    try {
        for (const headers of [{}, {Origin:'https://evil.example','X-App-Request':'1'}, {Origin:'null','X-App-Request':'1'}, {Origin:'https://example.com.evil','X-App-Request':'1'}]) {
            assert.equal((await fetch(url,{method:'POST',headers})).status,403);
        }
        const response = await fetch(url,{method:'POST',headers:{Origin:'https://example.com','X-App-Request':'1'}});
        assert.equal(response.status,200);
        assert.equal(response.headers.get('cache-control'),'no-store');
        assert.equal(response.headers.get('x-frame-options'),'DENY');
        assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
