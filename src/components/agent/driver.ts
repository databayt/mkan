import "server-only";

/**
 * The conversational driver — WhatsApp's tenant turn as ONE Claude tool-use conversation (docs/chat-funnel.md,
 * Phase 2, 2026-11-21). Behind MKAN_DRIVER=on (off by default). The model (Sonnet 5.5, through the capped client in
 * claude.ts, spend lane `agent-drive`) holds the chat and sells the viewing; code behind each tool holds every fact:
 * a price, a place, an availability or a time reaches the tenant only if a tool returned it, and the guard
 * (driver-pure.ts) refuses a message that says otherwise.
 *
 * whatsapp-chat.ts calls `driveTurn` after its own guardrails (STOP, "are you a bot?", a viewing already being
 * arranged, a deal's next step). It returns the reply, or `fallback` — the API is capped, off, slow or failed
 * before anything happened — and the Phase 1 pipeline (run.ts) answers instead, unchanged. A turn that already
 * did something (showed homes, asked a broker, offered times) and then failed still answers, from what the
 * tools did, so no tenant is left silent and no broker is asked twice.
 *
 * Every tool call is an AgentEvent, so the /find panel's steps and `mkan:read` keep working.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publicAppUrl } from "../../../scripts/crm/public-links";
import { appendUserMessage, type CurrentTask } from "./append";
import { appendTaskEvents } from "./broker";
import { askAvailabilityFor, handPickToPerson, type AskOutcome } from "./availability";
import { canSpend, claudeClient, DRIVER_MODEL, noteFailure, recordSpend } from "./claude";
import { openDemand, optInDemand } from "./demand";
import { proposeViewing, openViewingAsk, readViewingAsk } from "./deal";
import { readViewingTime, viewingLabel } from "./deal-pure";
import { converse } from "./driver-loop";
import { brokerCheckOf, composeReply, confirmedFirst, DRIVER_SYSTEM, driverEnabled, guardDriverText, guardNumbers, hasRealBrief, mergeHumanLines, pickHumanTurns, PREVERIFY, renderTurn, replyLanguageOf, resolvePick, type ChatLine, type DriverState, type HumanTurn, type PickRead } from "./driver-pure";
import { withoutListingBudget } from "./ref-budget-pure";
import { findChatMessages } from "@/lib/whatsapp/evolution";
import { messageText } from "../../../scripts/wa/outbox-pure";
import { addressList, textHash, type Sent } from "../../../scripts/wa/tenant-pure";
import { lidOfPhone, readState } from "./wa-state";
import { coerceMemory } from "./memory";
import { rankCandidates } from "./rank";
import { relaxations } from "./relax";
import { coerceRequirements, EMPTY_REQUIREMENTS, mergeRequirements, parseRequirements, type Requirements } from "./requirements";
import { restingStatus, TURN_DEADLINE_MS } from "./run";
import { searchKigali, toShortlist } from "./search";
import { loadTask } from "./task-view";
import type { AgentMessage, DriverNote, EventKind, ShortlistItem, StepStatus } from "./types";
import type { Viewer } from "./profile";
import { checkText, homeLines, homeMedia, isLanguageNeutral, MAX_HOMES, readHomeRef, waLang, type CheckOutcome, type HomeMedia, type WaLang } from "./whatsapp-format";
import { offerSlots } from "./viewing-loop";
import { noteRwSamples, writerFacts } from "./writer";

const json = (v: unknown) => v as Prisma.InputJsonValue;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** "150k" for a round thousand, the full figure otherwise: the way people text a rent (and not a list line to the eval's reader). */
const short = (n: number) => (Math.round(n) % 1000 === 0 ? `${Math.round(n) / 1000}k` : Math.round(n).toLocaleString("en-US"));
/** A home that is not somewhere to live (…922: a shop and a business room for a 150k furnished search). */
const COMMERCIAL_RE = /\b(shop|business room|office|commercial|store|warehouse|boutique|salon|restaurant|bar)\b/i;
/** How long the driver may take before the Phase 1 pipeline answers instead. */
const driverBudgetMs = () => Math.max(4_000, TURN_DEADLINE_MS - 2_000);
const BUSY_WAIT_MS = 20_000;

export type DriveResult =
  | { kind: "reply"; reply: string; taskId: string; media: HomeMedia[] }
  | { kind: "busy" }
  /** Nothing was done and the message is back as it was: run the Phase 1 pipeline. */
  | { kind: "fallback"; why: string };

export interface DriveInput {
  profile: { id: string; userId: string | null; waPhone: string | null };
  viewer: Viewer;
  digits: string;
  current: (CurrentTask & { locale: string }) | null;
  message: Extract<AgentMessage, { role: "user" }>;
  lang: WaLang;
  refSource?: string | null;
  seed?: { messages: AgentMessage[]; requirements: Prisma.JsonValue };
  /** A home code's home ("K6823" from a TikTok post): leads the search when it fits. */
  refHome?: { id: number; filters?: Record<string, unknown>; taken?: boolean; rent?: number } | null;
  onAnswering?: () => void;
}

/** Whether a driver turn may start: switched on, a key, credits left. */
export async function driverReady(): Promise<boolean> {
  return driverEnabled() && !!claudeClient() && (await canSpend().catch(() => false));
}

// ── the chat, as the model reads it ──────────────────────────────────────────

