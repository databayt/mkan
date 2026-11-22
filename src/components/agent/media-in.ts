import "server-only";

/**
 * Understanding what a person SENDS on WhatsApp — a photo, a voice note, a video, a file — as words the
 * conversational driver can answer (2026-11-22). Tenants forward TikTok ads, screenshot them, send house photos
 * and voice notes in Kinyarwanda; "I can only read typed messages" lost every one of them.
 *
 *   understandMedia(message, { lang })  →  { kind, text, transcript?, kCode?, listingHints?, lang? } | null
 *
 * A library the WhatsApp turn calls: it never throws and returns null when it cannot read the thing (no key, the
 * spend cap, a timeout, a file too large, a silent clip), so the caller falls back to its own line.
 *
 *   image    bytes via Evolution (mediaBytes) → Claude Haiku vision, one call, spend lane `agent-media` under the
 *            same monthly cap as the rest of the agent (claude.ts canSpend / recordSpend).
 *   audio    Groq Whisper (whisper-large-v3) → transcript + language. Whisper has no Kinyarwanda: no language hint
 *            for it, the words are read by the driver's model as heard.
 *   video    no ffmpeg on a Worker: the poster frame (videoMessage.jpegThumbnail) → vision, and the audio track →
 *            Whisper (it takes mp4; skipped above 25 MB), in parallel, merged into one line.
 *   document an image file → vision; a small PDF → Claude's document block; anything else → its file name.
 *
 * Env: AGENT_ANTHROPIC_API_KEY (vision, through claude.ts), GROQ_API_KEY (Whisper), GROQ_WHISPER_MODEL,
 * AGENT_MEDIA_MODEL (default claude-haiku-5-5). Never logged: phone numbers, bytes, transcripts.
 */
import { mediaBytes } from "@/lib/whatsapp/evolution";
import { canSpend, claudeClient, noteFailure, recordSpend } from "./claude";
import { detectLang, type Lang } from "./language";
import {
  audioFileName,
  captionOf,
  describeVision,
  fileLengthOf,
  GROQ_MAX_BYTES,
  hintsOf,
  mediaKindOf,
  mediaTurnText,
  mergeVideo,
  normalizeKCode,
  parseVision,
  payloadOf,
  PDF_MAX_BYTES,
  sniffImage,
  thumbnailOf,
  transcriptLang,
  usableTranscript,
  VISION_MAX_BYTES,
  VISION_SYSTEM,
  whisperLanguage,
  WHISPER_PROMPT,
  type MediaKind,
  type MediaMessage,
  type MediaUnderstanding,
  type VisionRead,
  type WhisperReply,
} from "./media-in-pure";

export type { MediaKind, MediaMessage, MediaUnderstanding } from "./media-in-pure";

const MEDIA_MODEL = process.env.AGENT_MEDIA_MODEL?.trim() || "claude-haiku-5-5";
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const WHISPER_MODEL = () => process.env.GROQ_WHISPER_MODEL?.trim() || "whisper-large-v3";
/** Hard ceilings per step; the turn's own deadline is larger than the longest of these. */
export const MEDIA_TIMEOUTS = { bytes: 6_000, vision: 7_000, audio: 12_000 };
const PAUSE_AFTER_429_MS = 60_000;
let groqPausedUntil = 0;

export interface VisionInput {
  data: Buffer;
  /** image/jpeg | image/png | image/webp | image/gif | application/pdf */
  mediaType: string;
  caption: string;
}
export interface WhisperInput {
  bytes: Buffer;
  fileName: string;
  mimetype: string;
  language?: string;
}
export interface MediaDeps {
  bytes: (messageId: string) => Promise<{ bytes: Buffer; mimetype: string } | null>;
  /** The model's raw reply (JSON text), or null. */
  vision: (input: VisionInput, timeoutMs: number) => Promise<string | null>;
  whisper: (input: WhisperInput, timeoutMs: number) => Promise<WhisperReply | null>;
}

export interface UnderstandOptions {
  /** The chat's language so far (en/rw/fr/ar/sw): a Whisper hint when it has the language, and the tie-breaker for a transcript. */
  lang?: string | null;
  deps?: Partial<MediaDeps>;
  timeouts?: Partial<typeof MEDIA_TIMEOUTS>;
}

// ── the two network calls ────────────────────────────────────────────────────

async function visionCall({ data, mediaType, caption }: VisionInput, timeoutMs: number): Promise<string | null> {
  const client = claudeClient();
  if (!client || !(await canSpend())) {
    console.log("[media] vision skipped (no client or spend gate)");
    return null;
  }
  const block =
    mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: data.toString("base64") } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mediaType, data: data.toString("base64") } } as const);
  try {
    const res = await client.messages.create(
      {
        model: MEDIA_MODEL,
        max_tokens: 400,
        system: VISION_SYSTEM,
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: [block as never, { type: "text", text: caption ? `Caption the person wrote: "${caption}"` : "No caption." }] }],
      },
      { timeout: timeoutMs },
    );
    void recordSpend("agent-media", res.usage, MEDIA_MODEL);
    if (res.stop_reason === "refusal") return null;
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  } catch (err) {
    await noteFailure(err);
    console.warn(`[media] vision failed: ${(err as Error).message.slice(0, 120)}`);
    return null;
  }
}

