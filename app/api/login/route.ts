import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken } from '../../../lib/session';

export const runtime = 'nodejs';
const scryptAsync = promisify(scrypt);

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        if (typeof body?.username !== 'string' || typeof body?.password !== 'string'
            || body.username.length > 100 || body.password.length > 1024) {
            return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
        }
        const username = body.username.trim().toLowerCase();
        const hashes: Record<string, string | undefined> = {
            admin: process.env.AUTH_ADMIN_PASSWORD_HASH,
            sourabh: process.env.AUTH_SOURABH_PASSWORD_HASH,
            prayash: process.env.AUTH_PRAYASH_PASSWORD_HASH,
        };
        const hash = Object.hasOwn(hashes, username) ? hashes[username] : undefined;
        if (!process.env.AUTH_SESSION_SECRET || process.env.AUTH_SESSION_SECRET.length < 32
            || !Object.values(hashes).every((value) => /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(value || ''))) {
            return NextResponse.json({ success: false, message: 'Server authentication is not configured' }, { status: 503 });
        }
        // Unknown users still perform derivation to avoid a cheap timing oracle.
        const [, salt, expected] = (hash || hashes.admin!).split(':');
        const actual = await scryptAsync(body.password, salt, 64) as Buffer;
        if (!timingSafeEqual(actual, Buffer.from(expected, 'hex')) || !hash) {
            return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
        }
        const response = NextResponse.json({ success: true, redirect: '/?user=' + (username === 'admin' ? 'sourabh' : username) });
        response.cookies.set(SESSION_COOKIE, await createSessionToken(username), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: SESSION_MAX_AGE,
            path: '/',
        });
        for (const cookie of ['admin_session', 'sourabh_session', 'prayash_session']) response.cookies.delete(cookie);
        return response;
    } catch {
        return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
    }
}