function chatLines(messages: AgentMessage[]): ChatLine[] {
  const out: ChatLine[] = [];
  for (const m of messages) {
    const at = Date.parse(m.at);
    const when = Number.isFinite(at) ? { at } : {};
    if (m.role === "user") {
      out.push({ who: "tenant", text: m.text, ...when });
      continue;
    }
    const said = "said" in m ? m.said : undefined;
    const say = (text: string) => out.push({ who: "mkan", text, ...when });
    if (said) say(said);
    else if (m.kind === "answer" && m.text) say(m.text);
    else if (m.kind === "ask") say(`(asked for their ${m.field === "maxPrice" ? "budget" : m.field})`);
    else if (m.kind === "clarify") say("(asked what kind of home they want)");
    else if (m.kind === "shortlist") say(m.same ? "(said these are the same homes as before)" : `(sent a list of ${Math.min(m.count, MAX_HOMES)} homes)`);
    else if (m.kind === "none") say("(said nothing matched yet)");
    else if (m.kind === "followUp") say("(sent a short reply)");
  }
  return out;
}

/** A budget stated in a message: a real monthly figure, never a phone number or a year. */
function statedBudget(text: string): number | null {
  const r = parseRequirements(text);
  return r.maxPrice && r.maxPrice >= 10_000 && r.maxPrice <= 5_000_000 && r.stay !== "short" ? r.maxPrice : null;
}

/** How far back a person's own messages in the chat are read: a takeover is remembered for days, not hours. */
const HUMAN_LOOKBACK_MS = 3 * 86_400_000;

/**
 * What a person at Mkan (Abdout) typed in this chat from the phone. The bot stores only WHEN (wa-tenant noteFromMe →
 * WaState `tenant-human`, a time per phone), not the words — the words are in the bridge's message store, which
 * findChatMessages reads per chat (both directions). A message is a person's when it is fromMe in this chat and not one of the
 * bot's own (WaState `tenant-sent`: ids, plus text hashes for an echo that beat its id). Never throws, never slow:
 * no read, no human lines.
 */
async function humanTurnsFor(digits: string, now = Date.now()): Promise<HumanTurn[]> {
  try {
    const lid = await lidOfPhone(digits);
    const addrs = addressList({ phone: digits, lid });
    const since = now - HUMAN_LOOKBACK_MS;
    const [sent, records] = await Promise.all([
      readState<Sent>("tenant-sent", []),
      // This chat only, under both addresses (the phone and the @lid) — not the whole line.
      Promise.race([
        Promise.all([`${digits}@s.whatsapp.net`, ...(lid ? [lid.includes("@") ? lid : `${lid}@lid`] : [])].map((jid) => findChatMessages(jid, 40))).then((r) => r.flat()),
        new Promise<never>((_, no) => setTimeout(() => no(new Error("slow")), 3_500)),
      ]),
    ]);
    return pickHumanTurns(records, {
      addrs,
      sentIds: new Set(sent.map((x) => x.id).filter(Boolean)),
      sent: sent.filter((x) => x.h && addrs.includes(x.phone)).map((x) => ({ at: Date.parse(x.at), h: x.h! })),
      textOf: (m) => messageText(m ?? undefined),
      hash: textHash,
      since,
    });
  } catch (err) {
    console.warn(`[driver] a person's messages were not read: ${(err as Error).message}`);
    return [];
  }
}

// ── one turn ─────────────────────────────────────────────────────────────────

interface Turn {
  taskId: string;
  lang: WaLang;
  phone: string;
  profileId: string;
  requirements: Requirements;
  memoryDismissed: number[];
  pin: number | null;
  /** The homes of the latest list, in order: "home 1" and "home 2". */
  shown: ShortlistItem[];
  shownIds: Set<number>;
  /** Candidates from this turn's search. */
  pool: Map<number, ShortlistItem>;
  justShown: ShortlistItem[] | null;
  /** The shown home this message names, read by meaning (driver-pure resolvePick). */
  pick: PickRead | null;
  /** The rent of the home a code named: a yardstick for "similar", never a budget. */
  refRent: number | null;
  /** Homes asked about before showing (this turn's search): their broker check, by id. */
  verified: Map<number, { outcome: string; item: ShortlistItem }>;
  /** Verified homes held behind the list: the next best when a shown one is taken. */
  backups: ShortlistItem[];
  checks: { id: number; title: string; outcome: CheckOutcome | "confirmed" | "busy" }[];
  offered: { id: number; labels: string[]; at: string[] } | null;
  lastOffered: { id: number; at: string[] } | null;
  booked: string | null;
  saved: boolean;
  events: [EventKind, StepStatus, Record<string, unknown>][];
}

function applySlots(t: Turn, input: Record<string, unknown>): { changed: string[]; unplaced?: string[] } {
  let r = t.requirements;
  const changed: string[] = [];
  let unplaced: string[] | undefined;
  const areas = Array.isArray(input.areas) ? (input.areas as unknown[]).filter((a): a is string => typeof a === "string" && !!a.trim()) : [];
  if (areas.length) {
    const read = parseRequirements(areas.join(", "));
    if (read.neighbourhood || read.neighbourhoods?.length || read.district) {
      r = { ...r, neighbourhood: read.neighbourhood, neighbourhoods: read.neighbourhoods, district: read.district, area: null };
      changed.push("areas");
    } else unplaced = areas;
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const budget = num(input.max_budget);
  if (budget && budget >= 10_000 && budget <= 5_000_000) {
    r = { ...r, maxPrice: Math.round(budget), pricePeriod: "month", cheap: null };
    changed.push("max_budget");
  }
  const beds = num(input.bedrooms);
  if (beds != null && beds >= 0 && beds <= 10) {
    r = { ...r, bedrooms: Math.round(beds) };
    changed.push("bedrooms");
  }
  if (typeof input.home_type === "string" && ["apartment", "house", "room", "studio"].includes(input.home_type)) {
    r = input.home_type === "studio" ? { ...r, homeType: "studio", bedrooms: 0 } : { ...r, homeType: input.home_type as Requirements["homeType"] };
    changed.push("home_type");
  }
  if (typeof input.furnished === "boolean") {
    r = { ...r, furnished: input.furnished };
    changed.push("furnished");
  }
  if (typeof input.move_in === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.move_in)) {
    r = { ...r, moveIn: input.move_in };
    changed.push("move_in");
  }
  t.requirements = { ...r, stay: "long", pricePeriod: r.maxPrice ? "month" : r.pricePeriod };
  return { changed, ...(unplaced ? { unplaced } : {}) };
}

