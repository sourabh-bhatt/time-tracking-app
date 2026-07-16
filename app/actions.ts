"use server";

import { revalidatePath } from "next/cache";
import { updateWeeklyReport } from "../lib/google-sheets";
import { getEasternWeekday } from "./components/timeZoneUtils";
import {
    TRACKING_INTERVAL_SECONDS,
    addDays,
    getUserState,
    getTrackingStats,
    getWeekStartDateKey,
    parseDateKey,
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
    const [logs, state, trackingStats] = await Promise.all([
        import("../lib/s3-storage").then(({ listLogsForDateRange }) => listLogsForDateRange(userId, weekStartKey, weekEndKey)),
        getUserState(userId),
        getTrackingStats(userId, weekEndKey),
    ]);

    const userCap = userId.charAt(0).toUpperCase() + userId.slice(1);
    const headers = ["Date", "Day", `${userCap} Hours`];
    if (userId === "sourabh") headers.push(`${userCap} Earnings ($)`);

    const rows: (string | number)[][] = [headers];
    const trackedSecondsByDateKey = logs.reduce((acc, log) => {
        if (log.countsTowardTime) {
            acc[log.dateKey] = (acc[log.dateKey] || 0) + TRACKING_INTERVAL_SECONDS;
        }
        return acc;
    }, {} as Record<string, number>);

    for (let i = 0; i < 7; i += 1) {
        const currentDateKey = addDays(weekStartKey, i);
        const currentDate = parseDateKey(currentDateKey);
        const overrideSeconds = state.manual_daily_seconds?.[currentDateKey];
        const seconds = Number.isFinite(Number(overrideSeconds))
            ? Number(overrideSeconds)
            : Number(trackedSecondsByDateKey[currentDateKey] || 0);

        const hours = seconds / 3600;
        const rowData: (string | number)[] = [
            currentDateKey,
            getEasternWeekday(currentDate, "long"),
            parseFloat(hours.toFixed(2)),
        ];

        if (userId === "sourabh") {
            rowData.push(parseFloat((hours * 5).toFixed(2)));
        }

        rows.push(rowData);
    }

    const totalHoursVal = Math.floor(trackingStats.weekSeconds / 3600);
    const totalMinutesVal = Math.floor((trackingStats.weekSeconds % 3600) / 60);
    const totalsRow: (string | number)[] = [
        "Weekly Totals",
        "",
        `${totalHoursVal}h ${totalMinutesVal}m of 60h`,
    ];

    if (userId === "sourabh") {
        totalsRow.push(`$${((trackingStats.weekSeconds / 3600) * 5).toFixed(2)}`);
    }

    rows.push(totalsRow);

    await updateWeeklyReport(rows);
    revalidatePath("/");
}
