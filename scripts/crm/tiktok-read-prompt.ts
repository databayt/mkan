/**
 * The TikTok reader's prompt — frozen and versioned like the Slack intake's.
 * Every CRM home keeps the version that read it (`notesEn`), so a change here
 * bumps TIKTOK_PROMPT_VERSION and older reads stay explainable.
 */
// v2 (2026-10-18): frames can arrive attached (the Groq reader) instead of as
// files to open; the USD rate is passed in; multi-unit posts list their units.
export const TIKTOK_PROMPT_VERSION = 'tiktok-v2';

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
- propertyType one of: Apartment, Villa, Townhouse, Cottage, Tinyhouse, Rooms (a single room/annex/"self-contained" room = Rooms; a standalone house = Villa; "self compound" house = Villa).
- roomType: ENTIRE_HOME, PRIVATE_ROOM or SHARED_ROOM.
- district: GASABO, KICUKIRO or NYARUGENGE if you know which holds the neighbourhood; else null. neighbourhood: the most specific place named (sector or area), as written.
- phones: every phone number you can see or read, exactly as written (caption, on-screen text, transcript digits).
- posterKind: BROKER if the account posts many different houses or says "commission"/"broker"/"real estate"; OWNER if the owner speaks for one home; else UNKNOWN.
- features: short English phrases (e.g. "parking", "fenced compound", "water tank", "furnished", "near main road").
- units: when one post offers SEVERAL units at different prices (e.g. "1bd 600k / 2bd 700k"), list each as {"bedrooms":n|null,"priceRwf":n|null,"propertyType":string|null}; the top-level fields then describe the first unit. A single home → [].
- propertyFrames: the frame numbers (as labelled above) of the frames that show the PROPERTY itself (rooms, exterior, kitchen, bathroom, view). Exclude frames that are mostly a person's face, text cards, logos or blurred transitions. Best frame first.
- titleEn: one short guest-facing line, e.g. "2-bedroom apartment in Nyamirambo". titleRw: the same in Kinyarwanda. descriptionEn: 2–4 plain sentences of facts only — never invent amenities.
- confidence 0–1: how sure you are of the extracted facts overall.
- Never invent a fact. Unknown → null.

Return ONLY this JSON object, no prose:
{"isRental":bool,"rejectReason":string|null,"inKigali":bool,"period":"MONTH"|"NIGHT"|"UNKNOWN","priceRwf":number|null,"priceAsWritten":string|null,"propertyType":string|null,"roomType":string|null,"bedrooms":number|null,"bathrooms":number|null,"furnished":bool|null,"district":string|null,"neighbourhood":string|null,"phones":[string],"posterKind":"BROKER"|"OWNER"|"UNKNOWN","features":[string],"units":[{"bedrooms":number|null,"priceRwf":number|null,"propertyType":string|null}],"propertyFrames":[number],"titleEn":string|null,"titleRw":string|null,"descriptionEn":string|null,"confidence":number}`;
}
