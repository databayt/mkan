import Image from "next/image";
import { db } from "@/lib/db";
import { getText } from "@/components/translation/localize";
import type { Lang } from "@/components/translation/types";
import { ClaimForm } from "./form";

/**
 * The claim page's server half: resolve the token, and show the host their own
 * listings before asking them to take the account.
 *
 * Showing the listings is the point. A host who has never heard of mkan is
 * being asked to trust a link from a stranger, and the only evidence we can
 * offer that this is really about their property is the property itself — their
 * photos, their titles, in their language. Everything here is read-only until
 * they press the button.
 */

interface ClaimContentProps {
  token: string;
  lang: Lang;
}

const COPY = {
  ar: {
    invalid: "هذا الرابط لم يعد صالحاً",
    invalidHelp: "الروابط تنتهي صلاحيتها بعد فترة، وتُستخدم مرة واحدة فقط. تواصل معنا ونرسل لك رابطاً جديداً.",
    heading: "هذه إعلاناتك؟",
    intro: (n: number) =>
      `جهّزنا لك حساباً على mkan فيه ${n === 1 ? "إعلان واحد" : `${n} إعلانات`} من إعلاناتك. اختر كلمة سر وخُد الحساب — الإعلانات ما بتظهر للضيوف قبل ما توافق أنت.`,
    noListings: "الحساب جاهز، لكن ما لقينا إعلانات مربوطة بيه بعد.",
    busy: "غير منشور",
  },
  en: {
    invalid: "This link is no longer valid",
    invalidHelp: "Claim links expire and can only be used once. Get in touch and we'll send a fresh one.",
    heading: "Are these yours?",
    intro: (n: number) =>
      `We've set up an mkan account holding ${n === 1 ? "one of your listings" : `${n} of your listings`}. Choose a password and the account is yours — nothing is shown to guests until you say so.`,
    noListings: "The account is ready, but no listings are attached to it yet.",
    busy: "Not published",
  },
} as const;

export async function ClaimContent({ token, lang }: ClaimContentProps) {
  const t = COPY[lang] ?? COPY.ar;

  const claim = await db.hostClaimToken.findUnique({
    where: { token },
    select: {
      usedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          username: true,
          listings: {
            where: { source: "AIRBNB" },
            select: {
              id: true,
              title: true,
              photoUrls: true,
              location: { select: { city: true } },
            },
            orderBy: { id: "asc" },
            take: 12,
          },
        },
      },
    },
  });

  const valid = claim && !claim.usedAt && claim.expiresAt > new Date();
  if (!valid) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold">{t.invalid}</h1>
        <p className="text-sm text-muted-foreground">{t.invalidHelp}</p>
      </div>
    );
  }

  const listings = claim.user.listings;

  // Titles are stored in whichever language the host wrote on Airbnb; getText
  // resolves each through translation_cache, which crm:seed-i18n has already
  // filled with Airbnb's own wording for the other locale.
  const shown = await Promise.all(
    listings.map(async (l) => ({
      id: l.id,
      title: await getText(l.title, lang),
      city: await getText(l.location?.city, lang),
      photo: l.photoUrls?.[0] ?? null,
    })),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t.heading}</h1>
        <p className="text-sm text-muted-foreground">{t.intro(listings.length)}</p>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noListings}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((l) => (
            <li key={l.id} className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                {l.photo ? (
                  <Image src={l.photo} alt="" fill sizes="56px" className="object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {l.city} · {t.busy}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ClaimForm token={token} lang={lang} />
    </div>
  );
}
