/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const dotenv = require('dotenv');
const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
} = require('@aws-sdk/client-s3');

const TRACKING_TIMEZONE = process.env.TRACKING_TIMEZONE || 'America/New_York';
const TRACKING_TIME_LABEL = process.env.TRACKING_TIME_LABEL || 'Eastern Time';
const TRACKING_INTERVAL_SECONDS = 600;
const IDLE_THRESHOLD_SECONDS = 5 * 60;
// Allow short VM suspends and temporary network/S3 stalls without immediately
// presenting a running desktop tracker as offline.
const PRESENCE_STALE_SECONDS = 5 * 60;

const envCandidates = [
    path.join(process.cwd(), '.env.local'),
    path.join(__dirname, '..', '.env.local'),
];

for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: false });
    }
}

let s3Client;

function getS3Config() {
    const bucket = process.env.AWS_S3_BUCKET || '';
    const region = process.env.AWS_REGION || '';
    const rawPrefix = process.env.AWS_S3_PREFIX || 'time-tracker';
    const basePrefix = rawPrefix.replace(/^\/+|\/+$/g, '');

    if (!bucket || !region) {
        throw new Error('Missing AWS S3 configuration. Set AWS_S3_BUCKET and AWS_REGION.');
    }

    return { bucket, region, basePrefix };
}

function getS3Client() {
    if (!s3Client) {
        const { region } = getS3Config();
        s3Client = new S3Client({ region });
    }

    return s3Client;
}

function sanitizeSegment(value) {
    return String(value || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '');
}

function buildKey(...segments) {
    const { basePrefix } = getS3Config();
    const parts = [basePrefix, ...segments].map(sanitizeSegment).filter(Boolean);
    return parts.join('/');
}

function normalizeUserId(userId) {
    return String(userId || '').trim().toLowerCase();
}

function toDateParts(date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: TRACKING_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    const parts = formatter.formatToParts(new Date(date));
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
        throw new Error('Unable to derive tracking date parts.');
    }

    return {
        year,
        month,
        day,
        dateKey: `${year}-${month}-${day}`,
    };
}

function parseDateKey(dateKey) {
    return new Date(`${dateKey}T00:00:00.000Z`);
}

function formatDateKey(date) {
    return new Date(date).toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
    const next = parseDateKey(dateKey);
    next.setUTCDate(next.getUTCDate() + days);
    return formatDateKey(next);
}

function getWeekStartDateKey(date) {
    const currentKey = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toDateParts(date).dateKey;
    const current = parseDateKey(currentKey);
    const day = current.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    current.setUTCDate(current.getUTCDate() + diff);
    return formatDateKey(current);
}

function getDateKeysInRange(startDateKey, endDateKey) {
    const keys = [];
    let current = startDateKey;

    while (current <= endDateKey) {
        keys.push(current);
        current = addDays(current, 1);
    }

    return keys;
}

function defaultActivity(activity) {
    return {
        mouseClicks: Number(activity?.mouseClicks || 0),
        keyPresses: Number(activity?.keyPresses || 0),
        mouseMoves: Number(activity?.mouseMoves || 0),
    };
}

function defaultUserState(userId) {
    return {
        userId: normalizeUserId(userId),
        weeklyLimitHours: 60,
        manual_weekly_paid: 0,
        manual_weekly_pending: 0,
        manual_total_pending: 0,
        allTimeAutoCount: 0,
        lastLogDate: null,
        isOnline: false,
        isTracking: false,
        isIdle: false,
        trackingStartedAt: null,
        activeSince: null,
        idleSince: null,
        lastHeartbeatAt: null,
        lastActivityAt: null,
        platform: null,
        lastUpdated: null,
    };
}

