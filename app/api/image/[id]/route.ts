import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id || !ObjectId.isValid(id)) {
            return new NextResponse("Invalid ID", { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db("employee_monitor");

        const collections = ["logs_sourabh", "logs_prayash"];
        let log = null;

        for (const colName of collections) {
            log = await db.collection(colName).findOne(
                { _id: new ObjectId(id) },
                { projection: { image: 1 } }
            );
            if (log) break;
        }

        if (!log || !log.image) {
            return new NextResponse("Image not found", { status: 404 });
        }

        // log.image might be a string (Base64) or BSON Binary
        let imgBuffer: Buffer;

        if (typeof log.image === 'string') {
            // Handle Base64 string
            const base64Data = log.image.split(';base64,').pop();
            imgBuffer = Buffer.from(base64Data || "", 'base64');
        } else if (log.image && log.image.buffer) {
            // Handle BSON Binary
            imgBuffer = log.image.buffer;
        } else {
            console.error("Unknown image format:", typeof log.image);
            return new NextResponse("Invalid image format", { status: 500 });
        }

        return new NextResponse(imgBuffer as any, {
            headers: {
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });

    } catch (error) {
        console.error("Error serving image:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
