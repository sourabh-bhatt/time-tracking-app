/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, scryptSync } = require('node:crypto');
const { loadTS } = require('./helpers');
const { SESSION_COOKIE, createSessionToken, verifySessionToken } = require('../lib/session');

test('legacy cookies never authenticate; valid signed cookies authenticate', async () => {
    const store = new Map([['admin_session', { value: 'true' }], ['sourabh_session', { value: 'anything' }]]);
    const auth = loadTS('lib/auth.ts', { 'next/headers': { cookies: async () => store } });
    assert.equal(await auth.getSessionContext(), null);
    process.env.AUTH_SESSION_SECRET = randomBytes(48).toString('hex');
    store.set(SESSION_COOKIE, { value: await createSessionToken('prayash') });
    assert.deepEqual(await auth.getSessionContext(), { role: 'employee', userId: 'prayash' });
    assert.equal(auth.canAccessUser(null, 'sourabh'), false);
    assert.equal(auth.canAccessUser({ role: 'employee', userId: 'prayash' }, 'sourabh'), false);
    assert.equal(auth.canAccessUser({ role: 'admin', userId: null }, 'sourabh'), true);
});

test('login validates hashed passwords, issues a signed cookie, and fails closed on missing configuration', async () => {
    process.env.AUTH_SESSION_SECRET = randomBytes(48).toString('hex');
    const password = randomBytes(24).toString('hex');
    const salt = randomBytes(16).toString('hex');
    const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
    for (const user of ['ADMIN', 'SOURABH', 'PRAYASH']) process.env[`AUTH_${user}_PASSWORD_HASH`] = hash;
    const { POST } = loadTS('app/api/login/route.ts');
    const request = (body) => new Request('http://localhost/api/login', { method: 'POST', body: JSON.stringify(body) });
    for (const username of ['admin', 'sourabh', 'prayash']) {
        const response = await POST(request({ username, password }));
        assert.equal(response.status, 200);
        const cookie = response.cookies.get(SESSION_COOKIE);
        assert.ok(cookie.httpOnly);
        assert.equal(cookie.sameSite, 'strict');
        assert.equal((await verifySessionToken(cookie.value)).role, username === 'admin' ? 'admin' : 'employee');
        assert.equal((await POST(request({ username, password: 'incorrect' }))).status, 401);
    }
    for (const body of [{ username: 'unknown', password }, { username: '__proto__', password }, { username: {}, password }, null]) {
        assert.equal((await POST(request(body))).status, 401);
    }
    delete process.env.AUTH_SESSION_SECRET;
    assert.equal((await POST(request({ username: 'admin', password }))).status, 503);
});

test('screenshots reject anonymous and other-user access before reading image bytes and forbid shared caching', async () => {
    let session = null;
    let imageReads = 0;
    let logReads = 0;
    const { GET } = loadTS('app/api/image/[id]/route.ts', {
        '../../../../lib/auth': {
            getSessionContext: async () => session,
            canAccessUser: (current, user) => current && (current.role === 'admin' || current.userId === user),
        },
        '../../../../lib/s3-storage': {
            getLogById: async () => { logReads++; return { userId: 'sourabh' }; },
            getImageById: async () => { imageReads++; return { buffer: Buffer.from('png'), contentType: 'image/png' }; },
        },
    });
    const call = () => GET(new Request('http://localhost/api/image/test'), { params: Promise.resolve({ id: 'test' }) });
    assert.equal((await call()).status, 401);
    assert.equal(logReads, 0);
    session = { role: 'employee', userId: 'prayash' };
    assert.equal((await call()).status, 403);
    assert.equal(imageReads, 0);
    session = { role: 'employee', userId: 'sourabh' };
    const response = await call();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('Vary'), 'Cookie');
});

test('server actions reject unauthenticated earnings reads, cross-user reads and non-admin changes before storage', async () => {
    let session = null;
    const actions = loadTS('app/actions.ts', {
        '../lib/auth': { getSessionContext: async () => session, canAccessUser: (current, user) => current && (current.role === 'admin' || current.userId === user) },
        '../lib/s3-storage': {
            getUserState: async () => { throw new Error('Storage must not be reached'); },
            saveUserState: async () => { throw new Error('Storage must not be reached'); },
        },
        '../lib/google-sheets': {},
        './components/timeZoneUtils': {},
        'next/cache': { revalidatePath: () => {} },
    });
    await assert.rejects(() => actions.getManualEarnings('sourabh'), /Forbidden/);
    await assert.rejects(() => actions.syncWeeklyReport('sourabh', '2026-11-17'), /Forbidden/);
    await assert.rejects(() => actions.updateManualEarnings('sourabh', {}), /Admin access required/);
    session = { role: 'employee', userId: 'prayash' };
    await assert.rejects(() => actions.getManualEarnings('sourabh'), /Forbidden/);
    await assert.rejects(() => actions.updateManualEarnings('prayash', {}), /Admin access required/);
});