function normalizeIsoTimestamp(value) {
    if (!value) {
        return null;
    }

    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function imageKeyForLog(userId, timestamp, id) {
    const { year, month, day } = toDateParts(timestamp);
    return buildKey('images', normalizeUserId(userId), year, month, day, `${id}.png`);
}

function logKeyForLog(userId, timestamp, id) {
    const { year, month, day } = toDateParts(timestamp);
    return buildKey('logs', normalizeUserId(userId), year, month, day, `${id}.json`);
}

function logIndexKey(id) {
    return buildKey('index', 'logs', `${id}.json`);
}

function userStateKey(userId) {
    return buildKey('state', 'users', `${normalizeUserId(userId)}.json`);
}

async function bodyToBuffer(body) {
    if (!body) {
        return Buffer.alloc(0);
    }

    if (Buffer.isBuffer(body)) {
        return body;
    }

    if (typeof body.transformToByteArray === 'function') {
        return Buffer.from(await body.transformToByteArray());
    }

    if (typeof body[Symbol.asyncIterator] === 'function') {
        const chunks = [];
        for await (const chunk of body) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    throw new Error('Unsupported S3 response body type.');
}

async function bodyToJson(body) {
    const text = (await bodyToBuffer(body)).toString('utf8');
    return JSON.parse(text);
}

function isMissingObjectError(error) {
    return error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404;
}

async function putObject(key, body, contentType) {
    const { bucket } = getS3Config();

    await getS3Client().send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
    }));
}

async function putJson(key, value) {
    await putObject(key, JSON.stringify(value, null, 2), 'application/json');
}

async function getObject(key) {
    const { bucket } = getS3Config();

    return getS3Client().send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
    }));
}

async function getJsonObject(key) {
    try {
        const response = await getObject(key);
        return await bodyToJson(response.Body);
    } catch (error) {
        if (isMissingObjectError(error)) {
            return null;
        }

        throw error;
    }
}

async function getBufferObject(key) {
    const response = await getObject(key);
    return {
        buffer: await bodyToBuffer(response.Body),
        contentType: response.ContentType || 'application/octet-stream',
    };
}

async function deleteKeys(keys) {
    const filteredKeys = keys.filter(Boolean);
    if (filteredKeys.length === 0) {
        return;
    }

    const { bucket } = getS3Config();

    if (filteredKeys.length === 1) {
        await getS3Client().send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: filteredKeys[0],
        }));
        return;
    }

    await getS3Client().send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
            Objects: filteredKeys.map((key) => ({ Key: key })),
            Quiet: true,
        },
    }));
}

async function listAllObjectKeys(prefix) {
    const { bucket } = getS3Config();
    const keys = [];
    let continuationToken;

    do {
        const response = await getS3Client().send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        }));

        for (const item of response.Contents || []) {
            if (item.Key) {
                keys.push(item.Key);
            }
        }

        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
}

function normalizeLogRecord(record) {
    const countsTowardTime = typeof record.countsTowardTime === 'boolean'
        ? record.countsTowardTime
        : (!record.type || record.type === 'auto');

    return {
        _id: String(record._id),
        userId: normalizeUserId(record.userId),
        timestamp: new Date(record.timestamp).toISOString(),
        activity: defaultActivity(record.activity),
        memo: record.memo || '',
        project: record.project || 'Internal Work',
        client: record.client || 'Time Tracker',
        type: record.type || 'auto',
        imageKey: record.imageKey,
        logKey: record.logKey,
        dateKey: record.dateKey || toDateParts(record.timestamp).dateKey,
        countsTowardTime,
    };
}

async function getUserState(userId) {
    const normalizedUserId = normalizeUserId(userId);
    const existing = await getJsonObject(userStateKey(normalizedUserId));
    return {
        ...defaultUserState(normalizedUserId),
        ...(existing || {}),
        userId: normalizedUserId,
    };
}

