import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// What the assistant is doing, phrased for the request, so a wait reads as
// progress rather than a frozen "analyzing" line. Every request starts with
// autocorrecting and understanding, then cycles its search steps, ending with
// the curator model picking the best 3.
const OPENING = ['Autocorrecting place names', 'Understanding your request'];
const STEPS = [
  [/\b(bus|buses|coach)\b/i, ['Mapping road routes', 'Triangulating the route', 'Pricing coach types', 'Picking the best 3']],
  [/\b(flights?|fly|plane|airport)\b/i, ['Locating airports', 'Triangulating the route', 'Estimating fares', 'Picking the best 3']],
  [/\b(hotels?|stays?|rooms?|resorts?|homestays?)\b/i, ['Scouting stays', 'Searching the vector index', 'Ranking stays with RAG', 'Picking the best 3']],
  [/\b(packages?|trip|tour|holiday|vacation|itinerary)\b/i, ['Searching the vector index', 'Matching your budget', 'Ranking packages', 'Picking the best 3']],
  [/\b(weather|temperature|forecast)\b/i, ['Checking the skies', 'Reading the forecast']],
];
const GENERAL = ['Thinking it through', 'Consulting the atlas', 'Honing an answer'];

export default function ThinkingStatus({ request = '' }) {
  const steps = STEPS.find(([pattern]) => pattern.test(request))?.[1] || GENERAL;
  const [index, setIndex] = useState(0);

  // ChatBox keys this component by request, so a new request starts from the top.
  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => i + 1), 1300);
    return () => clearInterval(timer);
  }, []);

  // Opening steps play once; the request's own steps then repeat.
  const label = index < OPENING.length ? OPENING[index] : steps[(index - OPENING.length) % steps.length];

  return (
    <span role="status" aria-live="polite" className="relative inline-flex min-w-[11rem] overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {label}…
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
