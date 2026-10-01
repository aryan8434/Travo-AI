import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { askLLM } from "./llm.js";
import { answerPackageQuestion } from "./utils/packageAnswer.js";
import { parseTravelPreferences } from "./utils/travelPreferences.js";
import { connectDB } from "./db.js";
import { saveMessage } from "./utils/saveChat.js";
import { getChatHistory } from "./utils/getChatHistory.js";
import {
  getSessionCity,
  setSessionCity,
  getSlots,
  saveSlots,
  mergeIntent,
  namedServiceIntent,
} from "./utils/sessionContext.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import auth from "./utils/auth.js";
import adminAuth from "./utils/adminAuth.js";
import UserChat from "./models/UserChat.js";
import path from "path";
import { searchHotels } from "./utils/hotelSearch.js";
import { buildBuses } from "./utils/busEngine.js";
import { fetchWeather } from "./providers/weatherProvider.js";
import {
  retrievePackages,
  loadAllPackages,
  syncVectraIndex,
  startPackageWatcher,
  budgetTier,
  resolvePackageLocation,
  packageLocationOptions,
} from "./utils/ragEngine.js";
import {
  searchChunks,
  listChunks,
  getChunkById,
  ragStats,
  chunkFacets,
} from "./utils/ragChunks.js";
import {
  buildFlights,
  listAirports,
  listAirportCities,
  resolveAirport,
  nearestAirportFor,
  findAirportsInText,
} from "./utils/flightEngine.js";
import { fileURLToPath } from "url";
import { createPaymentRouter, requireDatabase } from "./routes/payments.js";
import { attachQuote } from "./utils/checkout.js";
import { chatIdentity } from "./utils/chatIdentity.js";
import crypto from "crypto";
import mongoose from 'mongoose';
import { assertProductionConfig } from './utils/productionConfig.js';
import { READ_ONLY_INDEX } from './utils/embeddings.js';
import { MongoRateLimitStore } from './utils/mongoRateLimitStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   BOOT-TIME CONFIG GUARDS
========================================================= */
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error(
    "❌ JWT_SECRET is missing or too short (min 32 chars). Auth endpoints will fail. Set it in .env",
  );
}

/* =========================================================
   APP + MIDDLEWARE
========================================================= */
const app = express();
app.set("trust proxy", process.env.VERCEL === '1' ? 1 : process.env.TRUST_PROXY || false);
app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://checkout.razorpay.com', 'https://cdn.razorpay.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", 'https://*.razorpay.com', 'https://nominatim.openstreetmap.org', 'https://api.open-meteo.com', 'https://ipapi.co'],
    frameSrc: ['https://*.razorpay.com'], objectSrc: ["'none'"], upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
  } } }));
app.use(compression());

const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const defaultDevOrigins = [
  "http://localhost:3000",
  "http://localhost:5000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5000",
];
const allowedOrigins = corsOrigins.length ? corsOrigins : defaultDevOrigins;
if (process.env.VERCEL === '1' && process.env.VERCEL_URL) allowedOrigins.push(`https://${process.env.VERCEL_URL}`);

app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin / curl / server-to-server (no Origin header)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-key"],
  }),
);

const paymentsRouter = createPaymentRouter();
app.use('/api', (req, res, next) => {
  if (['/payments/webhook', '/payments/config'].includes(req.path)) return paymentsRouter(req, res, next);
  next();
});
app.use(express.json({ limit: "1mb" }));
app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
});