async function saveUserState(userId, updates) {
    const normalizedUserId = normalizeUserId(userId);
    const currentState = await getUserState(normalizedUserId);
    const nextState = {
        ...currentState,
        ...(updates || {}),
        userId: normalizedUserId,
        weeklyLimitHours: Number(updates?.weeklyLimitHours ?? currentState.weeklyLimitHours ?? 60),
        manual_weekly_paid: Number(updates?.manual_weekly_paid ?? currentState.manual_weekly_paid ?? 0),
        manual_weekly_pending: Number(updates?.manual_weekly_pending ?? currentState.manual_weekly_pending ?? 0),
        manual_total_pending: Number(updates?.manual_total_pending ?? currentState.manual_total_pending ?? 0),
        allTimeAutoCount: Number(updates?.allTimeAutoCount ?? currentState.allTimeAutoCount ?? 0),
        lastLogDate: updates?.lastLogDate ?? currentState.lastLogDate ?? null,
        isOnline: Boolean(updates?.isOnline ?? currentState.isOnline ?? false),
        isTracking: Boolean(updates?.isTracking ?? currentState.isTracking ?? false),
        isIdle: Boolean(updates?.isIdle ?? currentState.isIdle ?? false),
        trackingStartedAt: normalizeIsoTimestamp(Object.hasOwn(updates || {}, 'trackingStartedAt') ? updates.trackingStartedAt : currentState.trackingStartedAt),
        activeSince: normalizeIsoTimestamp(Object.hasOwn(updates || {}, 'activeSince') ? updates.activeSince : currentState.activeSince),
        idleSince: normalizeIsoTimestamp(Object.hasOwn(updates || {}, 'idleSince') ? updates.idleSince : currentState.idleSince),
        lastHeartbeatAt: normalizeIsoTimestamp(Object.hasOwn(updates || {}, 'lastHeartbeatAt') ? updates.lastHeartbeatAt : currentState.lastHeartbeatAt),
        lastActivityAt: normalizeIsoTimestamp(Object.hasOwn(updates || {}, 'lastActivityAt') ? updates.lastActivityAt : currentState.lastActivityAt),
        platform: updates?.platform ?? currentState.platform ?? null,
        lastUpdated: updates?.lastUpdated ? new Date(updates.lastUpdated).toISOString() : new Date().toISOString(),
    };

    await putJson(userStateKey(normalizedUserId), nextState);
    return nextState;
}

async function adjustAllTimeAutoCount(userId, delta) {
    const current = await getUserState(userId);
    const nextCount = Math.max(0, Number(current.allTimeAutoCount || 0) + Number(delta || 0));
    return saveUserState(userId, { allTimeAutoCount: nextCount });
}

async function saveLogEntry({
    id,
    userId,
    timestamp,
    imageBuffer,
    activity,
    memo,
    type,
    project,
    client,
    countsTowardTime,
    updateAllTimeCount = true,
}) {
    const normalizedUserId = normalizeUserId(userId);
    const logId = id || randomUUID();
    const normalizedTimestamp = new Date(timestamp || new Date());
    const logKey = logKeyForLog(normalizedUserId, normalizedTimestamp, logId);
    const imageKey = imageKeyForLog(normalizedUserId, normalizedTimestamp, logId);
    const dateKey = toDateParts(normalizedTimestamp).dateKey;

    const record = normalizeLogRecord({
        _id: logId,
        userId: normalizedUserId,
        timestamp: normalizedTimestamp,
        activity: defaultActivity(activity),
        memo: memo || '',
        project,
        client,
        type: type || 'auto',
        imageKey,
        logKey,
        dateKey,
        countsTowardTime,
    });

    try {
        await Promise.all([
            putObject(imageKey, imageBuffer, 'image/png'),
            putJson(logKey, record),
            putJson(logIndexKey(logId), record),
        ]);
    } catch (error) {
        await deleteKeys([imageKey, logKey, logIndexKey(logId)]);
        throw error;
    }

    if (updateAllTimeCount && record.countsTowardTime) {
        await adjustAllTimeAutoCount(normalizedUserId, 1);
    }

    const existingState = await getUserState(normalizedUserId);
    const shouldUpdateLatestDate = !existingState.lastLogDate || record.dateKey >= existingState.lastLogDate;
    if (shouldUpdateLatestDate) {
        await saveUserState(normalizedUserId, { lastLogDate: record.dateKey });
    }

    return record;
}

