/**
 * The money path, end to end, on the production database — before the first
 * real deal, and after any change to it:
 *
 *   pnpm deal:e2e            run every step, then delete every row it made
 *   pnpm deal:e2e --keep     leave the rows (and the listing/broker changes) for debugging
 *
 * It drives the SHIPPED functions with the team's test number (+249 919 071 294,
 * `pnpm wa:brokers test`), whose picks never reach a broker (broker-sends.ts):
 *
 *   1. "K<id>" — a TikTok code for a live Kigali broker home (the newest one)
 *      → handleTenantWhatsApp: homes back, the chat stamped tiktok + that home
 *   2. "1" — check it → the team-number path: a #mkan TEST card, no BrokerRequest
 *   3. the broker's typed "yes" → broker-inbox.ts recordTypedAnswer (on a
 *      BrokerRequest made here, since step 2 makes none): the deal sheet and
 *      "when can you come?"; then the tenant names a day → proposeViewing
 *   4. deal.ts bookViewing (`pnpm deal:book`) → ListingVisit + Deal
 *   5. setDealStatus SIGNED, PAID (`pnpm deal:status`) → RevenueEntry COMMISSION
 *   6. /monetize's first-share funnel counts the chat, attributed to a post
 *   8. a direct intro on a second home (deal-intro.ts, until 10 deals are paid): the broker's yes →
 *      Mkan's terms → their YES → a Deal with introducedAt and both numbers; the 24 h and 7-day
 *      follow-ups (marked sent by hand: nothing is sent) → VIEWED, SIGNED, and both 1–5 ratings
 *
 * Nothing reaches a person: MKAN_WA_OUTBOX is forced off for this process, so
 * every send is written SKIPPED (the Mac's outbox only sends QUEUED rows), and
 * SLACK_BOT_TOKEN is unset, so postSlackCard only logs (captured below) —
 * a fetch guard refuses slack.com and WhatsApp hosts as a second lock.
 * Every row is deleted in `finally`; the listing, the broker and the test
 * profile get their earlier values back.
 */
import { config } from "dotenv";
config({ override: true, quiet: true } as never);

import { randomBytes, createHash } from "node:crypto";

// ── the locks, before any src module reads env ──────────────────────────────
process.env.MKAN_WA_OUTBOX = "0";
delete process.env.SLACK_BOT_TOKEN;
// Steps 1–7 walk the relay path (Mkan in the middle); step 8 turns direct intros on (deal-intro.ts).
process.env.MKAN_INTRO_CAP = "0";
process.env.PRISMA_QUIET ??= "1";
const slackCards: string[] = [];
const realWarn = console.warn.bind(console);
console.warn = (...a: unknown[]) => {
  const s = a.map(String).join(" ");
  if (s.startsWith("[agent] no SLACK_BOT_TOKEN")) slackCards.push(s.replace(/^\[agent\] no SLACK_BOT_TOKEN — manual send not posted:\n/, ""));
  else realWarn(...a);
};
const blocked: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/slack\.com|graph\.facebook\.com|whatsapp|evolution/i.test(url)) {
    blocked.push(url);
    throw new Error(`deal:e2e refused a send to ${new URL(url).host}`);
  }
  return realFetch(input as never, init);
}) as typeof fetch;

const KEEP = process.argv.includes("--keep");
const TEST_DIGITS = "249919071294";
const TEST_PHONE = `+${TEST_DIGITS}`;
const RUN = `e2e-${Date.now().toString(36)}`;
const msgIds: string[] = [];
const nextMsg = () => {
  const id = `${RUN}-${msgIds.length + 1}`;
  msgIds.push(id);
  return id;
};

