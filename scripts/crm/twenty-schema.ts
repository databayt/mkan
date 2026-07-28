/**
 * Twenty CRM — declarative schema for the mkan Growth Engine (Epic G1.1).
 *
 * Single source of truth for the `Home` and `Host` custom objects (+ their fields)
 * that the seeder (`seed-twenty-objects.ts`) materializes in the live Twenty
 * workspace via the metadata GraphQL API. Mirrors `docs/growth.md` §2.3 / §2.4.
 *
 * Field types are Twenty's `FieldMetadataType` values (verified against
 * twentyhq/twenty `packages/twenty-shared/src/types/FieldMetadataType.ts`):
 *   TEXT NUMBER BOOLEAN DATE DATE_TIME SELECT MULTI_SELECT RELATION CURRENCY
 *   EMAILS PHONES LINKS ADDRESS RATING RAW_JSON …
 *
 * Note: Twenty auto-creates the label-identifier `name` (TEXT) field on every
 * object, so it is NOT declared here. Field `name`s are camelCase (Twenty
 * convention); human `label`s carry the readable text.
 */

import { CITY_OPTIONS, STATE_OPTIONS } from './sudan-places';

export type TwentyFieldType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATE_TIME'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'RELATION'
  | 'CURRENCY'
  | 'EMAILS'
  | 'PHONES'
  | 'LINKS'
  | 'ADDRESS'
  | 'RATING'
  | 'RAW_JSON';

export type RelationType = 'ONE_TO_MANY' | 'MANY_TO_ONE';

export interface FieldDef {
  /** camelCase Twenty field name (DB column derives from this). */
  name: string;
  /** Human-readable label (primary locale). */
  label: string;
  type: TwentyFieldType;
  description?: string;
  /** Tabler icon name, e.g. "IconMapPin". */
  icon?: string;
  /** SELECT / MULTI_SELECT choices (raw values). Expanded to Twenty option objects by the seeder. */
  options?: string[];
  /** JSON-serializable default (booleans only here to stay version-safe). */
  defaultValue?: boolean;
  /** For RELATION fields only. */
  relation?: {
    /** Target object `nameSingular` (e.g. "host", "home", "person"). */
    target: string;
    type: RelationType;
    /** Label of the reverse field auto-created on the target object. */
    targetFieldLabel: string;
    targetFieldIcon?: string;
  };
}

export interface ObjectDef {
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  /** Tabler icon name. */
  icon: string;
  description: string;
  fields: FieldDef[];
}

// ── Shared SELECT value lists ────────────────────────────────────────────────
const SOURCE = ['AIRBNB', 'FACEBOOK', 'WHATSAPP', 'REFERRAL', 'FIELD_SCOUT', 'OTHER'];

// mkan enums (exact spellings — the import job maps these straight onto Prisma enums).
// Appended in the same order as the Prisma enum. `crm:sync-options` grows the
// live MULTI_SELECT append-only and refuses to drop a value, because Twenty
// stores the option's `value` on the record — exactly like Postgres does.
const MKAN_AMENITIES = [
  'WasherDryer', 'AirConditioning', 'Dishwasher', 'HighSpeedInternet', 'HardwoodFloors',
  'WalkInClosets', 'Microwave', 'Refrigerator', 'Pool', 'Gym', 'Parking', 'PetsAllowed', 'WiFi',
  'Kitchen', 'TV', 'DedicatedWorkspace', 'Elevator', 'PatioOrBalcony', 'Backyard', 'HotTub',
  'Bathtub', 'BbqGrill', 'OutdoorDining', 'OutdoorShower', 'FirePit', 'IndoorFireplace',
  'PoolTable', 'Piano', 'BeachAccess', 'LakeAccess', 'EVCharger', 'Crib', 'Breakfast',
  'HairDryer', 'LuggageDropoff', 'BedroomLock', 'SmokeAlarm', 'CarbonMonoxideAlarm',
  'FireExtinguisher', 'FirstAidKit', 'SecurityCameras',
];
const MKAN_HIGHLIGHTS = [
  'HighSpeedInternetAccess', 'WasherDryer', 'AirConditioning', 'Heating', 'SmokeFree',
  'CableReady', 'SatelliteTV', 'DoubleVanities', 'TubShower', 'Intercom', 'SprinklerSystem',
  'RecentlyRenovated', 'CloseToTransit', 'GreatView', 'QuietNeighborhood',
];
const MKAN_PROPERTY_TYPE = ['Apartment', 'Villa', 'Townhouse', 'Cottage', 'Tinyhouse', 'Rooms'];

