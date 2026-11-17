/* eslint-disable @typescript-eslint/no-require-imports */
// Test the configured employee's image prefix without creating logs or time.
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.desktop'), quiet: true });

async function verify() {
    const user = String(process.env.USER_ID || '').trim().toLowerCase();
    if (!['sourabh', 'prayash'].includes(user)) throw new Error('Set USER_ID to the employee being tested.');
    if (!process.env.AWS_REGION || !process.env.AWS_S3_BUCKET) throw new Error('Missing storage configuration.');
    const client = new S3Client({ region: process.env.AWS_REGION });
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1kAAAAASUVORK5CYII=', 'base64');
    const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const prefix = (process.env.AWS_S3_PREFIX || 'time-tracker').replace(/^\/+|\/+$/g, '');
    const params = { Bucket: process.env.AWS_S3_BUCKET, Key: `${prefix}/images/${user}/${datePath}/verification-${randomUUID()}.png` };
    let attemptedUpload = false;
    try {
        attemptedUpload = true;
        await client.send(new PutObjectCommand({ ...params, Body: image, ContentType: 'image/png' }));
        const stored = await client.send(new GetObjectCommand(params));
        assert.deepEqual(Buffer.from(await stored.Body.transformToByteArray()), image);
        console.log('S3 image upload and read verified. No tracking log or time entry created.');
    } finally {
        try {
            if (attemptedUpload) {
                await client.send(new DeleteObjectCommand(params));
                console.log('Removed the temporary verification image.');
            }
        } catch (error) {
            console.error(`Temporary verification image cleanup failed (${error.name}); key: ${params.Key}`);
            process.exitCode = 1;
        }
        client.destroy();
    }
}

verify().catch((error) => {
    console.error(`Storage verification failed: ${error.name} (HTTP ${error.$metadata?.httpStatusCode || 'unavailable'}).`);
    process.exitCode = 1;
});
