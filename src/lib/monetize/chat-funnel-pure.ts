/**
 * The chat funnel, chat by chat (Abdout, 2026-11-14: "track the math and root causes").
 *
 * The scorecard (scorecard.ts) counts the road in totals; this reads every chat on it: the furthest
 * stage it reached, when, and — for a chat that stopped — where it stopped and who it is waiting on.
 * A stop that waits on the line is a bug (the 12 Nov pick that ended on "a person will reply"); one
 * that waits on a broker or a tenant is a rate to move. Pure: facts in, table out — the loader
 * (chat-funnel.ts) reads, `pnpm mkan:read funnel` prints, `pnpm funnel:review` judges.
 */
export const CHAT_STAGES = ["chat", "homes", "pick", "asked", "yes", "time", "booked", "viewed", "signed", "paid"] as const;
export type ChatStage = (typeof CHAT_STAGES)[number];

/** Who a stopped chat is waiting on. `line` is ours to fix in code; `mkan` is a person of ours. */
export type Owner = "tenant" | "broker" | "line" | "mkan" | "none";

export interface ChatFacts {
  /** The task id — never a phone number. */
  id: string;
  channel: "wa" | "web";
  /** tiktok | k_page | organic | web */
  source: string;
  lang: string;
  /** The monthly rent in question: the picked home's, else the budget. */
  rent: number | null;
  /** When each stage was first reached. A later stage implies the earlier ones. */
  at: Partial<Record<ChatStage, Date>>;
  lastTenantAt: Date | null;
  /** The broker said the picked home is taken. */
  taken?: boolean;
  /** The viewing's time, when one is booked. */
  viewingAt?: Date | null;
  /** The deal was closed as lost (Deal.status LOST), with the reason on record. */
  lost?: { at: Date; reason: string | null } | null;
}

export const stageIndex = (s: ChatStage) => CHAT_STAGES.indexOf(s);

/** The furthest stage with a stamp. */
export function furthest(f: ChatFacts): ChatStage {
  for (let i = CHAT_STAGES.length - 1; i > 0; i--) if (f.at[CHAT_STAGES[i]!]) return CHAT_STAGES[i]!;
  return "chat";
}

/** Wilson 95% interval for k of n — honest at the small counts this funnel has. */
export function wilson(k: number, n: number): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 1 };
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const mid = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (mid - half) / d), hi: Math.min(1, (mid + half) / d) };
}

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface StageRow {
  stage: ChatStage;
  /** Chats that reached this stage or a later one. */
  n: number;
  /** Share of the stage before that got here; null on the first row or when nothing got that far. */
  rate: number | null;
  lo: number | null;
  hi: number | null;
  /** Median time from the stage before, among chats with both stamps. */
  medianMs: number | null;
}

export function funnelTable(chats: ChatFacts[]): StageRow[] {
  const reached = chats.map((c) => stageIndex(furthest(c)));
  return CHAT_STAGES.map((stage, i) => {
    const n = reached.filter((r) => r >= i).length;
    if (i === 0) return { stage, n, rate: null, lo: null, hi: null, medianMs: null };
    const before = reached.filter((r) => r >= i - 1).length;
    const prev = CHAT_STAGES[i - 1]!;
    const waits = chats.flatMap((c) => {
      const a = c.at[prev];
      const b = c.at[stage];
      return a && b && b.getTime() >= a.getTime() ? [b.getTime() - a.getTime()] : [];
    });
    if (!before) return { stage, n, rate: null, lo: null, hi: null, medianMs: median(waits) };
    const { lo, hi } = wilson(n, before);
    return { stage, n, rate: n / before, lo, hi, medianMs: median(waits) };
  });
}

/** Where a chat that has not paid stands, and who it waits on. */
export interface Stop {
  id: string;
  stage: ChatStage;
  cause: StopCause;
  owner: Owner;
  /** Hours since the stage was reached (or the tenant last wrote, when later). */
  hours: number;
  reason?: string | null;
}

export type StopCause =
  | "no-homes" // wrote, and no homes were shown
  | "no-pick" // saw homes, picked none
  | "not-asked" // picked a home, and no broker was asked
  | "waiting-broker" // asked under a day ago
  | "broker-silent" // asked over a day ago, no answer
  | "home-taken" // the broker said it is gone
  | "no-time" // the broker said yes, the tenant named no time
  | "not-booked" // the tenant named a time, nothing is booked
  | "viewing-ahead" // booked, the day has not come
  | "viewing-unrecorded" // the viewing's time passed and nobody recorded how it went
  | "after-viewing" // viewed, not signed
  | "share-unpaid" // signed, Mkan's share not in
  | "lost"; // closed as lost