// Cities and states come from the gazetteer so the CRM, the scraper and the
// importer can never disagree about what "Kassala" is. The declared order here
// is only a starting position — `sync-twenty-options.ts` preserves whatever
// positions the live workspace already assigned.
const SUDAN_CITIES = CITY_OPTIONS.map((c) => c.value);
const SUDAN_STATES = STATE_OPTIONS.map((s) => s.value);

// ── Home ─────────────────────────────────────────────────────────────────────
export const HOME: ObjectDef = {
  nameSingular: 'home',
  namePlural: 'homes',
  labelSingular: 'Home',
  labelPlural: 'Homes',
  icon: 'IconHome',
  description: 'A scraped rental listing (Airbnb / other source) — the inventory unit vetted for import into mkan.',
  fields: [
    // Identity & source
    { name: 'source', label: 'Source', type: 'SELECT', options: SOURCE, icon: 'IconWorldWww', description: 'Where this home was discovered.' },
    { name: 'airbnbListingId', label: 'Airbnb listing ID', type: 'TEXT', description: 'External id (dedupe key with source).' },
    { name: 'airbnbUrl', label: 'Airbnb URL', type: 'LINKS', description: 'Back-link to the live listing.' },
    { name: 'scrapedAt', label: 'First scraped', type: 'DATE_TIME' },
    { name: 'lastSyncedAt', label: 'Last synced', type: 'DATE_TIME' },
    { name: 'stillListed', label: 'Still on source', type: 'BOOLEAN', defaultValue: true, description: 'Flipped false when a re-scrape 404s.' },

    // Content
    { name: 'title', label: 'Title', type: 'TEXT' },
    { name: 'description', label: 'Description', type: 'TEXT' },
    { name: 'roomType', label: 'Room type', type: 'SELECT', options: ['ENTIRE_HOME', 'PRIVATE_ROOM', 'SHARED_ROOM', 'HOTEL_ROOM'] },
    { name: 'airbnbCategory', label: 'Airbnb category', type: 'TEXT', description: 'Raw category, e.g. "Entire villa".' },
    { name: 'airbnbCategoryAr', label: 'Airbnb category (AR)', type: 'TEXT', description: 'Airbnb\'s own Arabic label, e.g. "وحدة للإيجار بالكامل".' },
    { name: 'city', label: 'City', type: 'SELECT', options: SUDAN_CITIES, icon: 'IconBuildingCommunity', description: 'Normalized city (wave-rollout key). Grown by sync-twenty-options.ts, never by the seeder.' },
    { name: 'homeState', label: 'State', type: 'SELECT', options: SUDAN_STATES, icon: 'IconMap2', description: 'Sudanese state (wilaya) — the coarse filter above city.' },
    // NB: "address" is a reserved field name in Twenty — must use a prefixed name.
    { name: 'homeAddress', label: 'Address', type: 'ADDRESS', icon: 'IconMapPin', description: 'Full geocoded location (incl. lat/lng subfields) → mkan Location.' },
    { name: 'bedrooms', label: 'Bedrooms', type: 'NUMBER' },
    { name: 'beds', label: 'Beds', type: 'NUMBER' },
    { name: 'bathrooms', label: 'Bathrooms', type: 'NUMBER' },
    { name: 'guestCapacity', label: 'Guest capacity', type: 'NUMBER' },

    // Amenities & photos
    { name: 'amenitiesRaw', label: 'Amenities (raw)', type: 'RAW_JSON', description: 'Lossless scraped amenity list.' },
    { name: 'mkanAmenities', label: 'mkan amenities', type: 'MULTI_SELECT', options: MKAN_AMENITIES, description: 'Mapped subset of the mkan Amenity enum.' },
    { name: 'mkanHighlights', label: 'mkan highlights', type: 'MULTI_SELECT', options: MKAN_HIGHLIGHTS, description: 'Mapped subset of the mkan Highlight enum.' },
    { name: 'petsAllowed', label: 'Pets allowed', type: 'BOOLEAN', defaultValue: false },
    { name: 'parkingIncluded', label: 'Parking included', type: 'BOOLEAN', defaultValue: false },
    { name: 'photoUrls', label: 'Photo URLs', type: 'LINKS', icon: 'IconPhoto', description: 'ALL scraped photo URLs.' },
    { name: 'photoCount', label: 'Photo count', type: 'NUMBER' },
    { name: 'coverPhotoUrl', label: 'Cover photo', type: 'LINKS' },
    { name: 'photosRehosted', label: 'Photos re-hosted', type: 'BOOLEAN', defaultValue: false, description: 'muscache hotlinks rot — import re-hosts to CDN first.' },

    // Pricing
    { name: 'priceNightSar', label: 'Price / night (SAR)', type: 'CURRENCY', description: 'Scraped nightly price (Airbnb shows SR).' },
    { name: 'fxRateSarSdg', label: 'FX rate SAR→SDG', type: 'NUMBER', description: 'Parallel-market rate used at conversion (per home; never hardcoded).' },
    { name: 'fxRateDate', label: 'FX rate date', type: 'DATE' },
    { name: 'priceNightSdg', label: 'Price / night (SDG)', type: 'CURRENCY', description: 'round_clean(SAR × rate) → mkan pricePerNight.' },
    { name: 'priceConfirmedByHost', label: 'Price confirmed by host', type: 'BOOLEAN', defaultValue: false },
    { name: 'priceSanityRatio', label: 'Price sanity ratio', type: 'NUMBER', description: 'price_sdg ÷ median(city, room_type).' },

    // Reputation & derived checks
    { name: 'avgRating', label: 'Airbnb rating', type: 'NUMBER', description: '0–5 decimal (NUMBER, not RATING).' },
    { name: 'reviewCount', label: 'Airbnb reviews', type: 'NUMBER' },
    { name: 'photoQuality', label: 'Photo quality', type: 'RATING', description: 'Manual 1–5 eyeball score.' },
    { name: 'dataCompletenessPct', label: 'Data completeness %', type: 'NUMBER' },
    { name: 'locationCheck', label: 'Location check', type: 'SELECT', options: ['PASS', 'SUDAN_ONLY', 'FAIL', 'UNCHECKED'] },
    { name: 'duplicateCheck', label: 'Duplicate check', type: 'SELECT', options: ['NONE', 'SUSPECTED', 'CONFIRMED', 'UNCHECKED'] },
    { name: 'hotelAgencyCheck', label: 'Hotel/agency check', type: 'SELECT', options: ['PASS', 'LARGE_PORTFOLIO', 'HOTEL', 'UNCHECKED'] },
    // How confidently we know WHOSE listing this is. HEURISTIC means the host
    // came from a whole-document key walk that a co-host or a "similar listings"
    // card can win — those must never be imported, because provisioning an
    // account for the wrong person is the worst outreach outcome available.
    { name: 'hostAttribution', label: 'Host attribution', type: 'SELECT', icon: 'IconUserQuestion', options: ['MEET_YOUR_HOST', 'EVENT_DATA', 'HEURISTIC', 'NONE'], description: 'Which rule resolved the host. Only MEET_YOUR_HOST / EVENT_DATA are import-safe.' },

    // Trust (computed)
    { name: 'homeTrustScore', label: 'Home trust score', type: 'NUMBER' },
    { name: 'overallTrustScore', label: 'Overall trust score', type: 'NUMBER', description: 'round(0.45·host + 0.55·home) — denormalized so Home views can filter it.' },
    { name: 'trustBand', label: 'Trust band', type: 'SELECT', options: ['AUTO_ONBOARD', 'MANUAL_REVIEW', 'HOLD', 'REJECT', 'UNSCORED'], icon: 'IconShieldCheck' },
    { name: 'trustBandOverride', label: 'Band override', type: 'SELECT', options: ['AUTO_ONBOARD', 'MANUAL_REVIEW', 'HOLD', 'REJECT'] },
    { name: 'overrideReason', label: 'Override reason', type: 'TEXT' },
    { name: 'scoredAt', label: 'Scored at', type: 'DATE_TIME' },
    { name: 'rubricVersion', label: 'Rubric version', type: 'TEXT' },

    // Curation labels (the filter chips: origin + quality + review state).
    // MULTI_SELECT so one home can carry several — e.g. [MANUAL, HIGH] or [SCRAPED].
    // MANUAL/SCRAPED = origin; HIGH = high overall trust; REVIEWED = human-checked (manual toggle).
    { name: 'labels', label: 'Labels', type: 'MULTI_SELECT', icon: 'IconTag', options: ['MANUAL', 'SCRAPED', 'HIGH', 'REVIEWED'], description: 'Filter chips: MANUAL vs SCRAPED origin · HIGH trust · REVIEWED by a human.' },

    // mkan integration & status
    { name: 'homeStatus', label: 'Home status', type: 'SELECT', icon: 'IconProgressCheck', options: ['SCRAPED', 'SCORED', 'READY_FOR_IMPORT', 'IMPORTED_BUSY', 'LIVE', 'REJECTED', 'DUPLICATE', 'DELISTED'] },
    { name: 'mkanPropertyType', label: 'mkan property type', type: 'SELECT', options: MKAN_PROPERTY_TYPE },
    { name: 'mkanListingId', label: 'mkan listing ID', type: 'NUMBER' },
    { name: 'mkanListingUrl', label: 'mkan listing URL', type: 'LINKS' },
    { name: 'importedAt', label: 'Imported to mkan', type: 'DATE_TIME' },
    { name: 'mkanPublishState', label: 'mkan publish state', type: 'SELECT', options: ['NOT_IMPORTED', 'IMPORTED_BUSY', 'LIVE', 'UNPUBLISHED'] },
    { name: 'publishedAt', label: 'Published (live) at', type: 'DATE_TIME' },
    { name: 'publishReady', label: 'Ready to publish', type: 'BOOLEAN', defaultValue: false },

    // Relations (created last — targets must exist)
    { name: 'host', label: 'Host', type: 'RELATION', icon: 'IconUserCheck', relation: { target: 'host', type: 'MANY_TO_ONE', targetFieldLabel: 'Homes', targetFieldIcon: 'IconHome' } },
    { name: 'duplicateOf', label: 'Duplicate of', type: 'RELATION', relation: { target: 'home', type: 'MANY_TO_ONE', targetFieldLabel: 'Duplicates', targetFieldIcon: 'IconCopy' } },
  ],
};

