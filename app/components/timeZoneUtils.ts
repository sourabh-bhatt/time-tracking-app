type TimeZoneDisplayOptions = {
    includeLabel?: boolean;
    includeSeconds?: boolean;
    includeOffset?: boolean;
};

type FormatTimeOptions = {
    includeSeconds?: boolean;
    includeDayPeriod?: boolean;
};

function formatTimeInZone(date: Date, timeZone: string, options?: FormatTimeOptions) {
    const includeSeconds = Boolean(options?.includeSeconds);
    const includeDayPeriod = options?.includeDayPeriod !== false;
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        second: includeSeconds ? "2-digit" : undefined,
    }).formatToParts(date);

    return parts
        .filter((part) => includeDayPeriod || part.type !== "dayPeriod")
        .map((part) => part.value)
        .join("")
        .trim();
}

export function getTimeZoneAbbreviation(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "short",
    }).formatToParts(date);

    return parts.find((part) => part.type === "timeZoneName")?.value || "";
}

export function getTimeZoneOffsetLabel(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "shortOffset",
    }).formatToParts(date);
    const raw = parts.find((part) => part.type === "timeZoneName")?.value || "";
    const normalized = raw.replace(/^GMT/, "UTC");
    const match = normalized.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/);

    if (!match) {
        return normalized || "UTC";
    }

    const [, sign, hours, minutes = "00"] = match;
    const safeHours = hours.padStart(2, "0");
    const safeSign = sign === "-" ? "\u2212" : "+";
    return `UTC${safeSign}${safeHours}:${minutes}`;
}

export function getTimeZoneDisplay(
    date: Date,
    timeZone: string,
    label: string,
    options?: TimeZoneDisplayOptions,
) {
    const includeLabel = Boolean(options?.includeLabel);
    const includeSeconds = Boolean(options?.includeSeconds);
    const includeOffset = options?.includeOffset !== false;
    const timeText = formatTimeInZone(date, timeZone, { includeSeconds });
    const zone = getTimeZoneAbbreviation(date, timeZone);
    const offset = includeOffset ? getTimeZoneOffsetLabel(date, timeZone) : "";

    if (!includeOffset) {
        if (includeLabel) {
            return `${timeText} ${label} ${zone}`;
        }

        return `${timeText} ${zone}`;
    }

    if (includeLabel) {
        return `${timeText} ${label} ${zone} \u00b7 ${offset}`;
    }

    return `${timeText} ${zone} \u00b7 ${offset}`;
}

export function getCompactTimeZoneDisplay(date: Date, timeZone: string) {
    const timeText = formatTimeInZone(date, timeZone);
    return `${timeText} ${getTimeZoneAbbreviation(date, timeZone)}`;
}

export function getHourInTimeZone(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        hour12: false,
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === "hour")?.value;
    return Number(hour || 0);
}

export function getTimeZoneRangeDisplay(start: Date, end: Date, timeZone: string) {
    return `${formatTimeInZone(start, timeZone)} - ${formatTimeInZone(end, timeZone, { includeDayPeriod: false })}`;
}
