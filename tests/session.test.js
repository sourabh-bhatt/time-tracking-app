/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createSessionToken, verifySessionToken, SESSION_MAX_AGE } = require('../lib/session');

test('signed sessions reject forged, tampered, expired, future and old-key tokens', async () => {
    process.env.AUTH_SESSION_SECRET = randomBytes(48).toString('hex');
    const now = Date.now();
    for (const user of ['admin', 'sourabh', 'prayash']) {
        const token = await createSessionToken(user, now);
        assert.deepEqual(await verifySessionToken(token, now), user === 'admin'
            ? { role: 'admin', userId: null } : { role: 'employee', userId: user });
        assert.equal(await verifySessionToken(token, now + SESSION_MAX_AGE * 1000), null);
        const [payload, signature] = token.split('.');
        const forgedPayload = Buffer.from(JSON.stringify({ v: 1, sub: 'admin', iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_MAX_AGE })).toString('base64url');
        if (user !== 'admin') assert.equal(await verifySessionToken(`${forgedPayload}.${signature}`, now), null);
        assert.equal(await verifySessionToken(`${payload}.${signature.slice(0, -2)}AA`, now), null);
    }
    for (const forged of [undefined, '', 'true', 'admin', 'x.y', 'a.b.c', 'x'.repeat(2000)]) {
        assert.equal(await verifySessionToken(forged, now), null);
    }
    const future = await createSessionToken('admin', now + 10000);
    assert.equal(await verifySessionToken(future, now), null);
    const old = await createSessionToken('admin', now);
    process.env.AUTH_SESSION_SECRET = randomBytes(48).toString('hex');
    assert.equal(await verifySessionToken(old, now), null);
    delete process.env.AUTH_SESSION_SECRET;
    assert.equal(await verifySessionToken(old, now), null);
    await assert.rejects(() => createSessionToken('admin'), /AUTH_SESSION_SECRET/);
});
