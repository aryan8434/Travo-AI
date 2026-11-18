import { retrievePackages, summaryText, factsText } from './ragEngine.js';
import { generateGroundedAnswer } from '../llm.js';
import { parseTravelPreferences } from './travelPreferences.js';

const ASKS_PRICE = /\bprice\b|\bcost\b|how much|\bcheapest\b|\b(?:most|least) expensive\b|\bpriciest\b|\bcostliest\b|\blowest\b|how many/i;
const ASKS_INCLUSIONS = /\binclud|\bcover/i;
const ASKS_SEASON = /best (?:time|month|season)|when (?:should|to)/i;
const SORT_LABELS = { price_asc: 'lowest-priced', price_desc: 'highest-priced', rating_desc: 'top-rated' };

export async function answerPackageQuestion(query, filters = {}) {
  const result = await retrievePackages(query, { ...parseTravelPreferences(query), ...filters }, 4);
  const asksPrice = ASKS_PRICE.test(query), asksInclusions = ASKS_INCLUSIONS.test(query), asksSeason = ASKS_SEASON.test(query);
  const factual = asksPrice || asksInclusions || asksSeason;
  // A pure price question cites the price-facts record; anything else cites the summary.
  const priceOnly = asksPrice && !asksInclusions && !asksSeason;
  const summaries = result.matches.map(p => ({ chunk_id: `${p.package_id}::${priceOnly ? 'facts' : 'summary'}`, package_id: p.package_id, title: p.title, section: priceOnly ? 'Price facts' : 'Summary', text: priceOnly ? factsText(p) : summaryText(p) }));
  const sources = factual ? summaries : result.sources || [];
  let answer;
  if (factual && result.matches.length) {
    const total = result.total ?? result.matches.length;
    // Say which ordering or count was applied, so the answer is checkable against the catalogue.
    let lead = '';
    if (/how many/i.test(query)) lead = `**${total}** package${total === 1 ? '' : 's'} match${total === 1 ? 'es' : ''} your request. Examples:\n\n`;
    else if (result.sort) lead = `Showing the ${SORT_LABELS[result.sort]} ${result.matches.length} of ${total} matching packages.\n\n`;
    answer = lead + result.matches.map((p, i) => {
      const price = `₹${p.price_inr.toLocaleString('en-IN')}`;
      let text = `**${p.title}** — ${price} for ${p.capacity_people || 1} guests. [${i + 1}]`;
      if (asksInclusions) {
        const included = Object.entries(p.included_services || {}).filter(([, value]) => value && value !== false);
        text += included.length ? '\n\n' + included.map(([key, value]) => `- ${key.replaceAll('_', ' ')}: ${typeof value === 'boolean' ? 'included' : value}`).join('\n') : '\n\nThe catalogue does not specify the inclusions. Ask the supplier before booking.';
        text += '\n\nServices not listed are not confirmed as included.';
      }
      if (asksSeason) text += `\n\nRecommended catalogue months: ${(p.best_months || []).join(', ') || 'not specified'}. ${p.weather || ''}`;
      return text;
    }).join('\n\n');
  } else answer = await generateGroundedAnswer(query, sources);
  return { answer, sources, packages: result.matches.map(({ detailed_guide, full_guide, ...p }) => p), vectorDbUsed: result.vectorDbUsed };
}
