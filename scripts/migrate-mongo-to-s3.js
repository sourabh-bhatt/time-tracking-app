/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const {
    saveLogEntry,
    saveUserState,
    normalizeUserId,
} = require('../lib/s3-storage');

dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: false });

const MIGRATION_CONCURRENCY = 25;

function normalizeImageBuffer(image) {
    if (!image) {
        return Buffer.alloc(0);
    }

    if (Buffer.isBuffer(image)) {
        return image;
    }

    if (typeof image === 'string') {
        const base64Data = image.split(';base64,').pop();
        return Buffer.from(base64Data || '', 'base64');
    }

    if (image.buffer) {
        return Buffer.from(image.buffer);
    }

    return Buffer.alloc(0);
}

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('Missing MONGODB_URI for migration.');
    }

    const client = new MongoClient(process.env.MONGODB_URI, {
        tls: true,
        serverSelectionTimeoutMS: 10000,
    });

    await client.connect();

    try {
        const db = client.db('employee_monitor');
        const collections = await db.listCollections().toArray();
        const logCollections = collections
            .map((collection) => collection.name)
            .filter((name) => name.startsWith('logs_'));

        const statsDocs = await db.collection('user_stats').find({}).toArray();
        const statsByUser = new Map(statsDocs.map((doc) => [normalizeUserId(doc.userId), doc]));

        console.log(`Found ${logCollections.length} log collections to migrate.`);

        for (const collectionName of logCollections) {
            const fallbackUserId = normalizeUserId(collectionName.replace(/^logs_/, ''));
            const cursor = db.collection(collectionName).find({});
            let migratedCount = 0;
            let autoCount = 0;
            let latestDateKey = null;
            let batch = [];

            const flushBatch = async () => {
                if (batch.length === 0) return;

                const currentBatch = batch;
                batch = [];

                await Promise.all(currentBatch.map(async (doc) => {
                    const userId = normalizeUserId(doc.userId || fallbackUserId);
                    const type = doc.type || 'auto';

                    await saveLogEntry({
                        id: doc._id.toString(),
                        userId,
                        timestamp: doc.timestamp || new Date(),
                        imageBuffer: normalizeImageBuffer(doc.image),
                        activity: doc.activity || {},
                        memo: doc.memo || '',
                        type,
                        project: doc.project || 'Internal Work',
                        client: doc.client || 'Time Tracker',
                        updateAllTimeCount: false,
                    });

                    if (type === 'auto') {
                        autoCount += 1;
                    }

                    const dateKey = new Date(doc.timestamp || new Date()).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                    if (!latestDateKey || dateKey > latestDateKey) {
                        latestDateKey = dateKey;
                    }

                    migratedCount += 1;
                }));

                if (migratedCount % 250 === 0) {
                    console.log(`${collectionName}: migrated ${migratedCount} records...`);
                }
            };

            for await (const doc of cursor) {
                batch.push(doc);

                if (batch.length >= MIGRATION_CONCURRENCY) {
                    await flushBatch();
                }
            }

            await flushBatch();

            const statsDoc = statsByUser.get(fallbackUserId);

            await saveUserState(fallbackUserId, {
                weeklyLimitHours: Number(statsDoc?.weeklyLimitHours || 60),
                manual_weekly_paid: Number(statsDoc?.manual_weekly_paid || 0),
                manual_weekly_pending: Number(statsDoc?.manual_weekly_pending || 0),
                manual_total_pending: Number(statsDoc?.manual_total_pending || 0),
                allTimeAutoCount: autoCount,
                lastLogDate: latestDateKey,
                lastUpdated: statsDoc?.lastUpdated ? new Date(statsDoc.lastUpdated).toISOString() : new Date().toISOString(),
            });

            console.log(`${collectionName}: migration complete (${migratedCount} total, ${autoCount} auto logs).`);
        }

        console.log('MongoDB to S3 migration completed.');
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
});
