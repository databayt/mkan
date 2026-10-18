import "server-only";

/**
 * Groq reader — reads what the tenant's newest message changes in the search
 * (set + clear), filling what the regexes in requirements.ts cannot read.
 * Free tier (~8k tokens/min across the site), so it is an enhancement, never a dependency: any failure returns null and the agent runs
 * on the deterministic reader alone. The task's event records which reader ran.
 *
 * A dead default is a dead reader (hogwarts lost its chatbot to a retired Groq
 * model on 2026-09-09). Before trusting the default, check the account lists it:
 *   curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
 *
 * Env: GROQ_API_KEY (required for this path), GROQ_AGENT_MODEL (optional).
 */
import { NEIGHBOURHOODS } from "./areas";
import { CLEARABLE, coerceRequirements, type ClearableField, type Requirements } from "./requirements";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
// The rules reader already has the numbers; a slow model costs the tenant more than it adds.
const TIMEOUT_MS = 3_500;
/** After a 429, skip the model for this long instead of paying the latency on every turn. */
const PAUSE_AFTER_429_MS = 60_000;
let pausedUntil = 0;

const SYSTEM = `You update a Kigali (Rwanda) rental search from the tenant's newest message. You get the search as it stands and the conversation so far. Output ONLY a JSON object {"set": {...}, "clear": [...]}:
- "set": only the fields the NEWEST message states or changes. Keys:
  stay: "short" (nights, holiday, Airbnb-style) or "long" (monthly rent, lease)
  district: "GASABO", "KICUKIRO" or "NYARUGENGE"
  neighbourhood: one of ${NEIGHBOURHOODS.map((n) => n.name).join(", ")}
  area: "center" (city centre / downtown), "business" (business district, offices, KCC) or "university" (near a campus)
  bedrooms: integer (studio = 0) · bathrooms: integer minimum
  furnished: true/false · compound: true for a standalone house with its own gate (villa, self compound)
  family: true when it is for a family with children · cheap: true when they want the cheapest
  maxPrice: number in RWF (expand "400k" to 400000) · pricePeriod: "night" or "month"
  nights, guests: integers · maxUpfront: RWF cash available to move in, only if stated
- "clear": field names the newest message drops ("anywhere" → district, neighbourhood, area; "any budget" → maxPrice; "furnished or not" → furnished). Allowed: ${CLEARABLE.join(", ")}.
Relative asks resolve against the current search: "cheaper" → maxPrice about 20% lower; "bigger" → one more bedroom; "Kacyiru instead" → the new neighbourhood (and its district).
Messages may be English, Arabic or Kinyarwanda. Never guess a number that was not written. Omit everything the newest message does not touch.`;

export interface GroqReading {
  set: Partial<Requirements>;
  clear: ClearableField[];
}

/** Read what the newest message changes in the current search. */
export async function readRequirementsWithGroq(latest: string, current: Requirements, earlier: string[]): Promise<GroqReading | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;
  if (Date.now() < pausedUntil) return null;
  const known = Object.fromEntries(Object.entries(current).filter(([, v]) => v != null));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_AGENT_MODEL?.trim() || DEFAULT_MODEL,
        temperature: 0,
        max_tokens: 400,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              `Current search: ${JSON.stringify(known)}`,
              earlier.length ? `Earlier messages:\n${earlier.slice(-4).map((m) => `- ${m}`).join("\n")}` : null,
              `Newest message: ${latest}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      }),
    });
    if (!res.ok) {
      // The free tier is shared site-wide (and with the TikTok lane's reader).
      if (res.status === 429) pausedUntil = Date.now() + PAUSE_AFTER_429_MS;
      console.warn(`[agent] groq ${res.status} — deterministic reader only`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { set?: unknown; clear?: unknown };
    const clear = Array.isArray(parsed.clear)
      ? parsed.clear.filter((k): k is ClearableField => typeof k === "string" && (CLEARABLE as readonly string[]).includes(k))
      : [];
    return { set: coerceRequirements(parsed.set), clear };
  } catch (err) {
    console.warn(`[agent] groq failed — deterministic reader only: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
