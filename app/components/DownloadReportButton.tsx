
"use client";

import React from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface DailyStat {
    date: string; // YYYY-MM-DD
    dayName: string; // Mon, Tue...
    sourabh: number; // Seconds
}

interface DownloadReportButtonProps {
    stats: DailyStat[];
    startDate: string;
    endDate: string;
}

export default function DownloadReportButton({ stats, startDate, endDate }: DownloadReportButtonProps) {
    const handleCsvDownload = () => {
        // 1. Prepare CSV Header
        const headers = ["Date", "Day", "Sourabh Hours", "Sourabh Earnings ($)"];

        // 2. Prepare Rows
        const rows = stats.map((day) => {
            const sourabhHours = (day.sourabh / 3600).toFixed(2);
            const sourabhEarnings = ((day.sourabh / 3600) * 5).toFixed(2);

            return [
                day.date,
                day.dayName,
                sourabhHours,
                sourabhEarnings
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

    const handlePdfDownload = () => {
        const doc = new jsPDF();

        // Title
        doc.setFontSize(18);
        doc.text("Weekly Report", 14, 22);

        // Subtitle (Date Range)
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`${startDate} to ${endDate} `, 14, 30);

        // Prepare Table Data
        const tableHead = [["Date", "Day", "Sourabh (Hrs)", "Sourabh ($)"]];
        const tableBody = stats.map((day) => {
            const sourabhHours = (day.sourabh / 3600).toFixed(2);
            const sourabhEarnings = ((day.sourabh / 3600) * 5).toFixed(2);

            return [
                day.date,
                day.dayName,
                sourabhHours,
                `$${sourabhEarnings} `
            ];
        });

        // Calculate Totals for Footer
        const totalSourabhSec = stats.reduce((acc, curr) => acc + curr.sourabh, 0);
        const totalEarnings = ((totalSourabhSec / 3600) * 5).toFixed(2);

        const tableFoot = [[
            "Totals",
            "",
            (totalSourabhSec / 3600).toFixed(2),
            `$${totalEarnings} `
        ]];

        // Generate Table
        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            foot: tableFoot,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [20, 168, 0] }, // Green like the brand
            footStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontStyle: 'bold' },
            styles: { fontSize: 10, cellPadding: 3 },
        });

        // Save
        doc.save(`weekly_report_${startDate}_to_${endDate}.pdf`);
    };

    return (
        <div className="flex gap-2">
            <button
                onClick={handleCsvDownload}
                className="bg-[#2a2a2a] hover:bg-[#333] text-gray-300 border border-[#333] px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                CSV
            </button>
            <button
                onClick={handlePdfDownload}
                className="bg-[#14a800] hover:bg-[#108a00] text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                PDF
            </button>
        </div>
    );
}
