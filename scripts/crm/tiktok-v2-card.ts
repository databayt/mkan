/**
 * The v2 glass card's stills, made with sharp (tiktok-v2-pure.ts glassGraph lays them on the
 * video): the face (ink tint, a soft sheen, the rim light, the three lines and the code capsule),
 * the rounded mask, the soft shadow, and the two refraction maps. Fonts are the brand kit's Latin
 * face, Geist (SIL OFL 1.1, scripts/crm/assets/fonts) — read from the repo, never the system, so a
 * missing font fails the render instead of silently swapping in another.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';

import { BRAND, CARD, type CardLines, displacementMaps } from './tiktok-v2-pure';

const FONTS = join(__dirname, 'assets', 'fonts');
const SEMI = join(FONTS, 'Geist-SemiBold.ttf');
const MEDIUM = join(FONTS, 'Geist-Medium.ttf');
// libvips' pango finds fonts through fontconfig, which has no config of its own on this Mac
// ("Cannot load default config file") and then falls back to a system face: point it at the
// card's own folder before the first text is drawn (fontconfig reads this lazily).
process.env.FONTCONFIG_FILE = join(FONTS, 'fonts.conf');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One line of text as an RGBA still, shrunk until it fits `maxW` (a long place name). */
async function line(text: string, opts: { file: string; face: string; size: number; color: string; alpha?: number; maxW: number }): Promise<{ png: Buffer; w: number; h: number; size: number }> {
  if (!existsSync(opts.file)) throw new Error(`card font missing: ${opts.file}`);
  for (let size = opts.size; ; size -= 2) {
    const alpha = Math.round((opts.alpha ?? 1) * 100);
    const png = await sharp({
      text: {
        text: `<span foreground="${opts.color}" fgalpha="${alpha}%">${esc(text)}</span>`,
        font: `${opts.face} ${size}`,
        fontfile: opts.file,
        rgba: true,
        dpi: 72,
      },
    })
      .png()
      .toBuffer();
    const m = await sharp(png).metadata();
    if ((m.width ?? 0) <= opts.maxW || size <= 20) return { png, w: m.width ?? 0, h: m.height ?? 0, size };
  }
}

/** A still's soft drop shadow, for legibility over a busy picture. */
async function softShadow(png: Buffer, w: number, h: number, blur = 5, opacity = 0.45): Promise<Buffer> {
  const pad = blur * 3;
  const alphaOnly = await sharp(png).ensureAlpha().extractChannel(3).toBuffer();
  const black = await sharp({ create: { width: w, height: h, channels: 3, background: '#000000' } })
    .joinChannel(alphaOnly)
    .png()
    .toBuffer();
  return sharp({ create: { width: w + 2 * pad, height: h + 2 * pad, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: black, left: pad, top: pad }])
    .blur(blur)
    .linear([1, 1, 1, opacity], [0, 0, 0, 0])
    .png()
    .toBuffer();
}

export interface CardStills {
  face: string;
  mask: string;
  shadow: string;
  shadowPad: number;
  dx: string;
  dy: string;
}

/** Writes the card's stills into `dir` for these lines and this tint; returns their paths. */
export async function cardStills(dir: string, lines: CardLines, tint: number, card: typeof CARD = CARD): Promise<CardStills> {
  const { w, h, r } = card;
  const padX = 44;

  // The glass's own face: ink tint, a sheen from the top-left, a rim light brighter on top.
  const glass = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.62"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.30"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="0.38" stop-color="#ffffff" stop-opacity="0.03"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="${BRAND.ink}" fill-opacity="${tint}"/>
  <rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="url(#sheen)"/>
  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${r - 1}" fill="none" stroke="url(#rim)" stroke-width="2"/>
</svg>`);

  const maxW = w - 2 * padX;
  const price = await line(lines.price, { file: SEMI, face: 'Geist SemiBold', size: 68, color: BRAND.canvas, maxW });
  const home = await line(lines.home, { file: MEDIUM, face: 'Geist Medium', size: 42, color: BRAND.canvas, alpha: 0.94, maxW });
  // The code sits in a capsule of the brand's accent at the end of the contact line.
  const code = await line(lines.code, { file: SEMI, face: 'Geist SemiBold', size: 32, color: '#ffffff', maxW: 240 });
  const capH = 52;
  const capW = code.w + 36;
  const contact = await line(lines.contact, { file: MEDIUM, face: 'Geist Medium', size: 34, color: BRAND.canvas, alpha: 0.86, maxW: maxW - capW - 14 });
  const capsule = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${capW}" height="${capH}"><rect width="${capW}" height="${capH}" rx="${capH / 2}" fill="${BRAND.accent}"/></svg>`),
  )
    .composite([{ input: code.png, left: Math.round((capW - code.w) / 2), top: Math.round((capH - code.h) / 2) }])
    .png()
    .toBuffer();

  // Rows, top to bottom: price, home, then contact + capsule on one baseline — the free height
  // shared evenly above, between and below, so the card reads as one block whatever the font.
  const rowH = Math.max(capH, contact.h);
  const gap = Math.max(10, Math.round((h - price.h - home.h - rowH) / 4));
  const yPrice = gap;
  const yHome = yPrice + price.h + Math.round(gap * 0.2);
  const yRow = h - gap - rowH;
  const texts: OverlayOptions[] = [];
  for (const [t, x, y] of [
    [price, padX, yPrice],
    [home, padX, yHome],
    [contact, padX, yRow + Math.round((rowH - contact.h) / 2)],
  ] as const) {
    const s = await softShadow(t.png, t.w, t.h);
    texts.push({ input: s, left: x - 15, top: y - 15 + 2 }, { input: t.png, left: x, top: y });
  }
  texts.push({ input: capsule, left: padX + contact.w + 14, top: yRow + Math.round((rowH - capH) / 2) });

  const face = join(dir, 'card-face.png');
  await sharp(glass).composite(texts).png().toFile(face);

  const mask = join(dir, 'card-mask.png');
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#000"/><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`))
    .greyscale()
    .png()
    .toFile(mask);

  const shadowPad = 60;
  const shadow = join(dir, 'card-shadow.png');
  await sharp({ create: { width: w + 2 * shadowPad, height: h + 2 * shadowPad, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      {
        input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#000" fill-opacity="0.34"/></svg>`),
        left: shadowPad,
        top: shadowPad + 12,
      },
    ])
    .blur(22)
    .png()
    .toFile(shadow);

  const maps = displacementMaps(w, h, r);
  const dx = join(dir, 'card-dx.png');
  const dy = join(dir, 'card-dy.png');
  await sharp(Buffer.from(maps.dx), { raw: { width: w, height: h, channels: 1 } }).png().toFile(dx);
  await sharp(Buffer.from(maps.dy), { raw: { width: w, height: h, channels: 1 } }).png().toFile(dy);

  writeFileSync(join(dir, 'card.json'), JSON.stringify({ lines, tint, sizes: { price: price.size, home: home.size, contact: contact.size } }, null, 2));
  return { face, mask, shadow, shadowPad, dx, dy };
}
