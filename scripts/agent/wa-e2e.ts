/**
 * The WhatsApp chat's safety nets, end to end on the production database — after any change to
 * whatsapp-chat.ts / wa-tenant.ts / wa-state.ts (2026-11-06):
 *
 *   pnpm wa:e2e            run every step, then delete every row it made
 *
 *   1. one claim per message: a second claim is refused, a busy turn gives it back, a run that died is
 *      retried, a written-but-unsent reply is re-sent, a settled one is never touched again
 *   2. a search, then "1" sent while that turn may still be writing: the pick is answered or left for
 *      the next pass — never refused with "I can't get an answer"
 *   3. "how did the viewing go?" → "1": the deal's next step, not home #1 of the chat
 *   4. a WEB tenant gives the team's number beside "Ask the broker" (optInDemand), the gate sees it
 *      (a #mkan TEST card, no broker reached), the broker answers "available" (applyAnswer) and the
 *      deal sheet is written to that number for WhatsApp — SKIPPED, the lock below never sends it
 *   5. the doors (2026-11-15): a TikTok code pins its home first, a pasted TikTok post link resolves to its
 *      home (a skip when no POSTED post has a link), "today" / "uyu munsi" answers the day's homes ending on
 *      the /today link (or the nothing-posted line), "new" alone still starts a new chat, a /tt bio message
 *      ("Check K<id> for me tiktok_bio") is answered with that home
 *
 * It drives the shipped functions with a made-up number on the team's list (`pnpm wa:brokers test`), whose
 * picks never reach a broker (broker-sends.ts), in a chat of its own that it deletes after. Nothing reaches
 * a person: see ./e2e-locks. It never writes the line's shared arrays (tenant-stop, tenant-sent, seen) —
 * another process's write there could drop a real tenant's STOP — so STOP itself is covered by the unit
 * tests (tests/agent/wa-answer.test.ts, tests/wa/outbox.test.ts).
 *
 * 2026-11-08: it used Abdout's own number and appended into his live chat, and from the Mac (every query
 * ~250 ms to us-east-1) its search outlasted the 15 s turn deadline and left that chat FAILED — the "one
 * failed chat in 14 days". The fake number and a script-only deadline (AGENT_TURN_DEADLINE_MS) fix both.
 */
import { blockedSends } from "./e2e-locks";

// Step 4 walks the relay path (the deal sheet to the tenant), not a direct intro (deal-intro.ts).
process.env.MKAN_INTRO_CAP = "0";
// The Mac is far from the database: give the turn the time the container never needs (run.ts).
process.env.AGENT_TURN_DEADLINE_MS ??= "60000";

