import { NextResponse } from "next/server";
import { getSessionContext } from "../../../../lib/auth";
import { deleteFlagById, getFlagById, updateFlagById } from "../../../../lib/s3-storage";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSessionContext();
    const flag = await getFlagById((await params).id);
    if (!session || !flag) return NextResponse.json({ error: flag ? "Forbidden" : "Not found" }, { status: flag ? 403 : 404 });
    const body = await request.json();
    if (session.role === "admin") {
        if (typeof body.hidden !== "boolean") return NextResponse.json({ error: "Hidden state required" }, { status: 400 });
        const updated = await updateFlagById(flag._id, { hidden: body.hidden, hiddenAt: body.hidden ? new Date().toISOString() : null, hiddenBy: body.hidden ? "admin" : null });
        return NextResponse.json({ flag: updated });
    }
    if (session.userId !== flag.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const response = String(body.employeeResponse || "").trim();
    if (!response) return NextResponse.json({ error: "Response required" }, { status: 400 });
    const updated = await updateFlagById(flag._id, { employeeResponse: response, respondedAt: new Date().toISOString() });
    return NextResponse.json({ flag: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSessionContext();
    if (session?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    const deleted = await deleteFlagById((await params).id);
    if (!deleted) return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    return NextResponse.json({ success: true });
}