let failures = 0;
function check(ok: boolean, label: string, detail = ""): boolean {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
  return ok;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;

async function main() {
  const { db } = await import("../../src/lib/db");
  const { hashKey } = await import("../../src/components/agent/profile");
  const { testPhones } = await import("../../src/components/agent/broker-sends");
  const { handleTenantWhatsApp } = await import("../../src/components/agent/whatsapp-chat");
  const { recordTypedAnswer } = await import("../../src/components/agent/broker-inbox");
  const { bookViewing, setDealStatus } = await import("../../src/components/agent/deal");
  const { loadFirstShare } = await import("../../src/lib/monetize/first-share");

  // Both the deployed (HEAD: `phone`) and the working tree (`address`) signatures.
  const say = (text: string) => handleTenantWhatsApp({ address: TEST_DIGITS, phone: TEST_DIGITS, text, msgId: nextMsg() } as never);
  const variants = [TEST_PHONE, TEST_DIGITS];

  const t0 = new Date();
  // ── preconditions ─────────────────────────────────────────────────────────
  const tests = await testPhones();
  if (!check(tests.has(TEST_DIGITS), "the test number is on the team list", `test-phones = ${[...tests].join(", ") || "none"}`)) return;
  const profileBefore = await db.agentProfile.findUnique({
    where: { keyHash: hashKey(`wa:${TEST_DIGITS}`) },
    select: { id: true, memory: true, lastSearchAt: true, firstSource: true, firstRef: true, waPhone: true },
  });

  // A live Kigali broker home (a TikTok lead with a reachable broker) nobody asked about in 30 days —
  // a broker's answer below touches every open question about the home, so it must have none. The
  // newest one with a real POSTED TikTok post first (step 6 then needs no stand-in post), else the newest.
  const homeWhere = {
      isPublished: false,
      source: "TIKTOK",
      rentPeriod: "MONTHLY",
      sourceUrl: { not: null },
      lostAt: null,
      currency: "RWF",
      priceMonth: { gt: 0 },
      location: { city: { equals: "Kigali", mode: "insensitive" }, state: { in: ["GASABO", "KICUKIRO", "NYARUGENGE"], mode: "insensitive" } },
      brokers: { some: { brokerId: { not: null }, user: { phoneNumber: { not: null } } } },
      brokerRequests: { none: { createdAt: { gte: new Date(Date.now() - 30 * DAY) } } },
      deals: { none: {} },
  } satisfies NonNullable<Parameters<typeof db.listing.findFirst>[0]>["where"];
  const homeSelect = { id: true, title: true, lostAt: true, lostReason: true, lastAvailabilityConfirmedAt: true } as const;
  const realPosts = await db.tikTokPost.findMany({ where: { status: "POSTED", postedAt: { lte: new Date() } }, orderBy: { postedAt: "desc" }, select: { listingId: true } });
  let listing: { id: number; title: string | null; lostAt: Date | null; lostReason: string | null; lastAvailabilityConfirmedAt: Date | null } | null = null;
  for (const { listingId } of realPosts) {
    listing = await db.listing.findFirst({ where: { ...homeWhere, id: listingId }, select: homeSelect });
    if (listing) break;
  }
  listing ??= await db.listing.findFirst({ where: homeWhere, orderBy: { createdAt: "desc" }, select: homeSelect });
  if (!check(!!listing, "a live Kigali broker home to test with", listing ? `K${listing.id} ${listing.title ?? ""}` : "none found")) return;
  const home = listing!;
  const link = await db.listingBroker.findFirst({
    where: { listingId: home.id },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: { userId: true, brokerId: true, user: { select: { phoneNumber: true } } },
  });
  const brokerPhone = link?.user.phoneNumber ?? null;
  const brokerVariants = brokerPhone ? [`+${brokerPhone.replace(/^\+/, "")}`, brokerPhone.replace(/^\+/, "")] : [];
  const brokersTouched = await db.broker.findMany({
    where: { OR: [...(link?.brokerId ? [{ id: link.brokerId }] : []), ...(brokerVariants.length ? [{ phones: { hasSome: brokerVariants } }] : [])] },
    select: { id: true, relationship: true, answers: true, availableAnswers: true, sharePct: true, shareFlatRwf: true, agreementNote: true, agreedAt: true },
  });

  // Row counts in this run's scope, before and after.
  const scopeCounts = async (profileId: string | null) => {
    const tasks = profileId ? await db.agentTask.findMany({ where: { profileId }, select: { id: true } }) : [];
    const taskIds = tasks.map((t) => t.id);
    const [events, deals, visits, requests, posts, outbound, waState, tenantReqs, revenue] = await Promise.all([
      db.agentEvent.count({ where: { taskId: { in: taskIds } } }),
      db.deal.count({ where: { listingId: home.id } }),
      db.listingVisit.count({ where: { listingId: home.id } }),
      db.brokerRequest.count({ where: { listingId: home.id } }),
      db.tikTokPost.count({ where: { listingId: home.id } }),
      db.outboundMessage.count({ where: { to: { in: [...variants, ...brokerVariants] } } }),
      db.waState.count({ where: { OR: [{ key: { contains: TEST_DIGITS } }, { key: { contains: RUN } }] } }),
      db.tenantRequest.count({ where: { taskId: { in: taskIds } } }),
      db.revenueEntry.count({ where: { line: "COMMISSION" } }),
    ]);
    return { agentTask: taskIds.length, agentEvent: events, deal: deals, listingVisit: visits, brokerRequest: requests, tikTokPost: posts, outboundMessage: outbound, waState, tenantRequest: tenantReqs, revenueCommission: revenue };
  };
  const before = await scopeCounts(profileBefore?.id ?? null);

  const made = {
    taskIds: new Set<string>(),
    requestIds: [] as string[],
    postId: null as string | null,
    visitId: null as number | null,
    dealId: null as string | null,
    // Step 8's second home and its broker, restored in cleanup.
    home2: null as { id: number; lostAt: Date | null; lostReason: string | null; lastAvailabilityConfirmedAt: Date | null } | null,
    broker2: null as {
      id: string;
      relationship: string;
      answers: number;
      availableAnswers: number;
      sharePct: unknown;
      shareFlatRwf: number | null;
      agreementNote: string | null;
      agreedAt: Date | null;
      visitFee: number | null;
    } | null,
    broker2Variants: [] as string[],
  };
  let profileId = profileBefore?.id ?? null;

  try {
    // 6 (setup) — a POSTED TikTok post for the home, an hour before the chat, if none exists.
    const posted = await db.tikTokPost.findFirst({ where: { listingId: home.id, status: "POSTED", postedAt: { lte: t0 } }, select: { id: true } });
    if (!posted) {
      const p = await db.tikTokPost.create({
        data: { listingId: home.id, ref: `K${home.id}`, status: "POSTED", reason: RUN, pickedAt: new Date(t0.getTime() - 2 * 3_600_000), postedAt: new Date(t0.getTime() - 3_600_000) },
        select: { id: true },
      });
      made.postId = p.id;
      console.log(`  · no POSTED TikTokPost for K${home.id}: a temporary one (${p.id}), posted an hour before the chat`);
    } else console.log(`  · K${home.id} has a real POSTED TikTokPost (${posted.id}) — used as is, never changed`);

    // ── 1. the TikTok code ──────────────────────────────────────────────────
    console.log(`\n1. "K${home.id}" from ${TEST_PHONE}`);
    const r1 = await say(`K${home.id}`);
    const reply1 = "reply" in r1 && r1.reply ? r1.reply : null;
    const taskId = "taskId" in r1 ? r1.taskId : null;
    if (taskId) made.taskIds.add(taskId);
    check(!!reply1 && !!taskId, "a reply on a chat", reply1 ? `${reply1.length} chars, chat ${taskId}` : `none (${"why" in r1 ? r1.why : "?"})`);
    if (!taskId) return;
    // The turn may outlive the bridge's 16 s wait; the next message needs it settled.
    for (let i = 0; i < 30; i++) {
      const s = await db.agentTask.findUnique({ where: { id: taskId }, select: { status: true } });
      if (s?.status !== "RUNNING") break;
      await sleep(2_000);
    }
    const task1 = await db.agentTask.findUnique({ where: { id: taskId }, select: { refListingId: true, refSource: true, status: true, shortlist: true, profileId: true } });
    profileId = task1?.profileId ?? profileId;
    const shortlist = (task1?.shortlist as { id: number; lead?: unknown; availability?: string }[] | null) ?? [];
    check(shortlist.length > 0 && /K?\d|\/find\?c=/.test(reply1 ?? ""), "the reply carries homes", `${shortlist.length} on the shortlist, task ${task1?.status}`);
    check(shortlist[0]?.id === home.id, "the coded home is first", `first = ${shortlist[0]?.id ?? "none"}, ${shortlist[0]?.lead ? "lead" : "not a lead"}, ${shortlist[0]?.availability ?? "?"}`);
    check(task1?.refListingId === home.id && task1?.refSource === "tiktok", "AgentTask refListingId + refSource", `${task1?.refListingId} / ${task1?.refSource}`);
    const prof1 = await db.agentProfile.findUnique({ where: { id: profileId! }, select: { firstSource: true, firstRef: true, createdAt: true } });
    console.log(
      `  · profile firstSource = ${prof1?.firstSource ?? "null"}, firstRef = ${prof1?.firstRef ?? "null"} (profile made ${prof1?.createdAt.toISOString().slice(0, 10)}; ` +
        `firstSource is stamped only on a profile made in the last hour, so an older test profile stays as it was)`,
    );

    // ── 2. the pick ─────────────────────────────────────────────────────────
    console.log(`\n2. "1" — check that home`);
    const cards2 = slackCards.length;
    const r2 = await say("1");
    const reply2 = "reply" in r2 ? r2.reply : null;
    check(!!reply2 && "taskId" in r2 && r2.taskId === taskId, "a reply on the same chat", reply2 ?? `none (${"why" in r2 ? r2.why : "?"})`);
    const handed = await db.agentEvent.findFirst({ where: { taskId, kind: "availability_asked" }, orderBy: { seq: "desc" }, select: { payload: true } });
    check((handed?.payload as { handed?: boolean } | null)?.handed === true, "the team-number path ran (availability_asked, handed)", JSON.stringify(handed?.payload ?? null));
    check(slackCards.slice(cards2).some((c) => c.includes("🧪 TEST")), "#mkan got a TEST card (intercepted, not posted)");
    const req2 = await db.brokerRequest.count({ where: { taskId } });
    check(req2 === 0, "no BrokerRequest for a team number", `${req2}`);
    const toBroker2 = brokerVariants.length ? await db.outboundMessage.count({ where: { to: { in: brokerVariants }, createdAt: { gte: t0 } } }) : 0;
    check(toBroker2 === 0, "no OutboundMessage to the broker", `${toBroker2}`);

    // ── 3. the broker's yes ─────────────────────────────────────────────────
    console.log(`\n3. the broker answers "yes" (broker-inbox.ts recordTypedAnswer)`);
    if (!check(!!link && !!brokerPhone, "the home has a broker with a number", brokerPhone ?? "none")) return;
    // Step 2 makes no BrokerRequest for a team number, so the one a real tenant's pick makes is made here.
    const token = randomBytes(18).toString("base64url");
    const req = await db.brokerRequest.create({
      data: {
        tokenHash: createHash("sha256").update(token).digest("hex"),
        listingId: home.id,
        brokerUserId: link!.userId,
        taskId,
        locale: "en",
        need: { e2e: RUN },
        channel: "e2e",
        consentAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });
    made.requestIds.push(req.id);
    console.log(`  · BrokerRequest ${req.id} made by the test (a team number's pick makes none)`);
    const cards3 = slackCards.length;
    // A real tenant may have asked about this home since the run began: their open question would get our "yes".
    const others = await db.brokerRequest.count({ where: { listingId: home.id, status: "PENDING", id: { not: req.id } } });
    if (!check(others === 0, "no real open question about the home", `${others} pending`)) return;
    await recordTypedAnswer([req.id], home.id, "AVAILABLE", brokerPhone!);
    const req3 = await db.brokerRequest.findUnique({ where: { id: req.id }, select: { status: true, respondedAt: true } });
    check(req3?.status === "AVAILABLE" && !!req3.respondedAt, "the request reads AVAILABLE", `${req3?.status}`);
    const sheet = await db.outboundMessage.findMany({ where: { to: { in: variants }, createdAt: { gte: t0 } }, select: { id: true, status: true, label: true, body: true } });
    check(sheet.length > 0, "the deal sheet was written for the tenant", `${sheet.length} row(s)`);
    check(sheet.every((m) => m.status !== "QUEUED"), "…and none of it is QUEUED (the outbox never sends it)", sheet.map((m) => m.status).join(", "));
    const ask = await db.waState.findUnique({ where: { key: `viewing-ask:${TEST_DIGITS}` }, select: { value: true } });
    check((ask?.value as { taskId?: string; listingId?: number } | null)?.taskId === taskId, '"when can you come?" is open for the tenant', JSON.stringify(ask?.value ?? null));
    check(slackCards.slice(cards3).some((c) => c.includes("is available")), "#mkan got the viewing-rep card (intercepted)");
    const shortlist3 = ((await db.agentTask.findUnique({ where: { id: taskId }, select: { shortlist: true } }))?.shortlist as { id: number; availability?: string }[]) ?? [];
    check(shortlist3.find((s) => s.id === home.id)?.availability === "confirmed", "the chat's card reads confirmed");

    // The tenant names a day three days out (the hourly reminder cron looks 25 h ahead, so it never picks this up).
    const day = new Date(Date.now() + 2 * 3_600_000 + 3 * DAY).toLocaleDateString("en-US", { weekday: "long", timeZone: "Africa/Kigali" });
    const r3 = await say(`${day} at 10am`);
    const reply3 = "reply" in r3 ? r3.reply : null;
    const ask3 = (await db.waState.findUnique({ where: { key: `viewing-ask:${TEST_DIGITS}` }, select: { value: true } }))?.value as { proposedAt?: string } | null;
    check(!!ask3?.proposedAt, `"${day} at 10am" is read as the viewing time`, ask3?.proposedAt ?? reply3 ?? "nothing");
    const proposed = await db.agentEvent.count({ where: { taskId, kind: "viewing_proposed" } });
    check(proposed === 1, "viewing_proposed on the chat", `${proposed}`);

    // ── 4. book the viewing ─────────────────────────────────────────────────
    console.log(`\n4. bookViewing (pnpm deal:book)`);
    const at = ask3?.proposedAt ? new Date(ask3.proposedAt) : new Date(Date.now() + 3 * DAY);
    // Mkan's share is settled before a viewing is booked (2026-11-07): with no agreement on record, a
    // booking without one is refused before anything is written.
    const agreedBefore = brokersTouched.some((b) => b.id === link?.brokerId && (b.sharePct != null || b.shareFlatRwf != null));
    if (!agreedBefore) {
      const refused = await bookViewing({ taskId, listingId: home.id, at, place: "deal:e2e", by: "deal:e2e", terms: null }).then(
        () => null,
        (err: Error) => err.message,
      );
      check(!!refused && /no share agreed/.test(refused), "a booking with no share agreed is refused", refused ?? "it booked");
      const half = await db.deal.count({ where: { taskId } });
      check(half === 0, "…and wrote nothing", `${half} deal(s)`);
    } else console.log("  · the broker already has a share on record: the refusal is not exercised");
    const booked = await bookViewing({ taskId, listingId: home.id, at, place: "deal:e2e — not a real viewing", by: "deal:e2e", terms: null, share: { pct: 0.5 } });
    made.visitId = booked.visitId;
    made.dealId = booked.dealId;
    const priced = await db.deal.findUnique({ where: { id: booked.dealId }, select: { brokerCommission: true, mkanShare: true } });
    const wantShare = priced?.brokerCommission ? Math.round(priced.brokerCommission * 0.5) : null;
    check(priced?.mkanShare === wantShare, "the deal carries Mkan's share (50% of the commission)", `commission ${priced?.brokerCommission ?? "none"}, share ${priced?.mkanShare ?? "none"}`);
    check(/💵|⚠ No share/.test(booked.economics), "the booking says what the deal earns", booked.economics);
    if (link?.brokerId) {
      const b = await db.broker.findUnique({ where: { id: link.brokerId }, select: { sharePct: true, relationship: true, agreedAt: true } });
      check(Number(b?.sharePct) === 0.5 && b?.relationship === "PARTNER" && !!b.agreedAt, "the broker's agreement is recorded (restored in cleanup)", `${b?.sharePct} · ${b?.relationship}`);
    }
    const visit = await db.listingVisit.findUnique({ where: { id: booked.visitId }, select: { taskId: true, contactPhone: true, scheduledFor: true } });
    const deal = await db.deal.findUnique({ where: { id: booked.dealId }, select: { status: true, taskId: true, visitId: true, listingId: true, brokerId: true, rentMonthly: true } });
    check(visit?.taskId === taskId && visit?.contactPhone === TEST_PHONE, "ListingVisit with taskId and the tenant", `visit ${booked.visitId}`);
    check(deal?.status === "VIEWING_BOOKED" && deal.taskId === taskId && deal.visitId === booked.visitId, "Deal VIEWING_BOOKED with taskId", `deal ${booked.dealId}, rent ${deal?.rentMonthly ?? "?"}, broker ${deal?.brokerId ?? "none"}`);
    // Data, not code: a rent no Kigali home asks still prices the deal sheet and the Deal. Flagged, not failed.
    if ((deal?.rentMonthly ?? 0) > 20_000_000) console.log(`  ⚠ K${home.id} rent ${deal!.rentMonthly!.toLocaleString("en")} RWF/month is implausible — check the listing's price`);
    const queued4 = await db.outboundMessage.count({ where: { to: { in: variants }, createdAt: { gte: t0 }, status: "QUEUED" } });
    check(queued4 === 0, "the tenant's confirmation is not QUEUED", `${queued4}`);
    const askGone = await db.waState.count({ where: { key: `viewing-ask:${TEST_DIGITS}` } });
    check(askGone === 0, "the viewing ask is closed");

    // ── 5. signed, then paid ────────────────────────────────────────────────
    console.log(`\n5. setDealStatus SIGNED, PAID (pnpm deal:status)`);
    const cards5 = slackCards.length;
    // The share booked above closes the deal; a home with no commission line gets one given here.
    await setDealStatus(booked.dealId, "SIGNED", { notes: RUN, ...(priced?.mkanShare ? {} : { mkanShare: 1000 }) });
    const signed = await db.deal.findUnique({ where: { id: booked.dealId }, select: { status: true, signedAt: true, mkanShare: true } });
    const invoice = slackCards.slice(cards5).find((c) => c.includes("🧾 *Invoice*"));
    check(!!invoice && invoice.includes(`RWF ${(signed?.mkanShare ?? 0).toLocaleString("en-US")}`), "SIGNED posts the invoice with the share (a person sends it)", invoice?.split("\n")[0] ?? "no invoice card");
    check(!!invoice && (invoice.includes("wa.me") || invoice.includes("no broker number")), "…with the drafted WhatsApp to the broker");
    const lost = await db.listing.findUnique({ where: { id: home.id }, select: { lostAt: true, lostReason: true } });
    check(signed?.status === "SIGNED" && !!signed.signedAt, "SIGNED with signedAt");
    check(!!lost?.lostAt && lost.lostReason === "RENTED", "the home is off the market (lostAt, RENTED)");
    if (deal?.brokerId) {
      const b = await db.broker.findUnique({ where: { id: deal.brokerId }, select: { relationship: true } });
      console.log(`  · broker relationship now ${b?.relationship} (restored in cleanup)`);
    }
    await setDealStatus(booked.dealId, "PAID", { mkanShare: 1000 });
    const paid = await db.deal.findUnique({ where: { id: booked.dealId }, select: { status: true, paidAt: true, mkanShare: true, signedAt: true } });
    const revenue = await db.revenueEntry.findMany({ where: { dealId: booked.dealId }, select: { line: true, amountRwf: true } });
    check(paid?.status === "PAID" && !!paid.paidAt && !!paid.signedAt, "PAID with paidAt (signedAt kept)");
    check(revenue.length === 1 && revenue[0]!.line === "COMMISSION" && revenue[0]!.amountRwf === 1000, "one COMMISSION RevenueEntry of 1,000 RWF", JSON.stringify(revenue));
    await setDealStatus(booked.dealId, "PAID", { mkanShare: 1000 });
    check((await db.revenueEntry.count({ where: { dealId: booked.dealId } })) === 1, "PAID twice is still one entry");

    // ── 6. the first-share funnel ───────────────────────────────────────────
    console.log(`\n6. /monetize first-share funnel (loadFirstShare(7))`);
    const view = await loadFirstShare(7);
    if (check(!!view, "the funnel reads")) {
      const post = view!.posts.find((p) => p.listingId === home.id);
      check(view!.chats >= 1 && view!.contacts >= 1, "the chat counts as a tiktok contact", `contacts ${view!.contacts}, chats ${view!.chats}`);
      check(!!post && post.chats >= 1, "the chat is attributed to the home's post", post ? `post ${post.id}${made.postId ? " (temporary)" : ""}: chats ${post.chats}` : "no post row for the home");
      check(!!post && post.paid >= 1 && post.paidShareRwf >= 1000, "…and so is the paid deal", post ? `viewings ${post.viewings}, signed ${post.signed}, paid ${post.paid}, share ${post.paidShareRwf} RWF` : "");
    }

    // ── 7. an unattended session cannot write money ─────────────────────────
    console.log(`\n7. deal:status from an unattended session`);
    const { spawnSync } = await import("node:child_process");
    const guarded = spawnSync("pnpm", ["exec", "tsx", "--require", "./scripts/agent/no-server-only.js", "scripts/agent/deal.ts", "status", `--deal=${booked.dealId}`, "--status=lost"], {
      env: { ...process.env, MKAN_UNATTENDED: "1" },
      encoding: "utf8",
      timeout: 60_000,
    });
    const still = await db.deal.findUnique({ where: { id: booked.dealId }, select: { status: true } });
    check(guarded.status === 3 && still?.status === "PAID", "refused with exit 3, the deal untouched", `exit ${guarded.status}, deal ${still?.status}`);

    // ── 8. a direct intro ───────────────────────────────────────────────────
    console.log(`\n8. a direct intro (until 10 deals are paid): terms, both numbers, follow-ups`);
    process.env.MKAN_INTRO_CAP = "1000";
    const { answerTerms, introSweep, introBrokerUpdate } = await import("../../src/components/agent/deal-intro");
    const home2 = await db.listing.findFirst({
      where: { ...homeWhere, id: { not: home.id }, brokers: { some: { brokerId: { not: null }, user: { phoneNumber: { not: null } }, broker: { is: { sharePct: null, shareFlatRwf: null, optOut: false } } } } },
      orderBy: { createdAt: "desc" },
      select: homeSelect,
    });
    const link2 = home2
      ? await db.listingBroker.findFirst({
          where: { listingId: home2.id, brokerId: { not: null }, user: { phoneNumber: { not: null } }, broker: { is: { sharePct: null, shareFlatRwf: null, optOut: false } } },
          select: { userId: true, brokerId: true, user: { select: { phoneNumber: true } } },
        })
      : null;
    if (check(!!home2 && !!link2?.brokerId, "a second home whose broker has no terms yet", home2 ? `K${home2.id}` : "none")) {
      made.home2 = home2;
      const phone2 = link2!.user.phoneNumber!;
      const digits2 = phone2.replace(/\D/g, "");
      made.broker2 = await db.broker.findUnique({ where: { id: link2!.brokerId! }, select: { id: true, relationship: true, answers: true, availableAnswers: true, sharePct: true, shareFlatRwf: true, agreementNote: true, agreedAt: true, visitFee: true } });
      made.broker2Variants = [`+${digits2}`, digits2];
      const token2 = randomBytes(18).toString("base64url");
      const req2 = await db.brokerRequest.create({
        data: { tokenHash: createHash("sha256").update(token2).digest("hex"), listingId: home2!.id, brokerUserId: link2!.userId, taskId, locale: "en", need: { e2e: RUN }, channel: "e2e", consentAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
        select: { id: true },
      });
      made.requestIds.push(req2.id);
      const cards8 = slackCards.length;
      await recordTypedAnswer([req2.id], home2!.id, "AVAILABLE", phone2);
      const termsAsk = (await db.waState.findUnique({ where: { key: `terms-ask:${digits2}` }, select: { value: true } }))?.value as { tenants?: { taskId: string }[] } | null;
      check(termsAsk?.tenants?.some((t) => t.taskId === taskId) === true, "the broker's yes opens Mkan's terms ask (no terms on record)", JSON.stringify(termsAsk));
      check(slackCards.slice(cards8).some((c) => c.includes("🤝 *Intro*")), "#mkan hears the intro started");
      const pending = await db.outboundMessage.findFirst({ where: { to: { in: variants }, label: "tenant-intro", createdAt: { gte: t0 } }, select: { body: true } });
      check(!!pending && !/\+?\d{9,}/.test(pending.body), "the tenant hears the broker will connect — no number yet", pending?.body.slice(0, 80) ?? "none");

      const yes = await answerTerms(phone2, "Yes, agreed", new Date());
      check(yes?.answer === "yes" && !!yes.reply && yes.reply.includes(TEST_PHONE), "their YES gets them the tenant's number", yes?.reply?.slice(0, 120) ?? "no answer");
      const b2 = await db.broker.findUnique({ where: { id: link2!.brokerId! }, select: { sharePct: true, visitFee: true, relationship: true, agreedAt: true } });
      check(Number(b2?.sharePct) === 0.1 && b2?.visitFee === 0 && b2?.relationship === "PARTNER" && !!b2.agreedAt, "the terms are on record: 10%, free viewing, PARTNER (restored in cleanup)", JSON.stringify(b2));
      const deal8 = await db.deal.findFirst({ where: { taskId, listingId: home2!.id }, select: { id: true, introducedAt: true, status: true, viewingFeePaid: true } });
      check(!!deal8?.introducedAt && deal8.status === "VIEWING_BOOKED" && deal8.viewingFeePaid === 0, "a Deal with introducedAt, no viewing fee", JSON.stringify(deal8));
      const intro = await db.outboundMessage.findFirst({ where: { to: { in: variants }, label: "tenant-intro", createdAt: { gte: t0 }, body: { contains: digits2 } }, select: { body: true } });
      check(!!intro, "the tenant gets the broker's WhatsApp", intro?.body.slice(0, 120) ?? "none");

      if (deal8) {
        // A Kigali 10:00 at least `h` hours after the intro: inside the send window.
        const kigali10 = (h: number) => {
          const t = new Date(deal8.introducedAt!.getTime() + h * 3_600_000 + 2 * 3_600_000);
          return new Date(`${new Date(t.getTime() + DAY).toISOString().slice(0, 10)}T10:00:00+02:00`);
        };
        const sent = async (label: string) =>
          db.outboundMessage.updateMany({ where: { label, createdAt: { gte: t0 } }, data: { status: "SENT", sentAt: new Date() } });
        await introSweep(kigali10(25));
        check((await sent(`tenant-intro-fu-24h:${deal8.id}`)).count === 1, "24 h: the tenant is asked \"did you see it?\"");
        const r8 = await say("1");
        const viewed = await db.deal.findUnique({ where: { id: deal8.id }, select: { status: true } });
        check(viewed?.status === "VIEWED", "\"1\" → VIEWED", `${viewed?.status} · ${"reply" in r8 ? r8.reply : ""}`);
        await introSweep(kigali10(24 * 7 + 1));
        check((await sent(`tenant-intro-fu-7d:${deal8.id}`)).count === 1, "7 days: the tenant is asked \"did you take it?\" and a rating");
        const brokerFu = await sent(`auto-intro-fu:${deal8.id}`);
        check(brokerFu.count === 1, "7 days: the broker is asked \"did they sign?\"");
        await say("Yes I took it, 5");
        const signed8 = await db.deal.findUnique({ where: { id: deal8.id }, select: { status: true, signedAt: true } });
        check(signed8?.status === "SIGNED" && !!signed8.signedAt, "\"yes … 5\" → SIGNED", signed8?.status ?? "none");
        const upd = await introBrokerUpdate(link2!.brokerId!, phone2, "Signed. 4", new Date());
        check(upd?.rating === 4, "the broker's answer is read, with their rating", JSON.stringify(upd));
        const scores = await db.agentEvent.findMany({ where: { taskId, kind: "feedback" }, select: { payload: true } });
        const got = scores.map((e) => e.payload as { kind?: string; who?: string; score?: number }).filter((p) => p.kind === "score");
        check(got.some((p) => p.who === "tenant" && p.score === 5) && got.some((p) => p.who === "broker" && p.score === 4), "both 1–5 ratings are recorded", JSON.stringify(got));
      }
      // What step 8 wrote to the broker and marked sent by hand goes now: the leak check below is for real sends.
      await db.outboundMessage.deleteMany({ where: { createdAt: { gte: t0 }, OR: [{ to: { in: made.broker2Variants } }, { label: { startsWith: "tenant-intro" } }] } });
      await db.waState.deleteMany({ where: { key: { in: [`terms-ask:${digits2}`, `intro-reply:${digits2}`] } } });
    }
    process.env.MKAN_INTRO_CAP = "0";

    const leaked = await db.outboundMessage.count({ where: { to: { in: [...variants, ...brokerVariants] }, createdAt: { gte: t0 }, status: { in: ["QUEUED", "SENT"] } } });
    check(leaked === 0 && blocked.length === 0, "nothing was sent to anyone", `${leaked} queued/sent row(s), ${blocked.length} blocked fetch(es), ${slackCards.length} Slack card(s) intercepted`);
  } catch (err) {
    check(false, "the run threw", (err as Error).stack ?? String(err));
  } finally {
    if (KEEP) {
      console.log(`\n--keep: rows left in place — chat ${[...made.taskIds].join(", ")}, deal ${made.dealId}, visit ${made.visitId}, post ${made.postId}, requests ${made.requestIds.join(", ")}`);
      console.log(`  restore by hand: Listing ${home.id} lostAt=${home.lostAt?.toISOString() ?? null} lostReason=${home.lostReason ?? null} lastAvailabilityConfirmedAt=${home.lastAvailabilityConfirmedAt?.toISOString() ?? null}; brokers ${JSON.stringify(brokersTouched)}`);
    } else {
      console.log(`\ncleanup`);
      // Every chat the test profile opened during the run.
      if (profileId) for (const t of await db.agentTask.findMany({ where: { profileId, createdAt: { gte: t0 } }, select: { id: true } })) made.taskIds.add(t.id);
      const taskIds = [...made.taskIds];
      const dealIds = (await db.deal.findMany({ where: { OR: [{ taskId: { in: taskIds } }, ...(made.dealId ? [{ id: made.dealId }] : [])] }, select: { id: true } })).map((d) => d.id);
      const removed: Record<string, number> = {};
      const run = async (name: string, p: Promise<{ count: number }>) => {
        try {
          removed[name] = (await p).count;
        } catch (err) {
          check(false, `cleanup ${name}`, (err as Error).message);
        }
      };
      await run("RevenueEntry", db.revenueEntry.deleteMany({ where: { dealId: { in: dealIds } } }));
      await run("Deal", db.deal.deleteMany({ where: { id: { in: dealIds } } }));
      await run("ListingVisit", db.listingVisit.deleteMany({ where: { OR: [{ taskId: { in: taskIds } }, ...(made.visitId ? [{ id: made.visitId }] : [])] } }));
      await run("BrokerRequest", db.brokerRequest.deleteMany({ where: { OR: [{ id: { in: made.requestIds } }, { taskId: { in: taskIds } }] } }));
      await run(
        "OutboundMessage",
        db.outboundMessage.deleteMany({ where: { createdAt: { gte: t0 }, OR: [{ to: { in: variants } }, { brokerRequestIds: { hasSome: made.requestIds } }] } }),
      );
      await run("TenantRequest", db.tenantRequest.deleteMany({ where: { taskId: { in: taskIds } } }));
      await run("AgentEvent", db.agentEvent.deleteMany({ where: { taskId: { in: taskIds } } }));
      await run("AgentTask", db.agentTask.deleteMany({ where: { id: { in: taskIds } } }));
      if (made.postId) await run("TikTokPost", db.tikTokPost.deleteMany({ where: { id: made.postId } }));
      await run(
        "WaState",
        db.waState.deleteMany({ where: { key: { in: [`viewing-ask:${TEST_DIGITS}`, ...msgIds.map((m) => `handoff:${m}`)] } } }),
      );
      await db.listing.update({ where: { id: home.id }, data: { lostAt: home.lostAt, lostReason: home.lostReason, lastAvailabilityConfirmedAt: home.lastAvailabilityConfirmedAt } });
      if (made.home2) {
        await db.listing.update({ where: { id: made.home2.id }, data: { lostAt: made.home2.lostAt, lostReason: made.home2.lostReason, lastAvailabilityConfirmedAt: made.home2.lastAvailabilityConfirmedAt } });
        await run("OutboundMessage (broker 2)", db.outboundMessage.deleteMany({ where: { createdAt: { gte: t0 }, to: { in: made.broker2Variants } } }));
      }
      if (made.broker2) {
        const b = made.broker2;
        await db.broker.update({
          where: { id: b.id },
          data: { relationship: b.relationship as never, answers: b.answers, availableAnswers: b.availableAnswers, sharePct: b.sharePct as never, shareFlatRwf: b.shareFlatRwf, agreementNote: b.agreementNote, agreedAt: b.agreedAt, visitFee: b.visitFee },
        });
      }
      for (const b of brokersTouched)
        await db.broker.update({
          where: { id: b.id },
          data: { relationship: b.relationship, answers: b.answers, availableAnswers: b.availableAnswers, sharePct: b.sharePct, shareFlatRwf: b.shareFlatRwf, agreementNote: b.agreementNote, agreedAt: b.agreedAt },
        });
      if (profileBefore) {
        await db.agentProfile.update({
          where: { id: profileBefore.id },
          data: { ...(profileBefore.memory != null ? { memory: profileBefore.memory as never } : {}), lastSearchAt: profileBefore.lastSearchAt, firstSource: profileBefore.firstSource, firstRef: profileBefore.firstRef, waPhone: profileBefore.waPhone },
        });
        if (profileBefore.memory == null) await db.$executeRaw`UPDATE "AgentProfile" SET memory = NULL WHERE id = ${profileBefore.id}`;
      } else if (profileId) {
        await db.agentProfile.deleteMany({ where: { id: profileId } });
        removed.AgentProfile = 1;
      }
      console.log(`  removed ${Object.entries(removed).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
      console.log(`  restored Listing K${home.id} (lostAt, lostReason, lastAvailabilityConfirmedAt), ${brokersTouched.length} broker(s) (relationship, answers), the test profile`);

      const after = await scopeCounts(profileBefore?.id ?? null);
      const listingAfter = await db.listing.findUnique({ where: { id: home.id }, select: { lostAt: true, lostReason: true, lastAvailabilityConfirmedAt: true } });
      const brokersAfter = await db.broker.findMany({
        where: { id: { in: brokersTouched.map((b) => b.id) } },
        select: { id: true, relationship: true, answers: true, availableAnswers: true, sharePct: true, shareFlatRwf: true, agreementNote: true, agreedAt: true },
      });
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      for (const k of Object.keys(before) as (keyof typeof before)[]) check(before[k] === after[k], `count ${k}`, `before ${before[k]}, after ${after[k]}`);
      check(same(listingAfter, { lostAt: home.lostAt, lostReason: home.lostReason, lastAvailabilityConfirmedAt: home.lastAvailabilityConfirmedAt }), "listing restored", JSON.stringify(listingAfter));
      check(same(brokersAfter.sort((a, b) => a.id.localeCompare(b.id)), [...brokersTouched].sort((a, b) => a.id.localeCompare(b.id))), "broker(s) restored");
    }
    console.log(`\n${failures === 0 ? "✓ deal:e2e passed" : `✗ deal:e2e: ${failures} failed`}`);
    await db.$disconnect();
  }
}

main()
  .catch((err) => {
    console.error(err);
    failures += 1;
  })
  .finally(() => process.exit(failures === 0 ? 0 : 1));
