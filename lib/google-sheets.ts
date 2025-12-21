
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SPREADSHEET_ID = '1UomDv8wyLqTLPRHgtwRlCET7e0kJZIjmYGvvuf8seuc';

export async function getSheetsClient() {
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

export async function updateWeeklyReport(rows: any[][]) {
    const sheets = await getSheetsClient();

    // Fetch spreadsheet metadata to get the actual sheet title
    const meta = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
    });

    const sheetTitle = meta.data.sheets?.[0]?.properties?.title;
    if (!sheetTitle) {
        throw new Error('No sheets found in the spreadsheet');
    }

    const rangePrefix = `'${sheetTitle}'`;

    // First, clear the range A1:E20 (just arbitrary large range or dynamic)
    await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${rangePrefix}!A1:Z100`, // Clear standard range
    });

    // Write new data
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${rangePrefix}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: rows,
        },
    });
}
