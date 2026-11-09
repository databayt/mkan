/**
 * Format v2 of the Kigali TikTok page — the pure core (no ffmpeg, no files, no network).
 *
 * Abdout, 2026-11-09: the broker's video goes out with nothing of the broker's added on top
 * (captions, prices, numbers, watermarks, stickers — removed cleanly, never blurred), text that is
 * really in the scene left exactly as filmed, Mkan's own short card on it in an Apple "Liquid
 * Glass" look (text only, no images), a trending TikTok sound instead of the broker's audio, and a
 * short caption with no emoji (captionV2 in tiktok-post-pure.ts).
 *
 * This file holds the card: what it says (cardLines), where it sits (CARD — inside TikTok's safe
 * area), how dark its glass is over a given picture (cardTint), the refraction at its edge
 * (displacementMaps) and the ffmpeg graph that lays it on the moving video (glassGraph). The
 * frosted backdrop is the ONLY blur in v2, and it stays inside the card's own rounded rectangle.
 */
import type { PostRow } from './tiktok-post-pure';
import { formatRwf, kindEn, refOf } from './tiktok-post-pure';

/** The 9:16 frame every v2 video is rendered at. */
export const FRAME = { w: 1080, h: 1920 } as const;

/**
 * TikTok's own interface covers the top ~130 px (the For You / Following tabs), the bottom ~480 px
 * (name, caption, sound ticker) and the right ~150 px (like, comment, share): the card stays clear.
 */
export const SAFE = { top: 130, bottom: 1920 - 480, left: 40, right: 1080 - 150 } as const;

/** The card's rectangle on the frame, its corner radius, and when it comes in. */
export const CARD = { x: 56, y: 1166, w: 868, h: 258, r: 48, inAt: 0.6, inFor: 0.4, rise: 24 } as const;

/** Brand colours (kun brand-kit, production.mkan). */
export const BRAND = { ink: '#1a2530', canvas: '#faf8f5', accent: '#e05638' } as const;

export interface CardLines {
  /** "RWF 700,000 / month" */
  price: string;
  /** "2-bedroom apartment · Nyamirambo" */
  home: string;
  /** "WhatsApp +250 780 984 777 · send" — the code follows in its own capsule */
  contact: string;
  /** "K6527" */
  code: string;
}

/** Title-cases a place as people write it ("NYAMIRAMBO" / "nyamirambo" → "Nyamirambo"). */
export const placeName = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-/(])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());

/**
 * What the card says (Abdout, 2026-11-09: price, home, area, then WhatsApp and the code). Short
 * enough to read in the second a viewer gives it; no emoji, no logo, no photo.
 */
export function cardLines(r: PostRow, whatsapp: string): CardLines {
  const beds = r.bedrooms ? `${r.bedrooms}-bedroom ` : '';
  const kind = kindEn(r);
  const where = r.area?.trim() || r.district?.trim() || 'Kigali';
  return {
    price: `${formatRwf(r.priceMonth ?? 0)} / month`,
    home: `${beds}${kind} · ${placeName(where)}`,
    contact: `WhatsApp ${whatsapp} · send`,
    code: refOf(r),
  };
}

/** sRGB 0–255 → relative luminance 0–1 (WCAG). */
export function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The ink tint's own luminance (#1a2530). */
const INK_LUM = luminance(0x1a, 0x25, 0x30);

/**
 * How opaque the card's ink glass is over a picture whose brightest tenth under the card has
 * luminance `p90` (0–1): enough for white text to hold 3:1 against the frosted backdrop (all the
 * card's text is "large" at 1080 wide), never under 0.22 (it must read as glass) nor over 0.62
 * (it must still show the room through it). One tint for every video — the unified look.
 */
export function cardTint(p90: number): number {
  const target = 0.3; // white on L ≤ 0.30 holds (1.05 / 0.35) = 3:1
  const need = p90 <= target ? 0 : (p90 - target) / (p90 - INK_LUM);
  return Math.round(Math.min(0.62, Math.max(0.22, need)) * 100) / 100;
}

