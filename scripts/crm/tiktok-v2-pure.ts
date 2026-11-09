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

// ── what is on the broker's video: added in editing, or in the scene ──────────────────────────
//
// `mkan-video measure` (scripts/crm/video/Measure.swift) reads every line of text on the source
// and records the evidence; these functions decide. The evidence that settles it, strongest first:
//  • held — the line's pixels stayed exactly the same while the picture around it changed (the
//    camera moved, or the shot cut): only something laid on top does that;
//  • fixed / follows — 0.2–0.4 s later the line was still at the same place on the screen while the
//    room moved (added), or had moved with the room (scene);
//  • popped — with the room unchanged, the line appeared or vanished (a caption coming on);
//  • looks — tilted or in perspective (scene); crisp over a soft picture, on a plain plate (added);
//    a phone number, @handle or ad words (added, but never on that alone).
// Anything unsure is kept, unless it carries a contact (then it goes): scene text is never removed.

export interface MeasuredVote { k: number; d: [number, number]; pred: [number, number]; ringNcc: number; nS: number; nF: number; v: 'fixed' | 'follows' | 'mixed' | 'none' }
export interface MeasuredPresence { d: number; dir: 'prev' | 'next'; box: number; ring: number }
export interface MeasuredLine {
  f: number;
  t: number;
  text: string;
  conf: number;
  /** x, y, w, h in source pixels (top-left origin). */
  box: [number, number, number, number];
  quad: [number, number][];
  angle: number;
  trap: number;
  ringTex: number;
  votes: MeasuredVote[];
  presence: MeasuredPresence[];
  looks: { sharpIn?: number; sharpRing?: number; boxMean?: number; boxStd?: number; ringMean?: number; ringStd?: number; plate?: [number, number, number, number] };
}
export interface Measure {
  w: number;
  h: number;
  fps: number;
  frames: number;
  ocrStep: number;
  lines: MeasuredLine[];
  motion: { f: number; mag: number; h: number[] }[];
  cuts: number[];
  staticWindows: { f0: number; f1: number; pairs: number; cells: string }[];
  cell: { div: number; w: number; h: number };
}

