/**
 * A Twenty `broker` record → the state the pure two-way logic (scripts/crm/brokers-pure.ts humanEdit)
 * reads. Moved out of scripts/crm/brokers.ts on 2026-11-15 so the daily `crm:brokers` run and the live
 * webhook (app/api/webhooks/twenty) use ONE mapping. Pure: no database, no Twenty calls.
 */
import { phonesFromTwenty } from '../phone';
import { RELATIONSHIPS, type BrokerKindT, type Relationship, type TwentyBrokerState } from '../../../scripts/crm/brokers-pure';

type Row = Record<string, unknown>;
const KINDS = new Set<BrokerKindT>(['BROKER', 'AGENCY', 'LANDLORD']);
const dateOf = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

const actorOf = (v: unknown): string | null => ((v as Row | null)?.source as string | undefined) ?? null;

/** A Twenty broker record as the pure two-way logic reads it. */
export function twentyBrokerState(t: Row, junction: Row[] | null, zoneSlugById: Map<string, string> | null): TwentyBrokerState {
  const rows = junction && zoneSlugById ? junction.filter((j) => String(j.brokerId) === String(t.id)) : null;
  const kind = String(t.kind ?? '') as BrokerKindT;
  return {
    id: String(t.id),
    updatedAt: dateOf(t.updatedAt),
    updatedBy: actorOf(t.updatedBy),
    kind: KINDS.has(kind) ? kind : null,
    name: typeof t.name === 'string' ? t.name : null,
    phones: phonesFromTwenty(t.phone as never, 'RW'),
    whatsapp: phonesFromTwenty(t.whatsapp as never, 'RW')[0] ?? null,
    optOut: t.optOut === true,
    zoneSlugs: rows ? [...new Set(rows.map((j) => zoneSlugById!.get(String(j.zoneId))).filter((z): z is string => !!z))] : null,
    zonesByPerson: (rows ?? []).some((j) => {
      const by = actorOf(j.createdBy);
      return !!by && by !== 'API' && by !== 'SYSTEM';
    }),
    mergeIntoId: t.mergeIntoId ? String(t.mergeIntoId) : null,
    // Present once crm:seed-objects added the partnership fields; the share is a percent in Twenty.
    partnership:
      'relationship' in t || 'sharePct' in t
        ? {
            relationship: (RELATIONSHIPS as readonly string[]).includes(String(t.relationship)) ? (t.relationship as Relationship) : undefined,
            sharePct: typeof t.sharePct === 'number' ? t.sharePct / 100 : null,
            shareFlatRwf: typeof t.shareFlatRwf === 'number' ? Math.round(t.shareFlatRwf) : null,
            agreementNote: typeof t.agreementNote === 'string' && t.agreementNote.trim() ? t.agreementNote.trim() : null,
            agreedAt: dateOf(t.agreedAt),
          }
        : null,
  };
}
