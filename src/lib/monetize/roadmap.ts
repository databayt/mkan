/**
 * The road to money — every sprint from the first paid deal to a chatbot that pays Databayt's burn
 * (Abdout, 2026-11-07: "plan every sprint needed, every task needed"). Pure data + helpers, read by
 * /monetize (the road) and by the sprint planner (scripts/sprint-cycle.ts): each new WEEK sprint is
 * planned from its roadmap entry, adapted to that day's numbers and lessons, and a sprint whose work is
 * done early pulls the next entry's tasks forward. The planner extends this file when fewer than
 * three sprints are left ahead (a commit like any other).
 *
 * Every task names a live metric key (scripts/sprint/live.ts → readMetrics) so the loop can measure it.
 * `gate` is the one thing Abdout decides: the unattended run prepares everything, then stops blocked
 * with that ask — it never sends, books or moves money itself.
 */
import { USD_TO_RWF } from "./costs";

export type RoadBlock = "scrape" | "enhance" | "post" | "chat" | "cost";

export interface RoadTask {
  title: string;
  block: RoadBlock;
  metric: string;
  /** What to do, in one or two sentences. */
  do: string;
  doneWhen: string;
  /** Abdout's one decision or step, when there is one. */
  gate?: string;
}

export interface RoadSprint {
  key: string;
  /** Monday → next Monday, UTC (the loop's week window). */
  startsAt: string;
  endsAt: string;
  title: string;
  goal: string;
  /** The number the sprint is judged by. */
  metric: string;
  tasks: RoadTask[];
}

export interface RoadMonth {
  /** YYYY-MM */
  month: string;
  /** Revenue target as a multiple of break-even. */
  breakEvenX: number;
  goal: string;
}

/** The money ladder, in received money per month. The second rung is the live break-even. */
export const RUNGS = [
  { key: "M1", usd: 0, label: "first" },
  { key: "M2", usd: null, label: "breakEven" },
  { key: "M3", usd: 100, label: "plan" },
  { key: "M4", usd: 500, label: "burn" },
] as const;
export type RungLabel = (typeof RUNGS)[number]["label"];