export interface Track {
  lines: MeasuredLine[];
  f0: number;
  f1: number;
  text: string;
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
/** How much of `a` lies inside `b` (0–1). */
const containment = (a: [number, number, number, number], b: [number, number, number, number]) => {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return (x * y) / (a[2] * a[3] || 1);
};
const iou = (a: [number, number, number, number], b: [number, number, number, number]) => {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const i = x * y;
  return i / (a[2] * a[3] + b[2] * b[3] - i || 1);
};

/** Lines followed across the samples: the same words within ~1 s, or the same place and size. */
export function trackLines(m: Measure): Track[] {
  const tracks: Track[] = [];
  const gap = m.ocrStep * 3;
  for (const l of [...m.lines].sort((a, b) => a.f - b.f)) {
    const key = norm(l.text);
    const tr = tracks.find((t) => {
      const last = t.lines[t.lines.length - 1]!;
      if (l.f - last.f > gap || last.f === l.f) return false;
      return (key.length >= 3 && norm(last.text) === key) || (iou(last.box, l.box) > 0.5 && Math.abs(last.box[3] - l.box[3]) < 0.3 * Math.max(last.box[3], l.box[3]));
    });
    if (tr) {
      tr.lines.push(l);
      tr.f1 = l.f;
      if (l.text.length > tr.text.length) tr.text = l.text;
    } else tracks.push({ lines: [l], f0: l.f, f1: l.f, text: l.text });
  }
  return tracks;
}

/** Words of a rental ad (prices, rooms, ad words; en / rw / fr) — a nudge toward "added", never proof. */
const AD_WORDS = /\b\d+\s*(?:k|m|rwf|frw|usd)\b|\$\s*\d|\b(?:rwf|frw)\b|\b(?:bed(?:room)?s?|bath(?:room)?s?|for\s+rent|to\s+let|price|deposit|furnished|call|whatsapp|dm|inbox|per\s+month|monthly|ibyumba|icyumba|ikodeshwa|irakodeshwa|inzu|amafaranga|ukwezi|à\s+louer|chambres?)\b/i;
/** A phone number (7+ digits, spaces and dots allowed) or an @handle. */
export const CONTACT = /(?:\+?\d[\d\s.\-]{7,}\d)|(?:^|\s)@[a-z0-9._]{3,30}/i;
/** A home already let (Kinyarwanda "yabonetse"/"yafashwe" — a native reader extends the list — and English). */
export const TAKEN = /\b(?:yabonetse|yafashwe|byafashwe|taken|rented\s+out|not\s+available|no\s+longer\s+available|already\s+rented|booked)\b/i;

export interface Verdict {
  kind: 'added' | 'scene';
  /** Positive: added. The hard rules give ±10. */
  score: number;
  why: string[];
  contact: boolean;
  taken: boolean;
}

/** Added or in the scene, with the evidence that decided it. */
export function classifyTrack(tr: Track, m: Measure): Verdict {
  const why: string[] = [];
  const text = tr.lines.map((l) => l.text).join(' ');
  const contact = CONTACT.test(text);
  const taken = TAKEN.test(text);
  let held = 0, popped = 0, fixed = 0, follows = 0;
  for (const l of tr.lines) {
    for (const p of l.presence) {
      if (p.ring < 0.8 && p.box >= 0.9) held++;
      else if (p.ring >= 0.92 && p.box < 0.5) popped++;
    }
    for (const v of l.votes) {
      if (v.v === 'fixed') fixed++;
      else if (v.v === 'follows') follows++;
    }
  }
  const conf = Math.max(...tr.lines.map((l) => l.conf));
  // A glimpse Vision is unsure of: the scene's texture, not a caption.
  if (tr.lines.length === 1 && conf < 0.5 && !contact) return { kind: 'scene', score: -10, why: ['one unsure glimpse'], contact, taken };
  if (held >= 2 && follows === 0) return { kind: 'added', score: 10, why: [`held still while the picture changed ×${held}`], contact, taken };
  if (follows >= 2 && fixed === 0 && held === 0) return { kind: 'scene', score: -10, why: [`moved with the room ×${follows}`], contact, taken };
  let score = 0;
  if (held) {
    score += 2 * held;
    why.push(`held ×${held}`);
  }
  if (fixed) {
    score += 3 * fixed;
    why.push(`fixed on screen ×${fixed}`);
  }
  if (follows) {
    score -= 3 * follows;
    why.push(`moved with the room ×${follows}`);
  }
  if (popped) {
    score += 1.5 * Math.min(popped, 4);
    why.push(`came on with the room unchanged ×${popped}`);
  }
  const l0 = tr.lines.reduce((a, b) => (b.box[3] > a.box[3] ? b : a));
  const tilt = Math.min(Math.abs(l0.angle), Math.abs(180 - Math.abs(l0.angle)));
  if (tilt > 4 || l0.trap > 0.12) {
    score -= 2;
    why.push(`in perspective (${tilt.toFixed(1)}°, trap ${l0.trap.toFixed(2)})`);
  }
  const sharp = (l0.looks.sharpIn ?? 0) / Math.max(1, l0.looks.sharpRing ?? 0);
  if (sharp > 1.8) {
    score += 0.5;
    why.push('crisp over the picture');
  }
  if (l0.looks.plate) {
    score += 0.5;
    why.push('on a plain plate');
  }
  if (contact) {
    score += 1.5;
    why.push('a contact');
  } else if (AD_WORDS.test(text)) {
    score += 1;
    why.push('ad words');
  }
  if (l0.box[3] / m.h > 0.035) {
    score += 0.5;
    why.push('big');
  }
  // Unsure: removed only with a contact on it (it must not reach mkan's page); otherwise it is the scene's.
  const kind = score >= 3 || (score > -2 && contact) ? 'added' : 'scene';
  if (kind === 'added' && score < 3) why.push('unsure, but a contact');
  return { kind, score, why, contact, taken };
}

// ── the plan: the least that removes everything added ────────────────────────────────────────

/** A region to clear: source pixels, over a span of frames. */
export interface Region {
  f0: number;
  f1: number;
  rect: [number, number, number, number];
  what: string;
}

export interface CleanPlan {
  mode: 'pass' | 'trim' | 'crop' | 'fill' | 'skip';
  /** Frame spans kept, in order (shot boundaries; a trim drops whole shots). */
  keep: [number, number][];
  /** One 9:16 window over every kept frame, when cropping clears the edges. */
  crop: [number, number, number, number] | null;
  /** What the fill engine clears (frames inside `keep` only). */
  masks: { f0: number; f1: number; rects: [number, number, number, number][] }[];
  cuts: number[];
  why: string[];
  /** Set for a home whose video says it is taken. */
  taken: boolean;
}

export interface PlanOpts {
  /** The shortest video worth posting, seconds. */
  minKeep?: number;
  /** A crop may zoom the picture at most this much (the stabiliser adds its own few percent). */
  maxZoom?: number;
}

/** A static-map window's cells (base64, one byte each) as rectangles that held still while the scene moved. */
export function staticRegions(m: Measure, threshold = 153, minCells = 6, maxFrac = 0.12): Region[] {
  const out: Region[] = [];
  const { w: cw, h: ch, div } = m.cell;
  for (const win of m.staticWindows) {
    if (win.pairs < 5) continue;
    const cells = Uint8Array.from(Buffer.from(win.cells, 'base64'));
    const seen = new Uint8Array(cw * ch);
    for (let i = 0; i < cells.length; i++) {
      if (seen[i] || cells[i]! < threshold) continue;
      // Flood the component.
      const stack = [i];
      seen[i] = 1;
      let n = 0, x0 = cw, y0 = ch, x1 = 0, y1 = 0;
      while (stack.length) {
        const j = stack.pop()!;
        const x = j % cw, y = Math.floor(j / cw);
        n++;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const k = ny * cw + nx;
          if (!seen[k] && cells[k]! >= threshold) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
      const area = ((x1 - x0 + 1) * (y1 - y0 + 1)) / (cw * ch);
      if (n >= minCells && area <= maxFrac) out.push({ f0: win.f0, f1: win.f1, rect: [x0 * div, y0 * div, (x1 - x0 + 1) * div, (y1 - y0 + 1) * div], what: 'logo or sticker held still' });
    }
  }
  return out;
}

/** Shots as [first, last] frame spans, from the cut list. */
export function shots(m: Measure): [number, number][] {
  const starts = [0, ...m.cuts.filter((c) => c > 0 && c < m.frames)];
  return starts.map((s, i) => [s, (starts[i + 1] ?? m.frames) - 1] as [number, number]);
}

const pad = (r: [number, number, number, number], p: number, W: number, H: number): [number, number, number, number] => {
  const x = Math.max(0, r[0] - p), y = Math.max(0, r[1] - p);
  return [x, y, Math.min(W, r[0] + r[2] + p) - x, Math.min(H, r[1] + r[3] + p) - y];
};
const unionRect = (a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] => {
  const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
};

/** The added text of a track as a region: its plate (or box) padded for the outline/shadow, over its frames. */
export function trackRegion(tr: Track, m: Measure): Region {
  let rect: [number, number, number, number] | null = null;
  for (const l of tr.lines) {
    const r = l.looks.plate ?? l.box;
    // Room for the letters' outline and shadow, not a slab of the picture around a huge word.
    const p = Math.round(Math.min(28, Math.max(6, 4 + 0.25 * l.box[3])));
    const pr = pad(r, p, m.w, m.h);
    rect = rect ? unionRect(rect, pr) : pr;
  }
  // From the sample before its first sighting to the sample after its last.
  return { f0: Math.max(0, tr.f0 - m.ocrStep), f1: Math.min(m.frames - 1, tr.f1 + m.ocrStep), rect: rect!, what: tr.text.slice(0, 40) };
}

/**
 * The least that clears every added thing: nothing (pass); the longest clean stretch, when it is
 * long enough to post (trim — joins only at the video's own cuts); a 9:16 window
 * that leaves edge captions outside (crop, zoom ≤ maxZoom); else clear what is left in place (fill).
 * Skip when the video says the home is taken, or when a contact filmed in the scene cannot be cut
 * out with its shot — scene text is never hidden.
 */
export function cleanPlan(m: Measure, opts: PlanOpts = {}): CleanPlan {
  const { minKeep = 8, maxZoom = 1.2 } = opts;
  const why: string[] = [];
  const tracks = trackLines(m);
  const verdicts = tracks.map((t) => ({ t, v: classifyTrack(t, m) }));
  // One caption block, one verdict: lines on together and stacked as one block are one caption (its
  // inner lines often sit on a plain plate where nothing can be measured around them).
  for (let changed = true; changed; ) {
    changed = false;
    for (const a of verdicts) {
      if (a.v.kind !== 'added') continue;
      for (const b of verdicts) {
        if (b.v.kind !== 'scene' || b.v.score <= -10 || !sameBlock(a.t, b.t, m)) continue;
        b.v = { ...b.v, kind: 'added', why: [...b.v.why, `same caption block as "${a.t.text.slice(0, 20)}"`] };
        changed = true;
      }
    }
  }
  // The same overlay seen again later (same words, same place), or a line inside an added block
  // (the small print of a logo, a caption's second read): added too, never kept half.
  const firstPass = blockRegions(verdicts.filter(({ v }) => v.kind === 'added').map(({ t }) => t), m);
  for (const b of verdicts) {
    if (b.v.kind !== 'scene' || b.v.score <= -10) continue;
    const twin = verdicts.find(({ t, v }) => v.kind === 'added' && norm(t.text).length >= 3 && norm(t.text) === norm(b.t.text) && iou(t.lines[0]!.box, b.t.lines[0]!.box) > 0.5);
    // Inside an added block, and holding still there (a sign the camera pans past is not part of it).
    const still = b.t.lines.length >= 2 && b.t.lines.every((l) => Math.hypot(l.box[0] - b.t.lines[0]!.box[0], l.box[1] - b.t.lines[0]!.box[1]) <= 0.5 * b.t.lines[0]!.box[3]);
    const inside = still && b.t.lines.filter((l) => firstPass.some((r) => l.f >= r.f0 - m.ocrStep && l.f <= r.f1 + m.ocrStep && containment(l.box, r.rect) >= 0.7)).length >= 0.6 * b.t.lines.length;
    if (twin) b.v = { ...b.v, kind: 'added', why: [...b.v.why, 'the same overlay as an added line'] };
    else if (inside) b.v = { ...b.v, kind: 'added', why: [...b.v.why, 'inside an added block'] };
  }
  const taken = verdicts.some(({ v }) => v.taken && v.score > -2);
  const all = shots(m);
  const base: CleanPlan = { mode: 'skip', keep: [], crop: null, masks: [], cuts: m.cuts, why, taken };
  if (taken) return { ...base, why: ['the video says the home is taken'] };

  const text = blockRegions(verdicts.filter(({ v }) => v.kind === 'added').map(({ t }) => t), m);
  const added: Region[] = [...text, ...persistentStatic(staticRegions(m), text, m)];
  // A contact filmed in the scene: its shot goes (never hidden).
  const sceneContact = verdicts.filter(({ v }) => v.kind === 'scene' && v.contact).map(({ t }) => t);
  const keep = all.filter(([a, b]) => !sceneContact.some((t) => t.f1 >= a && t.f0 <= b));
  if (keep.length < all.length) why.push(`cut ${all.length - keep.length} shot(s) with a phone number in the scene`);
  const secs = (spans: [number, number][]) => spans.reduce((s, [a, b]) => s + (b - a + 1), 0) / m.fps;
  if (secs(keep) < minKeep) return { ...base, why: [...why, `under ${minKeep} s would be left`] };

  const inSpan = (r: Region, [a, b]: [number, number]) => r.f1 >= a && r.f0 <= b;
  // Trim: the longest stretch with nothing added on it, if it is long enough to post — the head or
  // the tail cut at any frame (no jump), stretches joined only where the video already cuts.
  const dirty = new Uint8Array(m.frames);
  for (const r of added) dirty.fill(1, Math.max(0, r.f0), Math.min(m.frames, r.f1 + 1));
  const allowed = new Uint8Array(m.frames);
  for (const [a, b] of keep) allowed.fill(1, a, b + 1);
  const runs: [number, number][] = [];
  for (let f = 0; f < m.frames; ) {
    if (!allowed[f] || dirty[f]) { f++; continue; }
    let g = f;
    while (g + 1 < m.frames && allowed[g + 1] && !dirty[g + 1]) g++;
    runs.push([f, g]);
    f = g + 1;
  }
  const atCut = (f: number) => f === 0 || f >= m.frames || m.cuts.some((c) => Math.abs(c - f) <= 6);
  let best: [number, number][] = [];
  for (let i = 0; i < runs.length; i++) {
    const chain = [runs[i]!];
    for (let j = i + 1; j < runs.length && atCut(chain[chain.length - 1]![1] + 1) && atCut(runs[j]![0]); j++) chain.push(runs[j]!);
    if (secs(chain) > secs(best)) best = chain;
  }
  const dur = secs(keep);
  if (dirty.some((d, f) => d && allowed[f]) && secs(best) >= Math.max(minKeep, 0.4 * dur)) {
    return { ...base, mode: 'trim', keep: best, why: [...why, `kept the clean ${secs(best).toFixed(1)} s of ${dur.toFixed(1)} s`] };
  }
  const left = added.filter((r) => keep.some((s) => inSpan(r, s)));
  if (!left.length) return { ...base, mode: keep.length < all.length ? 'trim' : 'pass', keep, why: [...why, 'nothing added on top'] };

  // Crop: everything left sits in a band along the top or the bottom (or both).
  const W = m.w, H = m.h;
  let top = 0, bottom = 0, ok = true;
  for (const r of left) {
    const [, y, , h] = r.rect;
    if (y + h <= 0.24 * H) top = Math.max(top, y + h);
    else if (y >= 0.76 * H) bottom = Math.max(bottom, H - y);
    else ok = false;
  }
  if (ok) {
    const kh = H - top - bottom;
    const zoom = H / kh;
    const kw = Math.round((W * kh) / H / 2) * 2;
    if (zoom <= maxZoom) {
      const x = Math.round((W - kw) / 2 / 2) * 2;
      return { ...base, mode: 'crop', keep, crop: [x, Math.ceil(top / 2) * 2, kw, Math.floor(kh / 2) * 2], why: [...why, `cropped the edges (zoom ${zoom.toFixed(2)})`] };
    }
  }

  // Fill what is left, in place.
  return {
    ...base,
    mode: 'fill',
    keep,
    masks: left.map((r) => ({ f0: r.f0, f1: r.f1, rects: [r.rect] })),
    why: [...why, `clear ${left.length} region(s) in place: ${left.map((r) => r.what).slice(0, 4).join(' | ')}`],
  };
}

/** Two tracks are one caption block: on at the same time, stacked, overlapping across. */
export function sameBlock(a: Track, b: Track, m: Measure): boolean {
  const slack = 2 * m.ocrStep;
  if (Math.abs(a.f0 - b.f0) > slack || Math.abs(a.f1 - b.f1) > slack) return false;
  const ra = a.lines[0]!.box, rb = b.lines[0]!.box;
  const h = Math.max(ra[3], rb[3]);
  const gap = Math.max(rb[1] - (ra[1] + ra[3]), ra[1] - (rb[1] + rb[3]));
  const across = Math.min(ra[0] + ra[2], rb[0] + rb[2]) - Math.max(ra[0], rb[0]);
  return gap <= 1.5 * h && across >= 0.3 * Math.min(ra[2], rb[2]);
}

/** Added tracks grouped into caption blocks, each one region: the union of its lines, padded for plate and shadow. */
export function blockRegions(tracks: Track[], m: Measure): Region[] {
  const groups: Track[][] = [];
  for (const t of tracks) {
    const g = groups.find((gr) => gr.some((u) => sameBlock(u, t, m)));
    if (g) g.push(t);
    else groups.push([t]);
  }
  // Merging can bridge two groups: repeat until stable.
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < groups.length && !merged; i++) {
      for (let j = i + 1; j < groups.length && !merged; j++) {
        if (groups[i]!.some((a) => groups[j]!.some((b) => sameBlock(a, b, m)))) {
          groups[i]!.push(...groups[j]!);
          groups.splice(j, 1);
          merged = true;
        }
      }
    }
  }
  return groups.map((g) => {
    const rs = g.map((t) => trackRegion(t, m));
    const lineH = Math.max(...g.flatMap((t) => t.lines.map((l) => l.box[3])));
    const rect = pad(rs.map((r) => r.rect).reduce(unionRect), g.length > 1 ? Math.round(0.25 * lineH) : 0, m.w, m.h);
    return { f0: Math.min(...rs.map((r) => r.f0)), f1: Math.max(...rs.map((r) => r.f1)), rect, what: g.map((t) => t.text.slice(0, 24)).join(' / ') };
  });
}

