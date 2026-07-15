import Link from "next/link";
import { cookies } from "next/headers";
import DownloadReportButton from "../components/DownloadReportButton";
import TimeZoneClock from "../components/TimeZoneClock";
import { EASTERN_TIMEZONE, getEasternDateShort, getEasternDateWithYear, getEasternWeekday } from "../components/timeZoneUtils";
import {
    TRACKING_INTERVAL_SECONDS,
    TRACKING_TIME_LABEL,
    addDays,
    countsTowardTrackedTime,
    getWeekStartDateKey,
    listLogsForDateRange,
    parseDateKey,
    toDateParts,
} from "../../lib/s3-storage";

export const dynamic = "force-dynamic";

interface DailyStat {
    date: string;
    dayName: string;
    totalTime: number;
}

async function getWeeklyReport(startDateKey: string, selectedUser: string) {
    const weekEndKey = addDays(startDateKey, 6);
    const logs = await listLogsForDateRange(selectedUser, startDateKey, weekEndKey);
    const dailyStats: { [key: string]: DailyStat } = {};

    for (let i = 0; i < 7; i += 1) {
        const dateKey = addDays(startDateKey, i);
        const date = parseDateKey(dateKey);
        dailyStats[dateKey] = {
            date: dateKey,
            dayName: getEasternWeekday(date, "long"),
            totalTime: 0,
        };
    }

    logs.forEach((log) => {
        if (countsTowardTrackedTime(log)) {
            if (dailyStats[log.dateKey]) {
                dailyStats[log.dateKey].totalTime += TRACKING_INTERVAL_SECONDS;
            }
        }
    });

    return Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date));
}

function formatDuration(seconds: number) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
}

export default async function ReportPage(props: { searchParams: Promise<{ date?: string; user?: string }> }) {
    const cookieStore = await cookies();
    const isAdmin = cookieStore.has("admin_session");
    const isSourabh = cookieStore.has("sourabh_session");

    const searchParams = await props.searchParams;
    let selectedUser = searchParams.user || (isAdmin ? "sourabh" : (isSourabh ? "sourabh" : "prayash"));

    if (!isAdmin) {
        selectedUser = isSourabh ? "sourabh" : "prayash";
    }

    const dateParam = searchParams.date || toDateParts(new Date()).dateKey;
    const startOfWeekKey = getWeekStartDateKey(dateParam);
    const stats = await getWeeklyReport(startOfWeekKey, selectedUser);
    const totalTimeWeek = stats.reduce((acc, curr) => acc + curr.totalTime, 0);

    const getPrevWeek = () => addDays(startOfWeekKey, -7);
    const getNextWeek = () => addDays(startOfWeekKey, 7);

    const startOfWeek = parseDateKey(startOfWeekKey);
    const weekEndKey = addDays(startOfWeekKey, 6);
    const weekEnd = parseDateKey(weekEndKey);

    return (
        <div className="min-h-screen bg-[#121212] text-gray-300 font-sans">
            <header className="bg-[#1e1e1e] border-b border-[#333] px-4 md:px-6 py-4 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0">
                    <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-start">
                        <Link href="/" className="flex items-center gap-2 group">
                            <span className="text-gray-400 group-hover:text-white">←</span>
                            <h1 className="text-2xl font-bold text-white">Back to Work Diary</h1>
                        </Link>
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                        <DownloadReportButton stats={stats} startDate={startOfWeekKey} endDate={weekEndKey} selectedUser={selectedUser} />
                        <div className="text-sm text-gray-400">
                            Signed in as <span className="text-white font-medium">{isAdmin ? "admin" : (isSourabh ? "sourabh" : "prayash")}</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 md:gap-0">
                    <div className="text-center md:text-left">
                        <h2 className="text-3xl font-bold text-white mb-2">Weekly Report</h2>
                        <p className="text-gray-400">
                            {getEasternDateShort(startOfWeek)}
                            {" - "}
                            {getEasternDateWithYear(weekEnd)}
                            <TimeZoneClock
                                timeZone={EASTERN_TIMEZONE}
                                label={TRACKING_TIME_LABEL}
                                className="ml-2 text-xs tracking-[0.05em] text-sky-300"
                            />
                        </p>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto justify-center">
                        <Link href={`/report?user=${selectedUser}&date=${getPrevWeek()}`} className="px-4 py-2 bg-[#1e1e1e] border border-[#333] rounded hover:border-gray-500 transition-colors">
                            Previous Week
                        </Link>
                        <Link href={`/report?user=${selectedUser}&date=${getNextWeek()}`} className="px-4 py-2 bg-[#1e1e1e] border border-[#333] rounded hover:border-gray-500 transition-colors">
                            Next Week
                        </Link>
                    </div>
                </div>

                <div className="bg-[#1e1e1e] border border-[#333] rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-left min-w-[600px]">
                        <thead className="bg-[#2a2a2a] border-b border-[#333]">
                            <tr>
                                <th className="px-6 py-4 text-sm font-medium text-gray-400 whitespace-nowrap">Date</th>
                                <th className="px-6 py-4 text-sm font-medium text-gray-400 whitespace-nowrap">Day</th>
                                <th className="px-6 py-4 text-sm font-medium text-[#14a800] whitespace-nowrap capitalize">{selectedUser}</th>
                                <th className="px-6 py-4 text-sm font-medium text-white text-right whitespace-nowrap">Daily Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#333]">
                            {stats.map((day) => {
                                const userEarned = (day.totalTime / 3600) * 5;
                                return (
                                    <tr key={day.date} className="hover:bg-[#252525] transition-colors">
                                        <td className="px-6 py-4 text-white font-medium whitespace-nowrap">
                                            {getEasternDateShort(parseDateKey(day.date))}
                                        </td>
                                        <td className="px-6 py-4 text-gray-400 whitespace-nowrap">{day.dayName}</td>
                                        <td className="px-6 py-4 font-mono text-lg text-white whitespace-nowrap">
                                            <div>{formatDuration(day.totalTime)}</div>
                                            {selectedUser === "sourabh" && (
                                                <div className="text-xs text-green-500 font-bold">${userEarned.toFixed(2)}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-lg text-white text-right font-bold whitespace-nowrap">
                                            {formatDuration(day.totalTime)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-[#2a2a2a] border-t border-[#333]">
                            <tr>
                                <td colSpan={2} className="px-6 py-4 text-right font-bold text-gray-400 uppercase text-xs tracking-wider whitespace-nowrap">
                                    Weekly Totals
                                </td>
                                <td className="px-6 py-4 font-bold text-xl text-[#14a800] whitespace-nowrap">
                                    {formatDuration(totalTimeWeek)}
                                    {selectedUser === "sourabh" && (
                                        <div className="text-sm font-bold text-green-500">${((totalTimeWeek / 3600) * 5).toFixed(2)}</div>
                                    )}
                                    <span className="text-xs font-normal text-gray-500 block">of 60h</span>
                                </td>
                                <td className="px-6 py-4 font-bold text-xl text-white text-right whitespace-nowrap">
                                    {formatDuration(totalTimeWeek)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </main>
        </div>
    );
}
