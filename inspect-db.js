const { MongoClient } = require("mongodb");

const uri = "mongodb+srv://sourabhbhatt825_db_user:YkIRl7d8d8hzouyJ@time.kzzgpr1.mongodb.net/";
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        const db = client.db("employee_monitor");
        const collection = db.collection("logs");

        const log = await collection.findOne({}, { sort: { timestamp: -1 } });

        if (!log) {
            console.log("No logs found.");
        } else {
            console.log("Log found:", log._id);
            console.log("Image type:", typeof log.image);
            if (typeof log.image === 'string') {
                console.log("Image start:", log.image.substring(0, 50));
                console.log("Image length:", log.image.length);
            } else {
                console.log("Image is not a string:", log.image);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
