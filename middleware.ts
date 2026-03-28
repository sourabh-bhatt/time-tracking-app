import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const url = request.nextUrl;
    const path = url.pathname;
    const userParam = url.searchParams.get('user');

    // Define public paths that don't need authentication
    const isPublicPath = path === '/login' || path.startsWith('/api/');

    const adminToken = request.cookies.get('admin_session')?.value;
    const prayashToken = request.cookies.get('prayash_session')?.value;
    const sourabhToken = request.cookies.get('sourabh_session')?.value;

    const hasAnyToken = adminToken || prayashToken || sourabhToken;

    // Unauthenticated access attempt to protected path
    if (!isPublicPath && !hasAnyToken) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Role-based access control for dashboard / diary
    if (!isPublicPath) {
        // If Prayash tries to access anything other than his own user param, force redirect
        if (prayashToken && !adminToken) {
            if (userParam !== 'prayash') {
                return NextResponse.redirect(new URL('/?user=prayash', request.url));
            }
        }
        // If Sourabh tries to access anything other than his own user param, force redirect
        if (sourabhToken && !adminToken) {
            if (userParam !== 'sourabh') {
                return NextResponse.redirect(new URL('/?user=sourabh', request.url));
            }
        }
    }

    // If trying to access login page WITH a token, redirect to appropriate dashboard
    if (path === '/login' && hasAnyToken) {
        if (adminToken) {
            return NextResponse.redirect(new URL('/', request.url));
        } else if (sourabhToken) {
            return NextResponse.redirect(new URL('/?user=sourabh', request.url));
        } else {
            return NextResponse.redirect(new URL('/?user=prayash', request.url));
        }
    }

    return NextResponse.next();
}

// Matching Paths
export const config = {
    matcher: [
        '/',
        '/login',
        '/report',
        // Match all other paths basically, except next internals
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
