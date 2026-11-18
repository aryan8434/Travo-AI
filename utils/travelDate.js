/**
 * Travel-date parsing for flight searches. Dates are calendar days in India
 * (Asia/Kolkata), returned as "YYYY-MM-DD". Past dates return null.
 *
 * Deliberately conservative: budgets such as "5-10 thousand" or "2.5 lakh" must
 * never read as dates, so numeric dates need a slash, or a year when written
 * with "-" or ".". Day comes before month, as written in India.
 */
const MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
const MONTH = '(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\\.?';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function todayInIndia(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // en-CA formats as YYYY-MM-DD
}

const toIso = (d) => d.toISOString().slice(0, 10);
function utcDate(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function parseTravelDate(text = '', now = new Date()) {
  const t = String(text).toLowerCase();
  const today = new Date(`${todayInIndia(now)}T00:00:00Z`);
  const plusDays = (n) => new Date(today.getTime() + n * 86400000);
  const notPast = (d) => (d && d >= today ? toIso(d) : null);
  // A date without a year means its next occurrence (today counts).
  const nextOccurrence = (m, d) => {
    const y = today.getUTCFullYear();
    const thisYear = utcDate(y, m, d);
    return thisYear && thisYear >= today ? toIso(thisYear) : notPast(utcDate(y + 1, m, d));
  };
  const fullYear = (y) => (y.length === 2 ? 2000 + Number(y) : Number(y));

  if (/\bday after tomorrow\b/.test(t)) return toIso(plusDays(2));
  if (/\btomorrow\b/.test(t)) return toIso(plusDays(1));
  if (/\b(today|tonight)\b/.test(t)) return toIso(today);

  let m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/); // 2026-11-28
  if (m) return notPast(utcDate(+m[1], +m[2], +m[3]));
  m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/); // 28/11, 28/11/2026
  if (m) return m[3] ? notPast(utcDate(fullYear(m[3]), +m[2], +m[1])) : nextOccurrence(+m[2], +m[1]);
  m = t.match(/\b(\d{1,2})[.-](\d{1,2})[.-](\d{4}|\d{2})\b/); // 28-11-2026, 28.11.26
  if (m) return notPast(utcDate(fullYear(m[3]), +m[2], +m[1]));

  m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH}(?:,?\\s*(\\d{4}))?\\b`)); // 28 Nov, 28th of November 2026
  if (m) return m[3] ? notPast(utcDate(+m[3], MONTHS[m[2]], +m[1])) : nextOccurrence(MONTHS[m[2]], +m[1]);
  m = t.match(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`)); // Nov 28, November 28th, 2026
  if (m) return m[3] ? notPast(utcDate(+m[3], MONTHS[m[1]], +m[2])) : nextOccurrence(MONTHS[m[1]], +m[2]);

  m = t.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/); // the coming one, never today
  if (m) {
    const ahead = (WEEKDAYS.indexOf(m[1]) - today.getUTCDay() + 7) % 7 || 7;
    return toIso(plusDays(ahead));
  }
  return null;
}

export function formatTravelDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