// ── Host ─────────────────────────────────────────────────────────────────────
export const HOST: ObjectDef = {
  nameSingular: 'host',
  namePlural: 'hosts',
  labelSingular: 'Host',
  labelPlural: 'Hosts',
  icon: 'IconUserCheck',
  description: 'A property owner discovered from a source — vetted and contacted to onboard onto mkan.',
  fields: [
    // Profile (scraped)
    { name: 'source', label: 'Source', type: 'SELECT', options: SOURCE, icon: 'IconWorldWww' },
    { name: 'airbnbHostId', label: 'Airbnb host ID', type: 'TEXT', description: 'External id (dedupe key).' },
    { name: 'airbnbProfileUrl', label: 'Airbnb profile', type: 'LINKS' },
    { name: 'avatarUrl', label: 'Avatar URL', type: 'LINKS' },
    { name: 'superhost', label: 'Superhost', type: 'BOOLEAN', defaultValue: false },
    { name: 'hostSince', label: 'Host since', type: 'DATE' },
    { name: 'responseRate', label: 'Response rate %', type: 'NUMBER' },
    { name: 'responseTime', label: 'Response time', type: 'SELECT', options: ['WITHIN_HOUR', 'FEW_HOURS', 'WITHIN_DAY', 'FEW_DAYS', 'UNKNOWN'] },
    { name: 'airbnbListingsCount', label: 'Airbnb listings count', type: 'NUMBER', description: 'Portfolio size — agency signal.' },
    { name: 'portfolioReviewsTotal', label: 'Portfolio reviews', type: 'NUMBER' },
    { name: 'portfolioAvgRating', label: 'Portfolio avg rating', type: 'NUMBER' },

    // Contact & verification
    { name: 'phone', label: 'Phone', type: 'PHONES', icon: 'IconPhone' },
    { name: 'whatsapp', label: 'WhatsApp', type: 'PHONES', icon: 'IconBrandWhatsapp', description: 'The OpenClaw outreach channel.' },
    { name: 'whatsappStatus', label: 'WhatsApp status', type: 'SELECT', options: ['UNKNOWN', 'INVALID', 'VALID_DELIVERED'] },
    { name: 'email', label: 'Email', type: 'EMAILS' },
    { name: 'facebookUrl', label: 'Facebook', type: 'LINKS', icon: 'IconBrandFacebook' },
    { name: 'contactFoundVia', label: 'Contact found via', type: 'SELECT', options: ['AIRBNB_PROFILE', 'FACEBOOK', 'MUTUAL_CONTACT', 'FIELD_SCOUT', 'PUBLIC_DIRECTORY', 'OTHER'] },
    { name: 'preferredLanguage', label: 'Preferred language', type: 'SELECT', options: ['AR', 'EN'] },
    { name: 'identityVerified', label: 'Identity verified', type: 'SELECT', options: ['UNVERIFIED', 'NAME_MATCHED', 'OWNERSHIP_CLAIMED', 'ID_SEEN'] },
    { name: 'crossSourceCorroborated', label: 'Cross-source corroboration', type: 'SELECT', options: ['NONE', 'PARTIAL', 'CONFIRMED'] },
    { name: 'agencySuspected', label: 'Agency suspected', type: 'BOOLEAN', defaultValue: false },
    // 37 of the 55 hosts who state a location live outside Sudan — mostly the
    // UK, the Gulf and Egypt. That decides which number to expect, which
    // language to write in, and which community to search for them in.
    { name: 'livesIn', label: 'Lives in', type: 'TEXT', icon: 'IconWorldPin', description: "Where the host says they live, e.g. \"Riyadh, Saudi Arabia\". Diaspora hosts will not have a +249 number." },
    { name: 'hostWork', label: 'Work', type: 'TEXT', description: 'The Airbnb "My work" prompt — often names the agency directly.' },
    { name: 'hostAbout', label: 'About (Airbnb)', type: 'TEXT', description: "The host's own profile blurb." },
    { name: 'notes', label: 'Notes', type: 'TEXT' },

    // Contact hunt (Epic G1.6). Airbnb publishes no host phone, so every channel
    // here is inferred or hand-found. `contactCandidates` keeps the full,
    // un-adjudicated list so a human can pick in the CRM without losing the
    // rejected options; the flat phone/whatsapp/email fields hold only what was
    // actually chosen. `contactVerifiedByHuman` is the write-lock the sync
    // script honours — once set, no script overwrites that host's channels.
    { name: 'contactCandidates', label: 'Contact candidates', type: 'RAW_JSON', icon: 'IconAddressBook', description: 'Every channel found, with source + confidence. Human adjudicates here.' },
    { name: 'contactHuntedAt', label: 'Contact hunted at', type: 'DATE_TIME' },
    { name: 'contactConfidence', label: 'Contact confidence', type: 'SELECT', options: ['HIGH', 'MEDIUM', 'LOW', 'NONE'], icon: 'IconShieldQuestion' },
    { name: 'contactVerifiedByHuman', label: 'Contact verified by human', type: 'BOOLEAN', defaultValue: false, description: 'Write-lock: sync-contacts-to-twenty.ts never touches a host with this set.' },

    // Trust & mkan account
    { name: 'hostTrustScore', label: 'Host trust score', type: 'NUMBER' },
    { name: 'hostTrustBand', label: 'Host trust band', type: 'SELECT', options: ['TRUSTED', 'PROMISING', 'HOLD', 'LOW', 'UNSCORED'], icon: 'IconShieldCheck' },
    { name: 'hostScoredAt', label: 'Scored at', type: 'DATE_TIME' },
    { name: 'mkanAccountEmail', label: 'mkan account', type: 'EMAILS', description: 'e.g. 0001@mkan.org. Real hand-curated hosts use 0001-0003 (abdout/degna/hussein); scraped hosts get the 1000+ range.' },
    { name: 'mkanUsername', label: 'mkan username', type: 'TEXT', description: 'e.g. 0001 — username == the account number (real 0001-0003, scraped 1000+).' },
    { name: 'mkanUserId', label: 'mkan user ID', type: 'TEXT' },
    { name: 'accountProvisionedAt', label: 'Account provisioned', type: 'DATE_TIME' },
    { name: 'credentialsSentAt', label: 'Credentials sent', type: 'DATE_TIME' },
    { name: 'firstLoginAt', label: 'First login', type: 'DATE_TIME', description: 'From mkan User.lastLogin — engagement signal.' },

    // Relation — optional bridge to the standard People object once identity is real
    { name: 'person', label: 'Person (verified)', type: 'RELATION', relation: { target: 'person', type: 'MANY_TO_ONE', targetFieldLabel: 'Hosts', targetFieldIcon: 'IconUserCheck' } },
  ],
};

