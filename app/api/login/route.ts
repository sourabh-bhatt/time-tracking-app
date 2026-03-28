import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        const userLower = username.toLowerCase();

        if (userLower === 'admin' && password === 'Admin@881427') {
            const response = NextResponse.json({ success: true });
            response.cookies.set('admin_session', 'true', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 24 * 7, // 1 week
                path: '/',
            });
            return response;
        }

        if (userLower === 'prayash' && password === 'Prayash@123') {
            const response = NextResponse.json({ success: true, redirect: '/?user=prayash' });
            response.cookies.set('prayash_session', 'true', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 24 * 7, // 1 week
                path: '/',
            });
            return response;
        }

        return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    } catch (err) {
        return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
    }
}
