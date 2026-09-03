'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ImageModal from './ImageModal';
import FlagButton from './FlagButton';
import {
    EASTERN_TIMEZONE,
    getCompactTimeZoneDisplay,
    getHourInTimeZone,
    getTimeZoneRangeDisplay,
} from './timeZoneUtils';

const TRACKING_INTERVAL_SECONDS = 600;

interface Activity {
    mouseClicks: number;
    keyPresses: number;
    mouseMoves: number;
}

export interface LogEntry {
    _id: string;
    userId: string;
    timestamp: string;
    activity: Activity;
    memo?: string;
    type?: string;
    dateKey: string;
    countsTowardTime: boolean;
}

interface ScreenshotGalleryProps {
    logs: LogEntry[];
    selectedUser: string;
    isAdmin: boolean;
    canDelete?: boolean;
    dateKey: string;
}

function formatTrackingTimestamp(timestamp: string) {
    return getCompactTimeZoneDisplay(new Date(timestamp), EASTERN_TIMEZONE);
}

function formatTrackingRange(logs: LogEntry[]) {
    return getTimeZoneRangeDisplay(
        new Date(logs[0].timestamp),
        new Date(logs[logs.length - 1].timestamp),
        EASTERN_TIMEZONE,
    );
}

function countTrackedLogs(logs: LogEntry[]) {
    return logs.filter((log) => log.countsTowardTime).length;
}

function formatTrackedDuration(logs: LogEntry[]) {
    const trackedMinutes = countTrackedLogs(logs) * (TRACKING_INTERVAL_SECONDS / 60);
    return `(${trackedMinutes} mins)`;
}

