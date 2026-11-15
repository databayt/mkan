import "server-only";
/**
 * A deal step → CrmOps for Twenty, the CRM of record (2026-11-15). Callers never wait on Twenty: each
 * function only queues a CrmOp (crm-ops.ts) and the drain sends it within about a minute.
 *
 * What one step queues, in this order (the drain is oldest-first, so each finds what it points at):
 *   1. the tenant   — stage follows the deal, last message time        (object "tenant")
 *   2. the deal     — stage + the facts in ctx, relations tenant/broker/home   (object "deal")
 *   3. on VIEWING_BOOKED the viewing Task, assigned to Abdout's workspace member (object "task")
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { REAL_PERSON } from "@/lib/monetize/team";
import type { DealEventCtx, DealStep } from "@/components/agent/deal-event-pure";
import { enqueueCrm } from "./crm-ops";
import { isOurPhone } from "./ours";
import { buildDealFields, buildTenantFields, kCode, parseDealKey, tenantKeyOf, tenantStageFor, viewingTask, type DealFacts } from "./deal-sync-pure";

/** The tenant's profile, from the chat the deal grew from or their number. */
async function profileOf(ctx: DealEventCtx): Promise<{ id: string; real: boolean } | null> {
  let id: string | null = null;
  if (ctx.taskId) id = (await db.agentTask.findUnique({ where: { id: ctx.taskId }, select: { profileId: true } }))?.profileId ?? null;
  if (!id && ctx.tenantPhone) id = (await db.agentProfile.findUnique({ where: { waPhone: ctx.tenantPhone }, select: { id: true } }))?.id ?? null;
  if (!id) return null;
  // Our own chats (Abdout's contacts, test phones, the team) are not tenants: they stay out of the CRM.
  const rows = await db.$queryRaw<{ ok: number }[]>(Prisma.sql`SELECT 1 AS ok FROM "AgentProfile" p WHERE p.id = ${id} AND ${REAL_PERSON}`);
  return { id, real: rows.length > 0 };
}

async function factsOf(dealId: string | null | undefined): Promise<DealFacts> {
  if (!dealId) return {};
  const d = await db.deal.findUnique({ where: { id: dealId }, select: { rentMonthly: true, brokerCommission: true, mkanShare: true, tripCost: true } });
  return d ?? {};
}

/** A deal moved: upsert Twenty's `deal` (stage + the facts in ctx), and its viewing Task on VIEWING_BOOKED. */
export async function crmStep(step: DealStep, ctx: DealEventCtx, key: string): Promise<void> {
  const profile = await profileOf(ctx);
  if (profile && !profile.real) return;
  // A team, test or personal number typed into a web chat is still ours (REAL_PERSON reads only waPhone).
  if (await isOurPhone(ctx.tenantPhone)) return;
  const tenantKey = tenantKeyOf(profile?.id, ctx.tenantPhone);
  const at = ctx.at ?? new Date();

  if (tenantKey) {
    const statuses = ctx.tenantPhone ? (await db.deal.findMany({ where: { tenantPhone: ctx.tenantPhone }, select: { status: true } })).map((d) => d.status) : [];
    await enqueueCrm("tenant", tenantKey, buildTenantFields(tenantKey, ctx.tenantPhone, ctx.tenantName, tenantStageFor(step, statuses), at));
  }

  const facts = await factsOf(ctx.dealId);
  await enqueueCrm("deal", key, buildDealFields(step, { ...ctx, at }, key, tenantKey, facts));

  if (step === "VIEWING_BOOKED" && ctx.viewingAt) {
    const [listing, broker] = await Promise.all([
      db.listing.findUnique({ where: { id: ctx.listingId }, select: { location: { select: { neighbourhood: true, sector: true } } } }),
      ctx.brokerId ? db.broker.findUnique({ where: { id: ctx.brokerId }, select: { name: true } }) : null,
    ]);
    const task = viewingTask(ctx, listing?.location?.neighbourhood ?? listing?.location?.sector ?? null, broker?.name ?? null);
    if (task) await enqueueCrm("task", key, { ...task, $deal: key });
  }
}

/**
 * False when the deal's chat is one of ours (a test phone, the team, Abdout's contacts): his words on a
 * rehearsal ("cost", "note") stay out of Twenty like its steps do (profileOf). True when unsure.
 */
async function dealIsReal(key: string): Promise<boolean> {
  try {
    const parsed = parseDealKey(key);
    let taskId: string | null = parsed?.kind === "task" ? parsed.taskId : null;
    if (!taskId && parsed?.kind === "deal") taskId = (await db.deal.findUnique({ where: { id: parsed.dealId }, select: { taskId: true } }))?.taskId ?? null;
    if (!taskId) return true;
    const latest = await db.deal.findFirst({ where: { taskId }, orderBy: { createdAt: "desc" }, select: { tenantPhone: true } });
    if (await isOurPhone(latest?.tenantPhone)) return false;
    const profileId = (await db.agentTask.findUnique({ where: { id: taskId }, select: { profileId: true } }))?.profileId;
    if (!profileId) return true;
    const rows = await db.$queryRaw<{ ok: number }[]>(Prisma.sql`SELECT 1 AS ok FROM "AgentProfile" p WHERE p.id = ${profileId} AND ${REAL_PERSON}`);
    return rows.length > 0;
  } catch {
    return true;
  }
}

/** Mkan's person wrote a note on a deal ("note K5811 …"): a Twenty note on that deal. */
export async function crmNote(key: string, text: string): Promise<void> {
  const body = text.trim();
  if (!body) return;
  if (!(await dealIsReal(key))) return;
  await enqueueCrm("note", key, { $deal: key, body, title: body.slice(0, 60) });
}

/** Fields on the deal that are not a step ("cost K5811 3000" → tripCostRwf). */
export async function crmDealPatch(key: string, fields: { tripCostRwf?: number | null; notes?: string | null }): Promise<void> {
  try {
    if (!(await dealIsReal(key))) return;
    const payload: Record<string, unknown> = { mkanKey: key };
    if (fields.tripCostRwf != null) payload.tripCostRwf = fields.tripCostRwf;
    // A deal Twenty has never seen needs a name; one it knows keeps the name a person may have edited.
    const known = await db.crmLink.findUnique({ where: { key: `deal:${key}` }, select: { key: true } });
    const parsed = parseDealKey(key);
    if (!known && parsed && "listingId" in parsed) payload.name = kCode(parsed.listingId);
    if (Object.keys(payload).length > 1 || !known) await enqueueCrm("deal", key, payload);
    if (fields.notes?.trim()) await crmNote(key, fields.notes);
  } catch (e) {
    console.error("[crm] crmDealPatch:", (e as Error).message);
  }
}
