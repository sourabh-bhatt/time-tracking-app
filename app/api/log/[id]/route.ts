import { NextResponse } from 'next/server';
import clientPromise from "../../../../lib/mongodb";
import { ObjectId } from 'mongodb';

export async function DELETE(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params; // Await the promise
    try {
        const client = await clientPromise;
        const db = client.db("employee_monitor");
        const { id } = params;

        if (!id) {
            return NextResponse.json({ error: 'ID required' }, { status: 400 });
        }

        // We don't know the user collection from ID alone easily unless we search all or pass it.
        // However, the logs are in `logs_sourabh` or `logs_prayash`.
        // We can try to delete from both or pass the user in the query param?
        // Better: Pass user as query param or try both.
        // Let's try both for simplicity or cleaner: get user from search params.
        // But DELETE usually just takes ID.
        // Let's try to find it first or just try deleteOne on both.

        const collections = ['logs_sourabh', 'logs_prayash'];
        let deletedCount = 0;

        for (const colName of collections) {
            const result = await db.collection(colName).deleteOne({ _id: new ObjectId(id) });
            if (result.deletedCount > 0) {
                deletedCount++;
                break; // Found and deleted
            }
        }

        if (deletedCount === 0) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
