// Web Crypto keeps the same verification available in middleware and Node routes.
const SESSION_COOKIE = 'tracker_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const USERS = ['admin', 'sourabh', 'prayash'];
const encoder = new TextEncoder();

function getSecret() {
    const secret = process.env.AUTH_SESSION_SECRET;
    if (!secret || secret.length < 32) throw new Error('AUTH_SESSION_SECRET must contain at least 32 characters.');
    return secret;
}

function encode(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid token encoding');
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
}

async function signingKey() {
    return crypto.subtle.importKey('raw', encoder.encode(getSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function createSessionToken(userId, now = Date.now()) {
    if (!USERS.includes(userId)) throw new Error('Unknown user');
    const issuedAt = Math.floor(now / 1000);
    const payload = encode(encoder.encode(JSON.stringify({ v: 1, sub: userId, iat: issuedAt, exp: issuedAt + SESSION_MAX_AGE })));
    const signature = await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(payload));
    return `${payload}.${encode(new Uint8Array(signature))}`;
}

async function verifySessionToken(token, now = Date.now()) {
    if (typeof token !== 'string' || token.length > 1024) return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 2) return null;
        const [payload, signature] = parts;
        if (!await crypto.subtle.verify('HMAC', await signingKey(), decode(signature), encoder.encode(payload))) return null;
        const claims = JSON.parse(new TextDecoder().decode(decode(payload)));
        const seconds = Math.floor(now / 1000);
        if (claims.v !== 1 || !USERS.includes(claims.sub)
            || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)
            || claims.iat > seconds || claims.exp <= seconds
            || claims.exp - claims.iat !== SESSION_MAX_AGE) return null;
        return claims.sub === 'admin' ? { role: 'admin', userId: null } : { role: 'employee', userId: claims.sub };
    } catch {
        return null;
    }
}

module.exports = { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, verifySessionToken };
