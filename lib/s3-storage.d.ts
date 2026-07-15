export interface Activity {
    mouseClicks: number;
    keyPresses: number;
    mouseMoves: number;
}

export interface LogRecord {
    _id: string;
    userId: string;
    timestamp: string;
    activity: Activity;
    memo: string;
    project: string;
    client: string;
    type: string;
    imageKey: string;
    logKey: string;
    dateKey: string;
    countsTowardTime: boolean;
}

export interface UserState {
    userId: string;
    weeklyLimitHours: number;
    manual_weekly_paid: number;
    manual_weekly_pending: number;
    manual_total_pending: number;
    allTimeAutoCount: number;
    lastLogDate: string | null;
    isOnline: boolean;
    isTracking: boolean;
    isIdle: boolean;
    trackingStartedAt: string | null;
    activeSince: string | null;
    idleSince: string | null;
    lastHeartbeatAt: string | null;
    lastActivityAt: string | null;
    platform: string | null;
    lastUpdated: string | null;
}

export interface PresenceSummary {
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
}

export interface TrackingStats {
    userId: string;
    currentDateKey: string;
    weekStartKey: string;
    todayAutoCount: number;
    weekAutoCount: number;
    allTimeAutoCount: number;
    todaySeconds: number;
    weekSeconds: number;
    allTimeSeconds: number;
    manual: {
        weeklyPaid: number;
        weeklyPending: number;
        totalPending: number;
    };
    weeklyLimitHours: number;
}

export interface FlagRecord {
    _id: string;
    userId: string;
    targetType: "screenshot" | "time-block";
    logIds: string[];
    reason: string;
    memo: string;
    startTimestamp: string | null;
    endTimestamp: string | null;
    createdAt: string;
    createdBy: "admin";
    employeeResponse: string;
    respondedAt: string | null;
    hidden: boolean;
    hiddenAt: string | null;
    hiddenBy: string | null;
}

export const IDLE_THRESHOLD_SECONDS: number;
export const PRESENCE_STALE_SECONDS: number;
export const TRACKING_INTERVAL_SECONDS: number;
export const TRACKING_TIME_LABEL: string;
export const TRACKING_TIMEZONE: string;
export function addDays(dateKey: string, days: number): string;
export function countTrackedLogs(records: Array<Partial<LogRecord>>): number;
export function countsTowardTrackedTime(record: Partial<LogRecord>): boolean;
export function createFlag(input: Partial<FlagRecord> & { userId: string; reason: string }): Promise<FlagRecord>;
export function deleteFlagById(id: string): Promise<FlagRecord | null>;
export function deleteLogById(id: string): Promise<LogRecord | null>;
export function getAllTimeAutoCount(userId: string): Promise<number>;
export function getDateKeysInRange(startDateKey: string, endDateKey: string): string[];
export function getImageById(id: string): Promise<{ buffer: Buffer; contentType: string } | null>;
export function getFlagById(id: string): Promise<FlagRecord | null>;
export function getLogById(id: string): Promise<LogRecord | null>;
export function getPresenceSummary(userId: string, now?: Date | string): Promise<PresenceSummary>;
export function getPresenceSummaries(userIds: string[], now?: Date | string): Promise<PresenceSummary[]>;
export function getTrackingStats(userId: string, currentDate?: Date | string): Promise<TrackingStats>;
export function getUserState(userId: string): Promise<UserState>;
export function getLatestLogDate(userId: string): Promise<string | null>;
export function getWeekStartDateKey(date: Date | string): string;
export function listLogsForDate(userId: string, date: Date | string): Promise<LogRecord[]>;
export function listLogsForDateRange(userId: string, startDate: Date | string, endDate: Date | string): Promise<LogRecord[]>;
export function listFlagsForUser(userId: string, options?: { includeHidden?: boolean }): Promise<FlagRecord[]>;
export function normalizeUserId(userId: string): string;
export function parseDateKey(dateKey: string): Date;
export function saveLogEntry(input: {
    id?: string;
    userId: string;
    timestamp?: Date | string;
    imageBuffer: Buffer;
    activity?: Partial<Activity>;
    memo?: string;
    type?: string;
    project?: string;
    client?: string;
    countsTowardTime?: boolean;
    updateAllTimeCount?: boolean;
}): Promise<LogRecord>;
export function saveUserState(userId: string, updates: Partial<UserState>): Promise<UserState>;
export function toDateParts(date: Date | string): { year: string; month: string; day: string; dateKey: string };
export function updateFlagById(id: string, updates: Partial<FlagRecord>): Promise<FlagRecord | null>;
