"use client";

import { useEffect, useMemo, useState } from "react";
import { getTimeZoneAbbreviation, getTimeZoneDisplay } from "./timeZoneUtils";

type PresenceSummary = {
    userId: string;
    status: "offline" | "tracking-off" | "idle" | "active";
    statusLabel: string;
    isOnline: boolean;
    isTracking: boolean;
    isIdle: boolean;
    platform: string | null;
    trackingStartedAt: string | null;
    activeSince: string | null;
    idleSince: string | null;
    lastHeartbeatAt: string | null;
    lastActivityAt: string | null;
    heartbeatAgeSeconds: number | null;
    activityAgeSeconds: number | null;
    trackingDurationSeconds: number | null;
    activeDurationSeconds: number | null;
    idleDurationSeconds: number | null;
    idleThresholdSeconds: number;
    timeZone: string;
    timeZoneLabel: string;
};

function formatElapsed(totalSeconds: number | null) {
    if (!Number.isFinite(totalSeconds) || totalSeconds === null || totalSeconds < 0) {
        return "0s";
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}

function formatTime(iso: string | null, timeZone: string) {
    if (!iso) {
        return "n/a";
    }

    return new Date(iso).toLocaleTimeString("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
    });
}

function getCardClasses(status: PresenceSummary["status"]) {
    switch (status) {
        case "active":
            return "border-[#14a800] bg-[#132312]";
        case "idle":
            return "border-[#d4a72c] bg-[#29210d]";
        case "tracking-off":
            return "border-[#00acc1] bg-[#0c2327]";
        default:
            return "border-[#333] bg-[#1e1e1e]";
    }
}

function getDotClasses(status: PresenceSummary["status"]) {
    switch (status) {
        case "active":
            return "bg-[#14a800] shadow-[0_0_12px_rgba(20,168,0,0.7)]";
        case "idle":
            return "bg-[#d4a72c] shadow-[0_0_12px_rgba(212,167,44,0.6)]";
        case "tracking-off":
            return "bg-[#00acc1] shadow-[0_0_12px_rgba(0,172,193,0.6)]";
        default:
            return "bg-[#64748b]";
    }
}

async function fetchPresence(users: string[]) {
    const query = encodeURIComponent(users.join(","));
    const response = await fetch(`/api/presence?users=${query}`, {
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Presence request failed: ${response.status}`);
    }

    const payload = await response.json();
    return payload.presence as PresenceSummary[];
}

export default function LivePresencePanel({
    initialPresence,
    users,
}: {
    initialPresence: PresenceSummary[];
    users: string[];
}) {
    const [presence, setPresence] = useState<PresenceSummary[]>(initialPresence);
    const [, setTick] = useState(0);

    useEffect(() => {
        let mounted = true;

        const refresh = async () => {
            try {
                const nextPresence = await fetchPresence(users);
                if (mounted) {
                    setPresence(nextPresence);
                }
            } catch (error) {
                console.error("Presence refresh failed", error);
            }
        };

        refresh();

        const refreshId = window.setInterval(refresh, 20000);
        const tickerId = window.setInterval(() => setTick((value) => value + 1), 1000);

        return () => {
            mounted = false;
            window.clearInterval(refreshId);
            window.clearInterval(tickerId);
        };
    }, [users]);

    const sortedPresence = useMemo(
        () => [...presence].sort((left, right) => left.userId.localeCompare(right.userId)),
        [presence],
    );

    if (sortedPresence.length === 0) {
        return null;
    }

    return (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {sortedPresence.map((entry) => {
                const primaryDetail = entry.status === "active"
                    ? `Active for ${formatElapsed(entry.activeDurationSeconds)}`
                    : entry.status === "idle"
                        ? `Idle for ${formatElapsed(entry.idleDurationSeconds)}`
                        : entry.status === "tracking-off"
                            ? "Desktop is online, tracker is off"
                            : entry.heartbeatAgeSeconds === null
                                ? "No live tracker heartbeat yet"
                                : `Last seen ${formatElapsed(entry.heartbeatAgeSeconds)} ago`;

                const secondaryDetail = entry.isTracking && entry.trackingStartedAt
                    ? `Tracking since ${formatTime(entry.trackingStartedAt, entry.timeZone)} ${getTimeZoneAbbreviation(new Date(entry.trackingStartedAt), entry.timeZone)}`
                    : entry.lastHeartbeatAt
                        ? `Heartbeat ${formatTime(entry.lastHeartbeatAt, entry.timeZone)} ${getTimeZoneAbbreviation(new Date(entry.lastHeartbeatAt), entry.timeZone)}`
                        : "Waiting for desktop app login heartbeat";
                const timeZoneDisplay = getTimeZoneDisplay(new Date(), entry.timeZone, entry.timeZoneLabel, {
                    includeLabel: true,
                    includeSeconds: true,
                });

                return (
                    <div
                        key={entry.userId}
                        className={`rounded-xl border px-5 py-4 ${getCardClasses(entry.status)}`}
                    >
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="text-sm uppercase tracking-[0.18em] text-gray-400">
                                    {entry.userId}
                                </div>
                                <div className="mt-2 flex items-center gap-3">
                                    <span className={`h-3 w-3 rounded-full ${getDotClasses(entry.status)}`}></span>
                                    <span className="text-xl font-semibold text-white">{entry.statusLabel}</span>
                                </div>
                            </div>
                            <div className="text-right text-xs text-gray-400">
                                <div>{timeZoneDisplay}</div>
                                {entry.platform ? <div>{entry.platform}</div> : null}
                            </div>
                        </div>

                        <div className="mt-4 text-sm text-gray-200">{primaryDetail}</div>
                        <div className="mt-1 text-xs text-gray-400">{secondaryDetail}</div>
                    </div>
                );
            })}
        </section>
    );
}