/**
 * Logos and stickers from the static map, kept only where they persist (3+ one-second windows at the
 * same place) and are not the text already found (the map sees a held caption too).
 */
export function persistentStatic(rs: Region[], text: Region[], size: { w: number; h: number }): Region[] {
  const overlaps = (a: [number, number, number, number], b: [number, number, number, number]) => {
    const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
    const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    return (x * y) / (a[2] * a[3] || 1);
  };
  const own = rs.filter((r) => !text.some((t) => t.f1 >= r.f0 && t.f0 <= r.f1 && overlaps(r.rect, t.rect) >= 0.4));
  // A thin strip the whole height (or width) of the frame is a border's edge, not a sticker: borders
  // are cropped when the source is normalised (cropdetect), never painted over.
  const notBorder = (r: Region, W: number, H: number) => !((r.rect[3] >= 0.8 * H && r.rect[2] <= 0.1 * W) || (r.rect[2] >= 0.8 * W && r.rect[3] <= 0.1 * H));
  const clusters: Region[][] = [];
  for (const r of own) {
    const c = clusters.find((cl) => cl.some((u) => iou(u.rect, r.rect) > 0.3));
    if (c) c.push(r);
    else clusters.push([r]);
  }
  return clusters
    .filter((c) => new Set(c.map((r) => r.f0)).size >= 3)
    .filter((c) => notBorder({ ...c[0]!, rect: c.map((r) => r.rect).reduce(unionRect) }, size.w, size.h))
    .map((c) => ({ f0: Math.min(...c.map((r) => r.f0)), f1: Math.max(...c.map((r) => r.f1)), rect: c.map((r) => r.rect).reduce(unionRect), what: 'logo or sticker held still' }));
}

