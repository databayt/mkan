import "server-only";

/**
 * The quiet-tenant sweep (quiet-nudge-pure.ts has the rules), run hourly with the broker loop. The line follows
 * up a tenant who went quiet under the homes by itself — at most twice, spaced, each useful (a new matching home
 * from their brief, else one question; then a soft close). Real WhatsApp tenants only: never the team's numbers,
 * Abdout's own contacts, a tenant who said STOP, or a chat a person typed in within HUMAN_HOLD_MS. The chat is
 * touched when a follow-up goes, so the tenant's answer ("K6711", "2") continues it instead of opening a new one
 * (a WhatsApp chat is one search for 24 h, whatsapp-chat.ts). Mkan's person gets an FYI per follow-up.
 */
import { db } from "@/lib/db";
import { phoneKey, inSendWindow } from "../../../scripts/wa/outbox-pure";
import { lastTenantAt } from "./broker-gate";
import { testPhones } from "./broker-sends";
import { dealEvent } from "./deal-event";
import { newHomesFor } from "./follow-homes";
import { replyLang, type Lang } from "./language";
import { isPersonal } from "./personal";
import { followUpBlock, followUpMessage, followUpNote, planFollowUp, QUIET_LABEL, QUIET_MAX_MS, quietKey, quietNudgeOn, quietVerdict, sentCount, type QuietState } from "./quiet-nudge-pure";
import { coerceRequirements } from "./requirements";
import type { AgentMessage, ShortlistItem } from "./types";
import { readState, writeState } from "./wa-state";
import { sendMessages } from "./whatsapp";

/** The follow-ups sent this pass. */
export async function quietSweep(now = new Date()): Promise<number> {
  if (!quietNudgeOn() || !inSendWindow(now)) return 0;
  const tasks = await db.agentTask.findMany({
    where: { status: "DONE", updatedAt: { gte: new Date(now.getTime() - QUIET_MAX_MS) }, profile: { waPhone: { not: null } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, locale: true, messages: true, shortlist: true, requirements: true, profileId: true, profile: { select: { waPhone: true } } },
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
    const typed = human[digits] ? Date.parse(human[digits]!) : 0;
    // The cheap holds first; the personal list is a database read, so it comes only for a chat that could be sent to.
    if (followUpBlock({ test: tests.has(digits), stopped: stoppedSet.has(digits), humanAt: typed ? new Date(typed) : null, personal: false, now })) continue;
    const messages = (t.messages as unknown as AgentMessage[] | null) ?? [];
    const shortlist = (t.shortlist as unknown as ShortlistItem[] | null) ?? [];
    // A message answered under the homes leaves only a trace row: the tenant's last word may be newer than the chat's.
    const trace = await db.agentEvent.findFirst({ where: { taskId: t.id }, orderBy: { seq: "desc" }, select: { createdAt: true } });
    const wrote = lastTenantAt(messages);
    const lastActivity = wrote && trace ? new Date(Math.max(wrote.getTime(), trace.createdAt.getTime())) : (wrote ?? null);
    const state = await readState<QuietState>(quietKey(t.id), {}).catch(() => ({}) as QuietState);
    const verdict = quietVerdict({ messages, shortlist, lastActivity, now, sent: sentCount(state), lastSentAt: state.at ? new Date(state.at) : null, inWindow: true });
    if (verdict !== "first" && verdict !== "second") continue;
    if (followUpBlock({ test: false, stopped: false, humanAt: null, personal: await isPersonal(digits).catch(() => true), now })) continue;

    // The tenant's own language: what they write (language.ts), else the chat's stored one.
    const lang: Lang = replyLang(messages as { text?: string | null; role?: string }[], (["en", "rw", "fr", "ar", "sw"] as const).find((l) => l === t.locale) ?? "en");
    const brief = coerceRequirements(t.requirements);
    const homes = verdict === "first" ? await newHomesFor({ id: t.id, profileId: t.profileId, requirements: t.requirements, shortlist: t.shortlist }, 2) : [];
    const plan = planFollowUp(verdict, homes, { maxPrice: brief.maxPrice ?? null, area: !!(brief.neighbourhood || brief.neighbourhoods?.length || brief.district || brief.area) });
    // Recorded first: a failed send is not retried, a follow-up is never sent twice.
    const count = sentCount(state) + 1;
    await writeState(quietKey(t.id), { at: now.toISOString(), n: count } satisfies QuietState);
    await sendMessages([{ kind: "TENANT_ALERT", to, body: followUpMessage(lang, plan), label: count === 1 ? QUIET_LABEL : `${QUIET_LABEL}-2` }], `Quiet tenant follow-up ${count} of 2`);
    await db.agentTask.update({ where: { id: t.id }, data: { updatedAt: now } }).catch(() => {});
    // An FYI for Mkan's person, never a task: what the line did, and that it is still on it.
    const home = shortlist.find((s) => s.availability === "confirmed" || s.availability === "asked") ?? shortlist[0];
    if (home) void dealEvent("STALLED", { listingId: home.id, taskId: t.id, tenantPhone: to, note: followUpNote(verdict, plan), n: count });
    n += 1;
  }
  return n;
}
