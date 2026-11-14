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
import { appendUserMessage, reopenForTurn, type CurrentTask } from "./append";
import { askAvailabilityFor, handPickToPerson, type AskOutcome } from "./availability";
import { scrubTitle } from "@/lib/redact";
import { appendTaskEvent } from "./broker";
import { chatLink, optInDemand } from "./demand";
import { hashKey, type Viewer } from "./profile";
import { startTurn, TURN_DEADLINE_MS } from "./run";
import { loadTask, STUCK_AFTER_MS } from "./task-view";
import type { AgentMessage, AgentTaskView } from "./types";
import { busyText, checkText, formatWhatsApp, isFresh, readPick, readRef, retryPlan, takenIn, waLang, wantsViewing, type CheckOutcome, type WaDict, type WaLang } from "./whatsapp-format";
import { askAroundText, botText, firstMessageKind, isBareYes, isThanks, lastAgent, MAX_HOMES, personAfterHello, personText, asksForHome, readHomeRef, refSourceOf, shownHomes, thanksText, wantsPerson, whichOneText, type RefSource } from "./whatsapp-format";
import { afterHomesKind, chatText, visitText } from "./whatsapp-format";
import { askAround } from "./demand";
import { viewingRep } from "./broker-message";
import { parseBrokerReply } from "./broker-reply";
import { homeForRef } from "./home-ref";
import { isPersonal } from "./personal";
import { afterViewingFor, openViewingAsk, prepareDealSheet, proposeViewing, readViewingAsk, recordAfterViewing } from "./deal";
import { askTimeMessage, readAfterViewing, readViewingTime } from "./deal-pure";
import { introFollowUpFor, introMode, introTenantAnswer, startIntro } from "./deal-intro";
import { postSlackCard } from "./whatsapp";

const MAX_TEXT = 600;
/** A WhatsApp chat is one search while it stays this fresh. */
const CONTINUE_MS = 24 * 3_600_000;
/** Fewer than the web's 30: a phone loop costs Groq tokens the whole site shares. */
const MAX_TURNS_PER_HOUR = 20;
/**
 * How long the reply waits for the turn's first reply — past the turn's own deadline, whose error reply
 * also counts, so a slow database still answers this message rather than leaving it to the next pass.
 */
const TURN_WAIT_MS = TURN_DEADLINE_MS + 3_000;
/** A web chat a ref may carry over. */
const REF_MAX_AGE_MS = 30 * 24 * 3_600_000;

export type WaResult =
  /** `done`: the turn behind the reply, still writing its tail (the writer, the broker ask) — the phone's next message waits for it. */
  | { reply: string; taskId: string | null; done?: Promise<void> }
  /**
   * Nothing to send: a message already answered, the last turn still running ("busy": not taken in, the claim
   * is given back), or this message's own turn still running ("held": taken in, the claim is kept).
   */
  | { reply: null; why: "duplicate" | "busy" | "held" | "empty" | "personal"; done?: Promise<void> };

/** How long a message waits for the same phone's last turn to finish before it is left to the next poll. */
const BUSY_WAIT_MS = 20_000;

export const waDigits = (phone: string) => phone.replace(/[^\d]/g, "").replace(/^00/, "");

async function waDict(lang: WaLang): Promise<WaDict> {
  const a = (await getDictionary(lang)).agent as unknown as WaDict;
  return { reply: a.reply, ask: a.ask, demand: a.demand, refine: a.refine, clarify: a.clarify };
}

