"use client";

import React from "react";

interface DailyStat {
    date: string; // YYYY-MM-DD
    dayName: string; // Mon, Tue...
    sourabh: number; // Seconds
    prayash: number; // Seconds
}

interface DownloadReportButtonProps {
    stats: DailyStat[];
    startDate: string;
    endDate: string;
}

export default function DownloadReportButton({ stats, startDate, endDate }: DownloadReportButtonProps) {
    const handleDownload = () => {
        // 1. Prepare CSV Header
        const headers = ["Date", "Day", "Sourabh Hours", "Sourabh Earnings ($)", "Prayash Hours", "Total Hours"];

        // 2. Prepare Rows
        const rows = stats.map((day) => {
            const sourabhHours = (day.sourabh / 3600).toFixed(2);
            const sourabhEarnings = ((day.sourabh / 3600) * 5).toFixed(2);
            const prayashHours = (day.prayash / 3600).toFixed(2);
            const totalHours = ((day.sourabh + day.prayash) / 3600).toFixed(2);

            return [
                day.date,
                day.dayName,
                sourabhHours,
                sourabhEarnings,
                prayashHours,
                totalHours
            ];
        });

        // 3. Construct CSV Content
        const csvContent = [
            headers.join(","),
            ...rows.map(row => row.join(","))
        ].join("\n");

        // 4. Trigger Download
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `weekly_report_${startDate}_to_${endDate}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <button
            onClick={handleDownload}
            className="bg-[#14a800] hover:bg-[#108a00] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download CSV
        </button>
    );
}
