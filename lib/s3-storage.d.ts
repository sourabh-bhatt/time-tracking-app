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
}

export interface UserState {
    userId: string;
    weeklyLimitHours: number;
    manual_weekly_paid: number;
    manual_weekly_pending: number;
    manual_total_pending: number;
    allTimeAutoCount: number;
    lastLogDate: string | null;
    lastUpdated: string | null;
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

export const TRACKING_INTERVAL_SECONDS: number;
export const TRACKING_TIMEZONE: string;
export function addDays(dateKey: string, days: number): string;
export function deleteLogById(id: string): Promise<LogRecord | null>;
export function getAllTimeAutoCount(userId: string): Promise<number>;
export function getDateKeysInRange(startDateKey: string, endDateKey: string): string[];
export function getImageById(id: string): Promise<{ buffer: Buffer; contentType: string } | null>;
export function getLogById(id: string): Promise<LogRecord | null>;
export function getTrackingStats(userId: string, currentDate?: Date | string): Promise<TrackingStats>;
export function getUserState(userId: string): Promise<UserState>;
export function getLatestLogDate(userId: string): Promise<string | null>;
export function getWeekStartDateKey(date: Date | string): string;
export function listLogsForDate(userId: string, date: Date | string): Promise<LogRecord[]>;
export function listLogsForDateRange(userId: string, startDate: Date | string, endDate: Date | string): Promise<LogRecord[]>;
export function normalizeUserId(userId: string): string;
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
    updateAllTimeCount?: boolean;
}): Promise<LogRecord>;
export function saveUserState(userId: string, updates: Partial<UserState>): Promise<UserState>;
export function toDateParts(date: Date | string): { year: string; month: string; day: string; dateKey: string };
