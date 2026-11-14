import "server-only";

/**
 * The quiet-tenant sweep (quiet-nudge-pure.ts has the rule), run hourly with the broker loop. Real WhatsApp
 * tenants only: never the team's numbers, Abdout's own contacts, a tenant who said STOP, or a chat a person
 * is typing in. The chat is touched when the nudge goes, so the tenant's answer ("2") continues it instead
 * of opening a new one (a WhatsApp chat is one search for 24 h, whatsapp-chat.ts).
 */
import { db } from "@/lib/db";
import { HUMAN_HOLD_MS } from "../../../scripts/wa/tenant-pure";
import { inSendWindow, phoneKey } from "../../../scripts/wa/outbox-pure";
import { lastTenantAt } from "./broker-gate";
import { awakeMs } from "./broker-rank";
import { testPhones } from "./broker-sends";
import type { DealLang } from "./deal-pure";
import { isPersonal } from "./personal";
import { QUIET_LABEL, QUIET_MAX_MS, quietKey, quietNudgeMessage, quietNudgeOn, quietVerdict } from "./quiet-nudge-pure";
import type { AgentMessage, ShortlistItem } from "./types";
import { readState, writeState } from "./wa-state";
import { MAX_HOMES } from "./whatsapp-format";
import { sendMessages } from "./whatsapp";

/** The nudges sent this pass. */
export async function quietSweep(now = new Date()): Promise<number> {
  if (!quietNudgeOn() || !inSendWindow(now)) return 0;
  const tasks = await db.agentTask.findMany({
    where: { status: "DONE", updatedAt: { gte: new Date(now.getTime() - QUIET_MAX_MS) }, profile: { waPhone: { not: null } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, locale: true, messages: true, shortlist: true, profileId: true, profile: { select: { waPhone: true } } },
  });
  if (tasks.length === 0) return 0;
  const [tests, stopped, human] = await Promise.all([
    testPhones(),
    readState<string[]>("tenant-stop", []).catch(() => [] as string[]),
    readState<Record<string, string>>("tenant-human", {}).catch(() => ({}) as Record<string, string>),
  ]);
  const stoppedSet = new Set(stopped.map(phoneKey));
  // Only a phone's newest chat: an older one was left for a new search.
  const newest = new Set<string>();
  const seenProfiles = new Set<string>();
  for (const t of tasks) {
    if (!t.profileId || seenProfiles.has(t.profileId)) continue;
    seenProfiles.add(t.profileId);
    newest.add(t.id);
  }
  let n = 0;
  for (const t of tasks) {
    const to = t.profile?.waPhone;
    if (!to || !newest.has(t.id)) continue;
    const digits = phoneKey(to);
    if (tests.has(digits) || stoppedSet.has(digits)) continue;
    const typed = human[digits] ? Date.parse(human[digits]!) : 0;
    if (typed && now.getTime() - typed < HUMAN_HOLD_MS) continue;
    if (await isPersonal(digits).catch(() => true)) continue;
    const messages = (t.messages as unknown as AgentMessage[] | null) ?? [];
    const shortlist = (t.shortlist as unknown as ShortlistItem[] | null) ?? [];
    // A message answered under the homes leaves only a trace row: the tenant's last word may be newer than the chat's.
    const trace = await db.agentEvent.findFirst({ where: { taskId: t.id }, orderBy: { seq: "desc" }, select: { createdAt: true } });
    const wrote = lastTenantAt(messages);
    const lastActivity = wrote && trace ? new Date(Math.max(wrote.getTime(), trace.createdAt.getTime())) : (wrote ?? null);
    const done = await readState<{ at?: string }>(quietKey(t.id), {}).catch(() => ({}) as { at?: string });
    const verdict = quietVerdict({ messages, shortlist, lastActivity, now, awakeMs: lastActivity ? awakeMs(lastActivity, now) : 0, nudged: !!done.at, inWindow: true });
    if (verdict !== "nudge") continue;
    // Recorded first: a failed send is not retried, the nudge is never sent twice.
    await writeState(quietKey(t.id), { at: now.toISOString() });
    const lang: DealLang = t.locale === "ar" || t.locale === "rw" ? t.locale : "en";
    await sendMessages([{ kind: "TENANT_ALERT", to, body: quietNudgeMessage(lang, Math.min(MAX_HOMES, shortlist.length)), label: QUIET_LABEL }], "Quiet tenant nudge");
    await db.agentTask.update({ where: { id: t.id }, data: { updatedAt: now } }).catch(() => {});
    n += 1;
  }
  return n;
}
