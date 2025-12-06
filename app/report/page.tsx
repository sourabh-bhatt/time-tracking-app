import clientPromise from "../../lib/mongodb";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface DailyStat {
    date: string; // YYYY-MM-DD
    dayName: string; // Mon, Tue...
    sourabh: number; // Seconds
    prayash: number; // Seconds
}

async function getWeeklyReport(startDate: Date) {
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

    // 1. Fetch all auto logs for both users in this range
    const users = ['sourabh', 'prayash'];
    const dailyStats: { [key: string]: DailyStat } = {};

    // Initialize days
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        // Use 'en-CA' (YYYY-MM-DD) with local time to avoid UTC shift
        const dateStr = d.toLocaleDateString('en-CA');
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        dailyStats[dateStr] = { date: dateStr, dayName, sourabh: 0, prayash: 0 };
    }

    for (const user of users) {
        const collectionName = `logs_${user}`;

        const logs = await db.collection(collectionName).find({
            timestamp: { $gte: fetchStart, $lt: fetchEnd },
            type: 'auto'
        }).project({ timestamp: 1 }).toArray();

        logs.forEach(log => {
            const date = new Date(log.timestamp);
            // Construct IST YYYY-MM-DD reliably
            const istDateStr = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

            if (dailyStats[istDateStr]) {
                if (user === 'sourabh') dailyStats[istDateStr].sourabh += 600;
                if (user === 'prayash') dailyStats[istDateStr].prayash += 600;
            }
        });
    }

    return Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date));
}

function formatDuration(seconds: number) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
}

export default async function ReportPage(props: { searchParams: Promise<{ date?: string }> }) {
    const searchParams = await props.searchParams;
    const dateParam = searchParams.date || new Date().toISOString().split('T')[0];
    const currentDate = new Date(dateParam);

    // Calculate Start of Week (Monday)
    const day = currentDate.getDay(); // 0=Sun, 1=Mon
    const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const stats = await getWeeklyReport(startOfWeek);

    const totalSourabh = stats.reduce((acc, curr) => acc + curr.sourabh, 0);
    const totalPrayash = stats.reduce((acc, curr) => acc + curr.prayash, 0);

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

    return (
        <div className="min-h-screen bg-[#121212] text-gray-300 font-sans">
            <header className="bg-[#1e1e1e] border-b border-[#333] px-6 py-4 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="flex items-center gap-2 group">
                            <span className="text-gray-400 group-hover:text-white">←</span>
                            <h1 className="text-2xl font-bold text-white">Back to Work Diary</h1>
                        </Link>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-400">
                            Signed in as <span className="text-white font-medium">admin</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Header & Nav */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-3xl font-bold text-white mb-2">Weekly Report</h2>
                        <p className="text-gray-400">
                            {startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' - '}
                            {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Link href={`/report?date=${getPrevWeek()}`} className="px-4 py-2 bg-[#1e1e1e] border border-[#333] rounded hover:border-gray-500 transition-colors">
                            Previous Week
                        </Link>
                        <Link href={`/report?date=${getNextWeek()}`} className="px-4 py-2 bg-[#1e1e1e] border border-[#333] rounded hover:border-gray-500 transition-colors">
                            Next Week
                        </Link>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-[#1e1e1e] border border-[#333] rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-[#2a2a2a] border-b border-[#333]">
                            <tr>
                                <th className="px-6 py-4 text-sm font-medium text-gray-400">Date</th>
                                <th className="px-6 py-4 text-sm font-medium text-gray-400">Day</th>
                                <th className="px-6 py-4 text-sm font-medium text-[#14a800]">Sourabh</th>
                                <th className="px-6 py-4 text-sm font-medium text-[#00acc1]">Prayash</th>
                                <th className="px-6 py-4 text-sm font-medium text-white text-right">Daily Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#333]">
                            {stats.map((day) => (
                                <tr key={day.date} className="hover:bg-[#252525] transition-colors">
                                    <td className="px-6 py-4 text-white font-medium">
                                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">{day.dayName}</td>
                                    <td className="px-6 py-4 font-mono text-lg text-white">
                                        {formatDuration(day.sourabh)}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-lg text-white">
                                        {formatDuration(day.prayash)}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-lg text-white text-right font-bold">
                                        {formatDuration(day.sourabh + day.prayash)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-[#2a2a2a] border-t border-[#333]">
                            <tr>
                                <td colSpan={2} className="px-6 py-4 text-right font-bold text-gray-400 uppercase text-xs tracking-wider">
                                    Weekly Totals
                                </td>
                                <td className="px-6 py-4 font-bold text-xl text-[#14a800]">
                                    {formatDuration(totalSourabh)}
                                    <span className="text-xs font-normal text-gray-500 block">of 40h</span>
                                </td>
                                <td className="px-6 py-4 font-bold text-xl text-[#00acc1]">
                                    {formatDuration(totalPrayash)}
                                    <span className="text-xs font-normal text-gray-500 block">of 40h</span>
                                </td>
                                <td className="px-6 py-4 font-bold text-xl text-white text-right">
                                    {formatDuration(totalSourabh + totalPrayash)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </main>
        </div>
    );
}
