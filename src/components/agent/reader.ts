import "server-only";

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AREA_KEYS, LANDMARKS, NEIGHBOURHOODS, landmarkNamed, neighbourhoodNamed } from "./areas";
import { AGENT_MODEL, canSpend, claudeClient, noteFailure, recordSpend, type SpendLane } from "./claude";
import { readRequirementsWithGroq } from "./llm";
import type { AgentMemory } from "./memory";
import { CLEARABLE, DISTRICT_CODES, MUST_HAVES, type ClearableField, type MustHave, type Requirements } from "./requirements";
import type { AgentMessage, ShortlistItem } from "./types";

/**
 * Reading the tenant's newest message into a change of their search.
 *
 * Claude Haiku 5.5 reads first (structured output, ~1 s): it gets the search
 * as it stands, the homes on screen as [h1]…[h6], the chat so far and what
 * the agent remembers about the tenant, and returns only what the message
 * changes. Every value is checked here — the model proposes, code decides.
 * When Claude cannot spend (capped, cooling down, no key) or fails fast, the
 * Groq free tier reads; when both are out, run.ts reads with the rules alone.
 */

const CLAUDE_TIMEOUT_MS = 3_000;
/** Groq gets what is left of the reading budget — two timeouts never stack. */
const READ_BUDGET_MS = 3_500;
const GROQ_MIN_MS = 1_200;
/** USD → RWF for "$800 a month". A rough rate is enough to search with. */
const USD_TO_RWF = Number(process.env.USD_TO_RWF) > 0 ? Number(process.env.USD_TO_RWF) : 1_450;

const SET_FIELDS = [
  "stay",
  "district",
  "neighbourhood",
  "area",
  "bedrooms",
  "bathrooms",
  "furnished",
  "compound",
  "family",
  "cheap",
  "maxPrice",
  "pricePeriod",
  "nights",
  "guests",
  "maxUpfront",
  "months",
  "moveIn",
  "near",
  "nearIn",
] as const;

/**
 * Flat and fully required on purpose: structured outputs cap optional and
 * union (nullable) fields per request, and the SDK re-checks any min/max it
 * strips — one out-of-range value would fail the whole read. Ranges are code.
 */
export const ReaderOut = z.object({
  set: z.array(z.object({ field: z.enum(SET_FIELDS), value: z.string() })),
  clear: z.array(z.enum(CLEARABLE)),
  mustHaves: z.array(z.enum(MUST_HAVES)),
  currency: z.enum(["RWF", "USD"]),
  like: z.string(),
  notLike: z.string(),
  remember: z.array(z.string()),
  forget: z.array(z.string()),
  intent: z.enum(["search", "question", "other"]),
  question: z.string(),
  lang: z.enum(["en", "ar", "rw", "other"]),
});
export type ReaderOutput = z.infer<typeof ReaderOut>;

export interface Reading {
  by: "claude" | "groq";
  set: Partial<Requirements>;
  clear: ClearableField[];
  /** Shortlist refs ("h2") the tenant pointed at. */
  like: string | null;
  notLike: string | null;
  remember: string[];
  forget: string[];
  intent: "search" | "question" | "other";
  question: string | null;
  lang: "en" | "ar" | "rw" | null;
  /** A place the tenant named that mkan could not put on the map. */
  unplaced: string | null;
}

