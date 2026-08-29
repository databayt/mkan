/**
 * Gift handover — the account-claim message, compiled per Port Sudan host.
 *
 *   pnpm crm:gift-handover                  # full sheet (dry — this tool never sends)
 *   pnpm crm:gift-handover --account=1001   # one host
 *
 * The v2 of the first-touch message. v1 (`test-host-whatsapp-outreach.ts`) was
 * reply-to-activate: no claim link, no gift. This one carries the funnel's
 * give-before-ask doctrine in full:
 *
 *   1. The listing we already built — linked, published, theirs.
 *   2. The GIFT: professionally mastered photos, already live on their page
 *      (the line renders ONLY when MasteringRun rows are actually UPDATED for
 *      that listing — a promised gift that does not exist is worse than none).
 *   3. The account, handed over: a one-time claim link that lets them set
 *      their own password. No "reply to activate" — the key is in the message.
 *
 * Per host the sheet resolves: phone (Twenty, PHONES composite → +249…),
 * a LIVE claim token (unused, unexpired — or names the mint command),
 * mastered-photo count, and the wa.me link a human opens and sends. Attach
 * 2–3 before/after images to the WhatsApp when the gift line is present.
 *
 * READ-ONLY: it mints nothing and sends nothing. Minting is
 * `pnpm crm:claim-token --account=<account> --apply` (--rotate --ttl-days=14 to
 * replace; a link that expires before the human sends it is flagged here);
 * sending is a human with the wa.me link. Every send gets logged as a Note on
 * the Twenty record by the sender — QUEUED is not SENT. Site-provisioned
 * accounts (0001+, shared password, no token) are `pnpm crm:handover`.
 */
import { config } from "dotenv";
config({ override: true });

import { getPortSudanZone } from "../../src/lib/geo/portsudan-zones";
import { zoneSlug } from "./home-intake-pure";
import { claimUrl, listingUrl, publicAppUrl, waLink } from "./public-links";

// A message leaving the building must never carry a dev origin — localhost in
// a host's WhatsApp is a dead link that reads as a broken company. The guard
// lives in public-links.ts now, shared with claim-tokens and outreach, which
// used to print localhost links unguarded.
const APP = publicAppUrl();
const ACCOUNT = (process.argv.find((a) => a.startsWith("--account=")) ?? "").split("=")[1] || null;
// A link that dies before the human gets round to sending it is a dead link too.
const EXPIRING_SOON_H = 48;

// The 45-zone gazetteer names most zones; these are the ones it does not carry.
const ZONE_AR: Record<string, string> = {
  AIRPORT_DISTRICT: "حي المطار",
  AL_MIRGHANIYA: "حي الميرغنية",
  AROUS: "منطقة عروس",
};
const zoneAr = (zone: string | null | undefined): string =>
  getPortSudanZone(zoneSlug(zone))?.nameAr ?? (zone ? ZONE_AR[zone] : undefined) ?? "بورتسودان";

interface Sheet {
  account: string;
  listingId: string;
  hostNameAr: string;
  property: string;
  zoneAr: string;
  phone: string | null;
  listingUrl: string;
  claimUrl: string | null;
  claimNote: string;
  claimExpiresAt: string | null;
  expiringSoon: boolean;
  mastered: number;
  published: boolean;
  claimed: boolean;
  message: string;
  waLink: string | null;
}

export function compileGiftHandover(d: {
  hostNameAr: string;
  property: string;
  zoneAr: string;
  listingUrl: string;
  claimUrl: string;
  mastered: number;
}): string {
  const lines = [
    `السلام عليكم ورحمة الله أستاذ ${d.hostNameAr}،`,
    "",
    "معاك فريق منصة «مكان» (mkan.sd) — منصة سودانية لحجز الشقق المفروشة مباشرة بين المضيف والنزيل وبدون أي عمولة (0%).",
    "",
    `جهزنا لعقارك «${d.property}» (${d.zoneAr}) صفحة كاملة على المنصة بالصور والوصف:`,
    `🔗 ${d.listingUrl}`,
  ];
  if (d.mastered > 0) {
    lines.push(
      "",
      `وكهدية منا: أعدنا إخراج ${d.mastered} من صور العقار بجودة احترافية — الصور المحسّنة أصبحت على صفحتك وهي ملكك بالكامل، أرفقنا لك نماذج قبل/بعد.`,
    );
  }
  lines.push(
    "",
    "حسابك كمضيف جاهز لتستلمه — افتح الرابط التالي (يعمل مرة واحدة) لتعيين كلمة مرورك وإدارة عقارك بنفسك:",
    `🔑 ${d.claimUrl}`,
    "",
    "بعد الاستلام تصلك طلبات الحجز مباشرة على رقمك. لأي سؤال نحن هنا. 🤝",
  );
  return lines.join("\n");
}

