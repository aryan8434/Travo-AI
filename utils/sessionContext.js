import { BoundedMap } from "./boundedMap.js";
import mongoose from "mongoose";
import ChatSession from "../models/ChatSession.js";

/**
 * Per-session conversation state ("slots").
 *
 * The LLM sees the last 8 messages, but it is not reliable enough to re-emit
 * every slot on every turn — a follow-up like "kolkata" after "book flight"
 * must not lose the fact that we are booking a flight. So we keep explicit
 * slots server-side and merge each new intent over them.
 *
 * Backed by MongoDB when connected, always mirrored in memory so the app works
 * with no database at all.
 */

const SLOT_KEYS = [
  "intent",
  "from",
  "to",
  "city",
  "minPrice",
  "maxPrice",
  "budget",
  "budgetMin",
  "budgetMax",
  "budgetTier",
  "people",
  "timePreference",
];

// sessionId -> { activeCity, ...slots }
const memory = new BoundedMap();

// Slots only carry over between turns of the same booking flow.
const CARRYOVER_INTENTS = new Set(["flight", "bus", "hotel_search", "trip_plan"]);

function dbReady() {
  return mongoose.connection.readyState === 1;
}

function blank() {
  return { activeCity: null, context: {} };
}

async function loadState(sessionId) {
  if (!sessionId) return blank();

  const cached = memory.get(sessionId);
  if (cached) return cached;

  if (dbReady()) {
    try {
      const doc = await ChatSession.findOne({ sessionId })
        .select("activeCity context")
        .lean();
      if (doc) {
        const state = { activeCity: doc.activeCity || null, context: doc.context || {} };
        memory.set(sessionId, state);
        return state;
      }
    } catch (err) {
      console.warn("loadState fallback:", err.message);
    }
  }

  const fresh = blank();
  memory.set(sessionId, fresh);
  return fresh;
}

async function persist(sessionId, state) {
  memory.set(sessionId, state);
  if (!dbReady()) return;
  try {
    await ChatSession.findOneAndUpdate(
      { sessionId },
      { $set: { activeCity: state.activeCity, context: state.context } },
      { upsert: true },
    );
  } catch (err) {
    console.warn("persist session state fallback:", err.message);
  }
}

/* ---------------- active city ---------------- */

export async function getSessionCity(sessionId) {
  const state = await loadState(sessionId);
  return state.activeCity || null;
}

export async function setSessionCity(sessionId, city) {
  if (!sessionId || !city) return null;
  const state = await loadState(sessionId);
  state.activeCity = city;
  await persist(sessionId, state);
  return city;
}

/* ---------------- booking slots ---------------- */

export async function getSlots(sessionId) {
  const state = await loadState(sessionId);
  return { ...state.context };
}

/**
 * Merge a freshly-extracted intent over the remembered slots.
 *
 * Rules:
 *  - A non-empty value in `intent` always wins.
 *  - Remembered slots only survive while the flow stays the same (or the model
 *    returned a vague "general" for what is clearly a follow-up).
 *  - Starting a *different* booking flow clears the old route/price slots.
 */
export function mergeIntent(previous = {}, intent = {}) {
  const incoming = intent || {};
  const prevIntent = previous.intent;
  const newIntent = incoming.intent;

  const sameFlow = prevIntent && (newIntent === prevIntent || newIntent === "general" || !newIntent);
  const base = sameFlow && CARRYOVER_INTENTS.has(prevIntent) ? previous : {};

  const merged = { ...base };
  for (const key of SLOT_KEYS) {
    const value = incoming[key];
    if (value !== undefined && value !== null && value !== "" && value !== "null") {
      merged[key] = value;
    }
  }

  // Keep the earlier flow when the model degraded to "general" mid-booking.
  if (sameFlow && (!newIntent || newIntent === "general")) merged.intent = prevIntent;

  // Preserve the package-flow flags (they are set server-side, not by the LLM).
  if (sameFlow) {
    if (previous.packageLocation !== undefined && merged.packageLocation === undefined) {
      merged.packageLocation = previous.packageLocation;
    }
    if (previous.awaitingPackageLocation && merged.awaitingPackageLocation === undefined) {
      merged.awaitingPackageLocation = previous.awaitingPackageLocation;
    }
  }

  const bare = incoming.cityCandidate;

  // We asked "which state/destination?" last turn — this reply IS the answer.
  if (previous.awaitingPackageLocation) {
    const named = incoming.city || incoming.to || bare || null;
    if (named) {
      merged.intent = "trip_plan";
      merged.city = named;
      merged.packageLocation = named;
    }
    return merged;
  }

  // A bare place-name reply ("kolkata") fills the next empty slot of the
  // active flow, so the user never has to repeat "flight from … to …".
  if (bare) {
    if (merged.intent === "flight" || merged.intent === "bus") {
      if (!merged.from) merged.from = bare;
      else if (!merged.to) merged.to = bare;
      else merged.to = bare; // treat a later city as a changed destination
    } else if (merged.intent === "hotel_search" || merged.intent === "trip_plan" || merged.intent === "weather") {
      merged.city = bare;
      if (merged.intent === "trip_plan") merged.packageLocation = bare;
    }
  }

  return merged;
}

export async function saveSlots(sessionId, slots) {
  if (!sessionId) return;
  const state = await loadState(sessionId);
  state.context = { ...slots };
  await persist(sessionId, state);
}

export async function clearSlots(sessionId) {
  if (!sessionId) return;
  const state = await loadState(sessionId);
  state.context = {};
  await persist(sessionId, state);
}
