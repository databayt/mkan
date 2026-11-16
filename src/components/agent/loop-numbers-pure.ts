/**
 * The numbers with what each one means (2026-11-15). Abdout reads them on his phone — the word `numbers`,
 * and Sunday 20:00 with the schedule — so each line says three things: the number, what it means, and what
 * to do when it crosses its threshold. Real people only, the last 7 days. Counted by the funnel code that
 * /monetize and `pnpm agent:funnel` already use (chat-funnel-pure.ts funnelTable): this file only words it.
 *
 * Pure: the reading is loop-numbers.ts.
 */
import { funnelTable, median, type ChatFacts, type ChatStage } from "@/lib/monetize/chat-funnel-pure";
import { INBOUND_TARGET_PER_WEEK, type ChannelInbound, type InboundOverview } from "@/lib/monetize/inbound-pure";

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** The plan's thresholds. */
export const T = {
  /** shown → picked below this: the homes shown are not the ones they want. */
  pickedMin: 0.2,
  /** the broker's median answer slower than this many hours: ask the next broker. */
  brokerHours: 24,
  yesToBookedMin: 0.5,
  bookedToViewedMin: 0.7,
  /** signed → paid slower than this many days: chase the share. */
  paidDays: 7,
  /** rent under which a deal nets negative: lean to homes from here up. */
  leanRent: 700_000,
  /** the pivot: this many real WhatsApp tenants … */
  pivotTenants: 20,
  /** … by this day, with at least one viewing. */
  pivotBy: "2026-11-29",
  paidGoal: 10,
} as const;

export interface DealMoney {
  mkanShare: number | null;
  tripCost: number | null;
  paidAt: Date | null;
}

export interface NumbersInput {
  now: Date;
  /** Real people's chats from the last 30 days (loadChatFacts); the 7-day window is cut here. */
  chats: ChatFacts[];
  /** PAID deals, any time (the net per deal is read from the last 7 days, falling back to all). */
  paidDeals: DealMoney[];
  /** Chats of the window whose tenant quoted a K-code. */
  quoting: number;
}

export interface NumberLine {
  key: string;
  /** "Shown → picked: 3 of 9 (33%)". */
  text: string;
  /** What it means, in a sentence. */
  meaning: string;
  /** What to do — only when it crossed its threshold. */
  action: string | null;
}

const pct = (k: number, n: number) => `${Math.round((k / n) * 100)}%`;
const hoursText = (ms: number) => (ms < HOUR ? `${Math.max(1, Math.round(ms / 60_000))} min` : ms < 10 * HOUR ? `${Math.round(ms / HOUR * 10) / 10} h` : `${Math.round(ms / HOUR)} h`);
const rwf = (n: number) => `RWF ${Math.round(n).toLocaleString("en-US")}`;

/** The wait between two stamps, median over chats that have both. */
function waitMs(chats: ChatFacts[], from: ChatStage, to: ChatStage): number | null {
  return median(
    chats.flatMap((c) => {
      const a = c.at[from];
      const b = c.at[to];
      return a && b && b.getTime() >= a.getTime() ? [b.getTime() - a.getTime()] : [];
    }),
  );
}