const SYSTEM = `You read one message from a tenant looking for a home in Kigali, Rwanda, and update their search. Mkan, the app, then searches real homes with what you return. You never talk to the tenant; you only fill the JSON.

Return what the NEWEST message changes, against the search as it stands:
- set: one {field, value} per field the newest message states or changes. value is always a string: numbers as plain digits, booleans "true" or "false". Leave out everything the message does not touch.
- clear: fields the newest message drops ("anywhere" → district, neighbourhood, area, near; "any budget" → maxPrice, pricePeriod, cheap; "furnished or not" → furnished; "no need for parking any more" → mustHaves).
- mustHaves: features the newest message asks the home to have. Empty when it asks for none.

Fields:
- stay: "short" (nights, a holiday, Airbnb-style) or "long" (monthly rent, a lease).
- district: GASABO, KICUKIRO or NYARUGENGE.
- neighbourhood: exactly one of: ${NEIGHBOURHOODS.map((n) => n.name).join(", ")}. Any other place goes in near.
- near: a place the tenant wants to live close to — a workplace, campus, market, hospital, the airport. One of these names when it is one of them: ${LANDMARKS.map((l) => l.name).join(", ")}; otherwise the place as the tenant wrote it.
- nearIn: only when near is not one of those names: the neighbourhood (from the neighbourhood list) the place is in, if you know it.
- area: "center" (city centre, downtown), "business" (business district, offices, ministries) or "university" (near a campus) — only when no specific place is named.
- bedrooms: an integer, a studio is 0. bathrooms: the minimum count.
- furnished; compound (a standalone house with its own gate: a villa, a "self compound"); family (a family with children); cheap (wants the cheapest): "true" or "false".
- maxPrice: the rent ceiling as a plain number ("400k" → 400000, "1.2m" → 1200000). pricePeriod: "night" or "month".
- currency: "USD" when the tenant's amounts are in dollars ("$800", "800 dollars"), else "RWF". Give the number as written; Mkan converts.
- nights, guests: integers. maxUpfront: the cash the tenant has to move in, only if stated. months: the lease length in months ("a year" → 12). moveIn: YYYY-MM-DD, worked out from today's date, which is given with the message.
- mustHaves values: parking, pets (a pet allowed), wifi, workspace (a desk or office corner), ac (air conditioning), security (guard, cameras, gate), quiet, transit (close to buses or motos), kitchen, washer, balcony, garden, elevator, waterTank, generator (backup power).

Relative asks move the current search: "cheaper" → maxPrice about 20% lower and cheap "true"; "bigger" → one more bedroom; "Kacyiru instead" → that neighbourhood (and its district); "same but furnished" → furnished "true".

The homes on the tenant's screen are listed as [h1], [h2]… like: the ref of a home the tenant wants more like ("like the second one" → "h2"), else "". notLike: the ref of a home they reject, else "". When they want a home like one but changed ("like h2 but cheaper"), also set what changes, using that home's facts.

Memory holds facts about the tenant from earlier chats. In the FIRST message of a new chat you may set maxPrice, pricePeriod, stay, bedrooms and mustHaves from memory when the message does not say otherwise; set a place from memory only when the message says "same area", "again" or similar. The newest message always wins over memory.
remember: at most 2 short facts from the newest message worth keeping for future searches (household, workplace, pets, needs, moving date), in the tenant's language, under 80 characters each. Never a name, phone number, email or ID number. Usually empty.
forget: the ids of memory notes the newest message contradicts or asks to forget.

intent: "search" when the message asks for homes or changes the search; "question" when it only asks about renting, prices, areas or how Mkan works; "other" for greetings, thanks or anything else. question: the question in a few words when intent is "question", else "".
lang: the language of the newest message — "en", "ar" (any dialect), "rw" or "other".

Messages may be in English, Arabic, Kinyarwanda, French or Swahili, with typos and mixed languages. Never invent a number that is not in the message or the memory.`;

export interface ReadInput {
  latest: string;
  current: Requirements;
  /** The chat before the newest message, oldest first. */
  history: AgentMessage[];
  shown: ShortlistItem[];
  memory: AgentMemory;
  newChat: boolean;
  now?: Date;
}

const kigaliDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali" }).format(d);

function agentLine(m: Extract<AgentMessage, { role: "agent" }>): string {
  if (m.kind === "shortlist") return `showed ${m.count} homes${m.refine ? `, then asked about ${m.refine === "stay" ? "months or nights" : "the budget"}` : ""}`;
  if (m.kind === "ask") return `asked about ${m.field === "stay" ? "months or nights" : "the budget"}`;
  if (m.kind === "none") return "found no home";
  return "had an error";
}

function homeLine(h: ShortlistItem, i: number): string {
  const rooms = h.bedrooms === 0 ? "studio" : h.bedrooms != null ? `${h.bedrooms}-bed` : "home";
  const price = `${h.currency} ${Math.round(h.cost.headline).toLocaleString("en")} a ${h.cost.period === "month" ? "month" : "night"}`;
  return `[h${i + 1}] ${rooms} · ${h.district ?? "Kigali"} · ${price}${h.lead ? " · broker home" : ""}`;
}