const briefView = (r: Requirements) => ({
  areas: r.neighbourhoods?.length ? r.neighbourhoods : r.neighbourhood ? [r.neighbourhood] : r.district ? [r.district] : [],
  max_budget: r.maxPrice ?? null,
  bedrooms: r.bedrooms ?? null,
  home_type: r.homeType ?? null,
  furnished: r.furnished ?? null,
  move_in: r.moveIn ?? null,
});

function candidateFacts(items: ShortlistItem[], t: Turn) {
  const facts = writerFacts({ lang: "en", requirements: t.requirements, relaxed: [], shortlist: items }).homes;
  return items.map((s, i) => ({
    id: s.id,
    title: s.title,
    rent: `${short(s.cost.headline)} a month`,
    rent_rwf: Math.round(s.cost.headline),
    area: facts[i]?.neighbourhood ?? facts[i]?.area ?? null,
    bedrooms: s.bedrooms,
    bathrooms: s.bathrooms,
    type: facts[i]?.type ?? null,
    furnished: s.furnished ?? "not stated",
    fits: s.reasons.slice(0, 4),
    ask_broker: facts[i]?.askBroker ?? [],
    confirmed_free: s.availability === "confirmed",
    broker_check: brokerCheckOf(t.verified.get(s.id)?.outcome, s.availability),
  }));
}

async function searchTool(t: Turn, input: Record<string, unknown>) {
  // A pick is not a search: the tenant named a shown home, so it is checked, and nothing else is shown instead.
  if (t.pick?.sure && !t.checks.some((c) => c.id === t.pick!.id)) {
    return { error: `The tenant picked home ${t.pick.number} (${t.pick.title}) from the list. Do not search: call check_availability for home_numbers [${t.pick.number}] and offer_viewing_slots for it now.` };
  }
  const { changed, unplaced } = applySlots(t, input);
  await db.agentTask.update({ where: { id: t.taskId }, data: { requirements: json(t.requirements) } }).catch(() => {});
  const query: Requirements = { ...t.requirements, stay: "long" };
  const excludeIds = [...new Set([...t.memoryDismissed, ...(input.include_shown === true ? [] : [...t.shownIds])])];
  const { candidates } = await searchKigali(query, { excludeIds });
  let result = rankCandidates(candidates, query, 6, new Date(), t.pin ?? undefined);
  let relaxedKeys: string[] = [];
  if (result.ranked.length === 0) {
    const attempts = relaxations(query).filter((a) => !a.steps.some((s) => s.key === "budget"));
    const tried = await Promise.all(
      attempts.map(async (attempt) => {
        const found = await searchKigali(attempt.requirements, { excludeIds });
        return { attempt, ranked: rankCandidates(found.candidates, attempt.requirements) };
      }),
    );
    const best = tried.filter((x) => x.ranked.ranked.length > 0).sort((x, y) => x.attempt.steps.length - y.attempt.steps.length)[0];
    if (best) {
      result = best.ranked;
      relaxedKeys = best.attempt.steps.map((s) => s.key);
    }
  }
  const items = (await toShortlist(result.ranked, t.lang, query.near?.name)).filter((s) => !COMMERCIAL_RE.test(s.title));
  // Never past the tenant's budget: a stretch is not a fit (budgetRespected), and a list of homes they cannot pay is the old bot.
  const limit = t.requirements.maxPrice ? t.requirements.maxPrice * 1.05 : null;
  const within = limit ? items.filter((s) => s.cost.period !== "month" || s.cost.headline <= limit) : items;
  // No budget given and a code's home in play: similar means near ITS rent, never the tenant's budget.
  const near = !limit && t.refRent ? within.filter((s) => s.cost.period !== "month" || s.cost.headline <= t.refRent! * 1.25) : within;
  const pinned = t.pin ? near.find((s) => s.id === t.pin) : undefined;
  const rest = confirmedFirst(near.filter((s) => s.id !== t.pin));
  const ordered = pinned ? [pinned, ...rest] : rest;
  t.pool = new Map(ordered.slice(0, 5).map((s) => [s.id, s]));
  // The best few are asked before any is shown (inside the broker caps): the tenant is told it is being checked.
  // Only a real brief (an area or a budget) earns a broker's time; small talk never does.
  if (t.pool.size && hasRealBrief(t.requirements)) await verifyTop(t, [...t.pool.values()].filter((s) => s.availability !== "rented")).catch((err) => console.warn(`[driver] ${t.taskId} pre-verify: ${(err as Error).message}`));
  t.events.push(["search_done", "done", { tool: "search_homes", candidates: candidates.length, returned: t.pool.size, relaxed: relaxedKeys }]);
  let saved = false;
  if (t.pool.size === 0 && !t.saved) {
    const demand = await openDemand(t.taskId, t.profileId, query, t.lang).catch(() => null);
    if (demand) {
      await optInDemand(t.taskId, t.phone).catch(() => {});
      t.saved = saved = true;
    }
  }
  return {
    brief: briefView(t.requirements),
    ...(changed.length ? { brief_updated: changed } : {}),
    ...(unplaced ? { places_not_recognised: unplaced } : {}),
    candidates: candidateFacts([...t.pool.values()], t),
    ...(t.verified.size ? { brokers_asked_now: t.verified.size, say_briefly: "the candidates marked asking_now are being checked with their brokers: say so in one short line; the answer reaches the tenant here" } : {}),
    ...(relaxedKeys.length ? { widened: relaxedKeys, note: "These fit only after widening those details: say so plainly." } : {}),
    ...(t.pool.size === 0 ? { note: "Nothing within the budget matches. Say so honestly and ask which detail they can relax (area, size or budget).", ...(saved ? { saved_search: "the search is saved: new matching homes are sent to this chat automatically" } : {}) } : {}),
  };
}

