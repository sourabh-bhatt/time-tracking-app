import { NextRequest, NextResponse } from "next/server";
import { canAccessUser, getSessionContext } from "../../../lib/auth";
import { createFlag, getLogById, listFlagsForUser } from "../../../lib/s3-storage";

export async function GET(request: NextRequest) {
    const session = await getSessionContext();
    const userId = (request.nextUrl.searchParams.get("user") || "").toLowerCase();
    if (!userId || !canAccessUser(session, userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const includeHidden = session?.role === "admin" && request.nextUrl.searchParams.get("includeHidden") === "true";
    return NextResponse.json({ flags: await listFlagsForUser(userId, { includeHidden }) });
}

export async function POST(request: NextRequest) {
    const session = await getSessionContext();
    if (session?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    const body = await request.json();
    const userId = String(body.userId || "").toLowerCase();
    const reason = String(body.reason || "").trim();
    const logIds = Array.isArray(body.logIds) ? body.logIds.map(String) : [];
    if (!userId || !reason || logIds.length === 0) return NextResponse.json({ error: "User, reason, and target logs are required" }, { status: 400 });
    const logs = await Promise.all(logIds.map(getLogById));
    if (logs.some((log) => !log || log.userId !== userId)) return NextResponse.json({ error: "Invalid flag target" }, { status: 400 });
    const flag = await createFlag({ ...body, userId, reason, logIds });
    return NextResponse.json({ flag }, { status: 201 });
}