/* Rate limiters */
const authLimiter = rateLimit({
  ...(process.env.VERCEL === '1' ? { store: new MongoRateLimitStore('auth') } : {}),
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes." },
});
const chatLimiter = rateLimit({
  ...(process.env.VERCEL === '1' ? { store: new MongoRateLimitStore('chat') } : {}),
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    intent: "error",
    error: true,
    text: "⏳ **Too many requests** in a short time. Please wait a minute and try again.",
  },
});
const paymentLimiter = rateLimit({ ...(process.env.VERCEL === '1' ? { store: new MongoRateLimitStore('payment') } : {}), windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

app.use("/auth", authLimiter, requireDatabase, authRoutes);
app.use("/user", paymentLimiter, userRoutes);
app.use(["/api/create-order", "/api/verify-payment"], paymentLimiter);
app.use("/api", (req, res, next) => {
  if (["/create-order", "/verify-payment"].includes(req.path)) return paymentsRouter(req, res, next);
  next();
});

/* =========================================================
   TIME-OF-DAY FILTER
========================================================= */
const TIME_SLOTS = {
  morning: { start: 6, end: 12 },
  afternoon: { start: 12, end: 18 },
  evening: { start: 18, end: 21 },
  night: { start: 21, end: 6 },
};

function isInTimeSlot(timeStr, pref) {
  if (!pref || pref === "null") return true;
  const hour = Number(timeStr.split(":")[0]);
  const slot = TIME_SLOTS[pref];
  if (!slot) return true;
  return pref === "night" ? hour >= slot.start || hour < slot.end : hour >= slot.start && hour < slot.end;
}

/* =========================================================
   CITY / LOCATION PARSING
========================================================= */
function normalizeCityName(rawCity) {
  if (!rawCity || typeof rawCity !== "string") return null;
  const cleaned = rawCity.replace(/[^a-zA-Z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned
    .split(" ")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function extractCityFromPrompt(message) {
  if (!message || typeof message !== "string") return null;
  const pattern =
    /(?:my\s+city\s+is|i\s+am\s+in|i'm\s+in|im\s+in|set\s+(?:my\s+)?city\s*(?:to)?|change\s+(?:my\s+)?city\s*(?:to)?|update\s+(?:my\s+)?city\s*(?:to)?|my\s+location\s+is|location\s+is)\s+([a-zA-Z\s]{2,40})/i;
  const match = message.match(pattern);
  return match?.[1] ? normalizeCityName(match[1]) : null;
}

function isLocationQuery(message) {
  if (!message || typeof message !== "string") return false;
  return /(?:what(?:'s|\s+is)\s+(?:my\s+)?(?:city|location)|my\s+(?:city|location|loction)|where\s+am\s+i)/i.test(message);
}

/* =========================================================
   CHAT ENDPOINT
========================================================= */
app.post("/chat", chatLimiter, chatIdentity, async (req, res) => {
  try {
    const { message, policeCalled = false, userCity } = req.body;

    const sessionId = req.chatSessionId;
    if (!sessionId) {
      return res.status(400).json({ error: true, text: "Session ID is required" });
    }
    if (typeof message !== "string" || !message.trim() || message.length > 2000) {
      return res.status(400).json({ error: true, text: "Message must be 1-2000 characters" });
    }

    const incomingCity = normalizeCityName(userCity);
    const sessionCity = await getSessionCity(sessionId);
    let activeCity = incomingCity || sessionCity || null;

    if (incomingCity && incomingCity !== sessionCity) {
      activeCity = await setSessionCity(sessionId, incomingCity);
    }

    const cityFromPrompt = extractCityFromPrompt(message);
    if (cityFromPrompt) activeCity = await setSessionCity(sessionId, cityFromPrompt);

    if (isLocationQuery(message)) {
      const locationText = activeCity
        ? `📍 Your current city is ${activeCity}.`
        : "📍 I can’t detect your location yet. Please tell me your city name (example: My city is Jaipur).";
      await saveMessage(sessionId, "llm", locationText);
      return res.json({ intent: "general", text: locationText, activeCity });
    }

    // Read the last 8 turns BEFORE storing the current one, so the model gets
    // the conversation so far plus this message exactly once.
    const history = await getChatHistory(sessionId, 8);
    await saveMessage(sessionId, "user", message);

    const rawIntent = await askLLM(message, policeCalled, history, activeCity);

    // Merge over the slots we remember, so follow-ups like "kolkata" or "5000"
    // keep the flow (and the route) from the previous turn.
    const previousSlots = await getSlots(sessionId);
    const intent = mergeIntent(previousSlots, namedServiceIntent(message, rawIntent, previousSlots));
    await saveSlots(sessionId, intent);

    const intentCity = normalizeCityName(intent?.city);
    if (intentCity && intentCity !== activeCity) {
      activeCity = await setSessionCity(sessionId, intentCity);
    }

    const sendResponse = async (payload) => {
      if (Array.isArray(payload.results)) payload.results = payload.results.map(item => attachQuote(item, payload.type));
      if (payload?.text) await saveMessage(sessionId, "llm", payload.text);
      return res.json(payload);
    };

    // The reply belongs to this turn only; mergeIntent keeps booking slots, not text.
    const responseText =
      rawIntent?.message ||
      "Welcome to TravoAI. I can book hotels, buses, flights or find personalized travel packages.";

    const lower = message.toLowerCase();
    const wantsPackage =
      intent.intent === "trip_plan" ||
      intent.intent === "package_search" ||
      ["package", "trip", "vacation", "tour", "holiday", "itinerary"].some((k) => lower.includes(k));

    if (wantsPackage) {
      const loc = resolvePackageLocation(message) || resolvePackageLocation(intent.city) || resolvePackageLocation(intent.to) || resolvePackageLocation(previousSlots.packageLocation);
      const explicit = parseTravelPreferences(message);
      const filters = {
        budgetMin: explicit.budgetMin ?? intent.budgetMin ?? null,
        budgetMax: explicit.budgetMax ?? intent.budgetMax ?? intent.maxPrice ?? intent.budget ?? null,
        budgetTier: explicit.budgetTier || (previousSlots.intent === 'trip_plan' ? previousSlots.budgetTier : null),
        people: explicit.people ?? (previousSlots.intent === 'trip_plan' ? previousSlots.people : null),
        city: loc?.value || null,
      };
      await saveSlots(sessionId, { ...intent, ...filters, intent: 'trip_plan', packageLocation: loc?.value, awaitingPackageLocation: false });
      const rag = await retrievePackages(message, filters, 8);
      const question = /\?|what|which|include|meal|cancellation|how|tell me|best time/i.test(message);
      const response = question && rag.matches.length ? await answerPackageQuestion(message, filters) : null;
      return sendResponse({
        intent: 'trip_plan', type: 'package',
        text: response?.answer || (rag.matches.length
          ? 'Holiday packages' + (loc ? ' in **' + loc.value + '**' : '') + (filters.budgetMax ? ' within **₹' + Number(filters.budgetMax).toLocaleString('en-IN') + '**' : '') + '. Prices cover the stated number of guests; check inclusions for transport.'
          : 'No packages match this destination, tier and budget. Try changing one of these filters.'),
        results: rag.matches.map(({ detailed_guide, full_guide, ...p }) => p),
        sources: response?.sources || [], vectorDbUsed: rag.vectorDbUsed, activeCity,
      });
    }

    /* ---------- HOTEL SEARCH (package catalogue via RAG) ---------- */
    if (intent.intent === "hotel_search") {
      const cityToSearch = intentCity || intent.city || activeCity;
      if (!cityToSearch && !resolvePackageLocation(message)) {
        return sendResponse({ intent: "hotel_search", type: "hotel", text: "🏨 Which city or destination should I find stays in?", results: [], activeCity });
      }
      const search = await searchHotels(message, { city: cityToSearch, budget: intent.budget ?? intent.maxPrice ?? intent.budgetMax });
      return sendResponse({
        intent: "hotel_search",
        type: "hotel",
        text: search.text,
        results: search.hotels,
        sources: search.sources,
        activeCity: search.location || cityToSearch || activeCity,
      });
    }

    /* ---------- BUS SEARCH (distance-based estimates) ---------- */
    if (intent.intent === "bus") {
      const fromCity = intent.from || activeCity;
      const toCity = intent.to;
      if (!toCity || !fromCity) {
        return sendResponse({
          intent: "bus",
          type: "bus",
          text: !toCity
            ? `🚌 Where are you travelling to${fromCity ? ` from ${fromCity}` : ""}? (e.g. "Buses to Jaipur")`
            : `🚌 Which city are you leaving from for ${toCity}?`,
          results: [],
          activeCity,
        });
      }
      const route = buildBuses(fromCity, toCity);
      if (!route.ok) return sendResponse({ intent: "bus", type: "bus", text: `🚌 ${route.error}`, results: [], activeCity });

      const minPrice = intent.minPrice || 0;
      const maxPrice = intent.maxPrice || Infinity;
      const buses = route.buses.filter((b) => b.price >= minPrice && b.price <= maxPrice && isInTimeSlot(b.time, intent.timePreference));
      const fares = route.buses.map((b) => b.price);
      const summary = `${route.from} → ${route.to} is about **${route.roadKm} km** by road (~${route.duration}).`;
      if (buses.length === 0) {
        return sendResponse({
          intent: "bus",
          type: "bus",
          text: `😕 ${summary} No estimated fare fits that filter; fares on this route run ₹${Math.min(...fares)}–₹${Math.max(...fares)}.`,
          results: [],
          activeCity,
        });
      }
      return sendResponse({
        intent: "bus",
        type: "bus",
        text: `🚌 ${summary} Estimated fares by coach type below. Live bus booking isn't connected yet, so these can't be booked.`,
        results: buses,
        activeCity,
      });
    }

    /* ---------- FLIGHT SEARCH (distance-based pricing) ---------- */
    if (intent.intent === "flight") {
      // Cities named in THIS message always win over a remembered/echoed slot,
      // so a stale detected city can never trap the conversation in a loop.
      const spoken = findAirportsInText(message);

      let originHint = intent.from || activeCity || null;
      let toCity = intent.to;

      if (spoken.length >= 2) {
        originHint = spoken[0].city;
        toCity = spoken[1].city;
      } else if (spoken.length === 1) {
        const said = spoken[0];
        const knownOrigin = resolveAirport(intent.from || "");

        if (!knownOrigin) {
          // Origin was missing/unusable — the city they just named is the origin.
          originHint = said.city;
          if (resolveAirport(toCity || "")?.iata === said.iata) toCity = null;
        } else if (knownOrigin.iata !== said.iata) {
          // A different city named alongside a known origin is the destination.
          toCity = said.city;
        }
        // Same city as the origin: nothing new to assign — fall through and ask.
      }

      // Resolve the origin first — a detected city with no airport (e.g. Kota)
      // must ask for a departure city, not blame the destination.
      const originAirport = originHint ? resolveAirport(originHint) : null;

      if (!originAirport) {
        const nearby = originHint ? nearestAirportFor(originHint) : null;
        const askOrigin = nearby
          ? `✈️ ${originHint} doesn't have its own airport — the nearest one is **${nearby.city} (${nearby.iata})**. Which city are you flying **from**? (reply "${nearby.city}" to use it)`
          : originHint
            ? `✈️ I couldn't find an airport for **${originHint}**. Which city are you flying **from**? I cover ${listAirportCities().length} Indian airport cities — e.g. ${listAirportCities().slice(0, 8).join(", ")}…`
            : `✈️ Which city are you flying **from**?`;

        // Drop the unusable origin so the next reply is treated as the origin.
        await saveSlots(sessionId, { ...intent, from: null });

        return sendResponse({
          intent: "flight",
          type: "flight",
          text: askOrigin,
          results: [],
          activeCity,
        });
      }

      if (!toCity) {
        const examples = ["Delhi", "Mumbai", "Bengaluru", "Chennai", "Goa"]
          .filter((c) => c.toLowerCase() !== originAirport.city.toLowerCase())
          .slice(0, 3)
          .join(", ");
        return sendResponse({
          intent: "flight",
          type: "flight",
          text: `✈️ Where would you like to fly **to** from ${originAirport.city} (${originAirport.iata})? (e.g. ${examples})`,
          results: [],
          activeCity,
        });
      }

      const destAirport = resolveAirport(toCity);

      if (destAirport && destAirport.iata === originAirport.iata) {
        await saveSlots(sessionId, { ...intent, to: null });
        return sendResponse({
          intent: "flight",
          type: "flight",
          text: `✈️ Departure and destination are both ${originAirport.city} — where would you like to fly **to**?`,
          results: [],
          activeCity,
        });
      }

      if (!destAirport) {
        const nearbyDest = nearestAirportFor(toCity);
        const askDest = nearbyDest
          ? `✈️ ${toCity} doesn't have its own airport — the nearest one is **${nearbyDest.city} (${nearbyDest.iata})**. Shall I search flights to ${nearbyDest.city}?`
          : `✈️ I couldn't find an airport for **${toCity}**. Where would you like to fly to? I cover ${listAirportCities().length} Indian airport cities — e.g. ${listAirportCities().slice(0, 12).join(", ")}…`;

        await saveSlots(sessionId, { ...intent, to: null });

        return sendResponse({
          intent: "flight",
          type: "flight",
          text: askDest,
          results: [],
          activeCity,
        });
      }

      const result = buildFlights(originAirport.city, destAirport.city, 60);
      if (!result.ok) {
        return sendResponse({
          intent: "flight",
          type: "flight",
          text: `✈️ ${result.error} Please give me a different departure or destination city.`,
          results: [],
          activeCity,
        });
      }

      if (!intent.minPrice && !intent.maxPrice) {
        return sendResponse({
          intent: "flight",
          type: "flight",
          text: `✈️ ${result.from.city} (${result.from.iata}) → ${result.to.city} (${result.to.iata}) is about **${result.distanceKm} km**. Fares are calculated at ₹2.0–₹2.5 per km. What's your budget? (e.g. 5000 to 12000)`,
          results: [],
          activeCity,
        });
      }

      const minPrice = intent.minPrice || 0;
      const maxPrice = intent.maxPrice || Number.MAX_SAFE_INTEGER;
      const flights = result.flights
        .filter((f) => f.price >= minPrice && f.price <= maxPrice && isInTimeSlot(f.time, intent.timePreference))
        .sort((a, b) => a.price - b.price)
        .slice(0, 20);

      if (flights.length === 0) {
        // Say WHY nothing matched — cheapest/dearest actually on the route.
        const fares = result.flights.map((f) => f.price);
        const cheapest = Math.min(...fares);
        const dearest = Math.max(...fares);
        const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;

        const why =
          cheapest > maxPrice
            ? `The cheapest fare on this ${result.distanceKm} km route is ${rupees(cheapest)} — a little above your ${rupees(maxPrice)} ceiling.`
            : dearest < minPrice
              ? `Good news — every fare on this ${result.distanceKm} km route is **below** your ₹${minPrice.toLocaleString("en-IN")} minimum, from ${rupees(cheapest)} to ${rupees(dearest)}. Want me to show those?`
              : `Fares on this ${result.distanceKm} km route run ${rupees(cheapest)}–${rupees(dearest)}.`;

        return sendResponse({
          intent: "flight",
          type: "flight",
          text: `😕 Nothing between ₹${minPrice.toLocaleString("en-IN")} and ₹${maxPrice.toLocaleString("en-IN")} for ${result.from.city} → ${result.to.city}. ${why}`,
          results: [],
          activeCity,
        });
      }

      return sendResponse({
        intent: "flight",
        type: "flight",
        text: `✈️ ${result.from.city} → ${result.to.city} · ${result.distanceKm} km · fares ₹2.0–₹2.5/km (₹${minPrice} - ₹${maxPrice}):`,
        results: flights,
        activeCity,
      });
    }

    /* ---------- WEATHER ---------- */
    if (intent.intent === "weather") {
      const cityToSearch = intentCity || intent.city || activeCity || "Delhi";
      const weatherData = await fetchWeather(cityToSearch);
      if (!weatherData) {
        return sendResponse({
          intent: "weather",
          type: "weather",
          text: `😕 Sorry, I couldn't find weather data for ${cityToSearch}.`,
          results: null,
          activeCity: cityToSearch,
        });
      }
      return sendResponse({
        intent: "weather",
        type: "weather",
        text: `🌡️ Currently, the weather in **${weatherData.city}** is **${weatherData.temp_c}°C** (${weatherData.condition}).`,
        results: weatherData,
        activeCity: weatherData.city || activeCity,
      });
    }

    /* ---------- DEFAULT ---------- */
    return sendResponse({ intent: intent.intent, text: responseText, activeCity });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(503).json({
      intent: "error",
      error: true,
      text: "⚠️ **Something went wrong on our side.** Please try again in a moment.",
    });
  }
});

/* =========================================================
   PACKAGE / RAG QUERY ENDPOINTS
========================================================= */
app.get("/api/packages", chatLimiter, async (req, res) => {
  try {
    const { query = "", budget, budgetMin, budgetMax, city, people, category, tier } = req.query;
    if ([query, city, category, tier].some(v => v != null && (typeof v !== 'string' || v.length > 2000))) return res.status(400).json({ error: 'Invalid text filter' });
    if ([budget, budgetMin, budgetMax, people].some(v => v != null && (!Number.isFinite(Number(v)) || Number(v) < 0))) return res.status(400).json({ error: 'Invalid numeric filter' });
    if (tier && tier !== 'ALL' && !['economical', 'premium', 'luxury'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' });
    if (budgetMin && budgetMax && Number(budgetMin) > Number(budgetMax)) return res.status(400).json({ error: 'Minimum budget exceeds maximum budget' });
    const page = Math.max(1, Math.min(100, Math.floor(Number(req.query.page) || 1)));
    const pageSize = 24;
    const ragData = await retrievePackages(
      query,
      {
        budget: budget ? Number(budget) : null,
        budgetMin: budgetMin ? Number(budgetMin) : null,
        budgetMax: budgetMax ? Number(budgetMax) : null,
        budgetTier: tier && tier !== "ALL" ? String(tier).toLowerCase() : null,
        city,
        people: people ? Number(people) : null,
        category,
      },
      page * pageSize,
    );
    res.json({ success: true, packages: ragData.matches.slice((page - 1) * pageSize).map(({ detailed_guide, full_guide, ...pkg }) => pkg), total: ragData.total, page, hasMore: page * pageSize < ragData.total, vectorDbUsed: ragData.vectorDbUsed });
  } catch (err) {
    res.status(500).json({ error: true, message: "The request could not be completed" });
  }
});

app.get('/api/packages/:id', chatLimiter, (req, res) => {
  const pkg = loadAllPackages().find(p => p.package_id === req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });
  res.json({ success: true, package: pkg });
});
app.post('/api/packages/ask', chatLimiter, async (req, res) => {
  const { query, package_id, budgetMax, tier } = req.body || {};
  if (typeof query !== 'string' || !query.trim() || query.length > 2000 || (package_id != null && typeof package_id !== 'string') || (budgetMax != null && (!Number.isFinite(budgetMax) || budgetMax < 0)) || (tier != null && !['economical', 'premium', 'luxury'].includes(tier))) return res.status(400).json({ error: 'Invalid package question or filters' });
  const filters = { packageId: package_id };
  if (budgetMax != null) filters.budgetMax = budgetMax;
  if (tier) filters.budgetTier = tier;
  res.json({ success: true, ...(await answerPackageQuestion(query, filters)) });
});

app.get('/api/flights', chatLimiter, (req, res) => {
  if (typeof req.query.from !== 'string' || typeof req.query.to !== 'string' || req.query.from.length > 80 || req.query.to.length > 80) return res.status(400).json({ error: 'Origin and destination are required' });
  const result = buildFlights(req.query.from, req.query.to, 6);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ...result, flights: result.flights.map(f => attachQuote(f, 'flight')) });
});
app.get('/api/buses', chatLimiter, (req, res) => {
  if (typeof req.query.from !== 'string' || typeof req.query.to !== 'string' || req.query.from.length > 80 || req.query.to.length > 80) return res.status(400).json({ error: 'Origin and destination are required' });
  const route = buildBuses(req.query.from, req.query.to);
  if (!route.ok) return res.status(400).json({ error: route.error });
  res.json({ ...route, buses: route.buses.map(b => attachQuote(b, 'bus')) });
});
app.get('/api/hotels', chatLimiter, async (req, res) => {
  const { city = '', query = '', budget } = req.query;
  if (typeof city !== 'string' || typeof query !== 'string' || city.length > 120 || query.length > 500 || !(city.trim() || query.trim())) return res.status(400).json({ error: 'A city or search query is required' });
  if (budget != null && (!Number.isFinite(Number(budget)) || Number(budget) <= 0)) return res.status(400).json({ error: 'Invalid nightly budget' });
  try {
    const result = await searchHotels(query, { city: city || null, budget: budget != null ? Number(budget) : null, limit: 8 });
    res.json({ success: true, ...result, hotels: result.hotels.map(h => attachQuote(h, 'hotel')) });
  } catch {
    res.status(500).json({ error: 'The request could not be completed' });
  }
});
app.get('/api/weather', chatLimiter, async (req, res) => {
  if (typeof req.query.city !== 'string' || req.query.city.length > 120) return res.status(400).json({ error: 'City is required' });
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ weather: await fetchWeather(req.query.city) });
});
app.get("/api/airports", (req, res) => {
  res.json({ success: true, count: listAirports().length, airports: listAirports() });
});

/* =========================================================
   RAG EXPLORER API — inspect the retrieval layer itself
========================================================= */

// Index-wide statistics (documents, chunks, embedding model, chunking config)
app.get("/api/rag/stats", async (req, res) => {
  try {
    res.json({ success: true, ...(await ragStats()) });
  } catch (err) {
    res.status(500).json({ error: true, message: "The request could not be completed" });
  }
});

// Distinct facet values for filter dropdowns
app.get("/api/rag/facets", async (req, res) => {
  try {
    res.json({ success: true, ...(await chunkFacets()) });
  } catch (err) {
    res.status(500).json({ error: true, message: "The request could not be completed" });
  }
});

// Browse / keyword-filter the chunk store (no vector query)
app.get("/api/rag/chunks", async (req, res) => {
  try {
    const { page, limit, q, package_id, kind, section } = req.query;
    const data = await listChunks({
      page: Math.max(1, Math.floor(Number(page) || 1)),
      limit: Math.max(1, Math.min(100, Math.floor(Number(limit) || 25))),
      q: q || "",
      packageId: package_id || null,
      kind: kind || null,
      section: section || null,
    });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ error: true, message: "The request could not be completed" });
  }
});

// One chunk + its nearest neighbours in embedding space
app.get("/api/rag/chunk", async (req, res) => {
  try {
    const id = String(req.query.id || "");
    if (!id) return res.status(400).json({ error: true, message: "id is required" });
    const data = await getChunkById(id, {
      neighbours: Math.min(10, Number(req.query.neighbours) || 5),
    });
    if (!data) return res.status(404).json({ error: true, message: "Chunk not found" });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ error: true, message: "The request could not be completed" });
  }
});

// Semantic + BM25 hybrid search over chunks — the core RAG demo
app.post("/api/rag/search", chatLimiter, async (req, res) => {
  try {
    const { query, topK, package_id, kind, section, minScore, hybrid } = req.body || {};
    if (typeof query !== "string" || !query.trim() || query.length > 2000) {
      return res.status(400).json({ error: true, message: "query is required" });
    }
    const data = await searchChunks(query.trim(), {
      topK: Math.max(1, Math.min(25, Math.floor(Number(topK) || 10))),
      packageId: package_id || null,
      kind: kind || null,
      section: section || null,
      minScore: Number(minScore) || 0,
      hybrid: hybrid !== false,
    });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error("RAG search error:", err);
    res.status(500).json({ error: true, message: "The request could not be completed" });
  }
});

/* =========================================================
   ADMIN — RAG ENGINE CONTROL (protected)
========================================================= */
app.post("/api/admin/reindex", authLimiter, adminAuth, async (req, res) => {
  if (READ_ONLY_INDEX) return res.status(409).json({ error: 'This catalogue is rebuilt during deployment. Update the guides and redeploy to refresh it.' });
  try {
    await syncVectraIndex({ force: req.query.force === "1" });
    const pkgs = loadAllPackages();
    res.json({
      success: true,
      message: `Re-indexed ${pkgs.length} packages into Vectra Vector DB.`,
      count: pkgs.length,
    });
  } catch (err) {
    res.status(500).json({ error: true, message: "The request could not be completed" });
  }
});

app.get("/api/admin/chunks", adminAuth, async (req, res) => {
  try {
    const pkgs = loadAllPackages();
    res.json({
      success: true,
      totalPackages: pkgs.length,
      byTier: pkgs.reduce((acc, p) => {
        const t = p.budget_tier || budgetTier(p.price_inr || p.price);
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {}),
      chunks: pkgs.slice(0, 15),
    });
  } catch (err) {
    res.status(500).json({ error: true, message: "The request could not be completed" });
  }
});

/* =========================================================
   USER PERSISTENT CHAT HISTORY (auth-scoped, no IDOR)
========================================================= */
app.get("/api/chat/user-history", auth, requireDatabase, async (req, res) => {
  try {
    const userChat = await UserChat.findOne({ username: req.username }).lean();
    res.json({ success: true, messages: userChat ? userChat.messages : [] });
  } catch (err) {
    res.status(500).json({ error: true, message: "The request could not be completed" });
  }
});

app.post("/api/chat/save-user-message", chatLimiter, auth, requireDatabase, async (req, res) => {
  try {
    const input = req.body?.message;
    if (!input || typeof input.text !== 'string' || input.text.length > 20000 || !['user', 'bot'].includes(input.sender)) return res.status(400).json({ error: 'Invalid message' });
    const message = { sender: input.sender, text: input.text };

    await UserChat.findOneAndUpdate(
      { username: req.username },
      { $push: { messages: { $each: [message], $slice: -200 } } },
      { upsert: true, returnDocument: 'after' },
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: true, message: "The request could not be completed" });
  }
});

/* =========================================================
   STATIC FRONTEND + SPA FALLBACK
========================================================= */
app.use(
  express.static(path.join(__dirname, "build"), {
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);

app.get(/^\/(?!api|auth|user|chat).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

/* Global error handler */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = /CORS/.test(err.message) ? 403 : err.status || 500;
  console.error("Unhandled error:", err.message);
  res.status(status).json({ error: status >= 500 ? "Service unavailable. Please try again." : err.message });
});

/* =========================================================
   SERVER START
========================================================= */
const PORT = process.env.PORT || 5000;

async function startServer() {
  assertProductionConfig();
  await connectDB();
  if (process.env.NODE_ENV === 'production') await syncVectraIndex();
  startPackageWatcher();
  return app.listen(PORT, process.env.HOST || "127.0.0.1", () => console.log(`Server running on port ${PORT}`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) startServer().catch(async err => { console.error(err.message); await mongoose.disconnect(); process.exitCode = 1; });
export { app, startServer };
