import clientPromise from "../../lib/mongodb";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface DailyStat {
    date: string; // YYYY-MM-DD
    dayName: string; // Mon, Tue...
    totalTime: number; // Seconds
}

async function getWeeklyReport(startDate: Date, selectedUser: string) {
    const client = await clientPromise;
    const db = client.db("employee_monitor");

    // Calculate start and end of the week (Monday to Sunday)
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    // Widen fetch range for Timezone safety
    const fetchStart = new Date(start);
    fetchStart.setDate(fetchStart.getDate() - 1);

    const fetchEnd = new Date(start);
    fetchEnd.setDate(fetchEnd.getDate() + 8); // 7 days + 1 buffer

    const dailyStats: { [key: string]: DailyStat } = {};

    // Initialize days
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        // Use 'en-CA' (YYYY-MM-DD) with local time to avoid UTC shift
        const dateStr = d.toLocaleDateString('en-CA');
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        dailyStats[dateStr] = { date: dateStr, dayName, totalTime: 0 };
    }

    const collectionName = `logs_${selectedUser.toLowerCase()}`;

    const logs = await db.collection(collectionName).find({
        timestamp: { $gte: fetchStart, $lt: fetchEnd },
        type: 'auto'
    }).project({ timestamp: 1 }).toArray();

    logs.forEach(log => {
        const date = new Date(log.timestamp);
        // Construct IST YYYY-MM-DD reliably
        const istDateStr = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        if (dailyStats[istDateStr]) {
            dailyStats[istDateStr].totalTime += 600;
        }
    });

    return Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date));
}

function formatDuration(seconds: number) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
}

import DownloadReportButton from "../components/DownloadReportButton";
import { cookies } from "next/headers";

export default async function ReportPage(props: { searchParams: Promise<{ date?: string, user?: string }> }) {
    const cookieStore = await cookies();
    const isAdmin = cookieStore.has('admin_session');
    const isSourabh = cookieStore.has('sourabh_session');

    const searchParams = await props.searchParams;
    let selectedUser = searchParams.user || (isAdmin ? 'sourabh' : (isSourabh ? 'sourabh' : 'prayash'));
    
    if (!isAdmin) {
        selectedUser = isSourabh ? 'sourabh' : 'prayash';
    }

    const dateParam = searchParams.date || new Date().toISOString().split('T')[0];
    const currentDate = new Date(dateParam);

    // Calculate Start of Week (Monday)
    const day = currentDate.getDay(); // 0=Sun, 1=Mon
    const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const stats = await getWeeklyReport(startOfWeek, selectedUser);

    const totalTimeWeek = stats.reduce((acc, curr) => acc + curr.totalTime, 0);

    // Navigation
    const getPrevWeek = () => {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() - 7);
        // Use local date string to avoid timezone shifts in URL params too
        return d.toLocaleDateString('en-CA');
    };
    const getNextWeek = () => {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + 7);
        return d.toLocaleDateString('en-CA');
    };

    const weekEnd = new Date(startOfWeek);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Format dates for filename
    const startDateStr = startOfWeek.toLocaleDateString('en-CA');
    const endDateStr = weekEnd.toLocaleDateString('en-CA');

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
                        <DownloadReportButton stats={stats} startDate={startDateStr} endDate={endDateStr} selectedUser={selectedUser} />
                        <div className="text-sm text-gray-400">
                            Signed in as <span className="text-white font-medium">{isAdmin ? 'admin' : (isSourabh ? 'sourabh' : 'prayash')}</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
                {/* Header & Nav */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 md:gap-0">
                    <div className="text-center md:text-left">
                        <h2 className="text-3xl font-bold text-white mb-2">Weekly Report</h2>
                        <p className="text-gray-400">
                            {startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' - '}
                            {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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

                {/* Table */}
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
                                // Earned logic ($5/hr)
                                const userEarned = (day.totalTime / 3600) * 5;
                                return (
                                    <tr key={day.date} className="hover:bg-[#252525] transition-colors">
                                        <td className="px-6 py-4 text-white font-medium whitespace-nowrap">
                                            {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4 text-gray-400 whitespace-nowrap">{day.dayName}</td>
                                        <td className="px-6 py-4 font-mono text-lg text-white whitespace-nowrap">
                                            <div>{formatDuration(day.totalTime)}</div>
                                            {selectedUser === 'sourabh' && (
                                                <div className="text-xs text-green-500 font-bold">${userEarned.toFixed(2)}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-lg text-white text-right font-bold whitespace-nowrap">
                                            {formatDuration(day.totalTime)}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot className="bg-[#2a2a2a] border-t border-[#333]">
                            <tr>
                                <td colSpan={2} className="px-6 py-4 text-right font-bold text-gray-400 uppercase text-xs tracking-wider whitespace-nowrap">
                                    Weekly Totals
                                </td>
                                <td className="px-6 py-4 font-bold text-xl text-[#14a800] whitespace-nowrap">
                                    {formatDuration(totalTimeWeek)}
                                    {selectedUser === 'sourabh' && (
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