/**
 * The gate after cleaning: what a re-read of the cleaned video still finds added on top. Anything
 * sure (score ≥ 3), or any contact detail not filmed in the scene, fails it — the video is skipped,
 * never patched with a blur. Scene text (a sign, a label) does not fail it.
 */
export function qaProblems(m: Measure): string[] {
  const out: string[] = [];
  for (const t of trackLines(m)) {
    const v = classifyTrack(t, m);
    if (v.kind === 'added' && (v.score >= 3 || v.contact)) out.push(`"${t.text.slice(0, 32)}" ${(t.f0 / m.fps).toFixed(1)}–${(t.f1 / m.fps).toFixed(1)} s (${v.why.join('; ')})`);
  }
  return out;
}

/** The fill engine's report, and whether it is good enough to post (the fill must look like the room). */
export interface FillReport {
  frames: number;
  maskedFrames: number;
  holePx: number;
  realPx: number;
  prevPx: number;
  lamaPx: number;
  unfilledPx: number;
  lamaCalls: number;
  lama: boolean;
  maxGenFrac: number;
  seamP95: number;
  flickerP95: number;
  seconds: number;
}

export function fillProblems(r: FillReport, limits = { seam: 3, flicker: 3 }): string[] {
  const out: string[] = [];
  if (r.unfilledPx > 0) out.push(`${r.unfilledPx} px could not be filled within the cap on painted area`);
  if (r.seamP95 > limits.seam) out.push(`the fill's edge shows (seam ${r.seamP95})`);
  if (r.flickerP95 > limits.flicker) out.push(`the fill flickers (${r.flickerP95})`);
  return out;
}

