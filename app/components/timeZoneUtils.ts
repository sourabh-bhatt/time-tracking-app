export const EASTERN_TIMEZONE = "America/New_York";
export const EASTERN_TIME_LABEL = "Eastern Time";

type EasternInput = Date | string | number;
type EasternFormatOptions = Intl.DateTimeFormatOptions & {
    omitDayPeriod?: boolean;
};

type TimeZoneDisplayOptions = {
    includeLabel?: boolean;
    includeSeconds?: boolean;
    includeOffset?: boolean;
};

function toDate(value: EasternInput) {
    return value instanceof Date ? value : new Date(value);
}

export function formatEastern(date: EasternInput, options: EasternFormatOptions) {
    const { omitDayPeriod, ...intlOptions } = options;
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: EASTERN_TIMEZONE,
        ...intlOptions,
    }).formatToParts(toDate(date));

    return parts
        .filter((part) => !omitDayPeriod || part.type !== "dayPeriod")
        .map((part) => part.value)
        .join("")
        .trim();
}

export function toEST(date: EasternInput) {
    return formatEastern(date, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
}

export function getTimeZoneAbbreviation(date: EasternInput, timeZone = EASTERN_TIMEZONE) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "short",
    }).formatToParts(toDate(date));

    return parts.find((part) => part.type === "timeZoneName")?.value || "";
}

export function getTimeZoneOffsetLabel(date: EasternInput, timeZone = EASTERN_TIMEZONE) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "shortOffset",
    }).formatToParts(toDate(date));
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
    date: EasternInput,
    timeZone = EASTERN_TIMEZONE,
    label: string,
    options?: TimeZoneDisplayOptions,
) {
    const includeLabel = Boolean(options?.includeLabel);
    const includeSeconds = Boolean(options?.includeSeconds);
    const includeOffset = options?.includeOffset !== false;
    const timeText = formatEastern(date, {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        second: includeSeconds ? "2-digit" : undefined,
    });
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

export function getCompactTimeZoneDisplay(date: EasternInput, timeZone = EASTERN_TIMEZONE) {
    const timeText = formatEastern(date, {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
    });
    return `${timeText} ${getTimeZoneAbbreviation(date, timeZone)}`;
}

export function getHourInTimeZone(date: EasternInput, timeZone = EASTERN_TIMEZONE) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        hour12: false,
    }).formatToParts(toDate(date));
    const hour = parts.find((part) => part.type === "hour")?.value;
    return Number(hour || 0);
}

export function getTimeZoneRangeDisplay(start: EasternInput, end: EasternInput, timeZone = EASTERN_TIMEZONE) {
    return `${formatEastern(start, { timeZone, hour: "numeric", minute: "2-digit" })} - ${formatEastern(end, { timeZone, hour: "numeric", minute: "2-digit", omitDayPeriod: true })}`;
}

export function getEasternDateDisplay(date: EasternInput) {
    return formatEastern(date, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export function getEasternDateShort(date: EasternInput) {
    return formatEastern(date, {
        month: "short",
        day: "numeric",
    });
}

export function getEasternDateWithYear(date: EasternInput) {
    return formatEastern(date, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export function getEasternWeekday(date: EasternInput, weekday: "short" | "long" = "short") {
    return formatEastern(date, { weekday });
}

export function getEasternTime(date: EasternInput, options?: { includeSeconds?: boolean; omitDayPeriod?: boolean }) {
    return formatEastern(date, {
        hour: "numeric",
        minute: "2-digit",
        second: options?.includeSeconds ? "2-digit" : undefined,
        omitDayPeriod: options?.omitDayPeriod,
    });
}
