import "server-only";
/**
 * The tenant sweep (2026-11-15): tenants are derived from the database, not from call sites in the chat
 * code. Run by the wa-outbox backstop before the drain: AgentProfiles updated since the last sweep
 * (WaState `crm-tenant-cursor`) that are real people with a number → one `tenant` CrmOp each.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { REAL_PERSON } from "@/lib/monetize/team";
import { testPhones } from "@/components/agent/broker-sends";
import { isOurPhone } from "./ours";
import { readState, writeState } from "@/components/agent/wa-state";
import { chatSig } from "@/components/agent/chat-link";
import { publicAppUrl } from "../../../scripts/crm/public-links";
import { enqueueCrm } from "./crm-ops";
import { buildSweepFields, type TenantRow } from "./tenant-sync-pure";

const CURSOR = "crm-tenant-cursor";

interface RawRow {
  id: string;
  waPhone: string | null;
  firstSource: string | null;
  memory: unknown;
  createdAt: Date;
  updatedAt: Date;
  webPhone: string | null;
  userName: string | null;
}

/** Profiles changed after `since`, real people with a WhatsApp number or a phone left on the web. */
export async function changedTenants(since: Date, limit: number): Promise<{ rows: TenantRow[]; last: Date | null }> {
  const raw = await db.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT p.id, p."waPhone", p."firstSource", p.memory, p."createdAt", p."updatedAt",
      (SELECT t.phone FROM "TenantRequest" t WHERE t."profileId" = p.id AND t.phone IS NOT NULL ORDER BY t."updatedAt" DESC LIMIT 1) AS "webPhone",
      (SELECT u.username FROM "User" u WHERE u.id = p."userId") AS "userName"
    FROM "AgentProfile" p
    WHERE p."updatedAt" > ${since} AND ${REAL_PERSON}
      AND (p."waPhone" IS NOT NULL OR EXISTS (SELECT 1 FROM "TenantRequest" t WHERE t."profileId" = p.id AND t.phone IS NOT NULL))
    ORDER BY p."updatedAt" ASC
    LIMIT ${limit}`);
  if (raw.length === 0) return { rows: [], last: null };
  const tasks = await db.agentTask.findMany({
    where: { profileId: { in: raw.map((r) => r.id) } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, profileId: true, locale: true, updatedAt: true, shortlist: true },
  });
  const latest = new Map<string, (typeof tasks)[number]>();
  const shown = new Set<string>();
  for (const t of tasks) {
    if (t.profileId && !latest.has(t.profileId)) latest.set(t.profileId, t);
    if (t.profileId && Array.isArray(t.shortlist) && t.shortlist.length > 0) shown.add(t.profileId);
  }
  const rows = raw.map((r): TenantRow => {
    const t = latest.get(r.id);
    return {
      id: r.id,
      waPhone: r.waPhone,
      webPhone: r.webPhone,
      firstSource: r.firstSource,
      memory: r.memory,
      name: r.userName,
      createdAt: r.createdAt,
      task: t ? { id: t.id, locale: t.locale, updatedAt: t.updatedAt, shown: shown.has(r.id) } : null,
    };
  });
  return { rows, last: raw[raw.length - 1]!.updatedAt };
}

export interface SweepResult {
  queued: number;
  cursor: string | null;
}

/** The Twenty fields for one tenant, with the "is Twenty already holding this one" checks that decide whether a stage may be sent. */
export async function sweepFieldsFor(row: TenantRow, stopped: Set<string>): Promise<Record<string, unknown>> {
  const [linked, pending] = await Promise.all([
    db.crmLink.findUnique({ where: { key: `tenant:${row.id}` }, select: { key: true } }),
    db.crmOp.findFirst({ where: { object: "tenant", key: row.id, status: "QUEUED" }, select: { id: true } }),
  ]);
  const sig = row.task ? chatSig(row.task.id) : null;
  const chatLink = row.task ? `${publicAppUrl()}/en/find?c=${row.task.id}${sig ? `&s=${sig}` : ""}` : null;
  const phone = (row.waPhone ?? row.webPhone ?? "").replace(/[^\d]/g, "");
  return buildSweepFields(row, { stageKnown: !!linked || !!pending, stopped: !!phone && stopped.has(phone), chatLink });
}

export async function sweepTenants(opts: { limit?: number; dry?: boolean; since?: Date } = {}): Promise<SweepResult> {
  const cursor = await readState<{ at?: string }>(CURSOR, {});
  const since = opts.since ?? (cursor.at ? new Date(cursor.at) : new Date(Date.now() - 24 * 3_600_000));
  const { rows, last } = await changedTenants(since, opts.limit ?? 100);
  if (rows.length === 0) return { queued: 0, cursor: cursor.at ?? null };
  const stopped = new Set(await readState<string[]>("tenant-stop", []));
  const team = await testPhones().catch(() => new Set<string>());
  let queued = 0;
  for (const row of rows) {
    // A team / test / personal number left on the web is ours, whatever the profile says (ours.ts).
    if (await isOurPhone(row.waPhone ?? row.webPhone, team)) continue;
    const fields = await sweepFieldsFor(row, stopped);
    if (!fields.$phone) continue;
    queued += 1;
    if (!opts.dry) await enqueueCrm("tenant", row.id, fields);
  }
  if (!opts.dry && last) await writeState(CURSOR, { at: last.toISOString() });
  return { queued, cursor: last?.toISOString() ?? null };
}