const HOUR = 3_600_000;
/** A broker asked this long ago without an answer is silent, not slow. */
export const BROKER_SILENT_H = 24;
/** A pick with no ask this long after it is the line's fault, not a queue. */
export const NOT_ASKED_H = 1;
/** A named time with no booking this long after it. */
export const NOT_BOOKED_H = 24;

const OWNER: Record<StopCause, Owner> = {
  "no-homes": "line",
  "no-pick": "tenant",
  "not-asked": "line",
  "waiting-broker": "broker",
  "broker-silent": "broker",
  "home-taken": "broker",
  "no-time": "tenant",
  "not-booked": "line",
  "viewing-ahead": "none",
  "viewing-unrecorded": "mkan",
  "after-viewing": "tenant",
  "share-unpaid": "broker",
  lost: "none",
};

/** null for a paid chat: nothing stopped. */
export function stopOf(f: ChatFacts, now: Date): Stop | null {
  const stage = furthest(f);
  if (stage === "paid") return null;
  const since = Math.max(f.at[stage]?.getTime() ?? 0, 0) || f.lastTenantAt?.getTime() || now.getTime();
  const hours = Math.max(0, (now.getTime() - since) / HOUR);
  const make = (cause: StopCause, extra: Partial<Stop> = {}): Stop => ({ id: f.id, stage, cause, owner: OWNER[cause], hours, ...extra });
  if (f.lost) return make("lost", { reason: f.lost.reason, hours: Math.max(0, (now.getTime() - f.lost.at.getTime()) / HOUR) });
  switch (stage) {
    case "chat":
      return make("no-homes");
    case "homes":
      return make("no-pick");
    case "pick":
      // Under the hour the ask may still be in the outbox (quiet hours, the broker's daily cap).
      return hours < NOT_ASKED_H ? make("waiting-broker") : make("not-asked");
    case "asked":
      if (f.taken) return make("home-taken");
      return hours < BROKER_SILENT_H ? make("waiting-broker") : make("broker-silent");
    case "yes":
      return make("no-time");
    case "time":
      return hours < NOT_BOOKED_H ? make("waiting-broker") : make("not-booked");
    case "booked":
      return f.viewingAt && f.viewingAt.getTime() > now.getTime() ? make("viewing-ahead") : make("viewing-unrecorded");
    case "viewed":
      return make("after-viewing");
    default:
      return make("share-unpaid");
  }
}

export interface StopCount {
  cause: StopCause;
  owner: Owner;
  stage: ChatStage;
  n: number;
}

/** Stops grouped, the biggest first; a tie goes to the later stage (closer to money). */
export function stopCounts(stops: Stop[]): StopCount[] {
  const by = new Map<StopCause, StopCount>();
  for (const s of stops) {
    const row = by.get(s.cause) ?? { cause: s.cause, owner: s.owner, stage: s.stage, n: 0 };
    row.n++;
    by.set(s.cause, row);
  }
  return [...by.values()].sort((a, b) => b.n - a.n || stageIndex(b.stage) - stageIndex(a.stage));
}

/**
 * The one stop to work on: the line's own stops first (a chat the machine dropped is a bug, and the
 * cheapest to fix), then the largest stop a broker or tenant owns. Chats still moving are left out.
 */
export function worstStop(counts: StopCount[]): StopCount | null {
  const real = counts.filter((c) => c.cause !== "viewing-ahead" && c.cause !== "waiting-broker" && c.cause !== "lost");
  // "no-homes" is the line's too, but most of it is people who wrote about something else.
  const bug = real.filter((c) => c.owner === "line" && c.cause !== "no-homes").sort((a, b) => stageIndex(b.stage) - stageIndex(a.stage))[0];
  return bug ?? real[0] ?? null;
}

export const RENT_BANDS = ["under 200k", "200k–500k", "500k–1M", "over 1M", "unknown"] as const;
export type RentBand = (typeof RENT_BANDS)[number];
export const rentBand = (rent: number | null | undefined): RentBand =>
  rent == null || !(rent > 0) ? "unknown" : rent < 200_000 ? "under 200k" : rent < 500_000 ? "200k–500k" : rent < 1_000_000 ? "500k–1M" : "over 1M";

