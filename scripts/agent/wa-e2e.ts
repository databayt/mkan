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
 *
 * It drives the shipped functions with the team's test number (`pnpm wa:brokers test`), whose picks
 * never reach a broker (broker-sends.ts). Nothing reaches a person: see ./e2e-locks. It never writes
 * the line's shared arrays (tenant-stop, tenant-sent, seen) — another process's write there could drop
 * a real tenant's STOP — so STOP itself is covered by the unit tests (tests/wa/outbox.test.ts).
 */
import { blockedSends } from "./e2e-locks";

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
  const made = { visits: [] as number[], deals: [] as string[] };
  try {
    if (!check((await testPhones()).has(TEST_DIGITS), "the test number is on the team list")) return;

    // ── 1. the claim ──────────────────────────────────────────────────────────
    const id = nextMsg();
    const first = await state.claimMessage(id);
    check(first?.mode === "fresh", "a new message is claimed fresh");
    check((await state.claimMessage(id)) === null, "a second claim of the same message is refused (webhook + poll answer once)");
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
    check(blockedSends.length === 0 || blockedSends.every((u) => /slack|whatsapp|evolution|__wa/i.test(u)), "nothing reached a person", `${blockedSends.length} send(s) refused by the guard`);
  } finally {
    // ── cleanup: every row this run made ──────────────────────────────────────
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
