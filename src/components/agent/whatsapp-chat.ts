import "server-only";

/**
 * The rental agent on WhatsApp. A tenant messages Mkan's number; the bridge
 * posts it to /api/whatsapp/hook, and this runs the same turn `/find` runs and
 * returns the reply as one WhatsApp message (wa-tenant.ts sends it).
 *
 * A phone is a profile like a browser is: `AgentProfile.keyHash` is the sha256
 * of "wa:<digits>". A message continues the phone's latest chat while it is
 * under a day old ("new" starts another), a bare digit answers the last
 * numbered question, and `ref:<chat id>` from /find's "Continue on WhatsApp"
 * starts this phone's chat from the web one. The tenant never opts in for
 * alerts twice: a search kept open from WhatsApp alerts that same number.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { publicAppUrl } from "../../../scripts/crm/public-links";
import { appendUserMessage, type CurrentTask } from "./append";
import { askAvailabilityFor } from "./availability";
import { appendTaskEvent } from "./broker";
import { chatLink, optInDemand } from "./demand";
import { hashKey, type Viewer } from "./profile";
import { startTurn } from "./run";
import { loadTask } from "./task-view";
import type { AgentMessage, AgentTaskView } from "./types";
import { busyText, checkText, formatWhatsApp, isFresh, readPick, readRef, waLang, type WaDict, type WaLang } from "./whatsapp-format";

const MAX_TEXT = 600;
/** A WhatsApp chat is one search while it stays this fresh. */
const CONTINUE_MS = 24 * 3_600_000;
/** Fewer than the web's 30: a phone loop costs Groq tokens the whole site shares. */
const MAX_TURNS_PER_HOUR = 20;
/** The bridge holds the tenant's "typing…" this long; the turn's own deadline is 15 s. */
const TURN_WAIT_MS = 16_000;
/** A web chat a ref may carry over. */
const REF_MAX_AGE_MS = 30 * 24 * 3_600_000;

export type WaResult =
  | { reply: string; taskId: string | null }
  /** Nothing to send: a message already answered, or the last turn still running. */
  | { reply: null; why: "duplicate" | "busy" | "empty" };

export const waDigits = (phone: string) => phone.replace(/[^\d]/g, "").replace(/^00/, "");

async function waDict(lang: WaLang): Promise<WaDict> {
  const a = (await getDictionary(lang)).agent as unknown as WaDict;
  return { reply: a.reply, ask: a.ask, demand: a.demand, refine: a.refine, clarify: a.clarify };
}

