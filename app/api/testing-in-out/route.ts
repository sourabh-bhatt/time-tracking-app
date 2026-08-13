import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserState, saveUserState } from "../../../lib/s3-storage";

export const dynamic = "force-dynamic";

async function hasSourabhSession() {
    const cookieStore = await cookies();
    return cookieStore.has("sourabh_session");
}

export async function GET() {
    if (!(await hasSourabhSession())) {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const state = await getUserState("sourabh");
    return NextResponse.json({ authenticated: true, enabled: state.mobilePresenceEnabled, onCall: state.mobileOnCall });
}

export async function POST(request: Request) {
    if (!(await hasSourabhSession())) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const hasEnabled = typeof body.enabled === "boolean";
    const hasOnCall = typeof body.onCall === "boolean";
    if (!hasEnabled && !hasOnCall) {
        return NextResponse.json({ message: "A tracker or call-mode value is required" }, { status: 400 });
    }

    const currentState = await getUserState("sourabh");
    const nextEnabled = hasEnabled ? body.enabled : currentState.mobilePresenceEnabled;
    const nextOnCall = nextEnabled && (hasOnCall ? body.onCall : currentState.mobileOnCall);
    const now = new Date().toISOString();
    const state = await saveUserState("sourabh", {
        mobilePresenceEnabled: nextEnabled,
        mobilePresenceUpdatedAt: hasEnabled ? now : currentState.mobilePresenceUpdatedAt,
        mobileOnCall: nextOnCall,
        mobileOnCallUpdatedAt: hasOnCall && nextOnCall ? now : (nextOnCall ? currentState.mobileOnCallUpdatedAt : null),
    });

    return NextResponse.json({ success: true, enabled: state.mobilePresenceEnabled, onCall: state.mobileOnCall });
}
