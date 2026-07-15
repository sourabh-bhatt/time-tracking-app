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
    options?: { includeLabel?: boolean; includeSeconds?: boolean },
) {
    const includeLabel = Boolean(options?.includeLabel);
    const includeSeconds = Boolean(options?.includeSeconds);
    const timeText = date.toLocaleTimeString("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: includeSeconds ? "2-digit" : undefined,
    });
    const zone = getTimeZoneAbbreviation(date, timeZone);
    const offset = getTimeZoneOffsetLabel(date, timeZone);

    if (includeLabel) {
        return `${timeText} ${label} ${zone} \u00b7 ${offset}`;
    }

    return `${timeText} ${zone} \u00b7 ${offset}`;
}

export function getCompactTimeZoneDisplay(date: Date, timeZone: string) {
    const timeText = date.toLocaleTimeString("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
    });
    return `${timeText} ${getTimeZoneAbbreviation(date, timeZone)}`;
}
