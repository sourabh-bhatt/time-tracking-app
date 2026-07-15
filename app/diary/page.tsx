import Link from "next/link";
import { cookies } from "next/headers";
import ImageModal from "../components/ImageModal";
import FlagReviewPanel from "../components/FlagReviewPanel";
import TimeZoneClock from "../components/TimeZoneClock";
import { getTimeZoneDisplay } from "../components/timeZoneUtils";
import {
    TRACKING_INTERVAL_SECONDS,
    TRACKING_TIME_LABEL,
    TRACKING_TIMEZONE,
    addDays,
    countTrackedLogs,
    getLatestLogDate,
    getWeekStartDateKey,
    listLogsForDate,
    listLogsForDateRange,
    listFlagsForUser,
    toDateParts,
} from "../../lib/s3-storage";

export const dynamic = "force-dynamic";

interface Activity {
    mouseClicks: number;
    keyPresses: number;
    mouseMoves: number;
}

interface LogEntry {
    _id: string;
    userId: string;
    timestamp: string;
    activity: Activity;
    memo?: string;
    type?: string;
    dateKey: string;
    countsTowardTime: boolean;
}

function countTimeLogs(logs: LogEntry[]) {
    return countTrackedLogs(logs);
}

function formatTrackingTimestamp(timestamp: string) {
    return getTimeZoneDisplay(new Date(timestamp), TRACKING_TIMEZONE, TRACKING_TIME_LABEL, {
        includeLabel: true,
        includeSeconds: true,
    });
}

