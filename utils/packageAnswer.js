import { retrievePackages, summaryText } from './ragEngine.js';
import { generateGroundedAnswer } from '../llm.js';
import { parseTravelPreferences } from './travelPreferences.js';

export async function answerPackageQuestion(query, filters = {}) {
  const result = await retrievePackages(query, { ...parseTravelPreferences(query), ...filters }, 4);
  const summaries = result.matches.map(p => ({ chunk_id: `${p.package_id}::summary`, package_id: p.package_id, title: p.title, section: 'Summary', text: summaryText(p) }));
  const factual = /\binclud|\bcover|\bprice\b|\bcost\b|how much|best (?:time|month|season)|when (?:should|to)/i.test(query);
  const sources = factual ? summaries : result.sources || [];
  let answer;
  if (factual && result.matches.length) {
    answer = result.matches.map((p, i) => {
      const price = `₹${p.price_inr.toLocaleString('en-IN')}`;
      let text = `**${p.title}** — ${price} for ${p.capacity_people || 1} guests. [${i + 1}]`;
      if (/\binclud|\bcover/i.test(query)) {
        const included = Object.entries(p.included_services || {}).filter(([, value]) => value && value !== false);
        text += included.length ? '\n\n' + included.map(([key, value]) => `- ${key.replaceAll('_', ' ')}: ${typeof value === 'boolean' ? 'included' : value}`).join('\n') : '\n\nThe catalogue does not specify the inclusions. Ask the supplier before booking.';
        text += '\n\nServices not listed are not confirmed as included.';
      }
      if (/best (?:time|month|season)|when (?:should|to)/i.test(query)) text += `\n\nRecommended catalogue months: ${(p.best_months || []).join(', ') || 'not specified'}. ${p.weather || ''}`;
      return text;
    }).join('\n\n');
  } else answer = await generateGroundedAnswer(query, sources);
  return { answer, sources, packages: result.matches.map(({ detailed_guide, full_guide, ...p }) => p), vectorDbUsed: result.vectorDbUsed };
}
