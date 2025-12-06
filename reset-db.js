const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://sourabhbhatt825_db_user:YkIRl7d8d8hzouyJ@time.kzzgpr1.mongodb.net/';
const client = new MongoClient(uri, { tls: true });

async function run() {
    try {
        await client.connect();
        const db = client.db("employee_monitor");
        const collection = db.collection("logs");

        const countBefore = await collection.countDocuments();
        console.log(`Documents before delete: ${countBefore}`);

        const result = await collection.deleteMany({});
        console.log(`Deleted ${result.deletedCount} documents`);

        const countAfter = await collection.countDocuments();
        console.log(`Documents after delete: ${countAfter}`);
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