/** Objects the seeder creates, in dependency order (home + host first; relations wired last). */
export const OBJECTS: ObjectDef[] = [HOST, HOME];

// ── Opportunity (standard object) — custom fields for the onboarding funnel ───
// One Opportunity per host. The funnel lives in `onboardingStage`; the standard
// `stage` field is kept as a coarse mirror (NEW/QUALIFIED/PROPOSAL/WON/LOST).
export const OPPORTUNITY_FIELDS: FieldDef[] = [
  { name: 'onboardingStage', label: 'Onboarding stage', type: 'SELECT', icon: 'IconProgressCheck',
    options: ['SCRAPED', 'CONTACT_HUNT', 'CONTACTED', 'IN_CONVERSATION', 'ONBOARDING', 'TRUST_REVIEW', 'LIVE', 'DECLINED', 'UNREACHABLE', 'DUPLICATE', 'REJECTED_LOW_TRUST'],
    description: 'The onboarding funnel — the Kanban group field.' },
  { name: 'stageChangedAt', label: 'Stage changed', type: 'DATE_TIME' },
  { name: 'hostTrustBand', label: 'Host trust band', type: 'SELECT', icon: 'IconShieldCheck',
    options: ['TRUSTED', 'PROMISING', 'HOLD', 'LOW', 'UNSCORED'],
    description: "Denormalized copy so cards/filters show trust (views can't join)." },
  { name: 'homesCount', label: 'Homes', type: 'NUMBER' },
  { name: 'publishReadyHomes', label: 'Ready homes', type: 'NUMBER' },
  { name: 'liveHomes', label: 'Live homes', type: 'NUMBER' },
  { name: 'outreachChannel', label: 'Outreach channel', type: 'SELECT', options: ['WHATSAPP', 'CALL', 'FACEBOOK', 'IN_PERSON', 'OTHER'] },
  { name: 'outreachAttempts', label: 'Outreach attempts', type: 'NUMBER' },
  { name: 'firstContactedAt', label: 'First contacted', type: 'DATE_TIME' },
  { name: 'lastOutreachAt', label: 'Last outreach', type: 'DATE_TIME' },
  { name: 'repliedAt', label: 'Replied', type: 'DATE_TIME', description: 'First host reply — the big trust unlock.' },
  { name: 'nextFollowUpAt', label: 'Next follow-up', type: 'DATE_TIME' },
  { name: 'declineReason', label: 'Decline reason', type: 'SELECT',
    options: ['NOT_INTERESTED', 'ALREADY_BOOKED_FULL', 'PRICE_DISAGREEMENT', 'DISTRUSTS_PLATFORM', 'PROPERTY_UNAVAILABLE', 'WAR_DISPLACEMENT', 'OTHER'] },
  { name: 'host', label: 'Host', type: 'RELATION', icon: 'IconUserCheck',
    relation: { target: 'host', type: 'MANY_TO_ONE', targetFieldLabel: 'Onboarding', targetFieldIcon: 'IconTargetArrow' } },
];