async function main() {
  const { twentyClient } = await import("./twenty-rest");
  // Deferred: @/lib/db reads env at module scope.
  const { db } = await import("@/lib/db");
  const t = twentyClient();

  const res = await t.rest<any>("GET", "portSudans?limit=60&depth=0");
  const rows: any[] = (res.data?.portSudans ?? res.data ?? []).filter(
    (r: any) => r.account?.startsWith("10") && (!ACCOUNT || r.account === ACCOUNT),
  );

  const sheets: Sheet[] = [];
  for (const item of rows.sort((a, b) => (a.listingId ?? "").localeCompare(b.listingId ?? ""))) {
    const phone = item.hostWhatsapp?.primaryPhoneNumber
      ? `+249${item.hostWhatsapp.primaryPhoneNumber}`
      : item.hostPhone?.primaryPhoneNumber
        ? `+249${item.hostPhone.primaryPhoneNumber}`
        : null;

    // Twenty's `listingId` is the mkan code. It lived in `sourceListingId`
    // until 2026-08-24 and now has its own column — join on that.
    const listing = await db.listing.findFirst({
      where: { code: item.listingId },
      select: { id: true, hostId: true, isPublished: true, claimedAt: true, host: { select: { sourceHostId: true } } },
    });

    let claimLink: string | null = null;
    let claimNote = "no listing row — cannot resolve host account";
    let claimExpiresAt: string | null = null;
    let expiringSoon = false;
    let mastered = 0;
    if (listing) {
      const token = await db.hostClaimToken.findFirst({
        where: { userId: listing.hostId, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      claimLink = token ? claimUrl(token.token, "ar", APP) : null;
      claimExpiresAt = token?.expiresAt.toISOString() ?? null;
      const hoursLeft = token ? (token.expiresAt.getTime() - Date.now()) / 3_600_000 : null;
      expiringSoon = hoursLeft != null && hoursLeft < EXPIRING_SOON_H;
      claimNote = listing.claimedAt
        ? "ALREADY CLAIMED — do not send a claim link"
        : token
          ? `live token, expires ${token.expiresAt.toISOString().slice(0, 10)}${
              expiringSoon
                ? ` — ⚠ ${Math.max(0, Math.floor(hoursLeft!))}h left: rotate BEFORE sending (pnpm crm:claim-token --account=${item.account} --rotate --ttl-days=14 --apply)`
                : ""
            }`
          : `no live token — mint: pnpm crm:claim-token --account=${item.account} --apply`;
      mastered = await db.masteringRun.count({
        where: { listingId: listing.id, status: "UPDATED" },
      });
    }

    const d = {
      hostNameAr: item.hostName || "المضيف",
      property: item.titleAr || item.title || item.listingId,
      zoneAr: zoneAr(item.zone),
      listingUrl: listingUrl(item.listingId, "ar", APP),
      claimUrl: claimLink ?? "<claim link — mint first>",
      mastered,
    };
    const message = compileGiftHandover(d);
    sheets.push({
      account: item.account,
      listingId: item.listingId,
      hostNameAr: d.hostNameAr,
      property: d.property,
      zoneAr: d.zoneAr,
      phone,
      listingUrl: d.listingUrl,
      claimUrl: claimLink,
      claimNote,
      claimExpiresAt,
      expiringSoon,
      mastered,
      published: listing?.isPublished ?? false,
      claimed: !!listing?.claimedAt,
      message,
      waLink: phone ? waLink(phone, message) : null,
    });
  }

  console.log(`\n═══ Gift handover sheet — ${sheets.length} host(s) ═══`);
  const ready = sheets.filter((s) => s.phone && s.claimUrl && !s.claimed);
  const noPhone = sheets.filter((s) => !s.phone);
  const noToken = sheets.filter((s) => s.phone && !s.claimUrl && !s.claimed);
  console.log(
    `  ready to send ${ready.length} · needs contact ${noPhone.length} · needs token ${noToken.length} · already claimed ${sheets.filter((s) => s.claimed).length}`,
  );
  console.log(
    `  gift line: ${sheets.filter((s) => s.mastered > 0).length} host(s) have mastered photos — the rest send WITHOUT the gift line until mastering lands`,
  );
  const soon = ready.filter((s) => s.expiringSoon);
  if (soon.length)
    console.log(
      `  ⚠ ${soon.length} ready link(s) expire within ${EXPIRING_SOON_H}h (${soon.map((s) => s.account).join(", ")}) — rotate before sending, or the host taps a dead link`,
    );
  console.log("");

  for (const s of sheets) {
    console.log(`──── [${s.account}] ${s.listingId} — ${s.property.slice(0, 44)}`);
    console.log(`  phone     ${s.phone ?? "⏳ needs contact-hunt (Airbnb hides it)"}`);
    console.log(`  claim     ${s.claimNote}`);
    console.log(
      `  mastered  ${s.mastered} photo(s)${s.mastered ? " — attach before/after to the WhatsApp" : " — no gift line yet"}`,
    );
    console.log(`  published ${s.published} · claimed ${s.claimed}`);
    if (s.waLink && s.claimUrl && !s.claimed) console.log(`  📲 ${s.waLink.slice(0, 110)}…`);
    console.log("");
  }

  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("scripts/crm/.data", { recursive: true });
  writeFileSync(
    "scripts/crm/.data/gift-handover-sheet.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), sheets }, null, 2),
  );
  console.log("  sheet → scripts/crm/.data/gift-handover-sheet.json\n");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
