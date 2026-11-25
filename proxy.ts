import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/session';

export async function proxy(request: NextRequest) {
    const path = request.nextUrl.pathname;
    const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    // APIs and server actions also enforce authorization at the data boundary.
    const isPublicPath = path === '/login' || path === '/testing-in-out' || path.startsWith('/api/');
    if (!isPublicPath && !session) return NextResponse.redirect(new URL('/login', request.url));
    if (!isPublicPath && session?.role === 'employee' && request.nextUrl.searchParams.get('user') !== session.userId) {
        return NextResponse.redirect(new URL('/?user=' + session.userId, request.url));
    }
    if (path === '/login' && session) {
        return NextResponse.redirect(new URL(session.role === 'admin' ? '/' : '/?user=' + session.userId, request.url));
    }
    return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