async function getLogById(id) {
    if (!id) {
        return null;
    }

    const record = await getJsonObject(logIndexKey(id));
    return record ? normalizeLogRecord(record) : null;
}

async function getImageById(id) {
    const record = await getLogById(id);
    if (!record?.imageKey) {
        return null;
    }

    return getBufferObject(record.imageKey);
}

async function deleteLogById(id) {
    const record = await getLogById(id);
    if (!record) {
        return null;
    }

    await deleteKeys([record.imageKey, record.logKey, logIndexKey(id)]);

    if (record.countsTowardTime) {
        await adjustAllTimeAutoCount(record.userId, -1);
    }

    return record;
}

function normalizeFlagRecord(record) {
    return {
        _id: String(record._id),
        userId: normalizeUserId(record.userId),
        targetType: record.targetType === 'time-block' ? 'time-block' : 'screenshot',
        logIds: Array.isArray(record.logIds) ? record.logIds.map(String) : [],
        reason: String(record.reason || '').trim(),
        memo: String(record.memo || ''),
        startTimestamp: normalizeIsoTimestamp(record.startTimestamp),
        endTimestamp: normalizeIsoTimestamp(record.endTimestamp),
        createdAt: normalizeIsoTimestamp(record.createdAt) || new Date().toISOString(),
        createdBy: 'admin',
        employeeResponse: String(record.employeeResponse || ''),
        respondedAt: normalizeIsoTimestamp(record.respondedAt),
        hidden: Boolean(record.hidden),
        hiddenAt: normalizeIsoTimestamp(record.hiddenAt),
        hiddenBy: record.hiddenBy || null,
    };
}

function flagKey(userId, id) {
    return buildKey('flags', normalizeUserId(userId), `${id}.json`);
}

function flagIndexKey(id) {
    return buildKey('index', 'flags', `${id}.json`);
}

async function createFlag(input) {
    const id = randomUUID();
    const record = normalizeFlagRecord({ ...input, _id: id, createdAt: new Date().toISOString() });
    if (!record.reason) throw new Error('Flag reason is required.');
    await Promise.all([putJson(flagKey(record.userId, id), record), putJson(flagIndexKey(id), record)]);
    return record;
}

async function getFlagById(id) {
    const record = id ? await getJsonObject(flagIndexKey(id)) : null;
    return record ? normalizeFlagRecord(record) : null;
}

