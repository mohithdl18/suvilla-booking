
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "suvilla_bookings";

if (!uri) {
    throw new Error("Please add MONGODB_URI to your environment variables.");
}

const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
};

const globalForMongo = globalThis;

let clientPromise;

if (globalForMongo._mongoClientPromise) {
    clientPromise = globalForMongo._mongoClientPromise;
} else {
    const client = new MongoClient(uri, options);
    clientPromise = client.connect();

    globalForMongo._mongoClientPromise = clientPromise;
}

export default clientPromise;

export async function getDatabase() {
    const connectedClient = await clientPromise;
    return connectedClient.db(dbName);
}
