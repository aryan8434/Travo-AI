import mongoose from "mongoose";

let connectionPromise;
export async function connectDB() {
    if (mongoose.connection.readyState === 1) return;
    try {
        if (!connectionPromise) connectionPromise = mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 8000,
            maxPoolSize: 5,
        });
        await connectionPromise;
    } catch (err) {
        if (process.env.NODE_ENV === 'production') throw new Error('Persistent account storage is unavailable');
        console.warn('MongoDB unavailable; account and payment endpoints are disabled.');
    } finally {
        connectionPromise = undefined;
    }
}