async function whisperCall({ bytes, fileName, mimetype, language }: WhisperInput, timeoutMs: number): Promise<WhisperReply | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey || Date.now() < groqPausedUntil) return null;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimetype || "audio/ogg" }), fileName);
  form.append("model", WHISPER_MODEL());
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  form.append("prompt", WHISPER_PROMPT);
  if (language) form.append("language", language);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(GROQ_URL, { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${apiKey}` }, body: form });
    if (!res.ok) {
      if (res.status === 429) groqPausedUntil = Date.now() + PAUSE_AFTER_429_MS;
      console.warn(`[media] whisper ${res.status}`);
      return null;
    }
    return (await res.json()) as WhisperReply;
  } catch (err) {
    console.warn(`[media] whisper failed: ${(err as Error).message.slice(0, 120)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const DEFAULT_DEPS: MediaDeps = { bytes: (id) => mediaBytes(id), vision: visionCall, whisper: whisperCall };

/** A promise that gives up: null after `ms`, never a throw. */
async function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── per kind ─────────────────────────────────────────────────────────────────

interface Ctx {
  msg: MediaMessage;
  caption: string;
  lang: string | null;
  deps: MediaDeps;
  t: typeof MEDIA_TIMEOUTS;
}

/** Vision over a picture (bytes, or the poster frame when the bytes are out of reach). */
async function readPicture(c: Ctx, data: Buffer | null, mediaType: string | null): Promise<VisionRead | null> {
  if (!data || !mediaType) return null;
  const raw = await within(c.deps.vision({ data, mediaType, caption: c.caption }, c.t.vision), c.t.vision + 1_000);
  return raw ? parseVision(raw) : null;
}

async function understandImage(c: Ctx, mimetype?: string): Promise<MediaUnderstanding | null> {
  const id = c.msg.key?.id;
  const got = id ? await within(c.deps.bytes(id), c.t.bytes) : null;
  let data: Buffer | null = got?.bytes ?? null;
  if (data && data.length > VISION_MAX_BYTES) data = null;
  let type = data ? (sniffImage(data) ?? (mimetype?.startsWith("image/") ? mimetype : null)) : null;
  if (!data || !type) {
    // The poster frame is small and blurry, but a TikTok watermark and a price are often still legible.
    data = thumbnailOf(c.msg);
    type = data ? sniffImage(data) : null;
  }
  const v = await readPicture(c, data, type);
  return v ? fromVision("image", v, c.caption) : null;
}

function fromVision(kind: MediaKind, v: VisionRead, caption: string): MediaUnderstanding {
  const lang = v.lang ?? (caption ? (detectLang(caption).neutral ? undefined : detectLang(caption).lang) : undefined);
  return {
    kind,
    text: describeVision(v, caption),
    ...(v.kCode ? { kCode: v.kCode } : {}),
    ...(hintsOf(v) ? { listingHints: hintsOf(v)! } : {}),
    ...(lang ? { lang } : {}),
  };
}

/** Whisper over a voice note or a video's sound. */
async function transcribe(c: Ctx, kind: "audio" | "video", cachedBytes?: { bytes: Buffer; mimetype: string } | null): Promise<{ transcript: string; lang?: Lang } | null> {
  const size = fileLengthOf(c.msg);
  if (size != null && size > GROQ_MAX_BYTES) {
    console.log(`[media] ${kind} too large for whisper`);
    return null;
  }
  if (c.deps.whisper === whisperCall && !process.env.GROQ_API_KEY?.trim()) return null; // no key: do not fetch the bytes either
  const id = c.msg.key?.id;
  const got = cachedBytes ?? (id ? await within(c.deps.bytes(id), c.t.bytes + 4_000) : null);
  if (!got || got.bytes.length > GROQ_MAX_BYTES || got.bytes.length < 200) return null;
  const mimetype = got.mimetype || payloadOf(c.msg).mimetype || "";
  const reply = await within(
    c.deps.whisper({ bytes: got.bytes, fileName: audioFileName(mimetype, kind), mimetype, language: whisperLanguage(c.lang) }, c.t.audio),
    c.t.audio + 1_000,
  );
  const transcript = usableTranscript(reply);
  return transcript ? { transcript, lang: transcriptLang(transcript, reply?.language, c.lang) } : null;
}

async function understandAudio(c: Ctx): Promise<MediaUnderstanding | null> {
  const heard = await transcribe(c, "audio");
  if (!heard) return null;
  const kCode = normalizeKCode(/\bK\s?-?\d{3,6}\b/i.exec(heard.transcript)?.[0]);
  return {
    kind: "audio",
    text: `voice note${heard.lang ? ` (${heard.lang})` : ""}: "${heard.transcript.slice(0, 300)}"`,
    transcript: heard.transcript,
    ...(kCode ? { kCode } : {}),
    ...(heard.lang ? { lang: heard.lang } : {}),
  };
}

async function understandVideo(c: Ctx): Promise<MediaUnderstanding | null> {
  const thumb = thumbnailOf(c.msg);
  const [seen, heard] = await Promise.all([
    thumb ? readPicture(c, thumb, sniffImage(thumb) ?? "image/jpeg") : Promise.resolve(null),
    transcribe(c, "video"),
  ]);
  if (!seen && !heard) return null;
  const picture = seen ? describeVision(seen, "") : null;
  const kCode = seen?.kCode ?? normalizeKCode(/\bK\s?-?\d{3,6}\b/i.exec(heard?.transcript ?? c.caption)?.[0]) ?? undefined;
  const hints = seen ? hintsOf(seen) : undefined;
  const lang = heard?.lang ?? seen?.lang;
  return {
    kind: "video",
    text: mergeVideo(picture, heard?.transcript ?? null, c.caption),
    ...(heard ? { transcript: heard.transcript } : {}),
    ...(kCode ? { kCode } : {}),
    ...(hints ? { listingHints: hints } : {}),
    ...(lang ? { lang } : {}),
  };
}

async function understandDocument(c: Ctx): Promise<MediaUnderstanding | null> {
  const p = payloadOf(c.msg);
  const type = (p.mimetype ?? "").toLowerCase();
  const name = (p.fileName ?? "").replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 60);
  if (type.startsWith("image/")) {
    const r = await understandImage(c, type);
    return r ? { ...r, kind: "document" } : null;
  }
  if (type === "application/pdf") {
    const size = fileLengthOf(c.msg);
    const id = c.msg.key?.id;
    const got = id && (size == null || size <= PDF_MAX_BYTES) ? await within(c.deps.bytes(id), c.t.bytes) : null;
    if (got && got.bytes.length <= PDF_MAX_BYTES) {
      const v = await readPicture(c, got.bytes, "application/pdf");
      if (v) return fromVision("document", v, c.caption);
    }
  }
  // Anything else: a person sees a file, and its name.
  return { kind: "document", text: `file${name ? ` named "${name}"` : ""}${c.caption ? `, caption: "${c.caption}"` : ""}` };
}

// ── entry ────────────────────────────────────────────────────────────────────

/**
 * What a message's media says, or null. `msg` is the Evolution message (webhook or findMessages): `key.id`,
 * `messageType`, `message`. Never throws; logs one `[media]` line with the kind, the outcome and the time.
 */
export async function understandMedia(msg: MediaMessage, opts: UnderstandOptions = {}): Promise<MediaUnderstanding | null> {
  const started = Date.now();
  const kind = mediaKindOf(msg);
  if (!kind) return null;
  const c: Ctx = {
    msg,
    caption: captionOf(msg),
    lang: opts.lang ?? null,
    deps: { ...DEFAULT_DEPS, ...opts.deps },
    t: { ...MEDIA_TIMEOUTS, ...opts.timeouts },
  };
  let out: MediaUnderstanding | null = null;
  try {
    out = await (kind === "image" ? understandImage(c, payloadOf(msg).mimetype) : kind === "audio" ? understandAudio(c) : kind === "video" ? understandVideo(c) : understandDocument(c));
  } catch (err) {
    console.warn(`[media] ${kind} threw: ${(err as Error).message.slice(0, 120)}`);
    out = null;
  }
  console.log(`[media] ${kind} ${out ? "ok" : "none"} ${Date.now() - started}ms`);
  return out;
}

/**
 * A media message as the words a person would take from it, for the chat turn: "[photo: screenshot of a TikTok
 * ad, K6823, 120k, Kicukiro]", "[voice note, rw: "…"]". The K-code is appended when the model read one, so the
 * turn pins that home. Null for a message with no media. An unreadable one still returns a line ("could not be
 * read") so the turn asks for it warmly instead of the old "I can only read typed messages". Never throws.
 */
export async function mediaAsText(msg: MediaMessage, opts: UnderstandOptions = {}): Promise<string | null> {
  const kind = mediaKindOf(msg);
  if (!kind) return null;
  const r = await understandMedia(msg, opts).catch(() => null);
  let line = mediaTurnText(kind, r, captionOf(msg));
  if (r?.kCode && !line.includes(r.kCode)) line += ` ${r.kCode}`;
  return line;
}