export default async function Diary(props: { searchParams: Promise<{ user?: string; date?: string }> }) {
    const cookieStore = await cookies();
    const isAdmin = cookieStore.has("admin_session");
    const employeeUser = cookieStore.has("sourabh_session") ? "sourabh" : "prayash";
    const searchParams = await props.searchParams;
    const selectedUser = isAdmin ? (searchParams.user || "sourabh") : employeeUser;
    const requestedDateStr = searchParams.date || toDateParts(new Date()).dateKey;
    const latestLogDate = await getLatestLogDate(selectedUser);
    const selectedDateStr = searchParams.date || latestLogDate || requestedDateStr;
    const selectedDate = new Date(`${selectedDateStr}T00:00:00.000Z`);
    const flags = await listFlagsForUser(selectedUser, { includeHidden: isAdmin });

    const logs = await listLogsForDate(selectedUser, selectedDateStr) as LogEntry[];
    const weekStartKey = getWeekStartDateKey(selectedDateStr);
    const weekLogs = await listLogsForDateRange(selectedUser, weekStartKey, selectedDateStr) as LogEntry[];
    const weeklyCount = countTimeLogs(weekLogs);
    const weeklySeconds = weeklyCount * TRACKING_INTERVAL_SECONDS;
    const weeklyHours = Math.floor(weeklySeconds / 3600);
    const weeklyMinutes = Math.floor((weeklySeconds % 3600) / 60);

    const getTrackingHour = (date: Date) => {
        const d = new Date(date.toLocaleString("en-US", { timeZone: TRACKING_TIMEZONE }));
        return d.getHours();
    };

    const logsByHourAndMemo: { [key: number]: { [key: string]: LogEntry[] } } = {};

    logs.forEach((log) => {
        const hour = getTrackingHour(new Date(log.timestamp));
        const memo = log.memo || "No Memo";

        if (!logsByHourAndMemo[hour]) logsByHourAndMemo[hour] = {};
        if (!logsByHourAndMemo[hour][memo]) logsByHourAndMemo[hour][memo] = [];

        logsByHourAndMemo[hour][memo].push(log);
    });

    const totalSeconds = countTimeLogs(logs) * TRACKING_INTERVAL_SECONDS;
    const totalHours = Math.floor(totalSeconds / 3600);
    const totalMinutes = Math.floor((totalSeconds % 3600) / 60);

    const hourlyRate = 5;
    const totalEarnings = (totalSeconds / 3600) * hourlyRate;
    const weeklyEarnings = (weeklySeconds / 3600) * hourlyRate;

    const loggedHours = logs.map((log) => getTrackingHour(new Date(log.timestamp)));
    const trackedHours = new Set(loggedHours);

    const getPrevDate = () => addDays(selectedDateStr, -1);
    const getNextDate = () => addDays(selectedDateStr, 1);

    return (
        <div className="min-h-screen bg-[#121212] text-gray-300 font-sans">
            <header className="bg-[#1e1e1e] border-b border-[#333] px-4 md:px-6 py-4 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0">
                    <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 w-full md:w-auto">
                        <h1 className="text-2xl font-bold text-white">My Work Diary</h1>

                        <div className="flex bg-[#2a2a2a] rounded-lg p-1 w-full md:w-auto justify-center">
                            {["sourabh", "prayash"].map((user) => (
                                <Link
                                    key={user}
                                    href={`/diary?user=${user}&date=${selectedDateStr}`}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors flex-1 md:flex-initial text-center ${selectedUser === user
                                        ? "bg-[#333] text-white shadow-sm"
                                        : "text-gray-400 hover:text-white"
                                        }`}
                                >
                                    {user}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="text-sm text-gray-500">
                        Client View
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
                <FlagReviewPanel flags={flags} isAdmin={isAdmin} />
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 bg-[#1e1e1e] p-4 rounded-xl border border-[#333] gap-6 md:gap-0">
                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto justify-center">
                        <div className="flex items-center bg-[#2a2a2a] rounded-md border border-[#333] px-3 py-2">
                            <Link href={`/diary?user=${selectedUser}&date=${getPrevDate()}`} className="text-gray-400 hover:text-white px-2">‹</Link>
                            <span className="text-white font-medium mx-2">
                                {selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: TRACKING_TIMEZONE })}
                            </span>
                            <Link href={`/diary?user=${selectedUser}&date=${getNextDate()}`} className="text-gray-400 hover:text-white px-2">›</Link>
                        </div>
                        <Link href={`/diary?user=${selectedUser}&date=${toDateParts(new Date()).dateKey}`} className="text-[#14a800] text-sm font-medium hover:underline">
                            Today
                        </Link>
                        <TimeZoneClock
                            timeZone={TRACKING_TIMEZONE}
                            label={TRACKING_TIME_LABEL}
                            className="text-xs tracking-[0.05em] text-sky-300"
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8 w-full md:w-auto justify-center">
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col items-center sm:items-end">
                                <span className="text-2xl font-bold text-white transition-all hover:text-[#14a800]">
                                    {totalHours}:{totalMinutes.toString().padStart(2, "0")} hrs
                                </span>
                                <span className="text-xs text-green-500 font-medium">${totalEarnings.toFixed(2)}</span>
                                <span className="text-[10px] text-gray-400">Today</span>
                            </div>

                            <div className="h-8 w-[1px] bg-[#333]"></div>

                            <div className="flex flex-col items-center sm:items-end">
                                <span className="text-xl font-bold text-white transition-all hover:text-[#14a800]">
                                    {weeklyHours}:{weeklyMinutes.toString().padStart(2, "0")} <span className="text-sm font-normal text-gray-500">of 60 hrs</span>
                                </span>
                                <span className="text-xs text-green-500 font-medium">${weeklyEarnings.toFixed(2)}</span>
                                <span className="text-[10px] text-gray-400">This Week</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mb-8 overflow-x-auto">
                    <div className="flex min-w-[800px] border-b border-[#333] pb-2">
                        {Array.from({ length: 24 }).map((_, i) => {
                            const isTracked = trackedHours.has(i);
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                    <div className={`w-full h-3 ${isTracked ? "bg-[#14a800]" : "bg-[#2a2a2a]"} rounded-sm`}></div>
                                    <div className={`w-full h-3 ${isTracked ? "bg-[#14a800]" : "bg-[#2a2a2a]"} rounded-sm`}></div>
                                    <span className="text-[10px] text-gray-500">{i === 0 ? "12 am" : i === 12 ? "12 pm" : i > 12 ? `${i - 12} pm` : `${i} am`}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-8">
                    {Object.keys(logsByHourAndMemo).length === 0 ? (
                        <div className="text-center py-20 bg-[#1e1e1e] rounded-xl border border-dashed border-[#333]">
                            <p className="text-gray-500">No activity recorded for this day.</p>
                        </div>
                    ) : (
                        Object.entries(logsByHourAndMemo).map(([hour, memos]) => (
                            <div key={hour} className="space-y-4">
                                {Object.entries(memos).map(([memo, memoLogs]) => (
                                    <div key={`${hour}-${memo}`} className="bg-[#1e1e1e] rounded-xl border border-[#333] overflow-hidden">
                                        <div className="px-6 py-3 border-b border-[#333] bg-[#252525] flex flex-col gap-3 items-start md:flex-row md:justify-between md:items-center">
                                            <div className="flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full bg-[#14a800]"></div>
                                                <h3 className="font-medium text-white text-sm md:text-base leading-snug">
                                                    {formatTrackingTimestamp(memoLogs[0].timestamp)}
                                                    {" - "}
                                                    {formatTrackingTimestamp(memoLogs[memoLogs.length - 1].timestamp)}
                                                    <span className="text-gray-400 font-normal ml-2">
                                                        ({countTimeLogs(memoLogs) * 10} mins)
                                                    </span>
                                                </h3>
                                            </div>
                                            <div className="text-white font-medium">{memo}</div>
                                            <button className="text-gray-500 hover:text-white">...</button>
                                        </div>

                                        <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                            {memoLogs.map((log) => {
                                                const activityScore = Math.min((log.activity.keyPresses + log.activity.mouseClicks + log.activity.mouseMoves) / 60, 10);
                                                return (
                                                    <div key={log._id} className="group relative">
                                                        <ImageModal
                                                            src={`/api/image/${log._id}`}
                                                            timestamp={formatTrackingTimestamp(log.timestamp)}
                                                            activity={log.activity}
                                                            id={log._id}
                                                        >
                                                            <div className="aspect-video bg-[#121212] rounded-md overflow-hidden border border-[#333] relative cursor-pointer hover:ring-2 ring-[#14a800] transition-all">
                                                                <img
                                                                    src={`/api/image/${log._id}`}
                                                                    alt="Screen"
                                                                    loading="lazy"
                                                                    className="w-full h-full object-cover"
                                                                />
                                                                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs p-2 text-center pointer-events-none">
                                                                    <div>Keys: {log.activity.keyPresses}</div>
                                                                    <div>Clicks: {log.activity.mouseClicks}</div>
                                                                </div>
                                                            </div>
                                                        </ImageModal>
                                                        <div className="mt-2 space-y-1">
                                                            <div className="flex gap-[2px] h-1.5">
                                                                {[...Array(10)].map((_, i) => (
                                                                    <div key={i} className={`flex-1 rounded-full ${i < activityScore ? "bg-[#14a800]" : "bg-[#333]"}`} />
                                                                ))}
                                                            </div>
                                                            <div className="flex justify-between text-[10px] text-gray-500 leading-tight">
                                                                <span className="block whitespace-normal break-words">{formatTrackingTimestamp(log.timestamp)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}
