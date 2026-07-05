"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PropertyImage } from "@/components/atom/property-image";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import type { Locale } from "@/components/internationalization/config";

export interface AttentionCardProps {
  /** Remaining required-to-publish steps across the host's draft listings. */
  count: number;
  /** Cover photo of up to two drafts (null → branded placeholder tile). */
  photos: (string | null)[];
}

/**
 * Mobile "Actions need your attention" bar — the fixed bottom sheet on the
 * hosting Today tab, cloned from the airbnb.com/hosting 375px reference DOM.
 * Exact DLS values: white card `border-radius 24px 24px 0 0` + elevation-3
 * shadow, padding 16/24 with the bottom edge running underneath the tab bar
 * (ref: `calc(var(--tab-bar-height) + 16px)`); a 42px two-photo pile of 32px
 * tiles (2px white border, 6px radius, secondary top-end behind, primary
 * bottom-start in front) with a 24px #222 count badge at top −1 / start −10;
 * 16/20 medium title over a 14/18 #8C8C8C "Required to publish" subtitle.
 */
export function AttentionCard({ count, photos }: AttentionCardProps) {
  const dict = useDictionary();
  const params = useParams();
  const lang = (params?.lang as Locale) ?? "ar";
  const t = dict.hosting?.content;

  const primary = photos[0] ?? null;
  const secondary = photos.length > 1 ? photos[1] : undefined;

  const srLabel = (t?.actionsRemaining ?? "{count} actions remaining").replace(
    "{count}",
    String(count),
  );

  const tile = (src: string | null, offset: React.CSSProperties, seed: string) => (
    <div
      aria-hidden
      className="absolute h-8 w-8 overflow-hidden rounded-md border-2 border-white"
      style={{ backgroundColor: "#F7F7F7", ...offset }}
    >
      <PropertyImage src={src} alt="" sizes="32px" quality={50} seed={seed} />
    </div>
  );

  return (
    <Link
      href={`/${lang}/hosting/listings`}
      aria-label={`${t?.actionsNeedAttention ?? "Actions need your attention"} — ${srLabel}`}
      className="fixed inset-x-0 bottom-0 z-40 flex items-center bg-white lg:hidden"
      style={{
        borderRadius: "24px 24px 0 0",
        // 16px top / 24px sides; the bottom edge extends under the 57px tab
        // bar + 16px breathing room (ref: calc(var(--tab-bar-height) + 16px)).
        padding: "16px 24px 73px",
        marginBottom: "env(safe-area-inset-bottom)",
        boxShadow:
          "0px 0px 0px 1px rgba(0,0,0,0.02), 0px 8px 24px 0px rgba(0,0,0,0.10)",
      }}
    >
      {/* photo pile — 42px box, tiles overlap on the block diagonal */}
      <div className="relative shrink-0" style={{ width: 42, height: 42 }}>
        {secondary !== undefined
          ? tile(secondary, { top: 1.25, insetInlineStart: 9 }, "attention-secondary")
          : null}
        {tile(
          primary,
          secondary !== undefined
            ? { top: 9, insetInlineStart: 1.75 }
            : { top: 5, insetInlineStart: 5 },
          "attention-primary",
        )}
        <span
          aria-hidden
          className="absolute flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
          style={{
            top: -1,
            insetInlineStart: -10,
            zIndex: 1,
            backgroundColor: "#222222",
            color: "#FFFFFF",
          }}
        >
          {count}
        </span>
      </div>

      <div className="ms-4 min-w-0 flex-1">
        <span className="sr-only">{srLabel}</span>
        <div
          className="truncate text-base font-medium leading-5"
          style={{ color: "#222222" }}
        >
          {t?.actionsNeedAttention ?? "Actions need your attention"}
        </div>
        <div
          className="truncate text-sm"
          style={{ marginTop: 2, lineHeight: "18px", color: "#8C8C8C" }}
        >
          {t?.requiredToPublish ?? "Required to publish"}
        </div>
      </div>
    </Link>
  );
}
