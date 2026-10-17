import "server-only";

/**
 * Groq reader — fills the requirement fields the regexes in requirements.ts
 * could not read. Free tier (~8k tokens/min across the site), so it is an
 * enhancement, never a dependency: any failure returns null and the agent runs
 * on the deterministic reader alone. The task's event records which reader ran.
 *
 * A dead default is a dead reader (hogwarts lost its chatbot to a retired Groq
 * model on 2026-09-09). Before trusting the default, check the account lists it:
 *   curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
 *
 * Env: GROQ_API_KEY (required for this path), GROQ_AGENT_MODEL (optional).
 */
import { coerceRequirements, type Requirements } from "./requirements";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const TIMEOUT_MS = 6_000;

const SYSTEM = `You read a tenant's messages to a rental agent in Kigali, Rwanda, and output ONLY a JSON object with these keys (null when the tenant did not say):
- stay: "short" (nights, holiday, Airbnb-style) or "long" (monthly rent, lease)
- district: "GASABO", "KICUKIRO" or "NYARUGENGE" (map neighbourhoods: Kimihurura, Kacyiru, Remera, Kibagabaga, Gisozi, Kinyinya → GASABO; Kicukiro, Niboye, Kagarama, Gikondo, Kanombe → KICUKIRO; Nyamirambo, Kiyovu, Nyarugenge, Biryogo → NYARUGENGE)
- bedrooms: integer (studio = 0)
- furnished: true/false
- maxPrice: number in RWF (expand "400k" to 400000)
- pricePeriod: "night" or "month"
- nights: integer
- guests: integer
- maxUpfront: number in RWF — cash available to move in, only if stated
Messages may be English, Arabic or Kinyarwanda. Later messages override earlier ones. Never guess a number that was not written.`;

export async function readRequirementsWithGroq(messages: string[]): Promise<Partial<Requirements> | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;
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
          { role: "user", content: messages.map((m, i) => `Message ${i + 1}: ${m}`).join("\n") },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[agent] groq ${res.status} — deterministic reader only`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return coerceRequirements(JSON.parse(content));
  } catch (err) {
    console.warn(`[agent] groq failed — deterministic reader only: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