async function listFlagsForUser(userId, options = {}) {
    const normalizedUserId = normalizeUserId(userId);
    const keys = await listAllObjectKeys(buildKey('flags', normalizedUserId));
    const records = (await Promise.all(keys.map(getJsonObject)))
        .filter(Boolean)
        .map(normalizeFlagRecord)
        .filter((flag) => options.includeHidden || !flag.hidden);
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function updateFlagById(id, updates) {
    const current = await getFlagById(id);
    if (!current) return null;
    const record = normalizeFlagRecord({ ...current, ...updates, _id: current._id, userId: current.userId });
    await Promise.all([putJson(flagKey(record.userId, id), record), putJson(flagIndexKey(id), record)]);
    return record;
}

async function deleteFlagById(id) {
    const record = await getFlagById(id);
    if (!record) return null;
    await deleteKeys([flagKey(record.userId, id), flagIndexKey(id)]);
    return record;
}

function buildDailyLogPrefix(userId, date) {
    const normalizedUserId = normalizeUserId(userId);
    const dateKey = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toDateParts(date).dateKey;
    const [year, month, day] = dateKey.split('-');
    return buildKey('logs', normalizedUserId, year, month, day);
}

async function listLogsForDate(userId, date) {
    const prefix = buildDailyLogPrefix(userId, date);
    const keys = await listAllObjectKeys(prefix);

    if (keys.length === 0) {
        return [];
    }

    const records = await Promise.all(keys.map((key) => getJsonObject(key)));

    return records
        .filter(Boolean)
        .map(normalizeLogRecord)
        .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

async function listLogsForDateRange(userId, startDate, endDate) {
    const startDateKey = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : toDateParts(startDate).dateKey;
    const endDateKey = typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : toDateParts(endDate).dateKey;
    const dateKeys = getDateKeysInRange(startDateKey, endDateKey);
    const entries = await Promise.all(dateKeys.map((dateKey) => listLogsForDate(userId, dateKey)));

    return entries.flat().sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

function countsTowardTrackedTime(record) {
    return normalizeLogRecord(record).countsTowardTime;
}

function countTrackedLogs(records) {
    return records.filter((record) => countsTowardTrackedTime(record)).length;
}

async function getAllTimeAutoCount(userId) {
    const normalizedUserId = normalizeUserId(userId);
    const state = await getUserState(normalizedUserId);

    if (Number.isFinite(Number(state.allTimeAutoCount)) && state.lastUpdated !== null) {
        return Number(state.allTimeAutoCount);
    }

    const allLogKeys = await listAllObjectKeys(buildKey('logs', normalizedUserId));
    if (allLogKeys.length === 0) {
        return 0;
    }

    const records = await Promise.all(allLogKeys.map((key) => getJsonObject(key)));
    const count = countTrackedLogs(records.filter(Boolean).map(normalizeLogRecord));

    await saveUserState(normalizedUserId, { allTimeAutoCount: count });
    return count;
}

async function getLatestLogDate(userId) {
    const normalizedUserId = normalizeUserId(userId);
    const state = await getUserState(normalizedUserId);

    if (state.lastLogDate) {
        return state.lastLogDate;
    }

    const allLogKeys = await listAllObjectKeys(buildKey('logs', normalizedUserId));
    if (allLogKeys.length === 0) {
        return null;
    }

    const dateKeys = allLogKeys
        .map((key) => {
            const match = key.match(/\/logs\/[^/]+\/(\d{4})\/(\d{2})\/(\d{2})\//);
            if (!match) return null;
            return `${match[1]}-${match[2]}-${match[3]}`;
        })
        .filter(Boolean)
        .sort();

    const latest = dateKeys[dateKeys.length - 1] || null;
    if (latest) {
        await saveUserState(normalizedUserId, { lastLogDate: latest });
    }

    return latest;
}

async function getTrackingStats(userId, currentDate = new Date()) {
    const normalizedUserId = normalizeUserId(userId);
    const currentDateKey = typeof currentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(currentDate) ? currentDate : toDateParts(currentDate).dateKey;
    const weekStartKey = getWeekStartDateKey(currentDateKey);

    const [todayLogs, weekLogs, state] = await Promise.all([
        listLogsForDate(normalizedUserId, currentDateKey),
        listLogsForDateRange(normalizedUserId, weekStartKey, currentDateKey),
        getUserState(normalizedUserId),
    ]);

    const todayAutoCount = countTrackedLogs(todayLogs);
    const weekAutoCount = countTrackedLogs(weekLogs);
    const allTimeAutoCount = await getAllTimeAutoCount(normalizedUserId);

    return {
        userId: normalizedUserId,
        currentDateKey,
        weekStartKey,
        todayAutoCount,
        weekAutoCount,
        allTimeAutoCount,
        todaySeconds: todayAutoCount * TRACKING_INTERVAL_SECONDS,
        weekSeconds: weekAutoCount * TRACKING_INTERVAL_SECONDS,
        allTimeSeconds: allTimeAutoCount * TRACKING_INTERVAL_SECONDS,
        manual: {
            weeklyPaid: Number(state.manual_weekly_paid || 0),
            weeklyPending: Number(state.manual_weekly_pending || 0),
            totalPending: Number(state.manual_total_pending || 0),
        },
        weeklyLimitHours: Number(state.weeklyLimitHours || 60),
    };
}

function getSecondsSince(timestamp, nowMs) {
    if (!timestamp) {
        return null;
    }

    const parsed = new Date(timestamp).getTime();
    if (Number.isNaN(parsed)) {
        return null;
    }

    return Math.max(0, Math.floor((nowMs - parsed) / 1000));
}

function buildPresenceSummaryFromState(state, now = new Date()) {
    const nowMs = new Date(now).getTime();
    const heartbeatAgeSeconds = getSecondsSince(state.lastHeartbeatAt, nowMs);
    const activityAgeSeconds = getSecondsSince(state.lastActivityAt, nowMs);
    const trackingDurationSeconds = state.trackingStartedAt ? getSecondsSince(state.trackingStartedAt, nowMs) : null;
    const activeDurationSeconds = state.activeSince ? getSecondsSince(state.activeSince, nowMs) : null;
    const idleDurationSeconds = state.idleSince ? getSecondsSince(state.idleSince, nowMs) : null;

    const recentlySeen = heartbeatAgeSeconds !== null && heartbeatAgeSeconds <= PRESENCE_STALE_SECONDS;
    const isOnline = Boolean(state.isOnline && recentlySeen);
    const isTracking = Boolean(isOnline && state.isTracking);
    const inferredIdle = Boolean(isTracking && activityAgeSeconds !== null && activityAgeSeconds >= IDLE_THRESHOLD_SECONDS);
    const isIdle = Boolean(isTracking && (state.isIdle || inferredIdle));

    let status = 'offline';
    let statusLabel = 'Offline';

    if (isOnline && !isTracking) {
        status = 'tracking-off';
        statusLabel = 'Tracker Off';
    } else if (isIdle) {
        status = 'idle';
        statusLabel = 'Idle';
    } else if (isTracking) {
        status = 'active';
        statusLabel = 'Active';
    }

    return {
        userId: state.userId,
        status,
        statusLabel,
        isOnline,
        isTracking,
        isIdle,
        platform: state.platform || null,
        trackingStartedAt: state.trackingStartedAt || null,
        activeSince: state.activeSince || null,
        idleSince: state.idleSince || null,
        lastHeartbeatAt: state.lastHeartbeatAt || null,
        lastActivityAt: state.lastActivityAt || null,
        heartbeatAgeSeconds,
        activityAgeSeconds,
        trackingDurationSeconds,
        activeDurationSeconds,
        idleDurationSeconds,
        idleThresholdSeconds: IDLE_THRESHOLD_SECONDS,
        timeZone: TRACKING_TIMEZONE,
        timeZoneLabel: TRACKING_TIME_LABEL,
    };
}

async function getPresenceSummary(userId, now = new Date()) {
    const state = await getUserState(userId);
    return buildPresenceSummaryFromState(state, now);
}

async function getPresenceSummaries(userIds, now = new Date()) {
    const normalizedIds = userIds.map(normalizeUserId).filter(Boolean);
    const states = await Promise.all(normalizedIds.map((userId) => getUserState(userId)));
    return states.map((state) => buildPresenceSummaryFromState(state, now));
}

module.exports = {
    IDLE_THRESHOLD_SECONDS,
    PRESENCE_STALE_SECONDS,
    TRACKING_INTERVAL_SECONDS,
    TRACKING_TIME_LABEL,
    TRACKING_TIMEZONE,
    addDays,
    buildDailyLogPrefix,
    countTrackedLogs,
    countsTowardTrackedTime,
    createFlag,
    deleteFlagById,
    deleteLogById,
    getAllTimeAutoCount,
    getDateKeysInRange,
    getImageById,
    getFlagById,
    getLatestLogDate,
    getLogById,
    getPresenceSummaries,
    getPresenceSummary,
    getTrackingStats,
    getUserState,
    getWeekStartDateKey,
    listLogsForDate,
    listLogsForDateRange,
    listFlagsForUser,
    normalizeUserId,
    saveLogEntry,
    saveUserState,
    toDateParts,
    updateFlagById,
};