function homeByNumber(t: Turn, n: unknown): ShortlistItem | null {
  const i = typeof n === "number" ? n - 1 : -1;
  return i >= 0 ? t.shown[i] ?? null : null;
}

async function showTool(t: Turn, input: Record<string, unknown>) {
  const ids = (Array.isArray(input.ids) ? input.ids : []).filter((x): x is number => typeof x === "number").slice(0, MAX_HOMES);
  const picked = ids.map((id) => t.pool.get(id)).filter((s): s is ShortlistItem => !!s);
  if (!picked.length) return { error: "none of those ids came from the last search_homes: search first and use its ids" };
  const onDisk = await db.agentTask.findUnique({ where: { id: t.taskId }, select: { shortlist: true } }).catch(() => null);
  const prior = new Map(((onDisk?.shortlist as unknown as ShortlistItem[] | null) ?? []).map((s) => [s.id, s]));
  const list = picked.map((s) => {
    const was = prior.get(s.id);
    return was && s.availability === "unconfirmed" && was.availability !== "unconfirmed" ? { ...s, availability: was.availability } : s;
  });
  // The homes checked behind the list stay on the shortlist after it, so a "taken" goes straight to them (broker.ts).
  const behind = [...t.verified.values()].map((v) => prior.get(v.item.id) ?? v.item).filter((s) => !list.some((x) => x.id === s.id) && s.availability !== "rented");
  t.backups = list.length >= MAX_HOMES ? behind : [];
  await db.agentTask.update({ where: { id: t.taskId }, data: { shortlist: json([...list, ...t.backups]) } });
  t.shown = list;
  t.justShown = list;
  list.forEach((s) => t.shownIds.add(s.id));
  t.events.push(["shortlist_ready", "done", { tool: "show_homes", count: list.length, ids: list.map((s) => s.id) }]);
  return { shown: list.map((s, i) => ({ number: i + 1, title: s.title, rent: `${short(s.cost.headline)} a month` })), attached: "the list and photos are attached to your message at [[homes]]" };
}

function answerTool(t: Turn, input: Record<string, unknown>) {
  const item = homeByNumber(t, input.home_number);
  if (!item) return { error: "no such home in the latest list" };
  const f = writerFacts({ lang: "en", requirements: t.requirements, relaxed: [], shortlist: [item] }).homes[0]!;
  t.events.push(["reply_written", "done", { tool: "answer_from_listing", home: input.home_number }]);
  return {
    home_number: input.home_number,
    title: item.title,
    rent: `${short(item.cost.headline)} a month`,
    rent_rwf: Math.round(item.cost.headline),
    move_in_estimate: item.cost.period === "month" ? `${short(item.cost.total)} (RWF ${Math.round(item.cost.total)})` : undefined,
    area: f.neighbourhood ?? f.area,
    type: f.type,
    furnishing: f.furnishing ?? "the ad does not say",
    bedrooms: f.bedrooms,
    bathrooms: f.bathrooms ?? "the ad does not say",
    terms_the_ad_states: f.terms,
    has: f.has,
    the_ad_does_not_say: f.askBroker,
    confirmed_free_by_broker: f.confirmed,
    photos: "the photos were sent with the list; the viewing shows everything",
  };
}

const OUTCOME_FOR_MODEL: Record<string, string> = {
  asked: "the broker was messaged; the answer usually comes within a day, then you tell the tenant here",
  slow: "the broker was messaged (they have been slow on this home); it may take a while",
  already: "the broker was already asked about this home; the answer will come here",
  confirmed: "a broker confirmed this home is free",
  taken: "this home is TAKEN (rented): go to the next best home",
  unreachable: "no broker can be reached for this home right now: say so, offer another home or the viewing request",
  host: "this is a host's own home with no broker to ask: its request happens at the viewing",
  handed: "the check is noted; give no time for the answer",
  web: "the check is noted; give no time for the answer",
  none: "the check is noted; give no time for the answer",
  busy: "the check could not start just now; say you will check it and offer the viewing slots",
};

/** One home's broker check, inside every cap and gate askAvailabilityFor / askBroker hold (broker-sends, cadence, team numbers). */
async function askOne(t: Turn, item: ShortlistItem): Promise<CheckOutcome | "confirmed" | "busy"> {
  const ask = (): Promise<AskOutcome | null> => askAvailabilityFor(t.taskId, item.id).catch(() => null);
  let res = await ask();
  if (!res) {
    await sleep(1_200);
    res = await ask();
  }
  if (!res) await handPickToPerson(t.taskId, item, "check-failed").catch(() => {});
  const outcome: CheckOutcome | "confirmed" | "busy" = res?.why === "confirmed" ? "confirmed" : res?.asked ? (res.slow ? "slow" : "asked") : ((res?.why as CheckOutcome | undefined) ?? "busy");
  t.checks.push({ id: item.id, title: item.title, outcome });
  return outcome;
}

