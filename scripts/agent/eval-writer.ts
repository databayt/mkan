/**
 * pnpm agent:eval-writer — the /find reply writer on hand-made facts in
 * English, Arabic and Kinyarwanda: how many replies and "why" lines pass the
 * guard (no stray numbers, no prices, no "available" without a broker's yes,
 * the right script), and every Arabic and Kinyarwanda piece printed for a
 * person to read. Turning the rw writer on (AGENT_WRITER_LOCALES) waits for a
 * native speaker to approve these samples.
 *
 * Billed to the `agent-eval` lane (~18 calls ≈ $0.01). Key as in agent:eval.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { writeAnswer, writeReply, type WriterFacts, type WriterHome } from '../../src/components/agent/writer';

if (!process.env.AGENT_ANTHROPIC_API_KEY) {
  try {
    process.env.AGENT_ANTHROPIC_API_KEY = execFileSync('security', ['find-generic-password', '-s', 'mkan-ANTHROPIC_API_KEY', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // No key: nothing is written and every case reports as unwritten.
  }
}

const home = (over: Partial<WriterHome>): WriterHome => ({
  ref: 'h1',
  title: '2-bedroom apartment in Niboye',
  area: 'Kicukiro',
  bedrooms: 2,
  bathrooms: 1,
  period: 'month',
  typicalPrice: true,
  inBudget: null,
  has: [],
  askBroker: [],
  distance: null,
  confirmed: false,
  brokerHome: true,
  ...over,
});

const shortlists: Omit<WriterFacts, 'lang'>[] = [
  { search: ['monthly rent', 'Kicukiro district', '2 bedrooms'], widened: [], count: 3, followUp: 'the budget', homes: [home({}), home({ ref: 'h2', title: 'Family house in Kagarama', bedrooms: 3, typicalPrice: false }), home({ ref: 'h3', title: 'Apartment near Sonatubes', bathrooms: 2 })] },
  { search: ['monthly rent', 'near Kigali Heights', '1 bedrooms', 'must have parking, a water tank'], widened: [], count: 2, followUp: null, homes: [home({ title: 'Studio flat in Kimihurura', area: 'Gasabo', bedrooms: 1, has: ['parking'], askBroker: ['a water tank'], distance: '0.8 km from Kigali Heights' }), home({ ref: 'h2', area: 'Gasabo', bedrooms: 1, distance: '2.9 km from Kigali Heights', has: ['parking', 'a water tank'] })] },
  { search: ['a short stay', 'Nyarutarama', '3 nights', '2 guests'], widened: ['all of Gasabo district'], count: 2, followUp: null, homes: [home({ title: 'Garden suite', area: 'Gasabo', period: 'night', brokerHome: false, typicalPrice: false, inBudget: true }), home({ ref: 'h2', title: 'Hilltop loft', area: 'Gasabo', period: 'night', brokerHome: false, confirmed: true })] },
  { search: ['monthly rent', 'Kimironko', 'within their budget'], widened: ['a slightly higher budget'], count: 1, followUp: null, unplaced: "my sister's church", homes: [home({ title: '2-bedroom near the market', area: 'Gasabo', inBudget: false })] },
];
const questions = ['How much do I need to move in?', 'Is the viewing free?', 'What is the best school in Kigali?'];
const langs: WriterFacts['lang'][] = ['en', 'ar', 'rw'];

async function main() {
  let replies = 0;
  let passed = 0;
  let lines = 0;
  let linesPassed = 0;
  const samples: string[] = [];
  for (const lang of langs) {
    for (const facts of shortlists) {
      const out = await writeReply({ ...facts, lang }, 15_000, 'agent-eval');
      replies++;
      lines += facts.homes.length;
      if (out?.reply) passed++;
      linesPassed += out?.why.size ?? 0;
      if (lang !== 'en') samples.push(`[${lang}] ${out?.reply ?? '— (template)'}${[...(out?.why ?? new Map()).entries()].map(([r, t]) => `\n      ${r}: ${t}`).join('')}`);
      process.stdout.write(out ? '.' : 'x');
    }
    for (const q of questions) {
      const a = await writeAnswer(q, lang, 15_000, 'agent-eval');
      replies++;
      if (a) passed++;
      if (lang !== 'en') samples.push(`[${lang}] Q: ${q}\n      A: ${a ?? '— (template)'}`);
      process.stdout.write(a ? '.' : 'x');
    }
  }
  console.log(`\n\nreplies passing the guard: ${passed}/${replies} · why lines: ${linesPassed}/${lines}\n`);
  console.log(samples.join('\n\n'));
  process.exit(passed / replies >= 0.85 ? 0 : 1);
}

void main();
