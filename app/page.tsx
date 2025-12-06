import clientPromise from "../lib/mongodb";
import Link from "next/link";
import ImageModal from "./components/ImageModal";

export const dynamic = "force-dynamic";

interface Activity {
  mouseClicks: number;
  keyPresses: number;
  mouseMoves: number;
}

interface LogEntry {
  _id: string;
  userId: string;
  timestamp: Date;
  activity: Activity;
  memo?: string;
  type?: string;
}

// Fetch logs from DB
async function getLogs(userId: string, date: Date): Promise<LogEntry[]> {
  const client = await clientPromise;
  const db = client.db("employee_monitor");

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Query user-specific collection
  const collectionName = `logs_${userId.toLowerCase()}`;
  const logs = await db
    .collection(collectionName)
    .find({
      userId: userId,
      timestamp: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    })
    .project({ image: 0 }) // Exclude image for list view
    .sort({ timestamp: 1 })
    .toArray();

  return logs.map((log) => ({
    _id: log._id.toString(),
    userId: log.userId,
    timestamp: log.timestamp,
    activity: log.activity,
    memo: log.memo || '',
    type: log.type || 'auto' // Default legacy to auto
  }));
}

export default async function Home(props: { searchParams: Promise<{ user?: string, date?: string }> }) {
  const searchParams = await props.searchParams;
  const selectedUser = searchParams.user || 'sourabh';
  const selectedDateStr = searchParams.date || new Date().toISOString().split('T')[0];
  const selectedDate = new Date(selectedDateStr);

  const logs = await getLogs(selectedUser, selectedDate);

  // Helper to fetch weekly logs
  const getWeeklyLogs = async (userId: string, date: Date) => {
    const client = await clientPromise;
    const db = client.db("employee_monitor");
    const collectionName = `logs_${userId.toLowerCase()}`;

    // Start of week (Monday)
    const weekStart = new Date(date);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    const count = await db.collection(collectionName).countDocuments({
      userId: userId,
      timestamp: { $gte: weekStart },
      type: 'auto' // Only count auto logs for time
    });

    return count;
  };

  const weeklyCount = await getWeeklyLogs(selectedUser, selectedDate);
  const weeklySeconds = weeklyCount * 600;
  const weeklyHours = Math.floor(weeklySeconds / 3600);
  const weeklyMinutes = Math.floor((weeklySeconds % 3600) / 60);

  // Helper to get IST Hour
  const getISTHour = (date: Date) => {
    const d = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return d.getHours();
  };

  // Group logs by hour and memo
  // Structure: { [hour]: { [memo]: LogEntry[] } }
  const logsByHourAndMemo: { [key: number]: { [key: string]: LogEntry[] } } = {};

  logs.forEach(log => {
    const hour = getISTHour(new Date(log.timestamp));
    const memo = log.memo || 'No Memo';

    if (!logsByHourAndMemo[hour]) logsByHourAndMemo[hour] = {};
    if (!logsByHourAndMemo[hour][memo]) logsByHourAndMemo[hour][memo] = [];

    logsByHourAndMemo[hour][memo].push(log);
  });

  // Calculate stats
  // Filter out 'start'/'stop' logs (which have 0 duration credit)
  const autoLogs = logs.filter(l => !l.type || l.type === 'auto');
  const totalSeconds = autoLogs.length * 600;
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMinutes = Math.floor((totalSeconds % 3600) / 60);

  // Calculate total tracked time per hour for timeline (in IST)
  const loggedHours = logs.map(l => getISTHour(new Date(l.timestamp)));
  const trackedHours = new Set(loggedHours);

  const getPrevDate = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  const getNextDate = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  return (
    <div className="min-h-screen bg-[#121212] text-gray-300 font-sans">
      {/* Header */}
      <header className="bg-[#1e1e1e] border-b border-[#333] px-6 py-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-white">Work diary</h1>

            {/* User Selector */}
            <div className="flex bg-[#2a2a2a] rounded-lg p-1">
              {['sourabh', 'prayash'].map((user) => (
                <Link
                  key={user}
                  href={`/?user=${user}&date=${selectedDateStr}`}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${selectedUser === user
                    ? 'bg-[#333] text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                    }`}
                >
                  {user}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="bg-[#14a800] hover:bg-[#108a00] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
              Request Manual Time
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Date Navigation & Stats */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 bg-[#1e1e1e] p-4 rounded-xl border border-[#333]">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <div className="flex items-center bg-[#2a2a2a] rounded-md border border-[#333] px-3 py-2">
              <Link href={`/?user=${selectedUser}&date=${getPrevDate()}`} className="text-gray-400 hover:text-white px-2">‹</Link>
              <span className="text-white font-medium mx-2">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <Link href={`/?user=${selectedUser}&date=${getNextDate()}`} className="text-gray-400 hover:text-white px-2">›</Link>
            </div>
            <Link href={`/?user=${selectedUser}&date=${new Date().toISOString().split('T')[0]}`} className="text-[#14a800] text-sm font-medium hover:underline">
              Today
            </Link>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-end">
                <span className="text-2xl font-bold text-white transition-all hover:text-[#14a800]">
                  {totalHours}:{totalMinutes.toString().padStart(2, '0')} hrs
                </span>
                <span className="text-xs text-gray-400">Today</span>
              </div>

              <div className="h-8 w-[1px] bg-[#333]"></div>

              <div className="flex flex-col items-end">
                <span className="text-xl font-bold text-white transition-all hover:text-[#14a800]">
                  {weeklyHours}:{weeklyMinutes.toString().padStart(2, '0')} <span className="text-sm font-normal text-gray-500">of 40 hrs</span>
                </span>
                <span className="text-xs text-gray-400">This Week</span>
              </div>
            </div>
            <div className="flex gap-4 text-sm ml-4 border-l border-[#333] pl-4">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#14a800]"></span> Tracked</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#00acc1]"></span> Manual</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#e53935]"></span> Overtime</div>
            </div>
          </div>
        </div>

        {/* Timeline View */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex min-w-[800px] border-b border-[#333] pb-2">
            {Array.from({ length: 24 }).map((_, i) => {
              const isTracked = trackedHours.has(i);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`w-full h-3 ${isTracked ? 'bg-[#14a800]' : 'bg-[#2a2a2a]'} rounded-sm`}></div>
                  <div className={`w-full h-3 ${isTracked ? 'bg-[#14a800]' : 'bg-[#2a2a2a]'} rounded-sm`}></div>
                  <span className="text-[10px] text-gray-500">{i === 0 ? '12 am' : i === 12 ? '12 pm' : i > 12 ? `${i - 12} pm` : `${i} am`}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Screenshots Grid */}
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
                    {/* Group Header */}
                    <div className="px-6 py-3 border-b border-[#333] bg-[#252525] flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-[#14a800]"></div>
                        <h3 className="font-medium text-white">
                          {new Date(memoLogs[0].timestamp).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}
                          {' - '}
                          {new Date(memoLogs[memoLogs.length - 1].timestamp).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}
                          {/* Each log is 10 mins, but only count 'auto' logs */}
                          <span className="text-gray-400 font-normal ml-2">
                            ({memoLogs.filter(l => !l.type || l.type === 'auto').length * 10} mins)
                          </span>
                        </h3>
                      </div>
                      <div className="text-white font-medium">{memo}</div>
                      <button className="text-gray-500 hover:text-white">...</button>
                    </div>

                    {/* Grid */}
                    <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {memoLogs.map((log) => {
                        // Max score 10. Normal usage ~1 activity/sec => 600/10mins. 
                        // So divide by 60 to get a score out of 10 for normal intense activity? 
                        // Or just simplistic divide by 10 like before? Before it was 10s => /10 was 1.0 logic.
                        // Now 600s. If I do /10 it will be huge. 
                        // Let's divide by 60.
                        const activityScore = Math.min((log.activity.keyPresses + log.activity.mouseClicks + log.activity.mouseMoves) / 60, 10);

                        return (
                          <div key={log._id} className="group relative">
                            <ImageModal
                              src={`/api/image/${log._id}`}
                              timestamp={new Date(log.timestamp).toLocaleTimeString()}
                              activity={log.activity}
                            >
                              <div className="aspect-video bg-[#121212] rounded-md overflow-hidden border border-[#333] relative cursor-pointer hover:ring-2 ring-[#14a800] transition-all">
                                {/* Lazy load image via API */}
                                <img
                                  src={`/api/image/${log._id}`}
                                  alt="Screen"
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />

                                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs p-2 text-center pointer-events-none">
                                  <div>Keys: {log.activity.keyPresses}</div>
                                  <div>Clicks: {log.activity.mouseClicks}</div>
                                  <div className="mt-1 text-[10px] text-gray-300 flex flex-col gap-1">
                                    <div>
                                      EST: {new Date(log.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}
                                    </div>
                                    <div>
                                      IST: {new Date(log.timestamp).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}
                                    </div>
                                    <div>
                                      NPT: {new Date(log.timestamp).toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: 'numeric', minute: '2-digit' })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </ImageModal>

                            <div className="mt-2 space-y-1">
                              <div className="flex gap-[2px] h-1.5">
                                {[...Array(10)].map((_, i) => (
                                  <div key={i} className={`flex-1 rounded-full ${i < activityScore ? 'bg-[#14a800]' : 'bg-[#333]'}`} />
                                ))}
                              </div>
                              <div className="flex justify-between text-[10px] text-gray-500">
                                <span>{new Date(log.timestamp).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}</span>
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
