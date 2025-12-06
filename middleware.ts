import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;

    // Define public paths that don't need authentication
    const isPublicPath = path === '/login' || path.startsWith('/api/image'); // Allow login and image API (used by Electron apps theoretically? No, Electron uses direct DB. Allow public just in case or protect? Let's protect everything except login.)

    // Actually, wait, Electron doesn't use this Admin API for anything other than maybe checking something? 
    // Electron connects to MongoDB directly.
    // The Admin panel connects to MongoDB directly.
    // So we just need to protect the UI.

    const token = request.cookies.get('admin_session')?.value || '';

    // If trying to access a protected path without a token
    if (!isPublicPath && !token) {
        // Exclude /api/login from protection loop (it is public implicitly if we don't block it here, but let's be safe)
        if (path === '/api/login') return NextResponse.next();

        // Redirect to login
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // If trying to access login page WITH a token, redirect to dashboard
    if (path === '/login' && token) {
        return NextResponse.redirect(new URL('/', request.url));
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