export default function ScreenshotGallery({
    logs,
    selectedUser,
    isAdmin,
    canDelete = true,
    dateKey,
}: ScreenshotGalleryProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const router = useRouter();

    const logsByHourAndMemo = useMemo(() => {
        const grouped: { [hour: number]: { [memo: string]: LogEntry[] } } = {};
        logs.forEach((log) => {
            const hour = getHourInTimeZone(new Date(log.timestamp), EASTERN_TIMEZONE);
            const memo = log.memo || "No Memo";

            if (!grouped[hour]) grouped[hour] = {};
            if (!grouped[hour][memo]) grouped[hour][memo] = [];

            grouped[hour][memo].push(log);
        });
        return grouped;
    }, [logs]);

    const showToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 4000);
    };

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
                if (!isSelectMode) setIsSelectMode(true);
            }
            return next;
        });
    };

    const toggleSelectBlock = (blockLogs: LogEntry[]) => {
        const blockIds = blockLogs.map((l) => l._id);
        const allSelected = blockIds.every((id) => selectedIds.has(id));

        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allSelected) {
                blockIds.forEach((id) => next.delete(id));
            } else {
                blockIds.forEach((id) => next.add(id));
                if (!isSelectMode) setIsSelectMode(true);
            }
            return next;
        });
    };

    const selectAllOnDay = () => {
        const allIds = logs.map((l) => l._id);
        setSelectedIds(new Set(allIds));
        setIsSelectMode(true);
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    const exitSelectMode = () => {
        setSelectedIds(new Set());
        setIsSelectMode(false);
    };

    const confirmDelete = async () => {
        if (selectedIds.size === 0) return;

        setIsDeleting(true);
        setErrorMessage(null);

        try {
            const idsToDelete = Array.from(selectedIds);
            const res = await fetch('/api/log/bulk-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: idsToDelete }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || 'Failed to delete screenshots');
            }

            setShowConfirmModal(false);
            setSelectedIds(new Set());
            setIsSelectMode(false);
            showToast(`Deleted ${data.deletedCount || idsToDelete.length} screenshot(s)`);
            router.refresh();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error deleting screenshots';
            setErrorMessage(message);
        } finally {
            setIsDeleting(false);
        }
    };

    // Calculate duration for selected items
    const selectedLogs = useMemo(() => {
        return logs.filter((log) => selectedIds.has(log._id));
    }, [logs, selectedIds]);

    const selectedTrackedMinutes = useMemo(() => {
        return countTrackedLogs(selectedLogs) * (TRACKING_INTERVAL_SECONDS / 60);
    }, [selectedLogs]);

    if (logs.length === 0) {
        return (
            <div className="text-center py-20 bg-[#1e1e1e] rounded-xl border border-dashed border-[#333]">
                <p className="text-gray-500">No activity recorded for this day.</p>
            </div>
        );
    }

    return (
        <div className="relative space-y-6">
            {/* Top Toolbar / Bulk Selection Controls */}
            {canDelete && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1e1e1e] border border-[#333] px-5 py-3 rounded-xl">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-300">
                            Activity Feed ({logs.length} screenshot{logs.length !== 1 ? 's' : ''})
                        </span>
                        {selectedIds.size > 0 && (
                            <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs px-2.5 py-0.5 rounded-full font-medium">
                                {selectedIds.size} selected ({selectedTrackedMinutes}m tracked)
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {isSelectMode ? (
                            <>
                                <button
                                    onClick={selectedIds.size === logs.length ? clearSelection : selectAllOnDay}
                                    className="text-xs px-3 py-1.5 rounded-md bg-[#2a2a2a] text-gray-300 hover:text-white border border-[#444] transition-colors"
                                >
                                    {selectedIds.size === logs.length ? 'Deselect All' : `Select All (${logs.length})`}
                                </button>
                                <button
                                    onClick={exitSelectMode}
                                    className="text-xs px-3 py-1.5 rounded-md bg-[#252525] text-gray-400 hover:text-white border border-[#333] transition-colors"
                                >
                                    Done
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsSelectMode(true)}
                                className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-md bg-[#2a2a2a] text-gray-300 hover:text-white border border-[#444] transition-colors"
                                title="Select multiple screenshots to delete"
                            >
                                <span>☑️</span>
                                <span>Bulk Delete</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toastMessage && (
                <div className="fixed top-6 right-6 z-50 bg-[#14a800] text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-xl animate-fade-in flex items-center gap-2">
                    <span>✓</span>
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* Time Blocks & Screenshots */}
            <div className="space-y-8">
                {Object.entries(logsByHourAndMemo).map(([hour, memos]) => (
                    <div key={hour} className="space-y-4">
                        {Object.entries(memos).map(([memo, memoLogs]) => {
                            const blockIds = memoLogs.map((l) => l._id);
                            const allBlockSelected = blockIds.every((id) => selectedIds.has(id));
                            const someBlockSelected = blockIds.some((id) => selectedIds.has(id));

                            return (
                                <div key={`${hour}-${memo}`} className="bg-[#1e1e1e] rounded-xl border border-[#333] overflow-hidden">
                                    {/* Block Header */}
                                    <div className="px-6 py-3 border-b border-[#333] bg-[#252525] flex flex-col gap-3 items-start md:flex-row md:justify-between md:items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-[#14a800]"></div>
                                            <h3 className="font-medium text-white text-sm md:text-base leading-snug">
                                                {formatTrackingRange(memoLogs)}
                                                <span className="text-gray-400 font-normal ml-2">{formatTrackedDuration(memoLogs)}</span>
                                            </h3>
                                        </div>

                                        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                                            <div className="text-white font-medium text-sm md:text-base">{memo}</div>

                                            <div className="flex items-center gap-2">
                                                {canDelete && (
                                                    <button
                                                        onClick={() => toggleSelectBlock(memoLogs)}
                                                        className={`text-xs px-2.5 py-1 rounded transition-colors border ${
                                                            allBlockSelected
                                                                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                                                : someBlockSelected
                                                                ? 'bg-[#333] text-white border-[#555]'
                                                                : 'bg-[#2a2a2a] text-gray-400 hover:text-white border-[#333]'
                                                        }`}
                                                        title="Select/Deselect all screenshots in this block"
                                                    >
                                                        {allBlockSelected ? 'Deselect Block' : `Select Block (${memoLogs.length})`}
                                                    </button>
                                                )}

                                                {isAdmin && (
                                                    <FlagButton
                                                        userId={selectedUser}
                                                        logIds={memoLogs.map((log) => log._id)}
                                                        targetType="time-block"
                                                        startTimestamp={memoLogs[0].timestamp}
                                                        endTimestamp={memoLogs[memoLogs.length - 1].timestamp}
                                                        memo={memo}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Grid of Screenshots */}
                                    <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                        {memoLogs.map((log) => {
                                            const isSelected = selectedIds.has(log._id);
                                            const activityScore = Math.min((log.activity.keyPresses + log.activity.mouseClicks + log.activity.mouseMoves) / 60, 10);

                                            const cardContent = (
                                                <div
                                                    className={`aspect-video bg-[#121212] rounded-md overflow-hidden border relative cursor-pointer transition-all ${
                                                        isSelected
                                                            ? 'ring-2 ring-red-500 border-red-500 shadow-md shadow-red-500/20'
                                                            : 'border-[#333] hover:ring-2 hover:ring-[#14a800]'
                                                    }`}
                                                    onClick={isSelectMode ? () => toggleSelect(log._id) : undefined}
                                                >
                                                    <img
                                                        src={`/api/image/${log._id}`}
                                                        alt="Screen"
                                                        loading="lazy"
                                                        className={`w-full h-full object-cover transition-opacity ${
                                                            isSelected ? 'opacity-70' : 'opacity-100'
                                                        }`}
                                                    />

                                                    {/* Selection Checkbox Overlay */}
                                                    {canDelete && (
                                                        <div
                                                            className={`absolute top-2 left-2 z-10 transition-opacity ${
                                                                isSelectMode || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                                            }`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleSelect(log._id);
                                                            }}
                                                        >
                                                            <div
                                                                className={`w-6 h-6 rounded-md flex items-center justify-center border transition-all cursor-pointer shadow-md ${
                                                                    isSelected
                                                                        ? 'bg-red-600 border-red-500 text-white'
                                                                        : 'bg-black/70 border-white/60 hover:border-white text-transparent'
                                                                }`}
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Hover Details Overlay (only when not in select mode) */}
                                                    {!isSelectMode && (
                                                        <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs p-2 text-center pointer-events-none">
                                                            <div>Keys: {log.activity.keyPresses}</div>
                                                            <div>Clicks: {log.activity.mouseClicks}</div>
                                                            <div className="mt-1 text-[10px] text-gray-300 flex flex-col gap-1">
                                                                <div>{formatTrackingTimestamp(log.timestamp)}</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );

                                            return (
                                                <div key={log._id} className="group relative">
                                                    {isSelectMode ? (
                                                        cardContent
                                                    ) : (
                                                        <ImageModal
                                                            src={`/api/image/${log._id}`}
                                                            timestamp={formatTrackingTimestamp(log.timestamp)}
                                                            activity={log.activity}
                                                            id={log._id}
                                                        >
                                                            {cardContent}
                                                        </ImageModal>
                                                    )}

                                                    {isAdmin && !isSelectMode && (
                                                        <div className="mt-2 flex justify-end">
                                                            <FlagButton
                                                                userId={selectedUser}
                                                                logIds={[log._id]}
                                                                targetType="screenshot"
                                                                startTimestamp={log.timestamp}
                                                                endTimestamp={log.timestamp}
                                                                memo={memo}
                                                            />
                                                        </div>
                                                    )}

                                                    <div className="mt-2 space-y-1">
                                                        <div className="flex gap-[2px] h-1.5">
                                                            {[...Array(10)].map((_, i) => (
                                                                <div
                                                                    key={i}
                                                                    className={`flex-1 rounded-full ${
                                                                        i < activityScore ? 'bg-[#14a800]' : 'bg-[#333]'
                                                                    }`}
                                                                />
                                                            ))}
                                                        </div>
                                                        <div className="flex justify-between text-[10px] text-gray-500 leading-tight">
                                                            <span className="block whitespace-normal break-words">
                                                                {formatTrackingTimestamp(log.timestamp)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Sticky Floating Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1e1e1e]/95 backdrop-blur-md border border-[#444] shadow-2xl rounded-2xl px-6 py-3.5 flex flex-wrap items-center gap-4 text-white max-w-2xl w-[92%] sm:w-auto justify-between sm:justify-center">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                        <span>
                            {selectedIds.size} screenshot{selectedIds.size !== 1 ? 's' : ''} selected
                        </span>
                        <span className="text-gray-400 text-xs hidden sm:inline">
                            ({selectedTrackedMinutes} mins tracked)
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={clearSelection}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[#2a2a2a] text-gray-300 hover:text-white border border-[#444] transition-colors"
                        >
                            Clear
                        </button>

                        <button
                            onClick={() => setShowConfirmModal(true)}
                            className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors shadow-md shadow-red-600/30"
                        >
                            <span>🗑️</span>
                            <span>Delete Selected ({selectedIds.size})</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Bulk Deletion Confirmation Modal */}
            {showConfirmModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={() => !isDeleting && setShowConfirmModal(false)}
                >
                    <div
                        className="relative w-full max-w-md bg-[#1e1e1e] border border-[#333] rounded-2xl p-6 shadow-2xl text-white"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 text-red-500 mb-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-xl">
                                🗑️
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Delete Screenshots</h3>
                                <p className="text-xs text-gray-400 capitalize">{selectedUser} · {dateKey}</p>
                            </div>
                        </div>

                        <p className="text-sm text-gray-300 mb-3 leading-relaxed">
                            Are you sure you want to permanently delete{' '}
                            <strong className="text-white font-semibold">{selectedIds.size} screenshot{selectedIds.size !== 1 ? 's' : ''}</strong>?
                        </p>

                        <div className="bg-[#252525] border border-[#333] rounded-xl p-3.5 mb-4 text-xs text-gray-300 space-y-1.5">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Total screenshots:</span>
                                <span className="font-semibold text-white">{selectedIds.size}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Tracked time to deduct:</span>
                                <span className="font-semibold text-red-400">-{selectedTrackedMinutes} mins</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Employee:</span>
                                <span className="font-semibold text-white capitalize">{selectedUser}</span>
                            </div>
                        </div>

                        <p className="text-xs text-amber-400/90 mb-5 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
                            ⚠️ This action cannot be undone. S3 image records and associated tracked minutes will be permanently removed.
                        </p>

                        {errorMessage && (
                            <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
                                {errorMessage}
                            </div>
                        )}

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowConfirmModal(false)}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white bg-[#2a2a2a] border border-[#333] hover:border-[#555] transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-lg shadow-red-600/30 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        <span>Deleting...</span>
                                    </>
                                ) : (
                                    <span>Delete Permanently</span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
