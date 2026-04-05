import { NextResponse } from "next/server";
import { deleteLogById } from "../../../../lib/s3-storage";

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
