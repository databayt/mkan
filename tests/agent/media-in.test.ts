// @vitest-environment node
/** media-in — photos, voice notes, videos and files read as words; the pure half and the flow with fake network. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/whatsapp/evolution", () => ({ mediaBytes: vi.fn(async () => null) }));

const pure = await import("@/components/agent/media-in-pure");
const { understandMedia } = await import("@/components/agent/media-in");

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 1)]);
const OGG = Buffer.alloc(4_000, 2);

const image = (extra: Record<string, unknown> = {}) => ({ key: { id: "m1" }, messageType: "imageMessage", message: { imageMessage: { mimetype: "image/jpeg", caption: "Can i know about this?", ...extra } } });
const voice = (extra: Record<string, unknown> = {}) => ({ key: { id: "m2" }, messageType: "audioMessage", message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true, ...extra } } });
const video = (extra: Record<string, unknown> = {}) => ({ key: { id: "m3" }, messageType: "videoMessage", message: { videoMessage: { mimetype: "video/mp4", jpegThumbnail: JPEG.toString("base64"), fileLength: "2000000", ...extra } } });

const visionJson = JSON.stringify({ what: "tiktok_ad", summary: "Screenshot of a TikTok ad for an apartment.", k_code: "k 6823", tiktok_handle: "mkan.rw", price_rwf: "120k", area: "Kicukiro", bedrooms: 2, furnished: null, phone: "+250 788 123 456", text_lang: "en" });

describe("kinds and payloads", () => {
  it("names the kind of a message", () => {
    expect(pure.mediaKindOf(image())).toBe("image");
    expect(pure.mediaKindOf(voice())).toBe("audio");
    expect(pure.mediaKindOf(video())).toBe("video");
    expect(pure.mediaKindOf({ message: { pttMessage: {} } })).toBe("audio");
    expect(pure.mediaKindOf({ message: { conversation: "hi" } })).toBeNull();
    expect(pure.mediaKindOf({ message: { stickerMessage: {} } })).toBeNull();
  });

  it("reads a Long file length and both thumbnail shapes", () => {
    expect(pure.fileLengthOf(video({ fileLength: { low: 1234, high: 0 } }))).toBe(1234);
    expect(pure.fileLengthOf(video({ fileLength: 55 }))).toBe(55);
    expect(pure.thumbnailOf(video())?.length).toBe(JPEG.length);
    expect(pure.thumbnailOf(video({ jpegThumbnail: Object.fromEntries([...JPEG].map((b, i) => [i, b])) }))?.length).toBe(JPEG.length);
    expect(pure.thumbnailOf(image())).toBeNull();
  });

  it("sniffs an image from its bytes", () => {
    expect(pure.sniffImage(JPEG)).toBe("image/jpeg");
    expect(pure.sniffImage(Buffer.from("89504e470d0a1a0a0000000d", "hex"))).toBe("image/png");
    expect(pure.sniffImage(Buffer.from("not an image at all"))).toBeNull();
  });
});

describe("what the model's JSON is allowed to say", () => {
  it("validates every field", () => {
    const v = pure.parseVision(`Sure!\n${visionJson}`);
    expect(v).toMatchObject({ kCode: "K6823", handle: "@mkan.rw", rent: 120000, area: "Kicukiro", bedrooms: 2, lang: "en" });
    expect(v?.phone).toBe("+250788123456");
  });

  it("drops what it got wrong", () => {
    const v = pure.parseVision(JSON.stringify({ summary: "A house", k_code: "ABC", price_rwf: 5, bedrooms: 99, tiktok_handle: "not a handle!!", text_lang: "de" }));
    expect(v).toMatchObject({ summary: "A house" });
    expect(v?.kCode).toBeUndefined();
    expect(v?.rent).toBeUndefined();
    expect(v?.bedrooms).toBeUndefined();
    expect(v?.handle).toBeUndefined();
    expect(v?.lang).toBeUndefined();
    expect(pure.parseVision("no json here")).toBeNull();
  });

  it("reads rents the way Kigali writes them", () => {
    expect(pure.normalizeRent("120k")).toBe(120000);
    expect(pure.normalizeRent("RWF 150,000")).toBe(150000);
    expect(pure.normalizeRent(300)).toBe(300000);
    expect(pure.normalizeRent("1.5M")).toBe(1500000);
    expect(pure.normalizeRent("abc")).toBeNull();
    expect(pure.normalizeKCode("k-6823")).toBe("K6823");
    expect(pure.normalizeKCode("K12")).toBeNull();
  });

  it("describes a screenshot without its phone number", () => {
    const t = pure.describeVision(pure.parseVision(visionJson)!, "Can i know about this?");
    expect(t).toContain("K6823");
    expect(t).toContain("120k a month");
    expect(t).toContain('caption: "Can i know about this?"');
    expect(t).not.toMatch(/788|250/);
  });
});

describe("Whisper's reply", () => {
  it("drops silence and phantom phrases, keeps speech", () => {
    expect(pure.usableTranscript({ text: "Thank you.", duration: 1.2, segments: [{ no_speech_prob: 0.2 }] })).toBeNull();
    expect(pure.usableTranscript({ text: "Mwiriwe", segments: [{ no_speech_prob: 0.9 }] })).toBeNull();
    expect(pure.usableTranscript({ text: "  " })).toBeNull();
    expect(pure.usableTranscript({ text: "Mwiriwe, ndashaka inzu i Remera", duration: 6, segments: [{ no_speech_prob: 0.05 }] })).toBe("Mwiriwe, ndashaka inzu i Remera");
  });

  it("hints only languages Whisper has, and reads Kinyarwanda from the words or the chat", () => {
    expect(pure.whisperLanguage("fr")).toBe("fr");
    expect(pure.whisperLanguage("rw")).toBeUndefined();
    expect(pure.transcriptLang("Mwiriwe, ndashaka inzu", "swahili", null)).toBe("rw");
    expect(pure.transcriptLang("kimironko", "shona", "rw")).toBe("rw");
    expect(pure.transcriptLang("kimironko", "english", null)).toBe("en");
  });
});

describe("the user turn's form", () => {
  it("brackets each kind, and says when it could not be read", () => {
    expect(pure.mediaTurnText("image", { kind: "image", text: "TikTok ad, K6823" })).toBe("[photo: TikTok ad, K6823]");
    expect(pure.mediaTurnText("audio", { kind: "audio", text: "x", transcript: 'Ndashaka "inzu"', lang: "rw" })).toBe("[voice note, rw, rough machine transcript, may be wrong: \"Ndashaka 'inzu'\"]");
    expect(pure.mediaTurnText("audio", null)).toBe("[voice note: could not be read]");
    expect(pure.mergeVideo("an ad", "hello there", "look")).toBe('an ad; says: "hello there"; caption: "look"');
  });
});

describe("understandMedia (fake network)", () => {
  const bytes = vi.fn(async () => ({ bytes: JPEG, mimetype: "image/jpeg" }));

  it("reads a screenshot with one vision call", async () => {
    const vision = vi.fn(async () => visionJson);
    const r = await understandMedia(image(), { deps: { bytes, vision } });
    expect(vision).toHaveBeenCalledTimes(1);
    expect(vision.mock.calls[0]![0]).toMatchObject({ mediaType: "image/jpeg", caption: "Can i know about this?" });
    expect(r).toMatchObject({ kind: "image", kCode: "K6823", listingHints: { rent: 120000, area: "Kicukiro", bedrooms: 2, brokerHandle: "@mkan.rw" }, lang: "en" });
    expect(r?.text).toContain("K6823");
  });

  it("falls back to the poster frame when the bytes are gone, and to null when nothing reads", async () => {
    const vision = vi.fn(async () => visionJson);
    expect(await understandMedia(image({ jpegThumbnail: JPEG.toString("base64") }), { deps: { bytes: async () => null, vision } })).not.toBeNull();
    expect(await understandMedia(image(), { deps: { bytes: async () => null, vision } })).toBeNull();
    expect(await understandMedia(image(), { deps: { bytes, vision: async () => null } })).toBeNull();
    expect(await understandMedia(image(), { deps: { bytes, vision: async () => "garbage" } })).toBeNull();
  });

  it("never throws", async () => {
    const boom = async () => {
      throw new Error("down");
    };
    expect(await understandMedia(image(), { deps: { bytes: boom as never, vision: boom as never } })).toBeNull();
    expect(await understandMedia({ message: { conversation: "hi" } })).toBeNull();
  });

  it("transcribes a voice note; no language hint for Kinyarwanda, one for French", async () => {
    const whisper = vi.fn(async () => ({ text: "Mwiriwe, ndashaka inzu i Kicukiro itarengeje ibihumbi 150", language: "swahili", duration: 8, segments: [{ no_speech_prob: 0.02 }] }));
    const deps = { bytes: async () => ({ bytes: OGG, mimetype: "audio/ogg; codecs=opus" }), whisper };
    const r = await understandMedia(voice(), { lang: "rw", deps });
    expect(r).toMatchObject({ kind: "audio", lang: "rw" });
    expect(r?.transcript).toContain("ndashaka inzu");
    expect(whisper.mock.calls[0]![0]).toMatchObject({ fileName: "voice.ogg", language: undefined });
    await understandMedia(voice(), { lang: "fr", deps });
    expect(whisper.mock.calls[1]![0].language).toBe("fr");
  });

  it("answers null for a silent clip", async () => {
    const whisper = async () => ({ text: "Thank you.", duration: 1, segments: [{ no_speech_prob: 0.1 }] });
    expect(await understandMedia(voice(), { deps: { bytes: async () => ({ bytes: OGG, mimetype: "audio/ogg" }), whisper } })).toBeNull();
  });

  it("merges a video's poster frame and its sound; skips Whisper above 25 MB", async () => {
    const vision = vi.fn(async () => visionJson);
    const whisper = vi.fn(async () => ({ text: "This apartment is available in Kicukiro", language: "english", duration: 12, segments: [{ no_speech_prob: 0.01 }] }));
    const deps = { bytes: async () => ({ bytes: OGG, mimetype: "video/mp4" }), vision, whisper };
    const r = await understandMedia(video(), { deps });
    expect(r?.kind).toBe("video");
    expect(r?.text).toContain("TikTok ad");
    expect(r?.text).toContain('says: "This apartment is available in Kicukiro"');
    expect(r?.kCode).toBe("K6823");
    expect(whisper.mock.calls[0]![0].fileName).toBe("clip.mp4");
    whisper.mockClear();
    const big = await understandMedia(video({ fileLength: String(40 * 1024 * 1024) }), { deps });
    expect(whisper).not.toHaveBeenCalled();
    expect(big?.transcript).toBeUndefined();
    expect(big?.text).toContain("TikTok ad");
  });

  it("gives a file its name when no model reads it", async () => {
    const r = await understandMedia({ key: { id: "m4" }, message: { documentMessage: { mimetype: "application/zip", fileName: "lease.zip" } } }, { deps: {} });
    expect(r).toMatchObject({ kind: "document", text: 'file named "lease.zip"' });
  });
});
