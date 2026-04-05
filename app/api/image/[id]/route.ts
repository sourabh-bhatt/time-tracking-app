import { NextRequest, NextResponse } from "next/server";
import { getImageById } from "../../../../lib/s3-storage";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return new NextResponse("Invalid ID", { status: 400 });
        }

        const image = await getImageById(id);

        if (!image) {
            return new NextResponse("Image not found", { status: 404 });
        }

        return new NextResponse(new Uint8Array(image.buffer), {
            headers: {
                "Content-Type": image.contentType || "image/png",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    } catch (error) {
        console.error("Error serving image:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
