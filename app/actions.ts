"use server";

import { revalidatePath } from "next/cache";
import { updateWeeklyReport } from "../lib/google-sheets";
import {
    TRACKING_INTERVAL_SECONDS,
    TRACKING_TIMEZONE,
    addDays,
    countsTowardTrackedTime,
    getUserState,
    getWeekStartDateKey,
    listLogsForDateRange,
    saveUserState,
} from "../lib/s3-storage";

export async function updateManualEarnings(userId: string, data: { weeklyPaid: number; weeklyPending: number; totalPending: number }) {
    await saveUserState(userId, {
        manual_weekly_paid: data.weeklyPaid,
        manual_weekly_pending: data.weeklyPending,
        manual_total_pending: data.totalPending,
    });

    revalidatePath("/");
}

export async function getManualEarnings(userId: string) {
    const state = await getUserState(userId);

    return {
        weeklyPaid: Number(state.manual_weekly_paid || 0),
        weeklyPending: Number(state.manual_weekly_pending || 0),
        totalPending: Number(state.manual_total_pending || 0),
    };
}

export async function syncWeeklyReport(userId: string, dateStr: string) {
    const weekStartKey = getWeekStartDateKey(dateStr);
    const weekEndKey = addDays(weekStartKey, 6);
    const logs = await listLogsForDateRange(userId, weekStartKey, weekEndKey);

    const userCap = userId.charAt(0).toUpperCase() + userId.slice(1);
    const headers = ["Date", "Day", `${userCap} Hours`];
    if (userId === "sourabh") headers.push(`${userCap} Earnings ($)`);

    const rows: (string | number)[][] = [headers];
    let totalSeconds = 0;

    for (let i = 0; i < 7; i += 1) {
        const currentDateKey = addDays(weekStartKey, i);
        const currentDate = new Date(`${currentDateKey}T00:00:00.000Z`);
        const dayLogs = logs.filter((log) => log.dateKey === currentDateKey && countsTowardTrackedTime(log));
        const seconds = dayLogs.length * TRACKING_INTERVAL_SECONDS;
        totalSeconds += seconds;

        const hours = seconds / 3600;
        const rowData: (string | number)[] = [
            currentDateKey,
            currentDate.toLocaleDateString("en-US", { weekday: "long", timeZone: TRACKING_TIMEZONE }),
            parseFloat(hours.toFixed(2)),
        ];

        if (userId === "sourabh") {
            rowData.push(parseFloat((hours * 5).toFixed(2)));
        }

        rows.push(rowData);
    }

    const totalHoursVal = Math.floor(totalSeconds / 3600);
    const totalMinutesVal = Math.floor((totalSeconds % 3600) / 60);
    const totalsRow: (string | number)[] = [
        "Weekly Totals",
        "",
        `${totalHoursVal}h ${totalMinutesVal}m of 60h`,
    ];

    if (userId === "sourabh") {
        totalsRow.push(`$${((totalSeconds / 3600) * 5).toFixed(2)}`);
    }

    rows.push(totalsRow);

    await updateWeeklyReport(rows);
    revalidatePath("/");
}
