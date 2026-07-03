"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { UsersRound } from "lucide-react";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Airbnb's exact info-row glyphs, captured from the live dialog (24px,
// currentColor). Simple monochrome UI icons — reproduced 1:1 so the rows match.
const rowIconStyle = { display: "block", height: 24, width: 24, fill: "currentColor" } as const;

function PersonGlyph() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" role="presentation" focusable="false" style={rowIconStyle}>
      <path d="m16.0012 5c3.866 0 7 3.13401 7 7 0 2.3285-1.137 4.3915-2.886 5.6641 4.8605 1.6201 8.4448 6.0335 8.8481 11.3362h-2.0069c-.445-4.9392-4.1548-8.937-8.9548-9.8188l.0001-2.5978c1.7656-.7717 2.9995-2.5336 2.9995-4.5837 0-2.76142-2.2386-5-5-5s-5 2.23858-5 5c0 2.0505 1.2343 3.8127 3.0004 4.5842l.0002 2.5971c-4.80052.8815-8.51076 4.8794-8.95579 9.819h-2.00695c.40329-5.3027 3.9877-9.7161 8.84914-11.3362-1.75-1.2726-2.88701-3.3356-2.88701-5.6641 0-3.86599 3.13401-7 7.00001-7z" />
    </svg>
  );
}

function EyeGlyph() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" role="presentation" focusable="false" style={rowIconStyle}>
      <path d="M16 27A15.57 15.57 0 0 1 1.48 16.94l-.1-.3.13-.51a15 15 0 0 1 28.98-.01l.14.53-.11.3A15.58 15.58 0 0 1 16 27zM3.47 16.53a13.5 13.5 0 0 0 25.06 0 13 13 0 0 0-25.06 0zM16 21a5 5 0 1 1 5-5 5 5 0 0 1-5 5zm0-8a3 3 0 1 0 3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

// First-visit education modal mirroring Airbnb's "About your profile" dialog on
// the profile page — white 32px-radius card, top illustration, two icon+text
// rows, a full-width dark primary button and a Learn more link. Shown once per
// user via a localStorage flag.
//
// The illustration slot takes `illustrationSrc` (drop in a house-owned asset);
// with none it renders an original branded placeholder — Airbnb's proprietary
// 3D artwork is deliberately not reproduced.
const SEEN_KEY = "mkan_about_profile_seen";

function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-0.5 shrink-0 text-[#222222]">{icon}</span>
      <p className="text-[15px] leading-5 text-[#222222]">{children}</p>
    </div>
  );
}

export function AboutProfileDialog({ illustrationSrc }: { illustrationSrc?: string }) {
  const dict = useDictionary();
  const router = useRouter();
  const params = useParams();
  const lang = (params?.lang as string) ?? "en";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode — dismiss for the session */
    }
    setOpen(false);
  };

  const t = dict?.profile;
  const title = t?.aboutProfile ?? "About your profile";
  const intro = t?.aboutProfileIntro ?? "Your profile is how you introduce yourself on Mkan.";
  const visibility =
    t?.aboutProfileVisibility ??
    "Hosts and other guests can see your profile when you book, join a trip, or leave a review.";
  const createLabel = t?.createYourProfile ?? "Create your profile";
  const learnMore = t?.learnMore ?? "Learn more";
  const closeLabel = "Close";

  const goCreate = () => {
    dismiss();
    router.push(`/${lang}/profile/about?editMode=true`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="w-[calc(100%-2rem)] max-w-[568px] gap-0 rounded-[32px] border-0 bg-white p-0 shadow-[0_8px_28px_rgba(0,0,0,0.28)] sm:max-w-[568px]"
      >
        <button
          type="button"
          aria-label={closeLabel}
          onClick={dismiss}
          className="absolute start-4 top-4 z-10 grid size-8 place-items-center rounded-full text-[#222222] transition-colors hover:bg-black/5"
        >
          <svg
            viewBox="0 0 32 32"
            className="size-4"
            style={{ fill: "none", stroke: "currentColor", strokeWidth: 4 }}
            aria-hidden="true"
          >
            <path d="m6 6 20 20M26 6 6 26" />
          </svg>
        </button>

        <div className="px-6 pb-6 pt-8">
          {/* illustration */}
          <div className="flex justify-center">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0.05 }}
            >
              {illustrationSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={illustrationSrc}
                  alt=""
                  aria-hidden="true"
                  width={300}
                  height={237}
                  className="h-[190px] w-auto select-none"
                  draggable={false}
                />
              ) : (
                <div className="grid h-[190px] w-[300px] place-items-center rounded-3xl bg-gradient-to-b from-[#FFF0F3] to-[#FDE7EC]">
                  <UsersRound className="size-20 text-[#FF385C]" strokeWidth={1.25} />
                </div>
              )}
            </motion.div>
          </div>

          <DialogTitle asChild>
            <h2 className="mt-5 text-center text-[26px] font-semibold leading-[30px] text-[#222222]">
              {title}
            </h2>
          </DialogTitle>

          <div className="mt-6 space-y-4">
            <InfoRow icon={<PersonGlyph />}>{intro}</InfoRow>
            <InfoRow icon={<EyeGlyph />}>{visibility}</InfoRow>
          </div>

          <button
            type="button"
            onClick={goCreate}
            className="mt-8 h-14 w-full rounded-lg bg-[#222222] text-[18px] font-medium text-white transition-transform active:scale-[0.99]"
          >
            {createLabel}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 h-11 w-full text-[18px] font-medium text-[#222222] underline-offset-2 hover:underline"
          >
            {learnMore}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
