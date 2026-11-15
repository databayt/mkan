/**
 * What a deal step writes to Twenty, without I/O (2026-11-15). The stage words are the DealStep values
 * (deal-event-pure.ts) — Twenty's `deal.stage` SELECT is built from the same list.
 *
 * Truth rule: a null or missing fact is OMITTED from the payload, never sent as null. Twenty wins on
 * what a person edits (terms, share, viewing time); a step that does not know a field must not blank it.
 */
import { DEAL_STEPS, type DealEventCtx, type DealStep } from "@/components/agent/deal-event-pure";

export type TenantStage = "NEW" | "SHOWN_HOMES" | "PICKED" | "VIEWING" | "SIGNED" | "LOST";
export const TENANT_STAGES: TenantStage[] = ["NEW", "SHOWN_HOMES", "PICKED", "VIEWING", "SIGNED", "LOST"];

const RANK: Record<TenantStage, number> = { LOST: 0, NEW: 1, SHOWN_HOMES: 2, PICKED: 3, VIEWING: 4, SIGNED: 5 };

/** A Prisma Deal status → the tenant stage it implies. */
const FROM_DEAL: Record<string, TenantStage | null> = { VIEWING_BOOKED: "VIEWING", VIEWED: "VIEWING", SIGNED: "SIGNED", PAID: "SIGNED", LOST: null };

/** The tenant stage a step implies on its own (null: the step says nothing about the tenant). */
export function stageOfStep(step: DealStep): TenantStage | null {
  switch (step) {
    case "PICKED":
    case "BROKER_ASKED":
    case "BROKER_YES":
    case "TIME_PROPOSED":
      return "PICKED";
    case "VIEWING_BOOKED":
    case "VIEWED":
      return "VIEWING";
    case "SIGNED":
    case "PAID":
      return "SIGNED";
    case "LOST":
      return "LOST";
    default:
      return null; // STALLED
  }
}

/**
 * The tenant's stage after a step. `dealStatuses` are the statuses of the tenant's booked Deal rows: a
 * second pick never takes a tenant back from VIEWING/SIGNED, and a lost deal only makes the tenant LOST
 * when they have no other open deal.
 */
export function tenantStageFor(step: DealStep, dealStatuses: string[]): TenantStage | null {
  const open = dealStatuses.map((s) => FROM_DEAL[s] ?? null).filter((s): s is TenantStage => !!s);
  const floor = open.sort((a, b) => RANK[b] - RANK[a])[0] ?? null;
  const own = stageOfStep(step);
  if (!own) return null;
  if (own === "LOST") return floor ?? "LOST";
  if (floor && RANK[floor] > RANK[own]) return floor;
  return own;
}

/** "K5811" — the code a home goes by in every message. */
export const kCode = (listingId: number) => `K${listingId}`;

export interface DealFacts {
  /** Deal row facts read at enqueue time (best effort). */
  rentMonthly?: number | null;
  brokerCommission?: number | null;
  mkanShare?: number | null;
  tripCost?: number | null;
}

const present = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/**
 * The Twenty `deal` fields for one step. `$tenant` / `$broker` / `$home` are not Twenty fields: the drain
 * turns them into tenantId / brokerId / homeId once it knows the Twenty ids (crm-ops.ts).
 */
export function buildDealFields(step: DealStep, ctx: DealEventCtx, key: string, tenantKey: string | null, facts: DealFacts = {}): Record<string, unknown> {
  const at = (ctx.at ?? new Date()).toISOString();
  const withTime = step === "TIME_PROPOSED" || step === "VIEWING_BOOKED";
  return present({
    name: `${kCode(ctx.listingId)} · ${ctx.tenantName?.trim() || ctx.tenantPhone || "tenant"}`,
    mkanKey: key,
    mkanDealId: ctx.dealId ?? undefined,
    stage: step,
    stageChangedAt: at,
    viewingAt: withTime ? ctx.viewingAt?.toISOString() : undefined,
    meetingPoint: withTime ? ctx.meetingPoint : undefined,
    rentRwf: ctx.rent ?? facts.rentMonthly,
    commissionRwf: facts.brokerCommission,
    mkanShareRwf: ctx.share ?? facts.mkanShare,
    tripCostRwf: facts.tripCost,
    lostReason: step === "LOST" ? ctx.note : undefined,
    $tenant: tenantKey ?? undefined,
    $broker: ctx.brokerId ?? undefined,
    $home: ctx.listingId,
  });
}

/** The tenant fields a step writes: the stage and last-message time; the sweep (tenant-sync.ts) fills the rest. */
export function buildTenantFields(tenantKey: string, phone: string | null | undefined, name: string | null | undefined, stage: TenantStage | null, at: Date): Record<string, unknown> {
  return present({ mkanProfileId: tenantKey, name: name?.trim() || undefined, $phone: phone ?? undefined, stage: stage ?? undefined, lastMessageAt: at.toISOString() });
}

/** The viewing Task: one per deal and time, so a moved viewing updates the same Task. */
export function viewingTask(ctx: Pick<DealEventCtx, "listingId" | "tenantName" | "tenantPhone" | "viewingAt" | "meetingPoint">, area: string | null, brokerName: string | null) {
  if (!ctx.viewingAt) return null;
  const who = ctx.tenantName?.trim() || ctx.tenantPhone || "tenant";
  const title = ["Viewing " + kCode(ctx.listingId), area, `Tenant ${who}`].filter(Boolean).join(" · ");
  const body = [
    ctx.meetingPoint ? `Meet at: ${ctx.meetingPoint}` : null,
    ctx.tenantPhone ? `Tenant: ${who} ${ctx.tenantPhone}` : `Tenant: ${who}`,
    brokerName ? `Broker: ${brokerName}` : null,
  ].filter(Boolean).join("\n");
  return { title, body, dueAt: ctx.viewingAt.toISOString() };
}

/** The tenant key in Twenty (`mkanProfileId`): the profile id, else "phone:<digits>" for a number with no profile yet. */
export const tenantKeyOf = (profileId: string | null | undefined, phone: string | null | undefined): string | null =>
  profileId || (phone ? `phone:${phone.replace(/[^\d]/g, "")}` : null);

export const isDealStep = (s: string): s is DealStep => (DEAL_STEPS as readonly string[]).includes(s);

/** "<taskId>:<listingId>" | "deal:<dealId>" | "home:<listingId>" → what to look the Deal up by. */
export type ParsedDealKey = { kind: "task"; taskId: string; listingId: number } | { kind: "deal"; dealId: string } | { kind: "home"; listingId: number };
export function parseDealKey(key: string | null | undefined): ParsedDealKey | null {
  if (!key) return null;
  if (key.startsWith("deal:")) return key.length > 5 ? { kind: "deal", dealId: key.slice(5) } : null;
  if (key.startsWith("home:")) {
    const n = Number(key.slice(5));
    return Number.isInteger(n) && n > 0 ? { kind: "home", listingId: n } : null;
  }
  const i = key.lastIndexOf(":");
  const n = Number(key.slice(i + 1));
  return i > 0 && Number.isInteger(n) && n > 0 ? { kind: "task", taskId: key.slice(0, i), listingId: n } : null;
}