export function numbersLines(input: NumbersInput): NumberLine[] {
  const { now } = input;
  const since = now.getTime() - 7 * DAY;
  const wa = input.chats.filter((c) => c.channel === "wa");
  const week = wa.filter((c) => (c.at.chat?.getTime() ?? 0) >= since);
  const rows = new Map(funnelTable(week).map((r) => [r.stage, r]));
  const n = (s: ChatStage) => rows.get(s)?.n ?? 0;
  const lines: NumberLine[] = [];
  const step = (key: string, label: string, k: number, of: number, meaning: string, bad: boolean, action: string, extra = ""): void => {
    lines.push(
      of === 0
        ? { key, text: `${label}: no data yet`, meaning, action: null }
        : { key, text: `${label}: ${k} of ${of} (${pct(k, of)})${extra}`, meaning, action: bad ? action : null },
    );
  };

  lines.push({
    key: "tenants",
    text: `Real WhatsApp tenants: ${week.length}`,
    meaning: "People who wrote to the line this week — not the team, not your contacts.",
    action: null,
  });
  step("picked", "Shown → picked", n("pick"), n("homes"), "Of the tenants shown homes, how many chose one.", n("homes") > 0 && n("pick") / n("homes") < T.pickedMin, "Stock or price mismatch: look at what they asked for against the homes shown, and widen the stock.");

  const yesWait = waitMs(week, "asked", "yes");
  const slow = yesWait != null && yesWait > T.brokerHours * HOUR;
  step("yes", "Picked → broker yes", n("yes"), n("pick"), "Brokers who said the home is free; the wait is the median answer time.", slow, `Brokers answer in over ${T.brokerHours} h: ask the next broker on the home sooner.`, yesWait != null ? ` · median ${hoursText(yesWait)}` : "");

  step("booked", "Yes → viewing booked", n("booked"), n("yes"), "Tenants who got a viewing once the broker said yes.", n("yes") > 0 && n("booked") / n("yes") < T.yesToBookedMin, "Call the tenant: the line asks for a time and they go quiet.");
  step("viewed", "Booked → viewed", n("viewed"), n("booked"), "Booked viewings that took place.", n("booked") > 0 && n("viewed") / n("booked") < T.bookedToViewedMin, "Confirm with the tenant and the broker the day before.");
  step("signed", "Viewed → signed", n("signed"), n("viewed"), "Viewings that ended in a lease.", false, "");

  const payWait = waitMs(week, "signed", "paid");
  const payDays = payWait != null ? payWait / DAY : null;
  step("paid", "Signed → paid", n("paid"), n("signed"), "Leases where the broker has paid Mkan's share; the wait is the median.", payDays != null && payDays > T.paidDays, `Chase the share: the broker has had over ${T.paidDays} days.`, payDays != null ? ` · median ${Math.round(payDays * 10) / 10} d` : "");

  // Net per deal: the share minus what going cost (tripCost), over the deals paid this week, else all of them.
  const recent = input.paidDeals.filter((d) => d.paidAt && d.paidAt.getTime() >= since);
  const pool = recent.length ? recent : input.paidDeals;
  const nets = pool.filter((d) => d.mkanShare != null).map((d) => (d.mkanShare ?? 0) - (d.tripCost ?? 0));
  if (nets.length === 0) {
    lines.push({ key: "net", text: "Net per deal: no paid deal yet", meaning: "Mkan's share minus what the trip cost (cost K5811 3000).", action: null });
  } else {
    const avg = Math.round(nets.reduce((a, b) => a + b, 0) / nets.length);
    lines.push({
      key: "net",
      text: `Net per deal: ${rwf(avg)} over ${nets.length} paid ${nets.length === 1 ? "deal" : "deals"}${recent.length ? "" : " (all time)"}`,
      meaning: "Mkan's share minus what the trip cost. Below zero, every deal loses money.",
      action: avg < 0 ? `Lean to homes from ${rwf(T.leanRent)} a month: the share is a percent of the commission.` : null,
    });
  }

  const paidTotal = input.paidDeals.length;
  lines.push({
    key: "paid-goal",
    text: `Paid deals: ${paidTotal}/${T.paidGoal}`,
    meaning: paidTotal < T.paidGoal ? "You stay in the loop on every deal until the 10th is paid; after that the feed is a digest." : "The 10 are paid: the feed is a digest now.",
    action: null,
  });
  lines.push({
    key: "quoting",
    text: `Chats quoting a K-code: ${input.quoting}`,
    meaning: "Tenants who came with a home's code from a post — the TikTok to chat link working.",
    action: null,
  });

  // The pivot gate: 20 real WhatsApp tenants by 29 Nov, with a viewing — over everything the data holds, not the week.
  const viewings = wa.filter((c) => c.at.booked).length;
  const left = Math.ceil((Date.parse(`${T.pivotBy}T23:59:59+02:00`) - now.getTime()) / DAY);
  const met = wa.length >= T.pivotTenants && viewings >= 1;
  lines.push({
    key: "pivot",
    text: `Pivot gate: ${wa.length}/${T.pivotTenants} tenants, ${viewings} ${viewings === 1 ? "viewing" : "viewings"} (by ${T.pivotBy})`,
    meaning: met ? "The gate is met." : left >= 0 ? `${left} days left to reach ${T.pivotTenants} real tenants with at least one viewing.` : "The date has passed without the gate being met.",
    action: !met && left < 0 ? "Pivot: the line did not bring tenants in time — decide what changes." : !met && left <= 7 ? "A week left: push the posts that quote a K-code." : null,
  });
  return lines;
}

// ── Inbound: the number that decides everything now (Abdout, 2026-11-16) ──────────────────────────
// New people reaching Mkan, web alone and WhatsApp alone, 7 a week. It goes FIRST in the Sunday message and
// again on Monday's #mkan card — weekly warnings only, no daily alerts.

/** A step that fell by at least this share against last week is "the one that moved". */
export const INBOUND_FALL = 0.3;

/** The first day SiteSignal counted: before it the upstream numbers are zero because nothing counted, not because nobody came. */
export const INBOUND_COUNTING_SINCE = "16 Nov";

/** A fall of `last` → `now` by at least 30%, as the rounded percent; null when it held or there was no baseline. */
function fell(now: number | null | undefined, last: number | null | undefined): number | null {
  if (!last || last <= 0 || now == null) return null;
  const drop = (last - now) / last;
  return drop >= INBOUND_FALL ? Math.round(drop * 100) : null;
}