export interface SplitRow {
  key: string;
  chats: number;
  homes: number;
  pick: number;
  yes: number;
  booked: number;
  paid: number;
}

/** The same road, split by one trait of the chat. */
export function splitBy(chats: ChatFacts[], trait: (c: ChatFacts) => string): SplitRow[] {
  const by = new Map<string, SplitRow>();
  const at = (s: ChatStage) => stageIndex(s);
  for (const c of chats) {
    const key = trait(c);
    const row = by.get(key) ?? { key, chats: 0, homes: 0, pick: 0, yes: 0, booked: 0, paid: 0 };
    const r = stageIndex(furthest(c));
    row.chats++;
    if (r >= at("homes")) row.homes++;
    if (r >= at("pick")) row.pick++;
    if (r >= at("yes")) row.yes++;
    if (r >= at("booked")) row.booked++;
    if (r >= at("paid")) row.paid++;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => b.chats - a.chats || a.key.localeCompare(b.key));
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
export const waitText = (ms: number | null): string => {
  if (ms == null) return "—";
  const m = ms / 60_000;
  return m < 1 ? "under 1 min" : m < 90 ? `${Math.round(m)} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
};

const CAUSE_TEXT: Record<StopCause, string> = {
  "no-homes": "wrote, and were shown no homes",
  "no-pick": "saw homes and picked none",
  "not-asked": "picked a home and no broker was asked",
  "waiting-broker": "waiting on a broker, under a day",
  "broker-silent": "broker silent for over a day",
  "home-taken": "the home was already taken",
  "no-time": "broker said yes, tenant named no time",
  "not-booked": "tenant named a time, nothing booked",
  "viewing-ahead": "viewing booked, day not here yet",
  "viewing-unrecorded": "viewing time passed, outcome not recorded",
  "after-viewing": "viewed, not signed",
  "share-unpaid": "signed, Mkan's share not in",
  lost: "closed as lost",
};
export const causeText = (c: StopCause) => CAUSE_TEXT[c];

/** The whole read as lines of text: no phone, no name, no message words. */
export function funnelLines(chats: ChatFacts[], now: Date, days: number): string[] {
  const out: string[] = [`Chat funnel, last ${days} d: ${chats.length} real chat(s) (${chats.filter((c) => c.channel === "wa").length} WhatsApp, ${chats.filter((c) => c.channel === "web").length} web)`];
  if (!chats.length) return out;
  out.push("", "stage      chats   from the stage before        median wait");
  for (const r of funnelTable(chats)) {
    const rate = r.rate == null ? "" : `${pct(r.rate)} (95%: ${pct(r.lo)}–${pct(r.hi)})`;
    out.push(`${r.stage.padEnd(10)} ${String(r.n).padStart(5)}   ${rate.padEnd(27)} ${r.stage === "chat" ? "" : waitText(r.medianMs)}`);
  }
  const stops = chats.map((c) => stopOf(c, now)).filter((s): s is Stop => !!s);
  const counts = stopCounts(stops);
  out.push("", "Where chats stand, and who they wait on:");
  for (const c of counts) out.push(`  ${String(c.n).padStart(4)}  ${causeText(c.cause)}  [${c.owner === "none" ? "nobody" : c.owner}]`);
  const worst = worstStop(counts);
  if (worst) out.push("", `Work on: ${causeText(worst.cause)} — ${worst.n} chat(s), waiting on ${worst.owner === "line" ? "the line (a code fix)" : worst.owner === "mkan" ? "Mkan's person" : `the ${worst.owner}`}.`);
  const table = (title: string, rows: SplitRow[]) => {
    out.push("", `${title.padEnd(12)} chats  homes  pick  yes  booked  paid`);
    for (const r of rows) out.push(`${r.key.padEnd(12)} ${String(r.chats).padStart(5)}  ${String(r.homes).padStart(5)}  ${String(r.pick).padStart(4)}  ${String(r.yes).padStart(3)}  ${String(r.booked).padStart(6)}  ${String(r.paid).padStart(4)}`);
  };
  table("By source", splitBy(chats, (c) => c.source));
  table("By language", splitBy(chats, (c) => c.lang));
  table("By rent", splitBy(chats, (c) => rentBand(c.rent)));
  return out;
}

/** One chat as the database holds it (chat-funnel.ts maps the rows; no phone, no words). */
export interface TaskRow {
  id: string;
  /** One person, however many chats: the funnel counts people. */
  profileId: string | null;
  wa: boolean;
  source: string | null;
  lang: string;
  createdAt: Date;
  messages: { role?: string; kind?: string; count?: number; checked?: string; at?: string }[];
  /** The budget the tenant gave, monthly. */
  budget: number | null;
  requests: { consentAt: Date | null; sentAt: Date | null; respondedAt: Date | null; status: string; rent: number | null }[];
  /** When the tenant first named a viewing time. */
  proposedAt: Date | null;
}

export interface DealFacts {
  taskId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  signedAt: Date | null;
  paidAt: Date | null;
  notes: string | null;
  rent: number | null;
  visit: { createdAt: Date; scheduledFor: Date; occurredAt: Date | null } | null;
}

const earliest = (a: Date | undefined, b: Date | null | undefined): Date | undefined => (!b ? a : !a || b.getTime() < a.getTime() ? b : a);
const dateOf = (iso: string | undefined): Date | null => {
  const d = iso ? new Date(iso) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
};

/** People, each with the furthest their chats went. */
export function chatFacts(tasks: TaskRow[], deals: DealFacts[]): ChatFacts[] {
  const byTask = new Map<string, DealFacts[]>();
  for (const d of deals) if (d.taskId) byTask.set(d.taskId, [...(byTask.get(d.taskId) ?? []), d]);
  const people = new Map<string, ChatFacts & { newest: number }>();
  for (const t of [...tasks].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const key = t.profileId ?? t.id;
    const f: ChatFacts & { newest: number } = people.get(key) ?? {
      id: t.id,
      channel: t.wa ? "wa" : "web",
      source: t.source || (t.wa ? "organic" : "web"),
      lang: t.lang,
      rent: null,
      at: {},
      lastTenantAt: null,
      newest: 0,
    };
    // The newest chat names the person's row: it is the one a reader opens.
    if (t.createdAt.getTime() >= f.newest) {
      f.id = t.id;
      f.newest = t.createdAt.getTime();
      f.lang = t.lang;
    }
    const at = f.at;
    for (const m of t.messages) {
      const when = dateOf(m.at);
      if (!when) continue;
      if (m.role === "user") {
        at.chat = earliest(at.chat, when);
        if (!f.lastTenantAt || when.getTime() > f.lastTenantAt.getTime()) f.lastTenantAt = when;
      } else if (m.role === "agent" && m.kind === "shortlist" && (m.count ?? 0) > 0) {
        at.homes = earliest(at.homes, when);
        // A pick the line could not take to a broker leaves no BrokerRequest, only this mark (12 Nov, K5811).
        if (m.checked) at.pick = earliest(at.pick, when);
      }
    }
    at.chat = at.chat ?? t.createdAt;
    for (const r of t.requests) {
      at.pick = earliest(at.pick, r.consentAt);
      at.asked = earliest(at.asked, r.sentAt);
      if (r.respondedAt && r.status === "AVAILABLE") at.yes = earliest(at.yes, r.respondedAt);
      if (r.respondedAt && r.status === "RENTED") f.taken = true;
      if (r.consentAt && r.rent) f.rent = r.rent;
    }
    at.time = earliest(at.time, t.proposedAt);
    for (const d of byTask.get(t.id) ?? []) {
      if (d.rent) f.rent = d.rent;
      if (d.visit) {
        at.booked = earliest(at.booked, d.visit.createdAt);
        f.viewingAt = d.visit.scheduledFor;
      }
      const viewed = ["VIEWED", "SIGNED", "PAID"].includes(d.status);
      if (viewed) at.viewed = earliest(at.viewed, d.visit?.occurredAt ?? d.visit?.scheduledFor ?? d.updatedAt);
      if (d.status === "SIGNED" || d.status === "PAID") at.signed = earliest(at.signed, d.signedAt ?? d.updatedAt);
      if (d.status === "PAID") at.paid = earliest(at.paid, d.paidAt ?? d.updatedAt);
      if (d.status === "LOST") f.lost = { at: d.updatedAt, reason: d.notes?.trim().slice(0, 120) || null };
      else f.lost = null;
    }
    // A home the broker later confirmed is not "taken" for this person.
    if (at.yes) f.taken = false;
    f.rent = f.rent ?? t.budget;
    people.set(key, f);
  }
  return [...people.values()].map((p) => {
    const { newest, ...f } = p;
    void newest;
    return f;
  });
}