export const ROADMAP: RoadSprint[] = [
  {
    key: "S1",
    startsAt: "2026-11-02",
    endsAt: "2026-11-09",
    title: "First paid deal",
    goal: "One tenant from a Mkan chat signs a home, and Mkan's share is recorded.",
    metric: "paidDeals",
    tasks: [],
  },
  {
    key: "S2",
    startsAt: "2026-11-09",
    endsAt: "2026-11-16",
    title: "A viewing on a home that pays",
    goal: "One viewing booked on a home whose broker agreed Mkan's share.",
    metric: "viewingsBooked",
    tasks: [
      {
        title: "Share terms brokers can say yes to",
        block: "chat",
        metric: "viewingsBooked",
        do: "Draft the share in one line in English and Kinyarwanda (50% of the broker's commission, at least 20,000 RWF), make the booking script default its share from Broker.sharePct / shareFlatRwf so a PAID deal records Mkan's money by itself, and list the 10 brokers with the most live homes who answered before.",
        doneWhen: "the code is on main with a test, and docs/broker-share-2026-11.md holds the text and the 10 brokers",
        gate: "approve the share text and say send",
      },
      {
        title: "Web chats reach WhatsApp",
        block: "chat",
        metric: "waChats",
        do: "When /find is about to ask a broker, ask the tenant for a WhatsApp number first, so the broker's answer reaches someone (4 of 4 'available' answers last week reached nobody).",
        doneWhen: "a web tenant who gives a number gets the broker's answer on WhatsApp, proven by pnpm wa:e2e",
      },
      {
        title: "The 48-hour rule",
        block: "chat",
        metric: "viewingsBooked",
        do: "When a broker says available, send the tenant the deal sheet within the hour and one nudge at 24 h (warm leads went cold in a week).",
        doneWhen: "the rule is in code behind a switch, with a test",
        gate: "say yes to the automatic deal sheet and nudge",
      },
      {
        title: "Book a viewing with one tap",
        block: "chat",
        metric: "viewingsBooked",
        do: "When a tenant names a time, prepare the exact booking (home, tenant, broker, time, terms, share) and put it on /monetize as a Yes / No decision.",
        doneWhen: "a prepared booking shows as a decision and Yes books it",
        gate: "tap Yes on each booking",
      },
      {
        title: "Search keeps the area (mkan#54)",
        block: "chat",
        metric: "shortlistRate",
        do: "A search that names an area returns homes in that area, and the photo tour opens.",
        doneWhen: "issue #54's cases pass on production",
      },
      {
        title: "WhatsApp chats read again",
        block: "scrape",
        metric: "brokersNewWeek",
        do: "wa:chats fails with EPERM under the Hermes gateway; find the exact binary that needs Full Disk Access.",
        doneWhen: "the demand job reads WhatsApp chats again",
        gate: "add the binary to Full Disk Access",
      },
    ],
  },
  {
    key: "S3",
    startsAt: "2026-11-16",
    endsAt: "2026-11-23",
    title: "First money in",
    goal: "The first Rwandan franc is received and recorded.",
    metric: "revenueMonthRwf",
    tasks: [
      {
        title: "Walk the viewing to paid",
        block: "chat",
        metric: "paidDeals",
        do: "Follow the booked viewing through viewed → signed → paid with the tenant's own words, and ask the broker for Mkan's share on signing.",
        doneWhen: "the deal is PAID and its COMMISSION entry shows on /monetize",
        gate: "confirm the money arrived",
      },
      {
        title: "A MoMo number on every share ask",
        block: "chat",
        metric: "revenueMonthRwf",
        do: "Put Mkan's mobile-money pay number and the amount in the broker's share message, and record a payment with one admin tap.",
        doneWhen: "the share message carries the number and a test payment records",
        gate: "give Mkan's MoMo pay number",
      },
      {
        title: "Offer the broker subscription",
        block: "chat",
        metric: "revenueMonthRwf",
        do: "Turn docs/broker-subscription.md into the offer: recommend the first 2 leads free instead of a free month, so cash lands in November; pick the 5 brokers.",
        doneWhen: "the offer and the 5 brokers are ready to send",
        gate: "approve the price and the send",
      },
      {
        title: "Brokers answer: 15% → 30%",
        block: "chat",
        metric: "brokerAnswerRate",
        do: "Ask in Kinyarwanda first, nudge once after 2 daytime hours, and ask the brokers who answered before first.",
        doneWhen: "the change is live and the 7-day answer rate is measured",
      },
      {
        title: "200 views a post",
        block: "post",
        metric: "viewsPerPost",
        do: "Judge the spread-posting experiment and pin a short 'how to rent with Mkan' video.",
        doneWhen: "the experiment is closed with its result",
      },
      {
        title: "Three clean videos ready a day ahead",
        block: "enhance",
        metric: "videosClean",
        do: "Keep three stripped-clean listing videos rendered a day before they post.",
        doneWhen: "seven days in a row start with three ready",
      },
    ],
  },
  {
    key: "S4",
    startsAt: "2026-11-23",
    endsAt: "2026-11-30",
    title: "Break-even November",
    goal: "Money received in November covers every cost on /monetize.",
    metric: "revenueMonthRwf",
    tasks: [
      {
        title: "Shortlists lead with homes that pay",
        block: "chat",
        metric: "viewingsBooked",
        do: "Rank homes whose broker agreed a share, and rents of 200,000 RWF and up, first in the shortlist.",
        doneWhen: "the ranking is live with a test",
      },
      {
        title: "Run without the always-on container",
        block: "cost",
        metric: "costMonthRwf",
        do: "Rebuild the OpenNext lane from the parked stash, prove it with pnpm wa:e2e and pnpm deal:e2e on a staging Worker, then switch (about $29 a month saved).",
        doneWhen: "production runs without the container and every check passes",
        gate: "say yes or no to going containerless",
      },
      {
        title: "Costs from invoices",
        block: "cost",
        metric: "costMonthRwf",
        do: "Replace the estimated fixed costs with the real bills.",
        doneWhen: "the page says the costs come from invoices",
        gate: "store the real monthly bills in the Keychain",
      },
      {
        title: "The same videos on Instagram and Facebook",
        block: "post",
        metric: "viewsPerPost",
        do: "Cross-post every clean video to Instagram and Facebook Reels with the same caption.",
        doneWhen: "a day's three videos are on all three pages",
        gate: "connect the Instagram and Facebook pages once",
      },
      {
        title: "Twenty people write a week",
        block: "chat",
        metric: "people",
        do: "Find where tenants drop before writing (post → profile → WhatsApp) and fix the weakest step.",
        doneWhen: "people who wrote reaches 20 in 7 days, or the fix is live with the reason",
      },
    ],
  },
  {
    key: "S5",
    startsAt: "2026-11-30",
    endsAt: "2026-12-07",
    title: "Deals repeat",
    goal: "Two deals a week in the pipeline; every step automatic except the money.",
    metric: "viewingsBooked",
    tasks: [
      { title: "The deal pipeline on /monetize", block: "chat", metric: "viewingsBooked", do: "Show each live deal, its next step and the days it has waited (admins only).", doneWhen: "every live deal shows with its next step" },
      { title: "'We signed' read from the tenant", block: "chat", metric: "paidDeals", do: "Read a signing from the tenant's words, ask the broker for the share, and offer Abdout one tap to mark it paid.", doneWhen: "a signed deal reaches a paid decision without a session" },
      { title: "A broker scorecard", block: "chat", metric: "brokerAnswerRate", do: "Score brokers by answers, agreed share and deals; silent ones stop getting asks.", doneWhen: "the ask order follows the scorecard" },
    ],
  },
  {
    key: "S6",
    startsAt: "2026-12-07",
    endsAt: "2026-12-14",
    title: "Brokers pay monthly",
    goal: "Three brokers pay a monthly subscription.",
    metric: "revenueMonthRwf",
    tasks: [
      { title: "The subscription in code", block: "chat", metric: "revenueMonthRwf", do: "Subscribers, leads matched to their zones, receipts and renewal reminders; SUBSCRIPTION money on the page.", doneWhen: "a subscriber gets a matched lead and a receipt" },
      { title: "Offer it to ten more brokers", block: "chat", metric: "revenueMonthRwf", do: "Pick the next 10 by homes, answers and zone demand and prepare the offer.", doneWhen: "the offers are ready", gate: "approve the batch" },
    ],
  },
  {
    key: "S7",
    startsAt: "2026-12-14",
    endsAt: "2026-12-21",
    title: "Sell the chatbot",
    goal: "One agency signs a licence pilot for the Mkan agent.",
    metric: "revenueMonthRwf",
    tasks: [
      { title: "The licence offer", block: "chat", metric: "revenueMonthRwf", do: "Price the agent for an agency (their listings answered on WhatsApp day and night) and write the one-page offer.", doneWhen: "the offer and price are written", gate: "approve the price" },
      { title: "A demo of the agent", block: "chat", metric: "people", do: "A short screen recording of a real chat from question to booked viewing.", doneWhen: "the demo is ready to send" },
      { title: "Agency mode", block: "chat", metric: "chats", do: "Let the agent run on one agency's own listings and number.", doneWhen: "a test agency gets answers from its own listings only" },
      { title: "Pitch ten agencies", block: "chat", metric: "revenueMonthRwf", do: "Pick 10 agencies from the directory that use WhatsApp and prepare each message.", doneWhen: "the pitches are ready", gate: "approve the sends" },
    ],
  },
  {
    key: "S8",
    startsAt: "2026-12-21",
    endsAt: "2026-12-28",
    title: "Profit month",
    goal: "December's money covers costs twice, and the next quarter's road is written.",
    metric: "revenueMonthRwf",
    tasks: [
      { title: "Close December's deals", block: "chat", metric: "paidDeals", do: "Walk every live deal to paid or lost.", doneWhen: "no deal waits more than 3 days" },
      { title: "The road to $100 and $500 a month", block: "chat", metric: "revenueMonthRwf", do: "Write the next eight sprints into this roadmap from what paid and what did not.", doneWhen: "the roadmap reaches the end of February" },
    ],
  },
];