async function checkTool(t: Turn, input: Record<string, unknown>) {
  const nums = (Array.isArray(input.home_numbers) ? input.home_numbers : []).filter((x): x is number => typeof x === "number");
  const items = [...new Set(nums)].map((n) => homeByNumber(t, n)).filter((s): s is ShortlistItem => !!s);
  if (!items.length) return { error: "no such home in the latest list" };
  // The task is "running" while the driver works: the check waits for a quiet task (availability.ts).
  await db.agentTask.updateMany({ where: { id: t.taskId, status: "RUNNING" }, data: { status: "DONE" } });
  const results = await Promise.all(
    items.map(async (item) => {
      // A home this turn's search already asked about is not asked twice: its answer is the check's.
      const before = t.verified.get(item.id);
      const outcome = before && before.outcome !== "busy" ? (before.outcome as CheckOutcome | "confirmed") : await askOne(t, item);
      return { home_number: t.shown.indexOf(item) + 1, title: item.title, status: outcome, meaning: OUTCOME_FOR_MODEL[outcome] ?? OUTCOME_FOR_MODEL.busy };
    }),
  );
  t.events.push(["availability_asked", "waiting_person", { tool: "check_availability", homes: items.map((s) => s.id) }]);
  // Taken is never a dead end: the homes already checked behind the list come first, then a new search.
  const taken = results.some((r) => r.status === "taken");
  const next = taken ? t.backups.filter((s) => s.availability !== "rented" && !t.shown.some((x) => x.id === s.id)) : [];
  return {
    results,
    ...(taken
      ? {
          next_best: next.length
            ? { homes: candidateFacts(next, t), note: "These were already checked with their brokers: show_homes with these ids, best first, before searching again." }
            : { note: "Nothing checked is waiting: search_homes for the next best and show it." },
        }
      : {}),
  };
}

/**
 * Before the tenant sees any home: the brokers of the best PREVERIFY candidates are asked, in parallel, inside the
 * same caps and gates as a tenant's own pick (askAvailabilityFor). The shortlist on disk holds the homes shown so far
 * first, then these, so a broker's answer lands on the list (broker.ts applyAnswer) and a "taken" goes on to the next
 * best (nextBestAfterTaken). A home a broker already confirmed is not asked again.
 */
async function verifyTop(t: Turn, items: ShortlistItem[]): Promise<void> {
  const targets = items.slice(0, PREVERIFY);
  if (!targets.length) return;
  const onDisk = await db.agentTask.findUnique({ where: { id: t.taskId }, select: { shortlist: true } }).catch(() => null);
  const disk = (onDisk?.shortlist as unknown as ShortlistItem[] | null) ?? [];
  const prior = new Map(disk.map((s) => [s.id, s]));
  const front = t.shown.map((s) => prior.get(s.id) ?? s);
  const merged = targets.filter((s) => !front.some((f) => f.id === s.id)).map((s) => {
    const was = prior.get(s.id);
    return was && s.availability === "unconfirmed" && was.availability !== "unconfirmed" ? { ...s, availability: was.availability } : s;
  });
  await db.agentTask.update({ where: { id: t.taskId }, data: { shortlist: json([...front, ...merged]) } });
  await db.agentTask.updateMany({ where: { id: t.taskId, status: "RUNNING" }, data: { status: "DONE" } });
  await Promise.all(
    merged.map(async (item) => {
      const outcome = item.availability === "confirmed" ? "confirmed" : item.availability === "rented" ? "taken" : item.availability === "asked" ? "already" : await askOne(t, item);
      t.verified.set(item.id, { outcome, item });
    }),
  );
  if (t.verified.size) t.events.push(["availability_asked", "waiting_person", { tool: "search_homes", preverify: [...t.verified.keys()] }]);
}

async function slotsTool(t: Turn, input: Record<string, unknown>) {
  const item = input.home_number == null ? null : homeByNumber(t, input.home_number);
  if (input.home_number != null && !item) return { error: "no such home in the latest list" };
  const times = await offerSlots().catch(() => [] as Date[]);
  const labels = times.map((x) => viewingLabel(x, t.lang));
  if (!item) {
    t.events.push(["viewing_proposed", "waiting_person", { tool: "offer_viewing_slots", slots: labels }]);
    return labels.length
      ? { slots: labels, who: "someone from Mkan meets the tenant at the house", note: "No home is lined up yet: say viewings can be on these times, then ask the one missing thing so you can find the home." }
      : { slots: [], note: "No time is free in the next days: ask which day suits the tenant." };
  }
  await openViewingAsk(t.phone, t.taskId, item.id).catch(() => {});
  t.offered = { id: item.id, labels, at: times.map((x) => x.toISOString()) };
  t.events.push(["viewing_proposed", "waiting_person", { tool: "offer_viewing_slots", listingId: item.id, slots: labels }]);
  return labels.length
    ? { home_number: input.home_number, title: item.title, slots: labels, who: "someone from Mkan meets the tenant at the house", note: "Offer exactly these two labels." }
    : { home_number: input.home_number, slots: [], who: "someone from Mkan meets the tenant at the house", note: "No time is free in the next days: ask which day suits the tenant." };
}

