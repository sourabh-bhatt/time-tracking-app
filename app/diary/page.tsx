import Link from "next/link";
import { cookies } from "next/headers";
import FlagReviewPanel from "../components/FlagReviewPanel";
import TimeZoneClock from "../components/TimeZoneClock";
import ScreenshotGallery, { LogEntry } from "../components/ScreenshotGallery";
import { EASTERN_TIMEZONE, getEasternDateDisplay, getHourInTimeZone } from "../components/timeZoneUtils";
import {
    TRACKING_TIME_LABEL,
    TRACKING_TIMEZONE,
    addDays,
    getLatestLogDate,
    getTrackingStats,
    parseDateKey,
    getWeekStartDateKey,
    listLogsForDate,
    listLogsForDateRange,
    listFlagsForUser,
    toDateParts,
} from "../../lib/s3-storage";

export const dynamic = "force-dynamic";

export default async function Diary(props: { searchParams: Promise<{ user?: string; date?: string }> }) {
    const cookieStore = await cookies();
    const isAdmin = cookieStore.has("admin_session");
    const employeeUser = cookieStore.has("sourabh_session") ? "sourabh" : "prayash";
    const searchParams = await props.searchParams;
    const selectedUser = isAdmin ? (searchParams.user || "sourabh") : employeeUser;
    const requestedDateStr = searchParams.date || toDateParts(new Date()).dateKey;
    const latestLogDate = await getLatestLogDate(selectedUser);
    const selectedDateStr = searchParams.date || latestLogDate || requestedDateStr;
    const selectedDate = parseDateKey(selectedDateStr);
    const flags = await listFlagsForUser(selectedUser, { includeHidden: isAdmin });

    const logs = await listLogsForDate(selectedUser, selectedDateStr) as LogEntry[];
    const weekStartKey = getWeekStartDateKey(selectedDateStr);
    const weekLogs = await listLogsForDateRange(selectedUser, weekStartKey, selectedDateStr) as LogEntry[];
    const trackingStats = await getTrackingStats(selectedUser, selectedDateStr);
    const weeklySeconds = trackingStats.weekSeconds;
    const weeklyHours = Math.floor(weeklySeconds / 3600);
    const weeklyMinutes = Math.floor((weeklySeconds % 3600) / 60);

    const totalSeconds = trackingStats.todaySeconds;
    const totalHours = Math.floor(totalSeconds / 3600);
    const totalMinutes = Math.floor((totalSeconds % 3600) / 60);

    const hourlyRate = 5;
    const totalEarnings = (totalSeconds / 3600) * hourlyRate;
    const weeklyEarnings = (weeklySeconds / 3600) * hourlyRate;

    const loggedHours = logs.map((log) => getHourInTimeZone(new Date(log.timestamp), TRACKING_TIMEZONE));
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
                            {(isAdmin ? ["sourabh", "prayash"] : [selectedUser]).map((user) => (
                                <Link
                                    key={user}
                                    href={`/diary?user=${user}&date=${selectedDateStr}`}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors flex-1 md:flex-initial text-center ${selectedUser === user
                                        ? "bg-[#333] text-white shadow-sm font-semibold"
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
                                {getEasternDateDisplay(selectedDate)}
                            </span>
                            <Link href={`/diary?user=${selectedUser}&date=${getNextDate()}`} className="text-gray-400 hover:text-white px-2">›</Link>
                        </div>
                        <Link href={`/diary?user=${selectedUser}&date=${toDateParts(new Date()).dateKey}`} className="text-[#14a800] text-sm font-medium hover:underline">
                            Today
                        </Link>
                        <TimeZoneClock
                            timeZone={EASTERN_TIMEZONE}
                            label={TRACKING_TIME_LABEL}
                            includeLabel={false}
                            includeOffset={false}
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

                <ScreenshotGallery
                    logs={logs}
                    selectedUser={selectedUser}
                    isAdmin={isAdmin}
                    canDelete={true}
                    dateKey={selectedDateStr}
                />
            </main>
        </div>
    );
}
