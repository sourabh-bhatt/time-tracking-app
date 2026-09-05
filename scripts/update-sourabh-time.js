const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { google } = require('googleapis');

const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
}

const {
    getUserState,
    saveUserState,
    getTrackingStats,
    listLogsForDateRange,
    getWeekStartDateKey,
    addDays,
    parseDateKey
} = require('../lib/s3-storage');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SPREADSHEET_ID = '1UomDv8wyLqTLPRHgtwRlCET7e0kJZIjmYGvvuf8seuc';

async function getSheetsClient() {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        throw new Error('Missing Google Service Account credentials');
    }

    const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: SCOPES,
    });

    return google.sheets({ version: 'v4', auth });
}

async function updateWeeklyReport(rows) {
    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
    });

    const sheetTitle = meta.data.sheets?.[0]?.properties?.title;
    if (!sheetTitle) {
        throw new Error('No sheets found in the spreadsheet');
    }

    const rangePrefix = `'${sheetTitle}'`;

    await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${rangePrefix}!A1:Z100`,
    });

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${rangePrefix}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: rows,
        },
    });
}

async function run() {
    console.log('--- STARTING UPDATE ---');
    const user = 'sourabh';
    const state = await getUserState(user);
    console.log('Current manual_daily_seconds:', state.manual_daily_seconds);

    // Sep 01: 5h 55m = 21300s
    // Sep 02: 6h 40m = 24000s
    // Sep 03: 7h 30m = 27000s
    // Sep 04: 4h 00m = 14400s
    const targetDateKey = '2026-09-04';
    const newOverrides = {
        '2026-09-01': 21300,
        '2026-09-02': 24000,
        '2026-09-03': 27000,
        '2026-09-04': 14400,
    };

    const updatedDailySeconds = {
        ...state.manual_daily_seconds,
        ...newOverrides,
    };

    console.log('Saving new state for', user, '...');
    const nextState = await saveUserState(user, {
        manual_daily_seconds: updatedDailySeconds
    });
    console.log('Saved manual_daily_seconds:', nextState.manual_daily_seconds);

    const weekStartKey = getWeekStartDateKey(targetDateKey);
    const weekEndKey = addDays(weekStartKey, 6);
    const trackingStats = await getTrackingStats(user, weekEndKey);
    console.log('New tracking stats for week:', trackingStats);

    const hrs = Math.floor(trackingStats.weekSeconds / 3600);
    const mins = Math.floor((trackingStats.weekSeconds % 3600) / 60);
    console.log(`Week total: ${hrs}h ${mins}m (${trackingStats.weekSeconds}s)`);

    // Sync to Google Sheets
    try {
        console.log('Syncing to Google Sheets...');
        const logs = await listLogsForDateRange(user, weekStartKey, weekEndKey);
        const headers = ['Date', 'Day', 'Sourabh Hours', 'Sourabh Earnings ($)'];
        const rows = [headers];

        const trackedSecondsByDateKey = logs.reduce((acc, log) => {
            if (log.countsTowardTime) {
                acc[log.dateKey] = (acc[log.dateKey] || 0) + 600;
            }
            return acc;
        }, {});

        for (let i = 0; i < 7; i += 1) {
            const currentDateKey = addDays(weekStartKey, i);
            const currentDate = parseDateKey(currentDateKey);
            const dayName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(currentDate);
            const overrideSeconds = nextState.manual_daily_seconds?.[currentDateKey];
            const seconds = Number.isFinite(Number(overrideSeconds))
                ? Number(overrideSeconds)
                : Number(trackedSecondsByDateKey[currentDateKey] || 0);

            const hours = seconds / 3600;
            const rowData = [
                currentDateKey,
                dayName,
                parseFloat(hours.toFixed(2)),
                parseFloat((hours * 5).toFixed(2))
            ];
            rows.push(rowData);
        }

        const totalHoursVal = Math.floor(trackingStats.weekSeconds / 3600);
        const totalMinutesVal = Math.floor((trackingStats.weekSeconds % 3600) / 60);
        const totalsRow = [
            'Weekly Totals',
            '',
            `${totalHoursVal}h ${totalMinutesVal}m of 60h`,
            `$${((trackingStats.weekSeconds / 3600) * 5).toFixed(2)}`
        ];
        rows.push(totalsRow);

        console.log('Sheet rows to sync:');
        console.table(rows);

        await updateWeeklyReport(rows);
        console.log('Google Sheets synced successfully!');
    } catch (sheetErr) {
        console.error('Google Sheets sync error:', sheetErr);
    }
}

run().catch(console.error);