/** Custom fields added to EXISTING standard objects (resolved by nameSingular). */
export interface StandardFieldSet {
  object: string;
  fields: FieldDef[];
}
export const STANDARD_FIELD_SETS: StandardFieldSet[] = [
  { object: 'opportunity', fields: OPPORTUNITY_FIELDS },
];

/**
 * Twenty tag colors (subset) cycled across SELECT/MULTI_SELECT options.
 * From twentyhq/twenty `FieldMetadataOptions.ts` TagColor.
 */
export const TAG_COLORS = [
  'blue', 'green', 'orange', 'purple', 'red', 'sky', 'turquoise',
  'yellow', 'pink', 'gray', 'violet', 'amber', 'lime', 'crimson',
];

/**
 * Normalize any raw value to Twenty's required SELECT option format: UPPER_SNAKE_CASE.
 * Recent Twenty releases reject option values that aren't `^[A-Z][A-Z0-9_]*$`, so the
 * PascalCase mkan-enum spellings (WasherDryer, Apartment) must be converted before they
 * reach the metadata API. Idempotent for values that are already upper-snake
 * (PORT_SUDAN → PORT_SUDAN). Both the schema options AND twenty-upsert's record writes
 * must use this so the stored option and the written value stay byte-identical.
 */
export function toUpperSnake(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2') // WasherDryer → Washer_Dryer
    .replace(/[\s-]+/g, '_') // spaces / hyphens → _
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();
}

/** Expand a raw value into a Twenty SELECT option object (label human-readable, value UPPER_SNAKE). */
export function toOption(value: string, position: number) {
  const label = value
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase / PascalCase: WasherDryer → "Washer Dryer"
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' '); // PORT_SUDAN → "Port Sudan"
  return { label, value: toUpperSnake(value), color: TAG_COLORS[position % TAG_COLORS.length], position };
}
