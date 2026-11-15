"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Volume2, VolumeX } from "lucide-react";

/**
 * A broker home's own video, first on its page (Abdout, 2026-11-15: TikTok homes "displayed as a
 * video", photos stay for the rest). The broker's TikTok cleaned of their text, number and spoken
 * contact (`pnpm tt:web`), muted, looping, playing only while on screen. The card sits inside the
 * video as HTML, not burned into the file: the rent stays current and reads in en/ar/rw and RTL.
 * Reduced motion: the poster stays until the visitor taps play.
 */
export function VideoHero({
  src,
  poster,
  alt,
  labels,
  children,
}: {
  src: string;
  poster?: string | null;
  alt: string;
  labels: { mute: string; unmute: string };
  /** The card over the video's lower part: rent, place, the one button. */
  children: ReactNode;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative mx-auto aspect-[9/16] max-h-[78svh] w-full overflow-hidden rounded-2xl bg-muted">
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        aria-label={alt}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        controls={false}
        onClick={(e) => {
          const v = e.currentTarget;
          if (v.paused) void v.play().catch(() => {});
          else v.pause();
        }}
        className="absolute inset-0 size-full object-cover"
      />
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? labels.unmute : labels.mute}
        className="absolute end-3 top-3 grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"
      >
        {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3">{children}</div>
    </div>
  );
}
