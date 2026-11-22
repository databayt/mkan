import "server-only";
/**
 * The live feed to Mkan's person (loop-feed-pure.ts has the words): one line per deal step to
 * MKAN_REP_WHATSAPP while fewer than 10 deals are PAID, nothing per step after that (the 20:00 schedule
 * carries a day line instead). No approvals — the line has already done the step; this only tells him.
 * Called by deal-event.ts, which never lets a failure here fail the step.
 */
import { db } from "@/lib/db";
import { scrubTitle } from "@/lib/redact";
import { phoneKey } from "../../../scripts/wa/outbox-pure";
import { testPhones } from "./broker-sends";
import type { DealEventCtx, DealStep } from "./deal-event-pure";
import { feedLabel, feedLine, feedMode, FEED_SKIPS, type FeedFacts } from "./loop-feed-pure";
import { repDigits } from "./rep-word-pure";
import { sendMessages } from "./whatsapp";

/** The home and the tenant a step is about — one cheap read each; every field is optional. */
async function factsOf(ctx: DealEventCtx): Promise<FeedFacts> {
  const [home, task, tests] = await Promise.all([
    db.listing
      .findUnique({ where: { id: ctx.listingId }, select: { title: true, priceMonth: true, location: { select: { neighbourhood: true, sector: true } } } })
      .catch(() => null),
    ctx.tenantPhone || !ctx.taskId ? null : db.agentTask.findUnique({ where: { id: ctx.taskId }, select: { profile: { select: { waPhone: true } } } }).catch(() => null),
    testPhones().catch(() => new Set<string>()),
  ]);
  const tenantPhone = ctx.tenantPhone ?? task?.profile?.waPhone ?? null;
  return {
    title: scrubTitle(home?.title) || null,
    area: home?.location?.neighbourhood ?? home?.location?.sector ?? null,
    rent: ctx.rent ?? home?.priceMonth ?? null,
    tenantPhone,
    test: !!tenantPhone && tests.has(phoneKey(tenantPhone)),
  };
}

export async function feedStep(step: DealStep, ctx: DealEventCtx, key: string): Promise<void> {
  const rep = repDigits();
  if (!rep || FEED_SKIPS.includes(step)) return;
  const env = process.env.MKAN_LOOP_FEED?.trim().toLowerCase();
  // Dynamic: deal-intro.ts imports deal.ts, which calls dealEvent.
  const paid = env === "live" || env === "digest" || env === "off" ? 0 : await import("./deal-intro").then((m) => m.introCounts()).then((c) => c.paid).catch(() => 0);
  if (feedMode(paid) !== "live") return;
  const label = feedLabel(key, step, ctx.viewingAt, ctx.n);
  // Never the same line twice: a step can be reported by two paths (a pick by digit and by K-code), a retry, a re-run.
  const sent = await db.outboundMessage.findFirst({ where: { label }, select: { id: true } });
  if (sent) return;
  const body = feedLine(step, ctx, await factsOf(ctx));
  if (!body) return;
  await sendMessages([{ kind: "TENANT_ALERT", to: `+${rep}`, body, label }], `Loop → Mkan's person (${step})`);
}