const upstreamZero = (c: ChannelInbound) => {
  const u = [c.upstream.week, c.upstream.lastWeek];
  return u.every((x) => !x.reach && !x.intent && !x.tiktokViews);
};

/**
 * What moved upstream, in words: the first step down the road that fell 30% or more against last week.
 * Web walks visitors → opened the chat → people who wrote; WhatsApp walks TikTok views → taps → people who wrote.
 */
export function inboundMoved(o: InboundOverview): string[] {
  if (upstreamZero(o.web) && upstreamZero(o.wa)) return [`Upstream counting started ${INBOUND_COUNTING_SINCE}: nothing to compare yet.`];
  const reach = "fewer people saw us: the problem is reach, not the chat";
  const lines: string[] = [];
  const w = o.web;
  const web =
    ((p) => (p != null ? `Web visitors fell ${p}% → ${reach}.` : null))(fell(w.upstream.week.reach, w.upstream.lastWeek.reach)) ??
    ((p) => (p != null ? `Web chat opens fell ${p}% while visitors held → people came but didn't open the chat: the pages' call to action.` : null))(fell(w.upstream.week.intent, w.upstream.lastWeek.intent)) ??
    ((p) => (p != null ? `Web people fell ${p}% while chat opens held → they opened the chat but didn't write: the first screen.` : null))(fell(w.week, w.lastWeek));
  lines.push(web ?? "Web: nothing fell by 30% or more.");
  const a = o.wa;
  const wa =
    ((p) => (p != null ? `TikTok views fell ${p}% → ${reach}.` : null))(fell(a.upstream.week.tiktokViews, a.upstream.lastWeek.tiktokViews)) ??
    ((p) => (p != null ? `WhatsApp taps fell ${p}% → ${reach}.` : null))(fell(a.upstream.week.reach, a.upstream.lastWeek.reach)) ??
    ((p) => (p != null ? `WhatsApp people fell ${p}% while taps held → people tapped but didn't write: the WhatsApp door.` : null))(fell(a.week, a.lastWeek));
  lines.push(wa ?? "WhatsApp: nothing fell by 30% or more.");
  return lines;
}

const sourcesText = (c: ChannelInbound) => (c.sources.length ? c.sources.slice(0, 3).map((s) => `${s.source} ${s.n}`).join(", ") : "none");

/** `rate` is a share (0.32) from the funnel; a value above 1 is already a percent. */
const ratePct = (r: number) => `${Math.round(r <= 1 ? r * 100 : r)}%`;

/** The inbound block, as lines. Null = the loader could not read it: say so, never print zeros that look real. */
export function inboundBlock(o: InboundOverview | null): string[] {
  if (!o) return ["Inbound: inbound numbers not ready."];
  const target = o.total.target || INBOUND_TARGET_PER_WEEK;
  const bn = o.bottleneck;
  const label = (k: string) => k.replace(/[_-]+/g, " ");
  return [
    `People reaching us this week: ${o.total.week} of ${target} (last week ${o.total.lastWeek})`,
    `Web: ${o.web.week} (last week ${o.web.lastWeek}) · → WhatsApp ${o.web.movedToWa}`,
    `WhatsApp: ${o.wa.week} (last week ${o.wa.lastWeek})`,
    ...inboundMoved(o).map((l) => `Moved: ${l}`),
    `Bottleneck: ${label(bn.now)}${bn.next ? ` · next: ${label(bn.next)}${bn.nextRate != null ? ` ${ratePct(bn.nextRate)}` : ""}` : ""}`,
    "Sources this week:",
    `• Web: ${sourcesText(o.web)}`,
    `• WhatsApp: ${sourcesText(o.wa)}`,
  ];
}

/**
 * The full report for his phone: the inbound block first (when `inbound` is passed, null included), then every
 * line with its meaning, and the action where one fired.
 */
export function numbersMessage(lines: NumberLine[], title = "Numbers — the last 7 days", inbound?: InboundOverview | null): string {
  const body = lines.map((l) => `• ${l.text}\n  ${l.meaning}${l.action ? `\n  → ${l.action}` : ""}`);
  const head = inbound === undefined ? [] : [...inboundBlock(inbound), ""];
  return [...head, title, ...body].join("\n");
}

/** One line for an empty day: the number that matters most, and the first thing to act on. */
export function numbersShort(lines: NumberLine[]): string {
  const get = (k: string) => lines.find((l) => l.key === k)?.text;
  const act = lines.find((l) => l.action);
  return [get("tenants"), get("paid-goal")].filter(Boolean).join(" · ") + (act ? ` · act: ${act.action}` : "");
}
