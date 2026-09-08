import { BoundedMap } from "./boundedMap.js";
import ChatSession from "../models/ChatSession.js";
import mongoose from "mongoose";

// Global in-memory sliding window cache fallback
export const memoryStore = new BoundedMap();

export async function saveMessage(sessionId, role, content) {
  if (!sessionId || !content) return;

  // Always update in-memory cache first for zero-latency retrieval
  if (!memoryStore.has(sessionId)) {
    memoryStore.set(sessionId, []);
  }
  const memHistory = memoryStore.get(sessionId);
  memHistory.push({ role, content });
  if (memHistory.length > 20) memHistory.shift();

  // Persist to MongoDB database if connected
  try {
    if (mongoose.connection.readyState === 1) {
      await ChatSession.findOneAndUpdate(
        { sessionId },
        {
          $push: {
            messages: {
              $each: [{ role, content }],
              $slice: -20, // Keep last 20 messages in database session
            },
          },
        },
        { upsert: true, returnDocument: 'after' }
      );
    }
  } catch (err) {
    console.warn("MongoDB save warning (saved to in-memory cache):", err.message);
  }

  return { sessionId, messages: memHistory };
}