// ── the sound: a trending track from TikTok's Commercial Music Library, chosen at upload ─────────
//
// Abdout, 2026-11-09: music instead of the broker's audio, the viral kind. TikTok Studio's upload
// editor (Sounds → filter "Commercial use" → For You) lists tracks TikTok licenses for business
// posts, many of them trending; tiktok-upload.ts adds one and mutes the original. A track is not
// used twice in 7 days, must be as long as the video, and is never someone's "original sound".

export interface SoundRow {
  title: string;
  artist: string;
  secs: number;
}
export interface SoundUse {
  ref: string;
  title: string;
  artist: string;
  at: string;
}

/** One row of Studio's Sounds list ("Gym Motivation (Discipline) 01:00 · Young Twin Stylez", or its lines). */
export function parseSoundRow(text: string): SoundRow | null {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*?)\s+(\d{1,2}):(\d{2})\s*·\s*(.+)$/);
  if (!m) return null;
  return { title: m[1]!.trim(), artist: m[4]!.trim(), secs: Number(m[2]) * 60 + Number(m[3]) };
}

export const SOUND_REST_DAYS = 7;

/** The index of the first fit track in the list's own order (TikTok ranks it), or -1. */
export function pickSound(rows: (SoundRow | null)[], used: SoundUse[], videoSecs: number, now = Date.now(), deny: RegExp[] = []): number {
  const since = now - SOUND_REST_DAYS * 86_400_000;
  const recent = new Set(used.filter((u) => Date.parse(u.at) >= since).map((u) => `${u.title}|${u.artist}`.toLowerCase()));
  return rows.findIndex(
    (r) =>
      !!r &&
      !/^original sound\b/i.test(r.title) &&
      r.secs >= Math.min(60, Math.ceil(videoSecs)) &&
      !recent.has(`${r.title}|${r.artist}`.toLowerCase()) &&
      !deny.some((d) => d.test(`${r.title} ${r.artist}`)),
  );
}
