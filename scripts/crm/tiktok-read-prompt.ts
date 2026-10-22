/**
 * The TikTok reader's prompt — frozen and versioned like the Slack intake's.
 * Every CRM home keeps the version that read it (`notesEn`), so a change here
 * bumps TIKTOK_PROMPT_VERSION and older reads stay explainable.
 */
// v2 (2026-10-18): frames can arrive attached (the Groq reader) instead of as
// files to open; the USD rate is passed in; multi-unit posts list their units.
// v3 (2026-10-20): the TikTok post record keeps the ad itself — the reader
// now copies the on-screen text and names the broker/agency the ad shows.
// v4 (2026-10-22): the renting terms the ad states — deposit, commission,
// visit fee, water, electricity — and Kigali's words for the home type
// (self compound, self-contained, studio). The /find card shows them as
// "from the ad"; a term the ad leaves out stays null and reads as "typical".
export const TIKTOK_PROMPT_VERSION = 'tiktok-v4';

/** RWF per USD for posts priced in dollars. Override with TIKTOK_USD_RWF. */
export const USD_RWF = Number(process.env.TIKTOK_USD_RWF) || 1450;

export interface TikTokPromptInput {
  handle: string;
  channel: string | null;
  caption: string;
  transcript: string;
  uploadedAt: string | null;
  /** Frame labels in video order — file names, or "frame N" when attached. */
  frames: string[];
  /** `attached`: the images follow the prompt; `files`: open them with Read. */
  framesMode?: 'files' | 'attached';
  usdRate?: number;
}

function frameLine(v: TikTokPromptInput): string {
  if (!v.frames.length) return 'no frames from the video.';
  return v.framesMode === 'attached'
    ? `still frames from the video, attached after this text in order: ${v.frames.join('; ')}. Look at EVERY frame. Refer to frames by their frame number.`
    : `${v.frames.length} still frames from the video, in order, in the current directory: ${v.frames.join(', ')}. Open EVERY frame with the Read tool.`;
}

/**
 * The same reader for a Facebook group post or Marketplace listing: the facts,
 * rules and JSON are identical, only the medium changes (photos, no speech).
 * The TikTok text stays byte-for-byte what the TikTok reader reads with.
 * v2 (2026-10-22): the renting terms, with tiktok-v4.
 */
export const FACEBOOK_PROMPT_VERSION = 'facebook-v2';
export function buildFacebookPrompt(v: Omit<TikTokPromptInput, 'transcript'>): string {
  return buildTikTokPrompt({ ...v, transcript: '', framesMode: 'attached' })
    .replace('one TikTok video posted in Rwanda', 'one Facebook post (a group post or a Marketplace listing) in Rwanda')
    .replace(/- an automatic speech transcript[^\n]*\n/, '')
    .replace('still frames from the video, attached', 'photos from the post, attached')
    .replace('Frames often carry on-screen text', 'Photos often carry text')
    .replace('Poster: @', 'Poster: ')
    .replace('CAPTION:', 'POST TEXT:')
    .replace(/\nTRANSCRIPT:\n\(none\)\n/, '\n');
}