async function bookTool(t: Turn, input: Record<string, unknown>) {
  const item = homeByNumber(t, input.home_number);
  if (!item) return { error: "no such home in the latest list" };
  const offered = t.offered ?? (t.lastOffered && t.lastOffered.id === item.id ? { ...t.lastOffered, labels: [] as string[] } : null);
  let at: Date | null = null;
  const idx = typeof input.slot_index === "number" ? input.slot_index - 1 : -1;
  if (idx >= 0 && offered?.at[idx]) at = new Date(offered.at[idx]!);
  else if (typeof input.when_text === "string") {
    const when = readViewingTime(input.when_text, new Date());
    if (when && "at" in when) at = when.at;
  }
  if (!at) return { error: "no valid time: ask which day and time (within Mkan's viewing hours), or offer slots with offer_viewing_slots" };
  const phone = t.phone;
  const ask = (await readViewingAsk(phone)) ?? { taskId: t.taskId, listingId: item.id, at: new Date().toISOString() };
  const message = await proposeViewing({ ...ask, taskId: t.taskId, listingId: item.id }, at, phone, t.lang);
  const label = viewingLabel(at, t.lang);
  t.booked = label;
  t.events.push(["viewing_proposed", "waiting_person", { tool: "book_viewing", listingId: item.id, at: at.toISOString() }]);
  return { status: "requested: the broker is asked to confirm this time and the tenant hears here", time: label, home_number: input.home_number, tenant_message: message };
}

async function updateTool(t: Turn, input: Record<string, unknown>) {
  const { changed, unplaced } = applySlots(t, input);
  await db.agentTask.update({ where: { id: t.taskId }, data: { requirements: json(t.requirements) } }).catch(() => {});
  t.events.push(["requirements_extracted", "done", { tool: "update_brief", requirements: t.requirements, changed }]);
  return { brief: briefView(t.requirements), ...(unplaced ? { places_not_recognised: unplaced } : {}), updated: changed };
}

/** What the tools did, said plainly, when the model failed after they ran: never silence, never a second broker ask. */
function degraded(t: Turn, lang: WaLang): { text: string; homes: boolean } {
  const parts: string[] = [];
  const c = t.checks[0];
  if (c) parts.push(checkText(lang, c.outcome === "busy" ? "retry" : c.outcome, c.title));
  if (t.offered?.labels.length) {
    parts.push(lang === "ar" ? `هل يناسبك ${t.offered.labels[0]} أم ${t.offered.labels[1] ?? t.offered.labels[0]}؟` : lang === "rw" ? `${t.offered.labels[0]} cyangwa ${t.offered.labels[1] ?? t.offered.labels[0]}, ni uwuhe ukubereye?` : `Does ${t.offered.labels[0]}${t.offered.labels[1] ? ` or ${t.offered.labels[1]}` : ""} suit you for a viewing? Someone from Mkan meets you at the house.`);
  }
  return { text: parts.join("\n\n"), homes: !!t.justShown };
}

async function exec(t: Turn, name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "update_brief":
      return updateTool(t, input);
    case "search_homes":
      return searchTool(t, input);
    case "show_homes":
      return showTool(t, input);
    case "answer_from_listing":
      return answerTool(t, input);
    case "check_availability":
      return checkTool(t, input);
    case "offer_viewing_slots":
      return slotsTool(t, input);
    case "book_viewing":
      return bookTool(t, input);
    default:
      return { error: `unknown tool ${name}` };
  }
}

/** The tenant's message taken back out of the chat, so the Phase 1 path sees the chat as it was. */
async function undoAppend(taskId: string, created: boolean, msgId: string | undefined): Promise<void> {
  if (created) {
    await db.agentEvent.deleteMany({ where: { taskId } }).catch(() => {});
    await db.tenantRequest.deleteMany({ where: { taskId } }).catch(() => {});
    await db.agentTask.delete({ where: { id: taskId } }).catch(() => {});
    return;
  }
  const row = await db.agentTask.findUnique({ where: { id: taskId }, select: { messages: true, shortlist: true } });
  if (!row) return;
  const list = (row.messages as unknown as AgentMessage[]) ?? [];
  const at = msgId ? list.findLastIndex((m) => m.role === "user" && m.wa === msgId) : -1;
  const kept = at >= 0 ? list.slice(0, at) : list;
  await db.agentTask.update({ where: { id: taskId }, data: { messages: json(kept), status: restingStatus(row.shortlist) } });
}

