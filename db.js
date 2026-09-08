import mongoose from "mongoose";

export async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 3000
        });
        console.log("✅ MongoDB connected successfully");
    } catch (err) {
        if (process.env.NODE_ENV === 'production') throw new Error('Persistent account storage is unavailable');
        console.warn('MongoDB unavailable; account and payment endpoints are disabled.');
    }
}
