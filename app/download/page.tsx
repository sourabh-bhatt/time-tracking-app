import Link from "next/link";

export const metadata = {
    title: "Download Time Tracker | Beyond Billions",
};

export default function DownloadPage() {
    return (
        <div className="min-h-screen bg-[#121212] text-gray-300 font-sans flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-[#1e1e1e] rounded-xl border border-[#333] p-8 text-center shadow-2xl">
                <div className="mb-6">
                    <div className="w-16 h-16 bg-[#14a800] rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Time Tracker App</h1>
                    <p className="text-gray-400">
                        Download the desktop application to start tracking your work hours and activity.
                    </p>
                </div>

                <div className="space-y-4">
                    {/* Windows Download */}
                    <a
                        href="https://drive.google.com/file/d/17r0wwNS44cD-c1YvJt1ifcGI6Doj1iEy/view?usp=sharing"
                        download
                        className="block w-full bg-[#2a2a2a] hover:bg-[#333] border border-[#333] hover:border-[#14a800] text-white font-medium py-4 px-6 rounded-lg transition-all flex items-center justify-between group"
                    >
                        <div className="flex items-center gap-3">
                            <i className="fab fa-windows text-xl text-[#00a4ef]"></i>
                            <div className="text-left">
                                <div className="text-sm text-gray-400 group-hover:text-white">Download for</div>
                                <div className="font-bold">Windows (Portable Zip)</div>
                            </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 group-hover:text-[#14a800]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </a>

                    {/* Mac Download */}
                    <a
                        href="/installers/TimeTracker.dmg"
                        download
                        className="block w-full bg-[#2a2a2a] hover:bg-[#333] border border-[#333] hover:border-[#14a800] text-white font-medium py-4 px-6 rounded-lg transition-all flex items-center justify-between group"
                    >
                        <div className="flex items-center gap-3">
                            <i className="fab fa-apple text-xl text-white"></i>
                            <div className="text-left">
                                <div className="text-sm text-gray-400 group-hover:text-white">Download for</div>
                                <div className="font-bold">macOS</div>
                            </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 group-hover:text-[#14a800]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </a>
                </div>

                <div className="mt-8 pt-6 border-t border-[#333]">
                    <p className="text-sm text-gray-500 mb-4">
                        Once installed, simply select your name to start tracking.
                    </p>
                    <Link href="/" className="text-[#14a800] hover:underline text-sm">
                        Go to Work Diary &rarr;
                    </Link>
                </div>
            </div>
        </div>
    );
}
