"use server";

import clientPromise from "../lib/mongodb";
import { revalidatePath } from "next/cache";
import { updateWeeklyReport } from "../lib/google-sheets";

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

export async function syncWeeklyReport(userId: string, dateStr: string) {
    const client = await clientPromise;
    const db = client.db("employee_monitor");
    const collectionName = `logs_${userId.toLowerCase()}`;
    const collection = db.collection(collectionName);

    // Calculate Week Start (Monday)
    const date = new Date(dateStr);
    const day = date.getDay(); // 0 is Sunday
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);

    // Normalize to start of day
    const weekStart = new Date(date);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    // Fetch logs for the whole week
    // We'll just fetch all logs >= weekStart and filter in code to be precise with days
    // Or just query with range.
    // End of week is 7 days later
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const logs = await collection.find({
        userId: userId,
        timestamp: { $gte: weekStart, $lt: weekEnd },
        type: 'auto'
    }).toArray();

    const rows: any[] = [['Date', 'Day', 'Sourabh Hours', 'Sourabh Earnings ($)']];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    let totalSeconds = 0;

    // Loop through 7 days
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(weekStart);
        currentDate.setDate(weekStart.getDate() + i);

        const startOfDay = new Date(currentDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(currentDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Filter logs
        const dayLogs = logs.filter(l => l.timestamp >= startOfDay && l.timestamp <= endOfDay);
        const count = dayLogs.length;
        const seconds = count * 600;
        totalSeconds += seconds;

        const hours = seconds / 3600;
        const earnings = hours * 5;

        rows.push([
            currentDate.toISOString().split('T')[0],
            days[currentDate.getDay()],
            parseFloat(hours.toFixed(2)),
            parseFloat(earnings.toFixed(2))
        ]);
    }

    // Totals
    const totalHoursVal = Math.floor(totalSeconds / 3600);
    const totalMinutesVal = Math.floor((totalSeconds % 3600) / 60);
    const totalEarnings = (totalSeconds / 3600) * 5;

    rows.push([
        'Weekly Totals',
        '',
        `${totalHoursVal}h ${totalMinutesVal}m of 60h`,
        `$${totalEarnings.toFixed(2)}`
    ]);

    await updateWeeklyReport(rows);
    revalidatePath('/');
}
