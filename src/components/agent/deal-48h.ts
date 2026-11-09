import "server-only";

/**
 * The 48-hour rule's sweep (deal-48h-pure.ts has the rule). Run by introSweep every quarter hour in the
 * send window. It does nothing while the switch is off — the default — and the switch is Abdout's:
 * `pnpm wa:deal48h on` (or his Yes on /monetize).
 *
 * Who it looks at: a broker's "available" in the last 48 hours for a chat that asked about the home (its own ask, one handed
 * on to a second broker, or one it joined), with a number that reaches them, and no terms ask open (selectAsks). Not a chat whose
 * direct intro is already running (the intro hands over the broker's number and has its own follow-ups).
 */
import { db } from "@/lib/db";
import { scrubTitle } from "@/lib/redact";

import { ALERT_LABEL, inSendWindow, phoneKey } from "../../../scripts/wa/outbox-pure";
import { viewingRep } from "./broker-message";
import { lastTenantAt, reachedAt, TENANT_REACH } from "./broker-gate";
import { sendDealSheet, readViewingAsk } from "./deal";
import { dealNudgeMessage, type DealLang } from "./deal-pure";
import { asOn, DEAL_48H_KEY, plan48h, RULE_WINDOW_MS, selectAsks } from "./deal-48h-pure";
import type { ShortlistItem } from "./types";
import { readState, writeState } from "./wa-state";
import { sendMessages } from "./whatsapp";

export async function deal48hOn(): Promise<boolean> {
  const row = await db.waState.findUnique({ where: { key: DEAL_48H_KEY }, select: { value: true } }).catch(() => null);
  return asOn(row?.value);
}

export async function setDeal48h(on: boolean, by: string): Promise<void> {
  const value = { mode: on ? "on" : "off", by, at: new Date().toISOString() };
  await db.waState.upsert({ where: { key: DEAL_48H_KEY }, create: { key: DEAL_48H_KEY, value }, update: { value } });
}

type Done = { sheetAt?: string; nudgeAt?: string };
const doneKey = (requestId: string) => `deal-48h:${requestId}`;

/** How many messages went out this pass. */
export async function fortyEightSweep(now = new Date()): Promise<number> {
  if (!(await deal48hOn())) return 0;
  const since = new Date(now.getTime() - RULE_WINDOW_MS);
  // Homes a broker said yes to in the window; every AVAILABLE request on them, answered or joined.
  const yes = await db.brokerRequest.findMany({ where: { status: "AVAILABLE", respondedAt: { gte: since } }, select: { listingId: true }, distinct: ["listingId"], take: 100 });
  if (yes.length === 0) return 0;
  const rows = await db.brokerRequest.findMany({
    where: { status: "AVAILABLE", taskId: { not: null }, listingId: { in: yes.map((y) => y.listingId) } },
    select: { id: true, listingId: true, taskId: true, status: true, respondedAt: true },
  });
  // A broker still weighing Mkan's terms is the intro's: the tenant is about to hear "the broker will connect".
  const openTerms = new Set<string>();
  for (const w of await db.waState.findMany({ where: { key: { startsWith: "terms-ask:" } }, select: { value: true } })) {
    const ask = w.value as { listingId?: number; handedAt?: string; tenants?: { taskId: string }[] } | null;
    if (!ask || ask.handedAt) continue;
    for (const t of ask.tenants ?? []) openTerms.add(`${t.taskId}:${ask.listingId}`);
  }
  let n = 0;
  for (const { row: r, answeredAt } of selectAsks(rows, openTerms, now).slice(0, 50)) {
    const task = await db.agentTask.findUnique({ where: { id: r.taskId! }, select: { id: true, locale: true, shortlist: true, messages: true, ...TENANT_REACH } });
    if (!task) continue;
    const reached = reachedAt(task);
    const to = reached.profile.waPhone;
    if (!to) continue;
    const done = await readState<Done>(doneKey(r.id), {});
    const [deal, ask, sheetRow] = await Promise.all([
      db.deal.findFirst({ where: { taskId: task.id, listingId: r.listingId }, select: { id: true } }),
      readViewingAsk(to),
      db.outboundMessage.findFirst({
        where: { to: { in: [`+${phoneKey(to)}`, phoneKey(to)] }, label: ALERT_LABEL.dealSheet, status: { in: ["SENT", "QUEUED"] }, createdAt: { gte: answeredAt } },
        select: { createdAt: true },
      }),
    ]);
    const sheetAt = done.sheetAt ? new Date(done.sheetAt) : (sheetRow?.createdAt ?? null);
    const wrote = lastTenantAt(task.messages);
    const plan = plan48h({
      on: true,
      answeredAt,
      now,
      sheetSent: sheetAt != null,
      nudged: !!done.nudgeAt,
      // A viewing time named, a deal started, or the tenant writing after the sheet: nothing to chase.
      tenantActed: !!deal || !!ask?.proposedAt || (sheetAt != null && wrote != null && wrote > sheetAt),
      inWindow: inSendWindow(now),
    });
    if (plan.do === "sheet") {
      if (await sendDealSheet(reached, r.listingId).catch(() => false)) {
        await writeState(doneKey(r.id), { ...done, sheetAt: now.toISOString() });
        n += 1;
      }
    } else if (plan.do === "nudge") {
      const item = ((task.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === r.listingId);
      const lang: DealLang = task.locale === "ar" || task.locale === "rw" ? task.locale : "en";
      const title = scrubTitle(item?.title) || `K${r.listingId}`;
      await sendMessages([{ kind: "TENANT_ALERT", to, body: dealNudgeMessage(lang, title, viewingRep()), label: ALERT_LABEL.dealNudge }], `48 h nudge → tenant (home #${r.listingId})`);
      await writeState(doneKey(r.id), { ...done, nudgeAt: now.toISOString() });
      n += 1;
    }
  }
  return n;
}
