"use client";

import { useEffect, useState } from "react";
import { getTimeZoneDisplay } from "./timeZoneUtils";

export default function TimeZoneClock({
    timeZone,
    label,
    includeLabel = true,
    includeSeconds = true,
    className = "",
}: {
    timeZone: string;
    label: string;
    includeLabel?: boolean;
    includeSeconds?: boolean;
    className?: string;
}) {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setNow(new Date());
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, []);

    return (
        <span className={className}>
            {getTimeZoneDisplay(now, timeZone, label, { includeLabel, includeSeconds })}
        </span>
    );
}
