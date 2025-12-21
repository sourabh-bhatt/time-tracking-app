"use server";

import clientPromise from "../lib/mongodb";
import { revalidatePath } from "next/cache";

export async function updateManualEarnings(userId: string, data: { weeklyPaid: number, weeklyPending: number, totalPending: number }) {
    const client = await clientPromise;
    const db = client.db("employee_monitor");
    const statsCollection = db.collection('user_stats');

    await statsCollection.updateOne(
        { userId: userId },
        {
            $set: {
                manual_weekly_paid: data.weeklyPaid,
                manual_weekly_pending: data.weeklyPending,
                manual_total_pending: data.totalPending,
                lastUpdated: new Date()
            }
        },
        { upsert: true }
    );

    revalidatePath('/');
}

export async function getManualEarnings(userId: string) {
    const client = await clientPromise;
    const db = client.db("employee_monitor");
    const statsCollection = db.collection('user_stats');

    const stats = await statsCollection.findOne({ userId: userId });
    return {
        weeklyPaid: stats?.manual_weekly_paid || 0,
        weeklyPending: stats?.manual_weekly_pending || 0,
        totalPending: stats?.manual_total_pending || 0
    };
}
