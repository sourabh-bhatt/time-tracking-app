"use client";

import { useEffect, useState } from "react";
import { EASTERN_TIME_LABEL, EASTERN_TIMEZONE, getTimeZoneDisplay } from "./timeZoneUtils";

export default function TimeZoneClock({
    timeZone = EASTERN_TIMEZONE,
    label = EASTERN_TIME_LABEL,
    includeLabel = true,
    includeSeconds = false,
    includeOffset = true,
    className = "",
}: {
    timeZone?: string;
    label?: string;
    includeLabel?: boolean;
    includeSeconds?: boolean;
    includeOffset?: boolean;
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
            {getTimeZoneDisplay(now, timeZone, label, { includeLabel, includeSeconds, includeOffset })}
        </span>
    );
}