async function profileFor(digits: string) {
  const keyHash = hashKey(`wa:${digits}`);
  const select = { id: true, userId: true, memory: true, lastSearchAt: true, waPhone: true, firstSource: true } satisfies Prisma.AgentProfileSelect;
  const waPhone = `+${digits}`;
  const found = await db.agentProfile.findUnique({ where: { keyHash }, select });
  if (!found) return db.agentProfile.create({ data: { keyHash, waPhone }, select });
  // Profiles from before 10-25 learn their number on the next message.
  if (!found.waPhone) await db.agentProfile.update({ where: { id: found.id }, data: { waPhone } }).catch(() => {});
  return found;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A message the agent left to a person (asked for one, asked if it's a bot, or wrote about
 * something other than a home): one WaState row per message, `handoff:<id>`, so /monetize can
 * count what lands on Abdout's desk instead of only posting a #mkan card.
 */
const noteHandoff = (msgId: string, why: string) =>
  db.waState
    .upsert({ where: { key: `handoff:${msgId}` }, create: { key: `handoff:${msgId}`, value: { why } }, update: {} })
    .catch(() => {});

/**
 * How this person first reached Mkan (a TikTok post's code, the /k page, a web chat, or none) —
 * stamped once, on a profile made in the last hour, so older numbers are not re-attributed.
 */
const stampFirstSource = (profileId: string, source: RefSource, listingId: number | null) =>
  db.agentProfile
    .updateMany({
      where: { id: profileId, firstSource: null, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
      data: { firstSource: source, firstRef: listingId },
    })
    .catch(() => {});

export async function handleTenantWhatsApp(input: {
  phone: string;
  text: string;
  msgId: string;
  /** A retry of a message whose last run died (wa-state.ts claimMessage): if it was already taken in, answer with where the chat stands. */
  retry?: boolean;
  /** Called once the agent will answer — the "typing…" presence, never shown before the personal / hand-off gates. */
  onAnswering?: () => void;
}): Promise<WaResult> {
  const digits = waDigits(input.phone);
  const raw = input.text.trim().slice(0, MAX_TEXT);
  if (!digits || !raw) return { reply: null, why: "empty" };
  // Abdout's own contacts on this number are read message by message below (personal.ts).
  const personal = await isPersonal(digits);
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
  // The webhook and the fallback poll can both bring the same message, and a retry brings one whose last
  // run died before its reply went out (holdReply precedes every send). Where it stands in its chat decides
  // (whatsapp-format.ts retryPlan) — 2026-11-08: a retry of a turn a restart killed read RUNNING, was given
  // back as "busy", came back fresh as a duplicate and was never answered.
  const host = recent.find((t) => ((t.messages as unknown as AgentMessage[]) ?? []).some((m) => m.role === "user" && m.wa === input.msgId));
  if (host) {
    const plan = retryPlan(takenIn((host.messages as unknown as AgentMessage[]) ?? [], input.msgId), host, !!input.retry, Date.now(), STUCK_AFTER_MS);
    if (plan === "duplicate") return { reply: null, why: "duplicate" };
    if (plan === "held") return { reply: null, why: "held" };
    const rlang = (["en", "ar", "rw"].includes(host.locale) ? host.locale : "en") as WaLang;
    const rd = await waDict(rlang);
    if (plan === "resend") {
      const view = await loadTask(viewer, host.id);
      return view ? { reply: formatWhatsApp(view, rd, rlang, chatLink(host.id, rlang), publicAppUrl()), taskId: host.id } : { reply: null, why: "duplicate" };
    }
    // The turn died (a restart) or only its unsent error stands: run it once more on the same words.
    if (!(await reopenForTurn(host.id))) return { reply: null, why: "held" };
    input.onAnswering?.();
    return answerWithTurn({ taskId: host.id, viewer, msgId: input.msgId, digits, d: rd, lang: rlang });
  }
  // Answered without a turn (a pick, a thank-you, a viewing time): a trace row carries its id. A retry of
  // one answers it again — those answers are safe to repeat (a broker already asked is "already asked").
  if (!input.retry && recent.length > 0 && (await db.agentEvent.findFirst({ where: { taskId: { in: recent.map((t) => t.id) }, payload: { path: ["wa"], equals: input.msgId } }, select: { seq: true } }))) {
    return { reply: null, why: "duplicate" };
  }

  const { ref, rest } = readRef(raw);
  if (!profile.firstSource) await stampFirstSource(profile.id, refSourceOf(rest, ref), null);
  const latest = recent[0] && Date.now() - recent[0].updatedAt.getTime() < CONTINUE_MS ? recent[0] : null;
  // One of Abdout's own contacts: the agent answers only a message that asks for a home, or one that
  // carries on a home search it already started; everything else on this number stays his.
  const searching = !!latest && shownHomes(latest.messages as unknown as AgentMessage[]);
  if (personal && !asksForHome(rest) && !searching) return { reply: null, why: "personal" };
  if (personal && !searching) await postSlackCard(`🏠 ${profile.waPhone ?? "A contact"} from Abdout's personal list asked about a home — the agent is answering:\n> ${rest.slice(0, 300)}`).catch(() => {});
  const fresh = isFresh(rest) || !!ref;
  let current: (CurrentTask & { locale: string }) | null = fresh ? null : latest;
  // A digit, a price, a code or an "ok" keeps the chat's language (whatsapp-format.ts isLanguageNeutral).
  const lang: WaLang = waLang(rest || raw, (current ?? latest)?.locale);
  const d = await waDict(lang);
  if ((row?.turns ?? 0) >= MAX_TURNS_PER_HOUR) return { reply: busyText(d, "rate"), taskId: current?.id ?? null };

  // "Are you a bot?" gets the truth, and "person" gets one; the team hears both in #mkan.
  if (parseBrokerReply(rest).asksIfBot || wantsPerson(rest)) {
    const asksBot = !wantsPerson(rest);
    await noteHandoff(input.msgId, asksBot ? "asked-bot" : "wants-person");
    await postSlackCard(`${asksBot ? "🤖 A tenant asked if they're talking to a bot" : "🙋 A tenant wants a person"} — ${profile.waPhone ?? "unknown number"}${current ? ` · chat ${current.id}` : ""}\n> ${rest.slice(0, 300)}`).catch(() => {});
    if (current) await stampSeen(current.id, input.msgId, 0);
    return { reply: asksBot ? botText(lang, viewingRep()) : personText(lang, viewingRep()), taskId: current?.id ?? null };
  }

  // An intro's follow-up ("did you see it? 1 / 2 / 3", "did you take it? and 1–5"): the deal's next step,
  // not a pick of home #1 (deal-intro.ts). A new search or a home code still runs as one.
  const followUp = !isFresh(rest) && !readHomeRef(rest) ? await introFollowUpFor(profile.waPhone).catch(() => null) : null;
  if (followUp) {
    const reply = await introTenantAnswer(followUp, rest, lang).catch(() => null);
    if (reply) {
      if (followUp.deal.taskId) await stampSeen(followUp.deal.taskId, input.msgId, followUp.deal.listingId);
      return { reply, taskId: followUp.deal.taskId };
    }
  }

  // "How did the viewing go? Reply 1 / 2": the answer is the deal's next step, not a pick of home #1
  // (deal.ts recordAfterViewing). A new search or a home code still runs as one.
  const viewed = !isFresh(rest) && !readHomeRef(rest) ? await afterViewingFor(profile.waPhone).catch(() => null) : null;
  if (viewed) {
    const verdict = readAfterViewing(rest);
    if (verdict || !asksForHome(rest)) {
      const reply = await recordAfterViewing(viewed, verdict, rest, profile.waPhone ?? `+${digits}`, lang);
      if (viewed.taskId) await stampSeen(viewed.taskId, input.msgId, viewed.listingId);
      return { reply, taskId: viewed.taskId };
    }
  }

  // The deal sheet asked "when can you come?": a day and a time go to the person who books the viewing.
  // A message about a home ("2 bedrooms, can I see one tomorrow?") is a search, not a time (2026-11-06).
  const viewingAsk = asksForHome(rest) ? null : await readViewingAsk(profile.waPhone);
  if (viewingAsk) {
    const when = readViewingTime(rest, new Date());
    if (when && "at" in when) {
      const reply = await proposeViewing(viewingAsk, when.at, profile.waPhone!, lang);
      await stampSeen(viewingAsk.taskId, input.msgId, viewingAsk.listingId);
      return { reply, taskId: viewingAsk.taskId };
    }
    if (when) return { reply: askTimeMessage(lang), taskId: viewingAsk.taskId };
  }

  // A home's code ("K5808" from a TikTok post, or /find's "Check on WhatsApp"): a fresh chat that
  // searches like it, that home first. With a web ref too, the web chat's words come along.
  // A bare number answering the agent's own question ("budget?" → "6000") is that answer, not a home's
  // code; with a K, or in a chat with no question pending, it is the code (2026-11-06).
  const lastKind = current ? (((current.messages as unknown as AgentMessage[]) ?? []).findLast((m) => m.role === "agent") as { kind?: string } | undefined)?.kind : undefined;
  const bareNumber = /^#?\d{4,6}$/.test(rest.trim());
  const homeRef = bareNumber && (lastKind === "ask" || lastKind === "clarify") ? null : readHomeRef(rest);
  const refHome = homeRef ? await homeForRef(homeRef) : null;
  if (refHome) current = null;
  const refSource = refHome ? refSourceOf(rest, ref) : null;
  if (refHome) await db.agentProfile.updateMany({ where: { id: profile.id, firstRef: null, firstSource: refSource }, data: { firstRef: refHome.id } }).catch(() => {});

  // A digit answers the last numbered question.
  // A ref's prefilled words are ours, not the tenant's: the web chat's own words run instead.
  let text = ref && !refHome ? "" : rest;
  if (current) {
    const view = await loadTask(viewer, current.id);
    const pick = readPick(rest, view, d);
    if (pick?.kind === "check") {
      const item = view!.shortlist.find((s) => s.id === pick.listingId)!;
      const taskId = current.id;
      input.onAnswering?.();
      // A check that threw (a dropped connection, usually) is tried once more before the tenant hears of it.
      const ask = (): Promise<AskOutcome | null> => askAvailabilityFor(taskId, pick.listingId).catch(() => null);
      let res = await ask();
      if (!res) {
        await sleep(1_500);
        res = await ask();
      }
      // The turn that showed the homes is still writing: the next pass takes this pick (never refused).
      if (res?.why === "busy") return { reply: null, why: "busy" };
      await stampSeen(taskId, input.msgId, pick.listingId);
      const title = scrubTitle(item.title);
      // A broker already said yes: the pick is "I want to see it" — the deal sheet and "when can you come?".
      if (res?.why === "confirmed") {
        const sheet = await dealSheetFor(taskId, pick.listingId);
        if (sheet) return { reply: sheet, taskId };
        // No sheet to write (a tenant who said STOP, then picked a home): the question itself, and its window.
        await openViewingAsk(profile.waPhone ?? `+${digits}`, taskId, pick.listingId).catch(() => {});
        await handPickToPerson(taskId, item, "no-sheet").catch(() => {});
        return { reply: checkText(lang, "confirmed", title), taskId };
      }
      const why = res?.why;
      const outcome: CheckOutcome | null = res?.asked ? (res.slow ? "slow" : "asked") : why === "handed" || why === "already" || why === "taken" || why === "unreachable" || why === "host" ? why : null;
      // Two failed checks: the tenant is asked to send the number again — never a promise nobody keeps
      // (2026-11-08), and since 2026-11-14 never "a person will reply" either.
      if (!outcome) await handPickToPerson(taskId, item, "check-failed").catch(() => {});
      return { reply: checkText(lang, outcome ?? "retry", title, outcome === "host" ? `${publicAppUrl()}${item.path}` : null), taskId };
    }
    if (pick?.kind === "askAround") {
      const result = await askAround(current.id).catch(() => ({ asked: 0, handed: false }));
      await stampSeen(current.id, input.msgId, 0);
      return { reply: askAroundText(lang, result), taskId: current.id };
    }
    if (pick?.kind === "text") text = pick.text;
    // A bare yes / ok / 👍 under homes, with no question pending: which one? (It used to re-run the search.)
    if (!pick && !refHome && view && lastAgent(view)?.kind === "shortlist" && view.shortlist.length > 0 && isBareYes(rest)) {
      await stampSeen(current.id, input.msgId, 0);
      return { reply: whichOneText(lang, Math.min(MAX_HOMES, view.shortlist.length)), taskId: current.id };
    }
  }

  // The web chat a ref names: its words and search come along to this phone's new chat.
  let seed: { messages: AgentMessage[]; requirements: Prisma.JsonValue } | undefined;
  if (ref) {
    const web = await db.agentTask.findUnique({ where: { id: ref }, select: { messages: true, requirements: true, updatedAt: true, profile: { select: { waPhone: true } } } });
    // Only a web chat (or this phone's own) carries over: another phone's WhatsApp chat never does, whoever
    // learns its id (2026-11-06).
    const ownChat = !web?.profile?.waPhone || web.profile.waPhone === `+${digits}`;
    if (web && ownChat && Date.now() - web.updatedAt.getTime() < REF_MAX_AGE_MS) {
      const words = ((web.messages as unknown as AgentMessage[]) ?? []).filter((m) => m.role === "user");
      seed = { messages: words.slice(0, -1), requirements: web.requirements };
      if (!text) text = (words.at(-1) as { text?: string } | undefined)?.text ?? "";
    }
  }
  if (!text) text = raw;

  // A new chat that is neither about a home nor a hello is likely someone who knew this number before it
  // was Mkan's: a person answers it, never the agent.
  if (!current && !ref && !refHome && firstMessageKind(text) === "other") {
    await noteHandoff(input.msgId, "not-about-a-home");
    await postSlackCard(`💬 ${profile.waPhone ?? "a number"} wrote, not about a home — the agent stayed quiet; answer it yourself if it is for you:\n> ${text.slice(0, 300)}${profile.waPhone ? `\nIf this is someone you know: \`pnpm wa:personal add ${profile.waPhone}\`` : ""}`).catch(() => {});
    return { reply: null, why: "empty" };
  }
  // The same after a hello: a chat that has only greeted, whose next message is not about a home either
  // ("where are you, so we can bring the things" got six homes on 11-01), goes to a person.
  if (current && !ref && !refHome && personAfterHello(text, current.messages as unknown as AgentMessage[])) {
    await noteHandoff(input.msgId, "after-hello");
    await postSlackCard(`💬 ${profile.waPhone ?? "a number"} said hello, then wrote something not about a home — the agent stayed quiet; answer it yourself:\n> ${text.slice(0, 300)}`).catch(() => {});
    return { reply: null, why: "empty" };
  }
  // A thank-you after the homes went out gets a line back, not the same homes again (11-01: "Thank you" got six).
  if (current && !ref && !refHome && isThanks(text) && shownHomes(current.messages as unknown as AgentMessage[])) {
    await stampSeen(current.id, input.msgId, 0);
    return { reply: thanksText(lang), taskId: current.id };
  }
  // Under the homes, a message that moves nothing about the search gets what it asked for, never the
  // same homes again (2026-11-02): "How are you", "?", "What is this", "Can we meet now" and "Are you
  // still available?" each re-sent six (10-26..11-01). whatsapp-format.ts afterHomesKind.
  const said = current?.messages as unknown as AgentMessage[] | undefined;
  if (current && !ref && !refHome && shownHomes(said)) {
    const kind = afterHomesKind(text);
    if (kind !== "search") {
      await stampSeen(current.id, input.msgId, 0);
      const last = [...(said ?? [])].reverse().find((m): m is Extract<AgentMessage, { kind: "shortlist" }> => m.role === "agent" && m.kind === "shortlist");
      const n = Math.min(MAX_HOMES, last?.count ?? MAX_HOMES);
      if (kind === "person") {
        await noteHandoff(input.msgId, "under-homes");
        await postSlackCard(`💬 ${profile.waPhone ?? "a number"} wrote under their homes, not about a home — answer them yourself:\n> ${text.slice(0, 300)}`).catch(() => {});
        return { reply: personText(lang, viewingRep()), taskId: current.id };
      }
      const reply = kind === "check" ? whichOneText(lang, n) : kind === "visit" ? visitText(lang, n) : kind === "about" ? botText(lang, viewingRep()) : chatText(lang);
      return { reply, taskId: current.id };
    }
  }

  const message: Extract<AgentMessage, { role: "user" }> = {
    role: "user",
    text,
    at: new Date().toISOString(),
    wa: input.msgId,
    ...(refHome ? { filters: refHome.filters, pin: refHome.id } : {}),
    // The web chat this one carries on: the broker's answer is marked there too (broker.ts applyAnswer).
    ...(seed && ref ? { origin: ref } : {}),
  };
  input.onAnswering?.();
  let appended = await appendUserMessage({ profileId: profile.id, userId: profile.userId, current, message, lang, seed, refSource: refSource ?? refSourceOf(rest, ref) });
  // The bridge sends one phone's messages in order, so "busy" is the tail of the last turn: wait for it,
  // then leave the message to the next poll (wa-tenant.ts gives its claim back) — never drop it.
  for (const until = Date.now() + BUSY_WAIT_MS; "busy" in appended && Date.now() < until; ) {
    await sleep(1_000);
    current = current ? await db.agentTask.findUnique({ where: { id: current.id }, select: { id: true, status: true, messages: true, updatedAt: true, locale: true } }) : null;
    appended = await appendUserMessage({ profileId: profile.id, userId: profile.userId, current, message, lang, seed, refSource: refSource ?? refSourceOf(rest, ref) });
  }
  if ("busy" in appended) return { reply: null, why: "busy" };
  const { taskId } = appended;
  // The chat a home code opened, and where the code came from: the first-share funnel's join to the post.
  if (refHome) await db.agentTask.updateMany({ where: { id: taskId, refListingId: null }, data: { refListingId: refHome.id, refSource } }).catch(() => {});

  return answerWithTurn({ taskId, viewer, msgId: input.msgId, digits, d, lang, refHome, rest });
}

/**
 * Run the turn on the message just taken in and say what it answered. Waits for the first reply — or the
 * deadline's error, which is an answer too — a little past the turn's deadline. Nothing written for THIS
 * message yet (a database slower than that) is "held": the chat's previous reply is never sent in its place
 * (2026-11-08); the claim stays and the next pass sends this turn's reply.
 */
async function answerWithTurn(a: {
  taskId: string;
  viewer: Viewer;
  msgId: string;
  digits: string;
  d: WaDict;
  lang: WaLang;
  refHome?: { id: number } | null;
  rest?: string;
}): Promise<WaResult> {
  const turn = startTurn(a.taskId);
  const done = turn.done.catch(() => {});
  await Promise.race([turn.shown, sleep(TURN_WAIT_MS)]);
  const view: AgentTaskView | null = await loadTask(a.viewer, a.taskId);
  if (!view) return { reply: a.d.reply.error ?? "", taskId: a.taskId };
  const stand = takenIn(view.messages, a.msgId);
  if (stand === "unanswered") return { reply: null, why: "held", done };
  if (stand !== "replied" && stand !== "errored") return { reply: null, why: "duplicate", done };
  if (view.demand && !view.demand.optedIn) await optInDemand(a.taskId, `+${a.digits}`).catch(() => {});
  // "I'd like to view K1234" (the /find card's "Book the viewing on WhatsApp") on a home a broker already
  // said yes to: straight to the viewing, not "reply 1 to check" (2026-11-06).
  const refHome = a.refHome;
  if (refHome && a.rest && wantsViewing(a.rest) && view.shortlist.find((s) => s.id === refHome.id)?.availability === "confirmed") {
    await done;
    const sheet = await dealSheetFor(a.taskId, refHome.id);
    if (sheet) return { reply: sheet, taskId: a.taskId };
  }
  return { reply: formatWhatsApp(view, a.d, a.lang, chatLink(a.taskId, a.lang), publicAppUrl()), taskId: a.taskId, done };
}

/**
 * A pick of a home a broker already said yes to, as this message's reply: until 10 deals are paid, the
 * intro (the broker agrees Mkan's terms, then the numbers go — deal-intro.ts); after that, the deal
 * sheet (deal.ts prepareDealSheet opens the "when can you come?" window).
 */
async function dealSheetFor(taskId: string, listingId: number): Promise<string | null> {
  const task = await db.agentTask.findUnique({ where: { id: taskId }, select: { id: true, locale: true, shortlist: true, profile: { select: { waPhone: true } } } });
  if (!task) return null;
  if ((await introMode().catch(() => "relay" as const)) === "intro") {
    const res = await startIntro([task], listingId, null, { replyTo: task.id, typed: false }).catch(() => ({ started: false, reply: null }));
    if (res.started) return res.reply;
  }
  const sheet = await prepareDealSheet(task, listingId);
  return sheet?.body ?? null;
}

/** A digit that ran no turn is kept as a silent trace row, so a retried webhook does not ask the broker twice. */
const stampSeen = (taskId: string, msgId: string, listingId: number) => appendTaskEvent(taskId, "card_opened", "done", { listingId, wa: msgId });

/** STOP from a tenant: the bridge stops answering them, and no search alerts this number again. */
export async function silenceTenant(phone: string): Promise<void> {
  await db.tenantRequest.updateMany({ where: { phone: `+${waDigits(phone)}` }, data: { phone: null, optInAt: null } });
}