/** Signed distance from (x, y) to the edge of a w × h rounded rectangle at the origin (negative inside). */
export function roundedRectSdf(x: number, y: number, w: number, h: number, r: number): number {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * ffmpeg `displace` maps for the card (one byte a pixel, 128 = stay put): inside a band of `band`
 * px along the rounded edge, each pixel samples the frosted picture from further in, up to `amp`
 * px at the very edge — the light bending at the rim that makes glass look like glass. The centre
 * is untouched, so the room behind reads as it is.
 */
export function displacementMaps(w: number, h: number, r: number, band = 28, amp = 12): { dx: Uint8Array; dy: Uint8Array } {
  const dx = new Uint8Array(w * h).fill(128);
  const dy = new Uint8Array(w * h).fill(128);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = -roundedRectSdf(x + 0.5, y + 0.5, w, h, r); // depth inside, px
      if (d <= 0 || d >= band) continue;
      // Inward normal: the SDF's gradient, by central differences.
      const gx = roundedRectSdf(x + 1.5, y + 0.5, w, h, r) - roundedRectSdf(x - 0.5, y + 0.5, w, h, r);
      const gy = roundedRectSdf(x + 0.5, y + 1.5, w, h, r) - roundedRectSdf(x + 0.5, y - 0.5, w, h, r);
      const n = Math.hypot(gx, gy) || 1;
      const m = amp * (1 - d / band) ** 2;
      dx[y * w + x] = Math.max(1, Math.min(255, Math.round(128 - (m * gx) / n)));
      dy[y * w + x] = Math.max(1, Math.min(255, Math.round(128 - (m * gy) / n)));
    }
  }
  return { dx, dy };
}

export interface GlassInputs {
  /** ffmpeg input indexes of the looped stills (the video is input 0). */
  shadow: number;
  dx: number;
  dy: number;
  mask: number;
  face: number;
  /** The shadow still's padding around the card, px. */
  shadowPad: number;
  /** Frosted backdrop blur (sigma). */
  sigma?: number;
}

/**
 * The ffmpeg graph ([0:v] → [v]) that lays the glass card on the moving picture: the picture
 * under the card is frosted (gblur — only inside the card), lifted a little in colour, bent at
 * the rim (displace), given the card's face (tint, rim light, text: one still) and cut to the
 * rounded shape (alphamerge); then the soft shadow and the card fade and rise in at CARD.inAt.
 */
export function glassGraph(i: GlassInputs, card: typeof CARD = CARD): string {
  const { x, y, w, h, inAt, inFor, rise } = card;
  const pad = 24; // frost a little beyond the card so its edge has picture to blur from
  const sigma = i.sigma ?? 16;
  const yAt = `${y}+${rise}*max(0\\,1-(t-${inAt})/${inFor})`;
  return [
    `[0:v]split=2[base][under]`,
    `[under]crop=${w + 2 * pad}:${h + 2 * pad}:${x - pad}:${y - pad},gblur=sigma=${sigma},eq=saturation=1.35:brightness=0.02,crop=${w}:${h}:${pad}:${pad},format=yuv444p[frost]`,
    `[${i.dx}:v]format=gray,scale=${w}:${h},format=yuv444p[dx]`,
    `[${i.dy}:v]format=gray,scale=${w}:${h},format=yuv444p[dy]`,
    `[frost][dx][dy]displace=edge=smear,format=rgba[lens]`,
    `[lens][${i.face}:v]overlay=0:0:format=auto,format=rgba[faced]`,
    `[${i.mask}:v]format=gray,scale=${w}:${h}[m]`,
    `[faced][m]alphamerge,fade=t=in:st=${inAt}:d=${inFor}:alpha=1[card]`,
    `[${i.shadow}:v]format=rgba,fade=t=in:st=${inAt}:d=${inFor}:alpha=1[sh]`,
    `[base][sh]overlay=x=${x - i.shadowPad}:y='${y - i.shadowPad}+${rise}*max(0\\,1-(t-${inAt})/${inFor})':eval=frame:shortest=1[b1]`,
    `[b1][card]overlay=x=${x}:y='${yAt}':eval=frame:shortest=1,format=yuv420p[v]`,
  ].join(';');
}
