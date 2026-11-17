import { NextResponse } from "next/server";
import { getSessionContext } from "../../../../lib/auth";
import { normalizeUserId, resetOnCallCheckin } from "../../../../lib/s3-storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const session = await getSessionContext();
        const isAdmin = session?.role === 'admin';
        const isSourabh = session?.userId === 'sourabh';
        const isPrayash = session?.userId === 'prayash';

        if (!isAdmin && !isSourabh && !isPrayash) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const rawUserId = String(body?.userId || "").trim();

        if (!rawUserId) {
            return NextResponse.json({ error: "Missing userId" }, { status: 400 });
        }

        const targetUser = normalizeUserId(rawUserId);

        // Permissions check: employees can only continue their own on-call timer
        if (!isAdmin) {
            const currentEmployee = isSourabh ? "sourabh" : "prayash";
            if (targetUser !== currentEmployee) {
                return NextResponse.json(
                    { error: `Forbidden: Cannot modify on-call state for ${targetUser}` },
                    { status: 403 }
                );
            }
        }

        const updatedState = await resetOnCallCheckin(targetUser);

        return NextResponse.json({
            success: true,
            userId: targetUser,
            onCallCheckinDueAt: updatedState.onCallCheckinDueAt,
            onCallCheckinConfirmedAt: updatedState.onCallCheckinConfirmedAt,
            message: "On-call check-in extended by 30 minutes.",
        });
    } catch (error) {
        console.error("Failed to continue on-call session:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