async function profileFor(digits: string) {
  const keyHash = hashKey(`wa:${digits}`);
  const select = { id: true, userId: true, memory: true, lastSearchAt: true, waPhone: true } satisfies Prisma.AgentProfileSelect;
  const waPhone = `+${digits}`;
  const found = await db.agentProfile.findUnique({ where: { keyHash }, select });
  if (!found) return db.agentProfile.create({ data: { keyHash, waPhone }, select });
  // Profiles from before 10-25 learn their number on the next message.
  if (!found.waPhone) await db.agentProfile.update({ where: { id: found.id }, data: { waPhone } }).catch(() => {});
  return found;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function handleTenantWhatsApp(input: { phone: string; text: string; msgId: string }): Promise<WaResult> {
  const digits = waDigits(input.phone);
  const raw = input.text.trim().slice(0, MAX_TEXT);
  if (!digits || !raw) return { reply: null, why: "empty" };
  const profile = await profileFor(digits);
  const viewer: Viewer = { profile, ids: [profile.id], legacyKey: null };

  const since = new Date(Date.now() - 3_600_000);
  const [recent, [row]] = await Promise.all([
    db.agentTask.findMany({
      where: { profileId: profile.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, status: true, messages: true, updatedAt: true, locale: true },
    }),
    db.$queryRaw<{ turns: number }[]>`
      SELECT COUNT(*)::int AS turns
      FROM "AgentTask" t, jsonb_array_elements(t.messages) m
      WHERE t."profileId" = ${profile.id} AND t."updatedAt" >= ${since}
        AND m->>'role' = 'user' AND m->>'at' >= ${since.toISOString()}`,
  ]);
  // The webhook and the fallback poll can both bring the same message.
  const answered =
    recent.some((t) => ((t.messages as unknown as AgentMessage[]) ?? []).some((m) => m.role === "user" && m.wa === input.msgId)) ||
    (recent.length > 0 &&
      !!(await db.agentEvent.findFirst({ where: { taskId: { in: recent.map((t) => t.id) }, payload: { path: ["wa"], equals: input.msgId } }, select: { seq: true } })));
  if (answered) return { reply: null, why: "duplicate" };

  const { ref, rest } = readRef(raw);
  const latest = recent[0] && Date.now() - recent[0].updatedAt.getTime() < CONTINUE_MS ? recent[0] : null;
  const fresh = isFresh(rest) || !!ref;
  let current: (CurrentTask & { locale: string }) | null = fresh ? null : latest;
  const lang: WaLang = /^\s*[1-9٠-٩]\.?\s*$/.test(rest) && current ? ((["en", "ar", "rw"].includes(current.locale) ? current.locale : "en") as WaLang) : waLang(rest || raw);
  const d = await waDict(lang);
  if ((row?.turns ?? 0) >= MAX_TURNS_PER_HOUR) return { reply: busyText(d, "rate"), taskId: current?.id ?? null };

  // A digit answers the last numbered question.
  // A ref's prefilled words are ours, not the tenant's: the web chat's own words run instead.
  let text = ref ? "" : rest;
  if (current) {
    const view = await loadTask(viewer, current.id);
    const pick = readPick(rest, view, d);
    if (pick?.kind === "check") {
      const item = view!.shortlist.find((s) => s.id === pick.listingId)!;
      const { asked } = await askAvailabilityFor(current.id, pick.listingId).catch(() => ({ asked: false }));
      await stampSeen(current.id, input.msgId, pick.listingId);
      return { reply: checkText(lang, asked, item.title), taskId: current.id };
    }
    if (pick?.kind === "text") text = pick.text;
  }

  // The web chat a ref names: its words and search come along to this phone's new chat.
  let seed: { messages: AgentMessage[]; requirements: Prisma.JsonValue } | undefined;
  if (ref) {
    const web = await db.agentTask.findUnique({ where: { id: ref }, select: { messages: true, requirements: true, updatedAt: true } });
    if (web && Date.now() - web.updatedAt.getTime() < REF_MAX_AGE_MS) {
      const words = ((web.messages as unknown as AgentMessage[]) ?? []).filter((m) => m.role === "user");
      seed = { messages: words.slice(0, -1), requirements: web.requirements };
      if (!text) text = (words.at(-1) as { text?: string } | undefined)?.text ?? "";
    }
  }
  if (!text) text = raw;

  const message: Extract<AgentMessage, { role: "user" }> = { role: "user", text, at: new Date().toISOString(), wa: input.msgId };
  let appended = await appendUserMessage({ profileId: profile.id, userId: profile.userId, current, message, lang, seed });
  // The bridge sends one phone's messages in order, so "busy" is the tail of the last turn: wait for it once.
  for (let i = 0; "busy" in appended && i < 3; i++) {
    await sleep(2_000);
    current = current ? await db.agentTask.findUnique({ where: { id: current.id }, select: { id: true, status: true, messages: true, updatedAt: true, locale: true } }) : null;
    appended = await appendUserMessage({ profileId: profile.id, userId: profile.userId, current, message, lang, seed });
  }
  if ("busy" in appended) return { reply: null, why: "busy" };
  const { taskId } = appended;

  const turn = startTurn(taskId);
  await Promise.race([turn.done.catch(() => {}), sleep(TURN_WAIT_MS)]);
  const view: AgentTaskView | null = await loadTask(viewer, taskId);
  if (!view) return { reply: d.reply.error ?? "", taskId };
  if (view.demand && !view.demand.optedIn) await optInDemand(taskId, `+${digits}`).catch(() => {});
  return { reply: formatWhatsApp(view, d, lang, chatLink(taskId, lang), publicAppUrl()), taskId };
}

/** A digit that ran no turn is kept as a silent trace row, so a retried webhook does not ask the broker twice. */
const stampSeen = (taskId: string, msgId: string, listingId: number) => appendTaskEvent(taskId, "card_opened", "done", { listingId, wa: msgId });

/** STOP from a tenant: the bridge stops answering them, and no search alerts this number again. */
export async function silenceTenant(phone: string): Promise<void> {
  await db.tenantRequest.updateMany({ where: { phone: `+${waDigits(phone)}` }, data: { phone: null, optInAt: null } });
}
