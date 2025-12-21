import fs from 'fs';
import path from 'path';
import { getSheetsClient } from './lib/google-sheets';

// Load .env.local manually
const envPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            // Remove quotes if present
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            process.env[key] = value;
        }
    });
}

const SPREADSHEET_ID = '1UomDv8wyLqTLPRHgtwRlCET7e0kJZIjmYGvvuf8seuc';

async function main() {
    try {
        console.log('Authenticating...');
        const sheets = await getSheetsClient();
        console.log('Fetching spreadsheet metadata...');
        const meta = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID
        });

        console.log('Spreadsheet Title:', meta.data.properties?.title);
        console.log('Sheets found:');
        meta.data.sheets?.forEach(s => {
            console.log(` - "${s.properties?.title}" (ID: ${s.properties?.sheetId})`);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