const TEST_DIGITS = "250720000019";
const TEST_PHONE = `+${TEST_DIGITS}`;
const RUN = `wae2e-${Date.now().toString(36)}`;
let n = 0;
const nextMsg = () => `${RUN}-${++n}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(ok: boolean, label: string, detail = ""): boolean {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
  return ok;
}

async function main() {
  const { db } = await import("../../src/lib/db");
  const { hashKey } = await import("../../src/components/agent/profile");
  const { testPhones } = await import("../../src/components/agent/broker-sends");
  const { handleTenantWhatsApp } = await import("../../src/components/agent/whatsapp-chat");
  const state = await import("../../src/components/agent/wa-state");

  const t0 = new Date();
  // Row counts in this run's scope (the made-up number's own rows), before and after — the cleanup must leave them equal.
  const profileKey = hashKey(`wa:${TEST_DIGITS}`);
  const scopeCounts = async () => {
    const profile = await db.agentProfile.findUnique({ where: { keyHash: profileKey }, select: { id: true } });
    const tasks = profile ? await db.agentTask.findMany({ where: { profileId: profile.id }, select: { id: true } }) : [];
    const taskIds = tasks.map((t) => t.id);
    const [events, outbound, waState, requests, brokerReq, deals, visits, crmOps, crmLinks, notes] = await Promise.all([
      db.agentEvent.count({ where: { taskId: { in: taskIds } } }),
      db.outboundMessage.count({ where: { to: { in: [TEST_PHONE, TEST_DIGITS] } } }),
      db.waState.count({ where: { OR: [{ key: { contains: TEST_DIGITS } }, { key: { contains: "wae2e-" } }] } }),
      db.tenantRequest.count({ where: { taskId: { in: taskIds } } }),
      db.brokerRequest.count({ where: { taskId: { in: taskIds } } }),
      db.deal.count({ where: { OR: [{ tenantPhone: TEST_PHONE }, { taskId: { in: taskIds } }] } }),
      db.listingVisit.count({ where: { contactPhone: TEST_PHONE } }),
      // The queue itself is shared with real traffic: only ops that name this run's chats, profile or number.
      db.crmOp.count({ where: { OR: [...taskIds.map((id) => ({ key: { contains: id } })), ...(profile ? [{ key: { contains: profile.id } }] : []), { key: { contains: TEST_DIGITS } }] } }),
      db.crmLink.count({ where: { OR: [...taskIds.map((id) => ({ key: { contains: id } })), ...(profile ? [{ key: { contains: profile.id } }] : []), { key: { contains: TEST_DIGITS } }] } }),
      db.dailyNote.count({ where: { day: { startsWith: "wae2e" } } }),
    ]);
    return { agentTask: taskIds.length, agentEvent: events, outboundMessage: outbound, waState, tenantRequest: requests, brokerRequest: brokerReq, deal: deals, listingVisit: visits, crmOp: crmOps, crmLink: crmLinks, dailyNote: notes };
  };
  let countsBefore: Awaited<ReturnType<typeof scopeCounts>> | null = null;
  const made = { visits: [] as number[], deals: [] as string[], webTasks: [] as string[], webProfiles: [] as string[], requests: [] as string[] };
  let listingBefore: { id: number; lostAt: Date | null; lostReason: string | null; lastAvailabilityConfirmedAt: Date | null } | null = null;
  try {
    if (!check((await testPhones()).has(TEST_DIGITS), "the test number is on the team list")) return;
    // A chat of its own: whatever an earlier run of this made-up number left is deleted first.
    await deleteTestChats(db, hashKey(`wa:${TEST_DIGITS}`));
    // State an earlier run of this fake number left (its "hello" gate, an open viewing ask): residue, not a person's.
    await db.waState.deleteMany({ where: { key: { in: [`hello:${TEST_DIGITS}`, `viewing-ask:${TEST_DIGITS}`] } } });
    countsBefore = await scopeCounts();

    // ── 1. the claim ──────────────────────────────────────────────────────────
    const id = nextMsg();
    const first = await state.claimMessage(id);
    check(first?.mode === "fresh", "a new message is claimed fresh");
    check((await state.claimMessage(id))?.mode === "held", "a second claim of the same message is held off (webhook + poll answer once; the poll leaves it unseen)");
    await state.releaseMessage(id);
    check((await state.claimMessage(id))?.mode === "fresh", "a busy turn gives the claim back: the next pass takes it fresh");
    // A run that died: its 'working' row goes stale and the next pass retries it.
    await db.waState.update({ where: { key: `tmsg:${id}` }, data: { value: { s: "working", at: new Date(Date.now() - state.CLAIM_STALE_MS - 1000).toISOString(), tries: 1 } } });
    const retry = await state.claimMessage(id);
    check(retry?.mode === "retry" && retry.tries === 2, "a run that died is retried", JSON.stringify(retry));
    await state.holdReply(id, "the reply", 2);
    const resend = await state.claimMessage(id);
    check(resend?.mode === "resend" && "text" in resend && resend.text === "the reply", "a written but unsent reply is sent again, word for word");
    await state.settleMessage(id);
    check((await state.claimMessage(id)) === null, "a settled message is never answered again");

    // ── 2. a search, then "1" while its turn may still be writing ─────────────
    const search = await handleTenantWhatsApp({ phone: TEST_DIGITS, text: "2 bedroom in Kicukiro", msgId: nextMsg() });
    check(!!search.reply && search.reply.length > 40, "a search gets homes", (search.reply ?? "").split("\n")[0]?.slice(0, 80));
    const pick = await handleTenantWhatsApp({ phone: TEST_DIGITS, text: "1", msgId: nextMsg() });
    const refused = !!pick.reply && /can't get an answer|sinshobora|لا أستطيع/i.test(pick.reply);
    check(!refused && (!!pick.reply || ("why" in pick && pick.why === "busy")), "the pick is answered or left for the next pass, never refused", pick.reply?.slice(0, 90) ?? ("why" in pick ? pick.why : ""));
    if ("done" in search && search.done) await search.done;

    // ── 3. the reply to "how did the viewing go?" ─────────────────────────────
    const profile = await db.agentProfile.findUnique({ where: { keyHash: hashKey(`wa:${TEST_DIGITS}`) }, select: { id: true } });
    const task = profile ? await db.agentTask.findFirst({ where: { profileId: profile.id }, orderBy: { updatedAt: "desc" }, select: { id: true, shortlist: true } }) : null;
    const home = ((task?.shortlist as { id: number }[] | null) ?? [])[0];
    if (check(!!task && !!home, "the search left a home to view")) {
      const visit = await db.listingVisit.create({
        data: { listingId: home!.id, contactPhone: TEST_PHONE, scheduledFor: new Date(Date.now() - 4 * 3_600_000), recordedById: "mkan:e2e", taskId: task!.id, reminders: ["24h", "2h", "after"] },
        select: { id: true },
      });
      made.visits.push(visit.id);
      const deal = await db.deal.create({ data: { listingId: home!.id, visitId: visit.id, taskId: task!.id, tenantPhone: TEST_PHONE }, select: { id: true } });
      made.deals.push(deal.id);
      const after = await handleTenantWhatsApp({ phone: TEST_DIGITS, text: "1", msgId: nextMsg() });
      check(!!after.reply && /(?:tell|told) the broker you want|(?:سأخبر|أخبرت) الوسيط|(?:Ndabwira|Nabwiye) komisiyoneri/i.test(after.reply), "'1' after the viewing answers the viewing", after.reply?.slice(0, 90));
      const d = await db.deal.findUnique({ where: { id: deal.id }, select: { status: true } });
      check(d?.status === "VIEWED", "the deal moves to VIEWED", d?.status);
    }

    // ── 4. a web tenant's number carries the broker's answer to WhatsApp ───────
    // The home: a live Kigali broker lead nobody asked about in 30 days — a broker's answer touches every
    // open question about the home, so no real tenant may be waiting on it (deal-e2e.ts picks the same way).
    const DAY = 86_400_000;
    const home4 = await db.listing.findFirst({
      where: {
        isPublished: false, source: "TIKTOK", rentPeriod: "MONTHLY", lostAt: null, currency: "RWF", priceMonth: { gt: 0 },
        brokers: { some: { brokerId: { not: null }, user: { phoneNumber: { not: null } } } },
        brokerRequests: { none: { createdAt: { gte: new Date(Date.now() - 30 * DAY) } } },
        deals: { none: {} },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, lostAt: true, lostReason: true, lastAvailabilityConfirmedAt: true },
    });
    if (check(!!home4, "a broker home nobody is waiting on, for the web step", home4 ? `K${home4.id}` : "none found")) {
      const h = home4!;
      listingBefore = h;
      const link = await db.listingBroker.findFirst({ where: { listingId: h.id }, orderBy: [{ role: "desc" }, { createdAt: "asc" }], select: { userId: true, user: { select: { phoneNumber: true } } } });
      const { optInDemand } = await import("../../src/components/agent/demand");
      const { gateForTask } = await import("../../src/components/agent/broker-sends");
      const { askAvailabilityFor } = await import("../../src/components/agent/availability");
      const { applyAnswer } = await import("../../src/components/agent/broker");
      const { createHash, randomBytes } = await import("node:crypto");

      // A browser's chat: its own profile (no WhatsApp number), one home asked about.
      const webProfile = await db.agentProfile.create({ data: { keyHash: hashKey(`e2e-web:${RUN}`) }, select: { id: true } });
      made.webProfiles.push(webProfile.id);
      const item = { id: h.id, path: `/en/k/K${h.id}`, title: h.title ?? `Home ${h.id}`, photo: null, district: "KICUKIRO", zone: null, bedrooms: 2, bathrooms: 1, rating: null, reviews: null, currency: "RWF", rentPeriod: "MONTHLY", score: 1, reasons: [], cost: null, duplicates: 0, lead: true, availability: "unconfirmed" };
      const web = await db.agentTask.create({
        data: { profileId: webProfile.id, status: "DONE", locale: "en", messages: [{ role: "user", text: "2 bedroom in Kicukiro", at: new Date().toISOString() }], shortlist: [item] as never, requirements: { bedrooms: 2, stay: "long" } as never },
        select: { id: true },
      });
      made.webTasks.push(web.id);

      check((await gateForTask(web.id)).why === "not-whatsapp", "before a number: a browser chat is not reachable on WhatsApp");
      check(await optInDemand(web.id, TEST_PHONE), "the number is saved on the web chat's request (it had none)");
      const req = await db.tenantRequest.findUnique({ where: { taskId: web.id }, select: { id: true, phone: true, optInAt: true } });
      if (req) made.requests.push(req.id);
      check(req?.phone === TEST_PHONE && !!req.optInAt, "the request holds the number and the time it was given");
      const gate = await gateForTask(web.id);
      check(gate.waPhone === TEST_PHONE && gate.why === "test-phone", "the gate now reads the number: the team's own, so a #mkan TEST card", `${gate.ok ? "ok" : gate.why}`);
      const asked = await askAvailabilityFor(web.id, h.id);
      check(asked.ok && asked.why === "handed", "'Ask the broker' with the team number reaches no broker", JSON.stringify(asked));

      // The broker's side: the question a real ask would have made, then the typed "available".
      if (link) {
        await db.brokerRequest.create({
          data: { tokenHash: createHash("sha256").update(randomBytes(18)).digest("hex"), listingId: h.id, brokerUserId: link.userId, taskId: web.id, status: "PENDING", channel: "manual", consentAt: new Date(), expiresAt: new Date(Date.now() + DAY) },
        });
        const since = new Date();
        await applyAnswer(h.id, "AVAILABLE", link.user.phoneNumber, "typed");
        const out = await db.outboundMessage.findMany({ where: { to: { in: [TEST_PHONE, TEST_DIGITS] }, createdAt: { gte: since } }, select: { kind: true, status: true, body: true } });
        const sheet = out.find((m) => m.kind === "TENANT_ALERT");
        check(!!sheet, "the broker's 'available' is written to the web tenant's number for WhatsApp", sheet?.body.split("\n")[0]?.slice(0, 70));
        check(!!sheet && sheet.status !== "QUEUED" && sheet.status !== "SENT", "...and held back: the e2e lock keeps it from reaching the phone", sheet?.status);
        const t = await db.agentTask.findUnique({ where: { id: web.id }, select: { shortlist: true } });
        check(((t?.shortlist as { availability?: string }[] | null) ?? [])[0]?.availability === "confirmed", "the web chat shows the home confirmed");
        // The same answer with no number left reaches nobody (what 4 of 4 'available' answers did).
        await db.tenantRequest.update({ where: { taskId: web.id }, data: { phone: null, optInAt: null } });
        await db.brokerRequest.updateMany({ where: { taskId: web.id }, data: { status: "PENDING" } });
        const before = out.length;
        await applyAnswer(h.id, "AVAILABLE", link.user.phoneNumber, "typed");
        const again = await db.outboundMessage.count({ where: { to: { in: [TEST_PHONE, TEST_DIGITS] }, createdAt: { gte: since } } });
        check(again === before, "without a number the same answer reaches nobody");
      } else check(false, "the home has a broker to answer");
    }

    // ── 5. the doors: a code, a pasted link, "today", "new", the bio ───────────
    // The step-3 deal would read any next message as its after-viewing answer: it goes first (cleanup finds nothing more).
    await db.deal.deleteMany({ where: { id: { in: made.deals } } });
    await db.listingVisit.deleteMany({ where: { id: { in: made.visits } } });
    made.deals.length = 0;
    made.visits.length = 0;
    await db.waState.deleteMany({ where: { key: `viewing-ask:${TEST_DIGITS}` } });
    const door = async (text: string) => {
      const r = await handleTenantWhatsApp({ phone: TEST_DIGITS, text, msgId: nextMsg() });
      if ("done" in r && r.done) await r.done;
      const taskId = "taskId" in r ? r.taskId : null;
      if (taskId) {
        // The turn may outlive the reply; the next message needs it settled.
        for (let i = 0; i < 30; i++) {
          const s = await db.agentTask.findUnique({ where: { id: taskId }, select: { status: true } });
          if (s?.status !== "RUNNING") break;
          await sleep(2_000);
        }
      }
      return { reply: "reply" in r ? r.reply : null, taskId, why: "why" in r ? r.why : undefined };
    };
    const firstShown = async (taskId: string | null) => {
      const t = taskId ? await db.agentTask.findUnique({ where: { id: taskId }, select: { shortlist: true, refListingId: true, refSource: true } }) : null;
      return { ids: ((t?.shortlist as { id: number }[] | null) ?? []).map((s) => s.id), ref: t?.refListingId ?? null, source: t?.refSource ?? null };
    };

    // The homes: a live home with a POSTED TikTok post (a published broker home first), else step 4's broker home.
    const posted = await db.tikTokPost.findMany({ where: { status: "POSTED", postedAt: { lte: new Date() } }, orderBy: { postedAt: "desc" }, take: 60, select: { listingId: true, tiktokId: true, tiktokUrl: true, postedAt: true } });
    const liveIds = new Set(
      (await db.listing.findMany({ where: { id: { in: posted.map((p) => p.listingId) }, lostAt: null, rentPeriod: "MONTHLY", priceMonth: { gt: 0 } }, select: { id: true } })).map((l) => l.id),
    );
    const post = posted.find((p) => liveIds.has(p.listingId)) ?? null;
    const codeId = post?.listingId ?? listingBefore?.id ?? null;

    // 5a. a TikTok code pins its home first.
    if (check(codeId != null, "a live home for the code step", codeId ? `K${codeId}` : "none")) {
      const r = await door(`K${codeId}`);
      const shown = await firstShown(r.taskId);
      check(!!r.reply && shown.ids[0] === codeId, `"K${codeId}" pins that home first`, `first = ${shown.ids[0] ?? "none"}, ${shown.ids.length} shown`);
      check(shown.ref === codeId && shown.source === "tiktok", "...and stamps the chat (refListingId, tiktok)", `${shown.ref} / ${shown.source}`);

      // 5e. the /tt bio's message: the code and the marker.
      const bio = await door(`Check K${codeId} for me tiktok_bio`);
      const bioShown = await firstShown(bio.taskId);
      check(!!bio.reply && bioShown.ids[0] === codeId, `"Check K${codeId} for me tiktok_bio" is answered with that home`, `first = ${bioShown.ids[0] ?? "none"}, ${bio.reply?.split("\n")[0]?.slice(0, 70) ?? bio.why ?? ""}`);
      check(bioShown.source === "tiktok_bio", "...counted as the bio's", bioShown.source ?? "null");
    }

    // 5b. a pasted TikTok post link resolves to its home.
    const linked = posted.filter((p) => liveIds.has(p.listingId)).find((p) => p.tiktokId && /^\d{8,25}$/.test(p.tiktokId));
    if (!linked) console.log("– skipped: the pasted TikTok link — no POSTED post with a numeric video id on a live home");
    else {
      const { homeForTikTokLink } = await import("../../src/components/agent/tiktok-link");
      const url = `https://www.tiktok.com/@mkan.rw/video/${linked.tiktokId}`;
      check((await homeForTikTokLink(`You posted this ${url}`)) === linked.listingId, "a TikTok post link resolves to its home (tiktok-link.ts)", `K${linked.listingId}`);
      const r = await door(`${url}`);
      const shown = await firstShown(r.taskId);
      check(!!r.reply && shown.ids[0] === linked.listingId && shown.source === "tiktok", `the pasted link answers K${linked.listingId} first, counted as TikTok's`, `first = ${shown.ids[0] ?? "none"}, ${shown.source ?? "null"}`);
    }

    // 5c. "today" / "uyu munsi": the day's homes as a numbered list ending on /today — or the nothing-posted line.
    for (const word of ["today", "uyu munsi"]) {
      const r = await door(word);
      const reply = r.reply ?? "";
      const nothing = /nothing (?:has been )?posted|nta zamu|لم يُنشر|no (?:new )?(?:homes|posts)/i.test(reply);
      const list = /(?:^|\n)\s*\*?1\./.test(reply) && /\/(?:en|ar|rw)\/today\b/.test(reply);
      check(!!reply && (list || nothing), `"${word}" lists the day's homes ending on /today, or says nothing is posted`, [reply.split("\n")[0], ...reply.split("\n").slice(-1)].join(" … ").slice(0, 140) || (r.why ?? ""));
      if (!nothing) {
        const shown = await firstShown(r.taskId);
        check(shown.ids.length > 0 && shown.ids.length <= 6, `"${word}" put the day's homes on the chat`, `${shown.ids.length} home(s)`);
      }
    }

    // 5d. "new" alone starts a new chat — not the today list.
    const before5 = (await db.agentProfile.findUnique({ where: { keyHash: profileKey }, select: { id: true } }))?.id;
    const tasksBefore = before5 ? await db.agentTask.count({ where: { profileId: before5 } }) : 0;
    const fresh = await door("new");
    const tasksAfter = before5 ? await db.agentTask.count({ where: { profileId: before5 } }) : 0;
    const looksLikeToday = /\/(?:en|ar|rw)\/today\b/.test(fresh.reply ?? "") || /posted today|nothing posted/i.test(fresh.reply ?? "");
    check(!looksLikeToday, '"new" alone is not the today list', (fresh.reply ?? fresh.why ?? "no reply").split("\n")[0]!.slice(0, 90));
    check(tasksAfter >= tasksBefore, '"new" alone starts a new chat (or the hello), never continues the today chat', `${tasksBefore} → ${tasksAfter} chat(s)`);

    check(blockedSends.length === 0 || blockedSends.every((u) => /slack|whatsapp|evolution|__wa/i.test(u)), "nothing reached a person", `${blockedSends.length} send(s) refused by the guard`);
  } finally {
    // The ids that name this number's rows in the CRM queue, taken before the chats go.
    const crmProfile = await db.agentProfile.findUnique({ where: { keyHash: hashKey(`wa:${TEST_DIGITS}`) }, select: { id: true } }).catch(() => null);
    const crmTasks = crmProfile ? (await db.agentTask.findMany({ where: { profileId: crmProfile.id }, select: { id: true } }).catch(() => [])).map((t) => t.id) : [];
    const crmKeys = [TEST_DIGITS, ...(crmProfile ? [crmProfile.id] : []), ...crmTasks, ...made.webTasks, ...made.deals];
    // ── cleanup: every row this run made ──────────────────────────────────────
    // Step 4's web chat: its answers, request, events and profile, and the home back as it was.
    await db.brokerRequest.deleteMany({ where: { taskId: { in: made.webTasks } } }).catch(() => {});
    await db.outboundMessage.deleteMany({ where: { tenantRequestId: { in: made.requests } } }).catch(() => {});
    await db.tenantRequest.deleteMany({ where: { taskId: { in: made.webTasks } } }).catch(() => {});
    await db.agentEvent.deleteMany({ where: { taskId: { in: made.webTasks } } }).catch(() => {});
    await db.deal.deleteMany({ where: { taskId: { in: made.webTasks } } }).catch(() => {});
    await db.agentTask.deleteMany({ where: { id: { in: made.webTasks } } }).catch(() => {});
    await db.agentProfile.deleteMany({ where: { id: { in: made.webProfiles } } }).catch(() => {});
    if (listingBefore) {
      await db.listing.update({ where: { id: listingBefore.id }, data: { lostAt: listingBefore.lostAt, lostReason: listingBefore.lostReason, lastAvailabilityConfirmedAt: listingBefore.lastAvailabilityConfirmedAt } }).catch(() => {});
    }
    await db.deal.deleteMany({ where: { id: { in: made.deals } } }).catch(() => {});
    await db.listingVisit.deleteMany({ where: { id: { in: made.visits } } }).catch(() => {});
    // The made-up number's chats are this script's alone: all of them go, and its profile.
    await deleteTestChats(db, hashKey(`wa:${TEST_DIGITS}`), { profileToo: true });
    await db.outboundMessage.deleteMany({ where: { to: { in: [TEST_PHONE, TEST_DIGITS] }, createdAt: { gte: t0 } } }).catch(() => {});
    await db.waState.deleteMany({ where: { OR: [{ key: { startsWith: `tmsg:${RUN}` } }, { key: `viewing-ask:${TEST_DIGITS}`, updatedAt: { gte: t0 } }, { key: { startsWith: `handoff:${RUN}` } }] } }).catch(() => {});
    // The doors' rows: the "hello" gate, an open ask, any CRM op or link a chat of this number caused, a note.
    await db.waState.deleteMany({ where: { OR: [{ key: { in: [`hello:${TEST_DIGITS}`, `viewing-ask:${TEST_DIGITS}`] } }, { key: { contains: TEST_DIGITS }, updatedAt: { gte: t0 } }] } }).catch(() => {});
    await db.crmOp.deleteMany({ where: { createdAt: { gte: t0 }, OR: crmKeys.map((k) => ({ key: { contains: k } })) } }).catch(() => {});
    await db.crmLink.deleteMany({ where: { createdAt: { gte: t0 }, OR: crmKeys.map((k) => ({ key: { contains: k } })) } }).catch(() => {});
    await db.dailyNote.deleteMany({ where: { day: { startsWith: "wae2e" } } }).catch(() => {});
    // Before = after: the made-up number's own rows are all gone.
    if (countsBefore) {
      const after = await scopeCounts();
      for (const k of Object.keys(countsBefore) as (keyof typeof countsBefore)[]) check(countsBefore[k] === after[k], `count ${k}`, `before ${countsBefore[k]}, after ${after[k]}`);
    }
    console.log(`\ncleanup done (${RUN})`);
    await db.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks pass");
  process.exit(failures ? 1 : 0);
}

/** Every chat of the made-up test number (never a real person's — TEST_DIGITS is fake), and optionally its profile. */
async function deleteTestChats(db: (typeof import("../../src/lib/db"))["db"], keyHash: string, opts: { profileToo?: boolean } = {}) {
  const profile = await db.agentProfile.findUnique({ where: { keyHash }, select: { id: true, waPhone: true } });
  if (!profile || profile.waPhone !== TEST_PHONE) return;
  const ids = (await db.agentTask.findMany({ where: { profileId: profile.id }, select: { id: true } })).map((t) => t.id);
  await db.brokerRequest.deleteMany({ where: { taskId: { in: ids } } }).catch(() => {});
  await db.agentEvent.deleteMany({ where: { taskId: { in: ids } } }).catch(() => {});
  await db.tenantRequest.deleteMany({ where: { taskId: { in: ids } } }).catch(() => {});
  await db.agentTask.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  if (opts.profileToo) await db.agentProfile.deleteMany({ where: { id: profile.id } }).catch(() => {});
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
