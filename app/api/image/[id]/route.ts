import { NextRequest, NextResponse } from "next/server";
import { getImageById, getLogById } from "../../../../lib/s3-storage";
import { canAccessUser, getSessionContext } from "../../../../lib/auth";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSessionContext();
        if (!session) return new NextResponse('Unauthorized', { status: 401 });
        const { id } = await params;

        if (!id) {
            return new NextResponse("Invalid ID", { status: 400 });
        }

        const record = await getLogById(id);
        if (!record) return new NextResponse('Image not found', { status: 404 });
        if (!canAccessUser(session, record.userId)) {
            return new NextResponse("Forbidden", { status: 403 });
        }
        const image = await getImageById(id);

        if (!image) {
            return new NextResponse("Image not found", { status: 404 });
        }

        return new NextResponse(new Uint8Array(image.buffer), {
            headers: {
                "Content-Type": image.contentType || "image/png",
                "Cache-Control": "private, no-store",
                "Vary": "Cookie",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        console.error("Error serving image:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