export function buildTikTokPrompt(v: TikTokPromptInput): string {
  return `You read one TikTok video posted in Rwanda and decide whether it advertises a home for rent in Kigali, and if so extract its facts for a rental CRM.

You have:
- the caption (most reliable — brokers write price, rooms, place and phone here),
- an automatic speech transcript (Whisper; Kinyarwanda comes out garbled — use it only for place names, numbers and prices you can recognise),
- ${frameLine(v)} Frames often carry on-screen text (price, rooms, location, phone) — read it; when the caption is empty the frames carry everything.

Poster: @${v.handle}${v.channel ? ` (${v.channel})` : ''}${v.uploadedAt ? ` · posted ${v.uploadedAt}` : ''}

CAPTION:
${v.caption || '(empty)'}

TRANSCRIPT:
${v.transcript || '(none)'}

Rules:
- isRental = true only for a home offered FOR RENT (house, apartment, studio, room, annex). Sale, land, plots, hotels, furniture, comedy, ads for services → false with a short rejectReason.
- inKigali = true if the place is in Kigali city (Gasabo, Kicukiro, Nyarugenge or any of their sectors/neighbourhoods: Kimironko, Kibagabaga, Remera, Kacyiru, Nyamirambo, Gisozi, Kicukiro, Kanombe, Rebero, Nyarutarama, Gacuriro, Kagarama, Gikondo …). If no place is named but the post clearly targets Kigali, true. Other towns (Musanze, Rubavu, Huye …) → false.
- Prices in Kigali are usually monthly RWF. "250k" = 250000. "1.2M" = 1200000. If written in USD, convert at 1 USD = ${v.usdRate ?? USD_RWF} RWF and keep the original ("$350") in priceAsWritten. period: MONTH unless it says per night/day (NIGHT); UNKNOWN if no price.
- propertyType one of: Apartment, Villa, Townhouse, Cottage, Tinyhouse, Rooms. Kigali words: apartment / appartment / appartement / flat = Apartment; studio = Apartment with bedrooms 0; "self compound", "inzu yigenga", "standalone house", a house with its own gate = Villa; "self-contained", annex, single room, "icyumba" = Rooms. A plain "house" / "inzu" = Villa.
- roomType: ENTIRE_HOME, PRIVATE_ROOM or SHARED_ROOM.
- district: GASABO, KICUKIRO or NYARUGENGE if you know which holds the neighbourhood; else null. neighbourhood: the most specific place named (sector or area), as written.
- phones: every phone number you can see or read, exactly as written (caption, on-screen text, transcript digits).
- posterKind: BROKER if the account posts many different houses or says "commission"/"broker"/"real estate"; OWNER if the owner speaks for one home; else UNKNOWN.
- features: short English phrases (e.g. "parking", "fenced compound", "water tank", "furnished", "near main road"). Keep "water tank" here even when water is also stated below.
- furnished: true for "furnished"/"fully furnished"/"meublé"/"ifite ibikoresho", false for "unfurnished"/"empty"/"non meublé"/"nta bikoresho", null when not said.
- The renting terms — only what the post states, never Kigali's usual terms; each null when unstated:
  - depositMonths: months of rent held as deposit ("2 months deposit", "caution 1 mois", "ingwate y'amezi 2" → 2). "No deposit" → 0. Rent paid in advance ("3 months advance") is NOT a deposit.
  - commission: {"pct":number|null,"none":bool}. "commission 25%" → {"pct":25,"none":false}; "1 month commission" → {"pct":100,"none":false}; "+ commission" with no size → {"pct":null,"none":false}; "no commission", "direct from owner", "nta komisiyo", "sans commission" → {"pct":null,"none":true}. null when commission is not mentioned.
  - viewingFee: RWF to visit the home ("visit 10k", "visiting fee 10,000", "frais de visite 5000", "gusura 5000" → the number). "Free visit" → 0.
  - water: "INCLUDED" ("water included", "amazi arimo", "eau comprise", "bills included") or "SEPARATE" ("water not included", "+ water", own water meter); null if not said. A water TANK says nothing about the bill.
  - electricity: "INCLUDED" or "SEPARATE" the same way; "cash power" / a prepaid meter = SEPARATE.
- units: when one post offers SEVERAL units at different prices (e.g. "1bd 600k / 2bd 700k"), list each as {"bedrooms":n|null,"priceRwf":n|null,"propertyType":string|null}; the top-level fields then describe the first unit. A single home → [].
- propertyFrames: the frame numbers (as labelled above) of the frames that show the PROPERTY itself (rooms, exterior, kitchen, bathroom, view). Exclude frames that are mostly a person's face, text cards, logos or blurred transitions. Best frame first.
- titleEn: one short guest-facing line, e.g. "2-bedroom apartment in Nyamirambo". titleRw: the same in Kinyarwanda. descriptionEn: 2–4 plain sentences of facts only — never invent amenities.
- onScreenText: every piece of text shown ON SCREEN in the frames (price cards, room counts, place names, phone numbers, agency names, slogans), copied exactly as written, in frame order, pieces separated by " | ". Do not translate or correct. Skip TikTok's own interface text. Max ~600 characters. null if the frames show no text.
- brokerName: the broker's or real-estate agency's name as the ad presents it (a logo, a "… Real Estate" card, a signature in the caption), e.g. "Ibra Real Estate". null if the ad names none — do not just repeat the handle.
- confidence 0–1: how sure you are of the extracted facts overall.
- Never invent a fact. Unknown → null.

Return ONLY this JSON object, no prose:
{"isRental":bool,"rejectReason":string|null,"inKigali":bool,"period":"MONTH"|"NIGHT"|"UNKNOWN","priceRwf":number|null,"priceAsWritten":string|null,"propertyType":string|null,"roomType":string|null,"bedrooms":number|null,"bathrooms":number|null,"furnished":bool|null,"depositMonths":number|null,"commission":{"pct":number|null,"none":bool}|null,"viewingFee":number|null,"water":"INCLUDED"|"SEPARATE"|null,"electricity":"INCLUDED"|"SEPARATE"|null,"district":string|null,"neighbourhood":string|null,"phones":[string],"posterKind":"BROKER"|"OWNER"|"UNKNOWN","features":[string],"units":[{"bedrooms":number|null,"priceRwf":number|null,"propertyType":string|null}],"propertyFrames":[number],"titleEn":string|null,"titleRw":string|null,"descriptionEn":string|null,"onScreenText":string|null,"brokerName":string|null,"confidence":number}`;
}