/** One driver turn on a WhatsApp message. Never throws: `fallback` hands the message to the Phase 1 pipeline. */
export async function driveTurn(input: DriveInput): Promise<DriveResult> {
  const started = Date.now();
  const { profile, current, message, lang } = input;
  if (!(await driverReady())) return { kind: "fallback", why: "unavailable" };
  const client = claudeClient()!;
  const phone = profile.waPhone ?? `+${input.digits}`;

  // The message goes on the chat the way the pipeline puts it there; a chat mid-turn is "busy".
  let cur = current;
  let appended = await appendUserMessage({ profileId: profile.id, userId: profile.userId, current: cur, message, lang, seed: input.seed, refSource: input.refSource });
  for (const until = Date.now() + BUSY_WAIT_MS; "busy" in appended && Date.now() < until; ) {
    await sleep(1_000);
    cur = cur ? await db.agentTask.findUnique({ where: { id: cur.id }, select: { id: true, status: true, messages: true, updatedAt: true, locale: true } }) : null;
    appended = await appendUserMessage({ profileId: profile.id, userId: profile.userId, current: cur, message, lang, seed: input.seed, refSource: input.refSource });
  }
  if ("busy" in appended) return { kind: "busy" };
  const taskId = appended.taskId;
  const created = !current;
  input.onAnswering?.();

  try {
    const task = await db.agentTask.findUnique({
      where: { id: taskId },
      select: { messages: true, requirements: true, shortlist: true, profile: { select: { memory: true } } },
    });
    if (!task) throw new Error("task vanished");
    const all = (task.messages as unknown as AgentMessage[]) ?? [];
    const before = all.slice(0, all.findLastIndex((m) => m.role === "user" && m.wa === message.wa));
    const onDisk = (task.shortlist as unknown as ShortlistItem[] | null) ?? [];
    const listed = before.some((m) => m.role === "agent" && m.kind === "shortlist" && !m.same);
    const lastOffered = [...before].reverse().find((m): m is Extract<AgentMessage, { role: "agent" }> & DriverNote => m.role === "agent" && "offered" in m && !!m.offered);
    const t: Turn = {
      taskId,
      lang,
      phone,
      profileId: profile.id,
      requirements: { ...mergeRequirements(EMPTY_REQUIREMENTS, coerceRequirements(task.requirements)), stay: "long" },
      memoryDismissed: coerceMemory(task.profile?.memory).dismissed,
      // A taken home is not pinned: it cannot be offered, only its neighbours.
      pin: input.refHome && !input.refHome.taken ? input.refHome.id : null,
      pick: null,
      refRent: input.refHome?.rent ?? null,
      verified: new Map(),
      backups: listed ? onDisk.slice(MAX_HOMES).filter((s) => s.availability !== "rented") : [],
      shown: listed ? onDisk.slice(0, MAX_HOMES) : [],
      shownIds: new Set([...(listed ? onDisk.slice(0, MAX_HOMES).map((s) => s.id) : []), ...before.flatMap((m) => (m.role === "agent" && "shownIds" in m ? m.shownIds ?? [] : []))]),
      pool: new Map(listed ? onDisk.slice(MAX_HOMES).filter((s) => s.availability !== "rented").map((s) => [s.id, s]) : []),
      justShown: null,
      checks: [],
      offered: null,
      lastOffered: lastOffered?.offered ?? null,
      booked: null,
      saved: false,
      events: [],
    };
    // What a tap on a home's code carries (its own place, size and price) and what the rules read in this
    // message that is plainly a field: the brief the model starts from. It may correct any of it.
    // Its price is the home's, not the tenant's budget: it never enters the brief (ref-budget-pure.ts).
    if (input.refHome?.filters) t.requirements = { ...mergeRequirements(t.requirements, coerceRequirements(withoutListingBudget(input.refHome.filters))), stay: "long" };
    t.pick = resolvePick(
      message.text,
      t.shown.map((s, i) => ({ number: i + 1, id: s.id, title: s.title, places: [s.zone, s.district], rentRwf: Math.round(s.cost.headline) })),
    );
    const read = parseRequirements(message.text);
    const budget = statedBudget(message.text);
    t.requirements = mergeRequirements(t.requirements, {
      ...(budget ? { maxPrice: budget, pricePeriod: "month" as const } : {}),
      bedrooms: read.bedrooms,
      furnished: read.furnished,
      homeType: read.homeType,
      neighbourhood: read.neighbourhood,
      neighbourhoods: read.neighbourhoods,
      district: read.district,
    });
    const tenantMessages = [...before.filter((m) => m.role === "user").map((m) => (m as { text: string }).text), message.text];
    const budgetKnown = !!t.requirements.maxPrice || tenantMessages.some((x) => statedBudget(x) != null);
    // A message with no language in it ("1", "ok", a code) keeps the language of the last one that had some.
    const basisText = !isLanguageNeutral(message.text) ? message.text : [...tenantMessages].reverse().find((x) => !isLanguageNeutral(x)) ?? message.text;
    const basisLang: WaLang = basisText === message.text ? lang : waLang(basisText);
    const viewingAsk = await readViewingAsk(phone).catch(() => null);
    // A person at Mkan who typed in this chat (Abdout takes over from the phone): his words are in what the model reads.
    const humans = await humanTurnsFor(input.digits);
    const chat = mergeHumanLines(chatLines(before), humans);
    const lastBot = [...before].reverse().find((m) => m.role === "agent");
    const humanInChat = humans.length > 0 && humans[humans.length - 1]!.at > (lastBot ? Date.parse(lastBot.at) || 0 : 0);
    const said = chat.filter((l) => l.who === "mkan" && !l.text.startsWith("(")).map((l) => l.text);
    const state: DriverState = {
      now: new Date(Date.now() + 2 * 3_600_000).toISOString().replace("T", " ").slice(0, 16) + " (Kigali)",
      brief: briefView(t.requirements),
      budgetKnown,
      homesShown: t.shown.map((s, i) => ({ number: i + 1, id: s.id, title: s.title, area: s.district, rent: `${short(s.cost.headline)} a month`, availability: s.availability })),
      earlierHomesShown: Math.max(0, t.shownIds.size - t.shown.length),
      viewing: viewingAsk || t.lastOffered ? { homeNumber: t.shown.findIndex((s) => s.id === (viewingAsk?.listingId ?? t.lastOffered?.id)) + 1 || null, slotsOffered: t.lastOffered ? t.lastOffered.at.map((a) => viewingLabel(new Date(a), lang)) : [], requested: !!viewingAsk?.proposedAt } : null,
      replyLanguage: replyLanguageOf(basisText, basisLang),
      pick: t.pick ? { number: t.pick.number, id: t.pick.id, title: t.pick.title, how: t.pick.how, sure: t.pick.sure } : null,
      ...(humanInChat ? { humanInChat } : {}),
      refHome: input.refHome ? { code: `K${input.refHome.id}`, found: true, ...(input.refHome.taken ? { taken: true } : {}) } : readHomeRef(message.text) ? { code: `K${readHomeRef(message.text)}`, found: false } : null,
    };
    const toolResults: unknown[] = [];
    const guard = (raw: string) =>
      guardDriverText(raw, {
        allowed: guardNumbers(message.text, before.filter((m) => m.role === "user").map((m) => (m as { text: string }).text), toolResults, state, chat.map((l) => l.text)),
        tenantText: message.text,
        anyConfirmed: t.shown.some((s) => s.availability === "confirmed") || t.checks.some((c) => c.outcome === "confirmed"),
        budgetKnown: budgetKnown || !!t.requirements.maxPrice,
        replyLanguage: state.replyLanguage,
        said,
      });
    await appendTaskEvents(taskId, [["requirements_extracted", "done", { reader: "driver", requirements: t.requirements }]]).catch(() => {});

    const loop = await converse(
      {
        client,
        model: DRIVER_MODEL,
        system: DRIVER_SYSTEM,
        exec: (name, args) => exec(t, name, args),
        guard,
        onUsage: (u) => void recordSpend("agent-drive", u, DRIVER_MODEL),
        onTool: (name, args, result, ms) => {
          toolResults.push(result);
          console.log(`[driver] ${taskId} ${name} ${ms} ms`);
        },
        deadline: started + driverBudgetMs(),
      },
      renderTurn(chat, state, message.text),
    );

    let text: string;
    let raw: string;
    let spent = "model";
    if (loop.ok) {
      text = loop.text;
      raw = loop.raw;
    } else {
      if ("error" in loop && loop.error) await noteFailure(loop.error);
      console.warn(`[driver] ${taskId} failed after ${loop.calls} calls (${loop.tools.join(",") || "no tools"}): ${loop.why}`);
      if (!loop.effects) {
        await undoAppend(taskId, created, message.wa);
        return { kind: "fallback", why: loop.why };
      }
      const d = degraded(t, lang);
      raw = text = d.text || checkText(lang, "retry", "");
      spent = "degraded";
    }

    // Homes asked about before showing but never shown (the model asked a question instead): the list the tenant
    // last saw goes back as it was, with the homes asked about behind it, so "1" and "2" still mean what they meant.
    if (t.verified.size && !t.justShown) {
      const now = await db.agentTask.findUnique({ where: { id: taskId }, select: { shortlist: true } }).catch(() => null);
      const disk = (now?.shortlist as unknown as ShortlistItem[] | null) ?? [];
      const front = t.shown.length ? t.shown.map((s) => disk.find((x) => x.id === s.id) ?? s) : onDisk;
      const behind = t.shown.length >= MAX_HOMES ? disk.filter((x) => t.verified.has(x.id) && !front.some((f) => f.id === x.id) && x.availability !== "rented") : [];
      await db.agentTask.update({ where: { id: taskId }, data: { shortlist: json([...front, ...behind]) } }).catch(() => {});
    }

    const block = t.justShown ? homeLines(t.justShown, lang, publicAppUrl()).join("\n\n") : null;
    const reply = composeReply(text, block, raw);
    const note: DriverNote = { said: reply, driver: true, ...(t.justShown ? { shownIds: t.justShown.map((s) => s.id) } : {}), ...(t.offered ? { offered: { id: t.offered.id, at: t.offered.at } } : {}) };
    const agentMessage: AgentMessage = t.justShown
      ? { role: "agent", kind: "shortlist", count: t.justShown.length, text, at: new Date().toISOString(), ...note }
      : { role: "agent", kind: "answer", topic: "other", text: reply, at: new Date().toISOString(), ...note };
    // Kinyarwanda written by the model waits for a native speaker's read, like the writer's (pnpm agent:rw-samples).
    if (state.replyLanguage === "Kinyarwanda" && loop.ok) void noteRwSamples(taskId, [{ kind: "reply", text: reply, passed: true }]);
    t.events.push(["reply_written", "done", { tool: "reply", via: spent, calls: loop.calls, tools: loop.tools, ms: Date.now() - started }]);
    await appendTaskEvents(taskId, t.events).catch((err) => console.warn(`[driver] events not written: ${(err as Error).message}`));
    const fresh = await db.agentTask.findUnique({ where: { id: taskId }, select: { shortlist: true } });
    await db.$executeRaw`UPDATE "AgentTask" SET "messages" = "messages" || ${JSON.stringify([agentMessage])}::jsonb, "requirements" = ${JSON.stringify(t.requirements)}::jsonb, "status" = ${restingStatus(fresh?.shortlist)}::"AgentTaskStatus", "updatedAt" = now() WHERE "id" = ${taskId}`;
    let media: HomeMedia[] = [];
    if (t.justShown) {
      const view = await loadTask(input.viewer, taskId).catch(() => null);
      media = view ? homeMedia(view, lang, publicAppUrl()) : [];
    }
    return { kind: "reply", reply, taskId, media };
  } catch (err) {
    console.error(`[driver] ${taskId} threw: ${(err as Error).message}`);
    // Nothing is known to have happened: take the message back and let the pipeline answer.
    await undoAppend(taskId, created, message.wa).catch(() => {});
    return { kind: "fallback", why: `threw: ${(err as Error).message}` };
  }
}