export const MONTHS: RoadMonth[] = [
  { month: "2026-11", breakEvenX: 1, goal: "Money received in November covers every cost on /monetize." },
  { month: "2026-12", breakEvenX: 2, goal: "December's money covers every cost twice." },
];

const t = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** The roadmap sprint whose week holds `now`, if any. */
export function roadmapWeek(now = new Date()): RoadSprint | null {
  const x = now.getTime();
  return ROADMAP.find((s) => t(s.startsAt) <= x && x < t(s.endsAt)) ?? null;
}

/** The next `n` roadmap sprints after the one holding `now`. */
export function roadmapNext(now = new Date(), n = 3): RoadSprint[] {
  const x = now.getTime();
  return ROADMAP.filter((s) => t(s.startsAt) > x).slice(0, n);
}

/** Roadmap sprints still ahead (start after now) — the planner extends the file below three. */
export const roadmapAhead = (now = new Date()) => ROADMAP.filter((s) => t(s.startsAt) > now.getTime()).length;

export function roadmapMonth(now = new Date()): RoadMonth | null {
  return MONTHS.find((m) => m.month === now.toISOString().slice(0, 7)) ?? null;
}

export interface RungView {
  key: string;
  label: RungLabel;
  /** The rung's monthly target in RWF (0 for the first: any money at all). */
  targetRwf: number;
  /** 0–1. */
  progress: number;
  reached: boolean;
}

/** The ladder against this month's received money. */
export function rungsView(revenueRwf: number, breakEvenRwf: number): RungView[] {
  return RUNGS.map((r) => {
    const targetRwf = r.label === "breakEven" ? Math.round(breakEvenRwf) : Math.round((r.usd ?? 0) * USD_TO_RWF);
    const reached = targetRwf === 0 ? revenueRwf > 0 : revenueRwf >= targetRwf;
    const progress = targetRwf === 0 ? (revenueRwf > 0 ? 1 : 0) : Math.max(0, Math.min(1, revenueRwf / targetRwf));
    return { key: r.key, label: r.label, targetRwf, progress, reached };
  });
}

/** A roadmap task as the prompt an unattended session runs (the planner may rewrite it). */
export function roadTaskPrompt(task: RoadTask, sprint: RoadSprint): string {
  const gate = task.gate
    ? ` This needs Abdout to ${task.gate}: do all the preparation, then stop and report blocked with exactly that ask — never send, book or move money yourself.`
    : "";
  return (
    `In ~/mkan (roadmap ${sprint.key} "${sprint.title}" — ${sprint.goal}): ${task.do} Done when ${task.doneWhen}.${gate} ` +
    `Report the before/after of ${task.metric}, then run pnpm sprint:done <this prompt's id> --metric=${task.metric} --lesson="what moved it, or why not".`
  );
}