/** The volatile half of the prompt — after the cached system block. */
export function readerMessage(input: ReadInput): string {
  const known = Object.fromEntries(Object.entries(input.current).filter(([, v]) => v != null));
  const memory =
    Object.keys(input.memory.prefs).length || input.memory.notes.length
      ? JSON.stringify({
          prefs: Object.fromEntries(Object.entries(input.memory.prefs).map(([k, p]) => [k, p?.value])),
          notes: input.memory.notes.map((n) => ({ id: n.id, text: n.text })),
        })
      : "none";
  const history = input.history.slice(-6).map((m) => (m.role === "user" ? `- tenant: ${m.text}` : `- Mkan: ${agentLine(m)}`));
  return [
    `Today: ${kigaliDay(input.now ?? new Date())} (Kigali)`,
    `New chat: ${input.newChat ? "yes" : "no"}`,
    `Memory: ${memory}`,
    `Current search: ${JSON.stringify(known)}`,
    input.shown.length ? `Homes on screen:\n${input.shown.slice(0, 6).map(homeLine).join("\n")}` : null,
    history.length ? `Earlier in this chat:\n${history.join("\n")}` : null,
    `Newest message: ${input.latest}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const int = (v: string, min: number, max: number): number | null => {
  const n = Number(v.replace(/[,\s]/g, ""));
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const money = (v: string, usd: boolean, max: number): number | null => {
  const n = Number(v.replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const rwf = Math.round(usd ? n * USD_TO_RWF : n);
  return rwf >= 1_000 && rwf <= max ? rwf : null;
};
const bool = (v: string): boolean | null => (v === "true" ? true : v === "false" ? false : null);
const oneOf = <T extends string>(v: string, options: readonly T[]): T | null => (options.includes(v as T) ? (v as T) : null);

function moveInDay(v: string, now: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const at = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(at)) return null;
  // Yesterday (time zones) up to a year and a half out.
  return at >= now.getTime() - 2 * 86_400_000 && at <= now.getTime() + 550 * 86_400_000 ? v : null;
}

/**
 * The model's answer as a change to Requirements, every value checked.
 * A neighbourhood mkan does not know becomes a place to be near; a place
 * with no pin and no known neighbourhood is reported as `unplaced`.
 */
export function toReading(out: ReaderOutput, input: ReadInput, by: Reading["by"] = "claude"): Reading {
  const now = input.now ?? new Date();
  const usd = out.currency === "USD";
  const raw = new Map(out.set.map((s) => [s.field, s.value.trim()]));
  const set: Partial<Requirements> = {};
  let unplaced: string | null = null;

  const stay = oneOf(raw.get("stay") ?? "", ["short", "long"] as const);
  if (stay) set.stay = stay;
  const district = oneOf((raw.get("district") ?? "").toUpperCase(), DISTRICT_CODES);
  if (district) set.district = district;
  const area = oneOf(raw.get("area") ?? "", AREA_KEYS);
  if (area) set.area = area;
  const period = oneOf(raw.get("pricePeriod") ?? "", ["night", "month"] as const);
  if (period) set.pricePeriod = period;
  for (const [field, min, max] of [["bedrooms", 0, 10], ["bathrooms", 1, 10], ["nights", 1, 365], ["guests", 1, 30], ["months", 1, 60]] as const) {
    const n = raw.has(field) ? int(raw.get(field)!, min, max) : null;
    if (n != null) set[field] = n;
  }
  for (const field of ["furnished", "compound", "family", "cheap"] as const) {
    const b = raw.has(field) ? bool(raw.get(field)!) : null;
    if (b != null) set[field] = b;
  }
  // A nightly ceiling over 2M or a monthly one over 50M is a misread, not a budget.
  const ceiling = raw.has("maxPrice") ? money(raw.get("maxPrice")!, usd, (period ?? input.current.pricePeriod) === "night" ? 2_000_000 : 50_000_000) : null;
  if (ceiling != null) set.maxPrice = ceiling;
  const upfront = raw.has("maxUpfront") ? money(raw.get("maxUpfront")!, usd, 200_000_000) : null;
  if (upfront != null) set.maxUpfront = upfront;
  const moveIn = raw.has("moveIn") ? moveInDay(raw.get("moveIn")!, now) : null;
  if (moveIn) set.moveIn = moveIn;

  // Places: a known neighbourhood filters; anything else is a pin to be near.
  const hood = raw.get("neighbourhood");
  let nearName = raw.get("near") || null;
  if (hood) {
    const known = neighbourhoodNamed(hood);
    if (known) {
      set.neighbourhood = known.name;
      set.district ??= known.district as Requirements["district"];
    } else nearName ??= hood;
  }
  if (nearName) {
    const landmark = landmarkNamed(nearName);
    const within = neighbourhoodNamed(raw.get("nearIn"));
    if (landmark) set.near = { name: landmark.name, lat: landmark.lat, lng: landmark.lng };
    else if (within) set.near = { name: nearName.slice(0, 60), lat: within.lat, lng: within.lng };
    else unplaced = nearName.slice(0, 60);
  }

  if (out.mustHaves.length) set.mustHaves = [...new Set<MustHave>([...(input.current.mustHaves ?? []), ...out.mustHaves])].slice(0, 8);

  const ref = (v: string) => (/^h[1-6]$/.test(v) && Number(v.slice(1)) <= input.shown.length ? v : null);
  const like = ref(out.like);
  // "Like h2" without its own figures: that home's size and district stand in.
  if (like) {
    const home = input.shown[Number(like.slice(1)) - 1];
    if (home?.bedrooms != null) set.bedrooms ??= home.bedrooms;
  }

  return {
    by,
    set,
    clear: out.clear.filter((k) => set[k as keyof Requirements] == null),
    like,
    notLike: ref(out.notLike),
    remember: out.remember.map((s) => s.trim()).filter(Boolean).slice(0, 2),
    forget: out.forget.filter((id) => input.memory.notes.some((n) => n.id === id)),
    intent: out.intent,
    question: out.intent === "question" && out.question.trim() ? out.question.trim().slice(0, 200) : null,
    lang: out.lang === "other" ? null : out.lang,
    unplaced,
  };
}

/** One Claude read; null when it cannot or should not spend, or anything fails. */
export async function readWithClaude(
  input: ReadInput,
  {
    timeoutMs = CLAUDE_TIMEOUT_MS,
    lane = "agent-read",
    onUsage,
  }: { timeoutMs?: number; lane?: SpendLane; onUsage?: (usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) => void } = {},
): Promise<Reading | null> {
  const client = claudeClient();
  if (!client || !(await canSpend())) return null;
  try {
    const res = await client.messages.parse(
      {
        model: AGENT_MODEL,
        max_tokens: 1_500,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: readerMessage(input) }],
        output_config: { effort: "low", format: zodOutputFormat(ReaderOut) },
      },
      { timeout: timeoutMs },
    );
    void recordSpend(lane, res.usage);
    onUsage?.(res.usage);
    if (res.stop_reason === "refusal" || !res.parsed_output) return null;
    return toReading(res.parsed_output, input);
  } catch (err) {
    await noteFailure(err);
    console.warn(`[agent] claude read failed — falling back: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Claude, then Groq with what is left of the budget, then null (the rules).
 * A Claude timeout goes straight to the rules: Groq would only add its own.
 */
export async function readRequirements(input: ReadInput): Promise<Reading | null> {
  const started = Date.now();
  const claude = await readWithClaude(input);
  if (claude) return claude;
  const left = READ_BUDGET_MS - (Date.now() - started);
  if (left < GROQ_MIN_MS) return null;
  const earlier = input.history.filter((m): m is Extract<AgentMessage, { role: "user" }> => m.role === "user").map((m) => m.text);
  const groq = await readRequirementsWithGroq(input.latest, input.current, earlier, left);
  return groq
    ? { by: "groq", set: groq.set, clear: groq.clear, like: null, notLike: null, remember: [], forget: [], intent: "search", question: null, lang: null, unplaced: null }
    : null;
}
