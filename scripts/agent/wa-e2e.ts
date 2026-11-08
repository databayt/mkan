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
 *
 * It drives the shipped functions with the team's test number (`pnpm wa:brokers test`), whose picks
 * never reach a broker (broker-sends.ts). Nothing reaches a person: see ./e2e-locks. It never writes
 * the line's shared arrays (tenant-stop, tenant-sent, seen) — another process's write there could drop
 * a real tenant's STOP — so STOP itself is covered by the unit tests (tests/wa/outbox.test.ts).
 */
import { blockedSends } from "./e2e-locks";

// Step 4 walks the relay path (the deal sheet to the tenant), not a direct intro (deal-intro.ts).
process.env.MKAN_INTRO_CAP = "0";

const TEST_DIGITS = "249919071294";
const TEST_PHONE = `+${TEST_DIGITS}`;
const RUN = `wae2e-${Date.now().toString(36)}`;
let n = 0;
const nextMsg = () => `${RUN}-${++n}`;

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
  const made = { visits: [] as number[], deals: [] as string[], webTasks: [] as string[], webProfiles: [] as string[], requests: [] as string[] };
  let listingBefore: { id: number; lostAt: Date | null; lostReason: string | null; lastAvailabilityConfirmedAt: Date | null } | null = null;
  try {
    if (!check((await testPhones()).has(TEST_DIGITS), "the test number is on the team list")) return;

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
      check(!!after.reply && /tell the broker you want|سأخبر الوسيط|Ndabwira komisiyoneri/i.test(after.reply), "'1' after the viewing answers the viewing", after.reply?.slice(0, 90));
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
    check(blockedSends.length === 0 || blockedSends.every((u) => /slack|whatsapp|evolution|__wa/i.test(u)), "nothing reached a person", `${blockedSends.length} send(s) refused by the guard`);
  } finally {
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
    const profile = await db.agentProfile.findUnique({ where: { keyHash: hashKey(`wa:${TEST_DIGITS}`) }, select: { id: true } });
    if (profile) {
      const tasks = await db.agentTask.findMany({ where: { profileId: profile.id, createdAt: { gte: t0 } }, select: { id: true } });
      const ids = tasks.map((t) => t.id);
      await db.brokerRequest.deleteMany({ where: { taskId: { in: ids } } }).catch(() => {});
      await db.agentEvent.deleteMany({ where: { taskId: { in: ids } } }).catch(() => {});
      await db.agentTask.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    }
    await db.outboundMessage.deleteMany({ where: { to: { in: [TEST_PHONE, TEST_DIGITS] }, createdAt: { gte: t0 } } }).catch(() => {});
    await db.waState.deleteMany({ where: { OR: [{ key: { startsWith: `tmsg:${RUN}` } }, { key: `viewing-ask:${TEST_DIGITS}`, updatedAt: { gte: t0 } }, { key: { startsWith: `handoff:${RUN}` } }] } }).catch(() => {});
    console.log(`\ncleanup done (${RUN})`);
    await db.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks pass");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
