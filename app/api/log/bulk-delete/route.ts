import { NextResponse } from "next/server";
import { canAccessUser, getSessionContext } from "../../../../lib/auth";
import { deleteLogsByIds, getLogById } from "../../../../lib/s3-storage";

export async function POST(request: Request) {
    try {
        const session = await getSessionContext();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];

        if (ids.length === 0) {
            return NextResponse.json({ error: "No screenshot IDs provided" }, { status: 400 });
        }

        // Fetch logs to verify authorization
        const uniqueIds: string[] = Array.from(new Set<string>(ids));
        const rawRecords = await Promise.all(uniqueIds.map((id: string) => getLogById(id)));
        const records = rawRecords.filter((r): r is NonNullable<typeof r> => Boolean(r));

        if (records.length === 0) {
            return NextResponse.json({ error: "No matching screenshots found" }, { status: 404 });
        }

        // Ensure user is authorized to delete all target records
        for (const record of records) {
            if (!canAccessUser(session, record.userId)) {
                return NextResponse.json(
                    { error: `Forbidden: Cannot delete screenshots for user ${record.userId}` },
                    { status: 403 }
                );
            }
        }

        const authorizedIds = records.map((r) => r._id);
        const result = await deleteLogsByIds(authorizedIds);

        return NextResponse.json({
            success: true,
            deletedCount: result.deletedCount,
            deletedIds: result.deletedIds,
        });
    } catch (error) {
        console.error("Bulk delete error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
