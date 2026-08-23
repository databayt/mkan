/**
 * Photo request — the ask for listings that are PUBLISHED with ZERO photos.
 *
 *   npx tsx scripts/crm/photo-request.ts                # full sheet (dry — never sends)
 *   npx tsx scripts/crm/photo-request.ts --host=0002    # one host account
 *
 * The 2026-08-22 photo census found the marketplace's worst conversion hole:
 * 24 listings live on the site with no photos at all — a guest cannot book a
 * blank card, so every one of them converts nobody. Low-quality photos go
 * through mastering; NO photos need the HOST, because real apartment photos
 * cannot be invented (the honesty rule: the model improves the photograph,
 * never the property — and with no photograph there is nothing honest to
 * improve).
 *
 * So this is a host-success touch, give-before-ask shaped: the ask is 5–8
 * quick phone photos per listing, ANY quality — and the give is that we
 * master them into professional shots for free (the pipeline that does this
 * is live and proven). One message per host, all their blank listings named,
 * wa.me link ready. A human sends; this tool never does.
 *
 * Contact resolution: User.phoneNumber first, then the Twenty portSudans
 * record for the host's account (hostWhatsapp → hostPhone). Read-only
 * everywhere; sheet lands in .data/photo-request-sheet.json.
 */
import { config } from "dotenv";
config({ override: true });

const HOST = (process.argv.find((a) => a.startsWith("--host=")) ?? "").split("=")[1] || null;
const APP = (process.env.NEXT_PUBLIC_APP_URL ?? "https://mkan.sd").replace(/\/+$/, "");

interface HostSheet {
  hostId: string;
  account: string | null; // e.g. "0002" — from sourceListingId prefix
  hostNameAr: string;
  phone: string | null;
  phoneNote?: string;
  phoneSource: "user" | "twenty" | null;
  listings: Array<{ sourceListingId: string | null; title: string; url: string }>;
  message: string;
  waLink: string | null;
}

export function compilePhotoRequest(d: {
  hostNameAr: string;
  listings: Array<{ title: string; url: string }>;
}): string {
  const many = d.listings.length > 1;
  const lines = [
    `السلام عليكم ورحمة الله أستاذ ${d.hostNameAr}،`,
    "",
    "معاك فريق منصة «مكان» (mkan.sd). 🌟",
    "",
    many
      ? `لاحظنا أن ${d.listings.length} من شققك المنشورة على المنصة ما زالت بدون صور — والشقة بدون صور لا يحجزها أحد:`
      : "لاحظنا أن شقتك المنشورة على المنصة ما زالت بدون صور — والشقة بدون صور لا يحجزها أحد:",
    ...d.listings.map((l) => `• ${l.title}\n  ${l.url}`),
    "",
    "أرسل لنا ٥–٨ صور لكل شقة على هذا الرقم — بأي جودة، صور موبايل عادية تكفي — ونحن نتكفّل بتحسينها بجودة احترافية مجاناً ونضيفها لصفحاتك خلال يوم. 📷",
    "",
    "كل ما كانت الصور أسرع، بدأت الحجوزات أسرع. 🤝",
  ];
  return lines.join("\n");
}

async function main() {
  const { db } = await import("@/lib/db");
  const { twentyClient } = await import("./twenty-rest");

  const empty = await db.listing.findMany({
    where: { isPublished: true, photoUrls: { isEmpty: true } },
    select: {
      sourceListingId: true,
      title: true,
      hostId: true,
      host: { select: { id: true, username: true, phoneNumber: true } },
    },
    orderBy: { sourceListingId: "asc" },
  });

  // Group by host; account = the "NNNN" prefix of sourceListingId ("0002-05").
  const byHost = new Map<string, typeof empty>();
  for (const l of empty) {
    if (!byHost.has(l.hostId)) byHost.set(l.hostId, []);
    byHost.get(l.hostId)!.push(l);
  }

  // Twenty fallback for phones + Arabic host names, keyed by account.
  let psByAccount = new Map<string, { name: string | null; phone: string | null }>();
  try {
    const t = twentyClient();
    const res = await t.rest<{ data?: { portSudans?: Array<Record<string, unknown>> } }>(
      "GET",
      "portSudans?limit=100&depth=0",
    );
    for (const r of res.data?.portSudans ?? []) {
      const acc = String(r.account ?? "");
      if (!acc || psByAccount.has(acc)) continue;
      const wa = (r.hostWhatsapp as { primaryPhoneNumber?: string })?.primaryPhoneNumber;
      const ph = (r.hostPhone as { primaryPhoneNumber?: string })?.primaryPhoneNumber;
      psByAccount.set(acc, {
        name: (r.hostName as string) ?? null,
        phone: wa ? `+249${wa}` : ph ? `+249${ph}` : null,
      });
    }
  } catch (e) {
    console.warn(
      `  ! Twenty unreadable (${e instanceof Error ? e.message.split("\n")[0] : e}) — phones from User rows only`,
    );
  }

  const sheets: HostSheet[] = [];
  for (const [hostId, ls] of byHost) {
    const account = ls[0].sourceListingId?.split("-")[0] ?? null;
    if (HOST && account !== HOST) continue;
    const tw = account ? psByAccount.get(account) : undefined;
    const rawPhone = ls[0].host?.phoneNumber?.trim() || tw?.phone || null;
    // SD mobile only (+2499 + 8 digits) — a malformed number in a wa.me link
    // fails silently and reads as a host who ignored us. Invalid → flagged,
    // never "ready".
    const phone = rawPhone && /^\+2499\d{8}$/.test(rawPhone) ? rawPhone : null;
    const phoneNote = rawPhone && !phone ? ` (INVALID on file: ${rawPhone} — fix the User/Twenty record)` : "";
    const hostNameAr = tw?.name || ls[0].host?.username || "المضيف";
    const listings = ls.map((l) => ({
      sourceListingId: l.sourceListingId,
      title: l.title?.trim() || l.sourceListingId || "(untitled)",
      url: `${APP}/ar/listings/${l.sourceListingId}`,
    }));
    const message = compilePhotoRequest({ hostNameAr, listings });
    sheets.push({
      hostId,
      account,
      hostNameAr,
      phone,
      phoneNote,
      phoneSource: ls[0].host?.phoneNumber ? "user" : tw?.phone ? "twenty" : null,
      listings,
      message,
      waLink: phone
        ? `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(message)}`
        : null,
    });
  }

  const ready = sheets.filter((s) => s.waLink);
  console.log(
    `\n═══ Photo request — ${empty.length} blank published listing(s), ${sheets.length} host(s) ═══`,
  );
  console.log(`  ready to send ${ready.length} · needs contact ${sheets.length - ready.length}\n`);
  for (const s of sheets) {
    console.log(`──── [${s.account ?? "?"}] ${s.hostNameAr} — ${s.listings.length} listing(s)`);
    console.log(
      `  phone  ${s.phone ?? "⏳ no valid number" + (s.phoneNote ?? "")}${s.phoneSource && s.phone ? ` (${s.phoneSource})` : ""}`,
    );
    for (const l of s.listings) console.log(`    · ${l.sourceListingId}  ${l.title.slice(0, 46)}`);
    if (s.waLink) console.log(`  📲 ${s.waLink.slice(0, 100)}…`);
    console.log("");
  }

  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("scripts/crm/.data", { recursive: true });
  writeFileSync(
    "scripts/crm/.data/photo-request-sheet.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), sheets }, null, 2),
  );
  console.log("  sheet → scripts/crm/.data/photo-request-sheet.json\n");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
