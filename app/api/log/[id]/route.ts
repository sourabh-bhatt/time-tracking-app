import { NextResponse } from "next/server";
import { deleteLogById } from "../../../../lib/s3-storage";
import { canAccessUser, getSessionContext } from "../../../../lib/auth";

export async function DELETE(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;

    try {
        const { id } = params;

        if (!id) {
            return NextResponse.json({ error: "ID required" }, { status: 400 });
        }

        const { getLogById } = await import("../../../../lib/s3-storage");
        const record = await getLogById(id);
        const session = await getSessionContext();
        if (record && !canAccessUser(session, record.userId)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const deleted = await deleteLogById(id);

        if (!deleted) {
            return NextResponse.json({ error: "Entry not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
