/**
 * Twenty CRM — saved Views for the mkan Growth Engine (Epic G1.1).
 *
 * Aseel's pinned working set (docs/growth.md §2.8). Field names below are the
 * camelCase Twenty field names from `twenty-schema.ts` plus a few standard
 * fields (opportunity.amount, home.updatedAt, task.title/status/dueAt,
 * createdAt). The seeder resolves every name to a fieldMetadataId and skips any
 * it can't find, so a name mismatch degrades the view rather than failing it.
 *
 * Filter `value` is JSON: SELECT → array of option values; NUMBER → number;
 * BOOLEAN → [true]; empties → "". Twenty's filter encoding is version-sensitive,
 * so filters are applied best-effort (logged on failure); columns / kanban
 * grouping / sorts are the reliable parts.
 */

export type ViewFilterOperand =
  | 'IS'
  | 'IS_NOT'
  | 'IS_EMPTY'
  | 'IS_NOT_EMPTY'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN_OR_EQUAL'
  | 'CONTAINS';

export interface ViewFilterDef {
  field: string;
  operand: ViewFilterOperand;
  value?: unknown;
}
export interface ViewSortDef {
  field: string;
  direction: 'ASC' | 'DESC';
}
export interface ViewDef {
  name: string;
  /** Target object nameSingular (home | host | opportunity | task). */
  object: string;
  type: 'TABLE' | 'KANBAN';
  icon: string;
  /** Kanban group-by Select field (required for KANBAN). */
  groupBy?: string;
  /** Ordered visible columns. */
  fields: string[];
  sorts?: ViewSortDef[];
  filters?: ViewFilterDef[];
}

const SINKS = ['DECLINED', 'UNREACHABLE', 'DUPLICATE', 'REJECTED_LOW_TRUST'];

export const VIEWS: ViewDef[] = [
  {
    name: 'Onboarding pipeline',
    object: 'opportunity',
    type: 'KANBAN',
    icon: 'IconLayoutKanban',
    groupBy: 'onboardingStage',
    fields: ['host', 'hostTrustBand', 'homesCount', 'amount', 'nextFollowUpAt'],
    filters: SINKS.map((s) => ({ field: 'onboardingStage', operand: 'IS_NOT' as const, value: [s] })),
  },
  {
    name: 'Homes — to vet',
    object: 'home',
    type: 'TABLE',
    icon: 'IconChecklist',
    fields: ['city', 'host', 'roomType', 'priceNightSdg', 'avgRating', 'reviewCount', 'photoCount', 'overallTrustScore', 'airbnbUrl'],
    filters: [
      { field: 'trustBand', operand: 'IS', value: ['MANUAL_REVIEW'] },
      { field: 'homeStatus', operand: 'IS', value: ['SCORED'] },
    ],
    sorts: [{ field: 'overallTrustScore', direction: 'DESC' }],
  },
  {
    name: 'Contacted — awaiting reply',
    object: 'opportunity',
    type: 'TABLE',
    icon: 'IconClock',
    fields: ['host', 'outreachAttempts', 'lastOutreachAt', 'nextFollowUpAt', 'hostTrustBand'],
    filters: [{ field: 'onboardingStage', operand: 'IS', value: ['CONTACTED'] }],
    sorts: [{ field: 'lastOutreachAt', direction: 'ASC' }],
  },
  {
    name: 'Trusted — ready to go Live',
    object: 'home',
    type: 'TABLE',
    icon: 'IconRocket',
    fields: ['host', 'city', 'priceNightSdg', 'trustBand', 'mkanListingUrl', 'importedAt'],
    filters: [
      { field: 'publishReady', operand: 'IS', value: [true] },
      { field: 'mkanPublishState', operand: 'IS', value: ['IMPORTED_BUSY'] },
    ],
    sorts: [{ field: 'overallTrustScore', direction: 'DESC' }],
  },
  {
    name: 'Duplicates & rejects',
    object: 'home',
    type: 'TABLE',
    icon: 'IconTrash',
    fields: ['homeStatus', 'duplicateOf', 'trustBand', 'overrideReason', 'airbnbUrl'],
    filters: [{ field: 'homeStatus', operand: 'IS', value: ['REJECTED', 'DUPLICATE'] }],
    sorts: [{ field: 'updatedAt', direction: 'DESC' }],
  },
  {
    name: 'Hosts — best next outreach',
    object: 'host',
    type: 'TABLE',
    icon: 'IconTargetArrow',
    fields: ['hostTrustScore', 'hostTrustBand', 'superhost', 'portfolioReviewsTotal', 'whatsapp', 'airbnbProfileUrl'],
    filters: [
      { field: 'hostTrustScore', operand: 'GREATER_THAN_OR_EQUAL', value: 40 },
      { field: 'mkanAccountEmail', operand: 'IS_EMPTY' },
      { field: 'whatsapp', operand: 'IS_NOT_EMPTY' },
    ],
    sorts: [{ field: 'hostTrustScore', direction: 'DESC' }],
  },
  {
    name: 'Home inventory board',
    object: 'home',
    type: 'KANBAN',
    icon: 'IconLayoutKanban',
    groupBy: 'homeStatus',
    fields: ['city', 'trustBand', 'priceNightSdg', 'host'],
  },
  {
    name: 'Follow-ups due',
    object: 'task',
    type: 'TABLE',
    icon: 'IconCalendarDue',
    fields: ['status', 'dueAt'],
    filters: [{ field: 'status', operand: 'IS_NOT', value: ['DONE'] }],
    sorts: [{ field: 'dueAt', direction: 'ASC' }],
  },
  {
    name: 'Live on mkan',
    object: 'home',
    type: 'TABLE',
    icon: 'IconWorld',
    fields: ['host', 'city', 'priceNightSdg', 'publishedAt', 'mkanListingUrl'],
    filters: [{ field: 'mkanPublishState', operand: 'IS', value: ['LIVE'] }],
    sorts: [{ field: 'publishedAt', direction: 'DESC' }],
  },
  {
    name: 'Duplicate funnels (hygiene)',
    object: 'opportunity',
    type: 'TABLE',
    icon: 'IconCopyCheck',
    fields: ['host', 'onboardingStage', 'createdAt'],
    sorts: [{ field: 'name', direction: 'ASC' }],
  },
];
