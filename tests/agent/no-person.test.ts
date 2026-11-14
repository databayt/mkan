/**
 * The chat never ends on a person (2026-11-14). Real chats, 11-05..11-13: sixteen messages were handed to
 * "a person" — "Okay, I've asked Osman to reply to you here", "A person from Mkan will check … and reply
 * to you here", or silence and a #mkan card — and none was answered. These are those messages, and what
 * the line may and may not say back.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isTikTokHost, tiktokLink, videoIdOf, withoutTikTokLink } from "@/components/agent/tiktok-link-pure";
import { botText, checkText, helloText, personText, refSourceOf, unsureText, videoNotFoundText } from "@/components/agent/whatsapp-format";
import { saidJustNow, REPEAT_WINDOW_MS, type Sent } from "../../scripts/wa/tenant-pure";

vi.mock("@/lib/db", () => ({ db: {} }));
const { guardHomeAnswer, PERSON_PROMISE_RE } = await import("@/components/agent/writer");
type WriterHome = import("@/components/agent/writer").WriterHome;

/** What only a person could deliver: the old lines, in the three languages. */
const PROMISES_A_PERSON = /person from Mkan will|someone from Mkan will|asked \w+ to reply|will reply to you here|Type "person"|write "person"|يرد عليك أحد|طلبت من .{1,20} أن يرد|سيتحقق أحد|azagusubiza|kugusubiza hano|akugarukire|Andika "umuntu"/i;

describe("the line's own words", () => {
  it("never promise a person, in any language", () => {
    for (const lang of ["en", "ar", "rw"] as const) {
      const lines = [
        botText(lang, "Osman"),
        personText(lang, "Osman"),
        unsureText(lang),
        helloText(lang),
        videoNotFoundText(lang),
        ...(["asked", "slow", "already", "taken", "unreachable", "none", "host", "retry", "confirmed"] as const).map((o) => checkText(lang, o, "Flat", "https://www.mkan.sd/en/listings/7")),
      ];
      for (const t of lines) expect(t, t).not.toMatch(PROMISES_A_PERSON);
    }
  });

  it("say what the assistant is, and that a person comes to the viewing", () => {
    expect(botText("en", "Osman")).toMatch(/Mkan's assistant/);
    expect(botText("en", "Osman")).toMatch(/Osman from our team comes to the viewing/);
    expect(personText("en", "Osman")).toMatch(/I'm Mkan's assistant, and I can do all of it here/);
    expect(personText("ar", "عثمان")).toContain("مساعد مكان");
  });

  it("only 'handed' (broker sends paused, a team number) still says a check is in a person's hands", () => {
    expect(checkText("en", "handed", "Flat")).toMatch(/checking "Flat" with the broker now/);
  });
});

describe("a TikTok link names a home", () => {
  // 11-07: "Hello", this link, "You posted this on ur TikTok" — and a generic search came back.
  const share = "https://vt.tiktok.com/ZSpkS5f6G/";
  const full = "https://www.tiktok.com/@mkan.rw/video/7699123631762328884?_r=1&_t=abc";

  it("finds the link in a message, and what was said beside it", () => {
    expect(tiktokLink(share)).toBe(share);
    expect(tiktokLink(`You posted this ${share} on ur TikTok`)).toBe(share);
    expect(tiktokLink(full)).toContain("/video/7699123631762328884");
    expect(tiktokLink("https://www.tiktok.com/t/ZTabc123/")).toContain("/t/ZTabc123");
    expect(tiktokLink("3 bedroom 400k")).toBeNull();
    expect(tiktokLink("https://tiktok.com.evil.example/@x/video/1234567890")).toBeNull();
    expect(withoutTikTokLink(`3 bedroom ${share} 400k`)).toBe("3 bedroom 400k");
    expect(withoutTikTokLink(share)).toBe("");
  });

  it("reads the post's id from a full link only", () => {
    expect(videoIdOf(full)).toBe("7699123631762328884");
    expect(videoIdOf("https://www.tiktok.com/@kigali.homes/photo/7693392839253806344")).toBe("7693392839253806344");
    expect(videoIdOf(share)).toBeNull();
  });

  it("follows TikTok's own https hosts and nothing else", () => {
    expect(isTikTokHost("https://vt.tiktok.com/ZSpkS5f6G/")).toBe(true);
    expect(isTikTokHost("https://www.tiktok.com/@a/video/1")).toBe(true);
    expect(isTikTokHost("http://vt.tiktok.com/x")).toBe(false);
    expect(isTikTokHost("https://tiktok.com.evil.example/x")).toBe(false);
    expect(isTikTokHost("https://169.254.169.254/latest")).toBe(false);
    expect(isTikTokHost("not a url")).toBe(false);
  });

  it("counts a chat that opens with a link as TikTok's", () => {
    expect(refSourceOf(share, null)).toBe("tiktok");
    expect(refSourceOf("https://www.tiktok.com/@mkan.rw/video/7699123631762328884", null)).toBe("tiktok");
    expect(refSourceOf("2 bedroom in Remera", null)).toBe("organic");
  });
});

describe("an answer under the homes", () => {
  const home = (o: Partial<WriterHome> = {}): WriterHome => ({
    ref: "h1",
    title: "2-bedroom apartment in Gikondo",
    area: "Kicukiro",
    neighbourhood: "Gikondo",
    type: "an apartment",
    furnishing: "furnished",
    terms: ["water included in the rent"],
    bedrooms: 2,
    bathrooms: 1,
    period: "month",
    typicalPrice: false,
    inBudget: true,
    has: [],
    askBroker: [],
    distance: null,
    confirmed: false,
    brokerHome: true,
    ...o,
  });
  const facts = { lang: "en" as const, homes: [home(), home({ ref: "h2", title: "4-bedroom apartment in Gikondo", bedrooms: 4, bathrooms: 3, furnishing: null })] };

  it("passes a plain answer from the homes' facts", () => {
    // 11-08: "Is the first apartment furnished?" and "Does it have water?" were handed to a person.
    const ok = guardHomeAnswer("Yes, the first one is furnished and water is included in the rent. Send 1 and I'll check with its broker that it's still free.", facts, "Is the first apartment furnished?");
    expect(ok).toMatch(/^Yes, the first one is furnished/);
    expect(guardHomeAnswer("Home 2 has 3 bathrooms. The ad doesn't say whether it is furnished; that is confirmed with the broker at the viewing.", facts, "how many bathrooms?")).toBeTruthy();
  });

  it("refuses a person promised, a link, a price, a number that is nowhere in the facts, or 'available' unconfirmed", () => {
    const q = "does it have water?";
    expect(guardHomeAnswer("I'm not sure. Someone from our team will get back to you shortly.", facts, q)).toBeNull();
    expect(guardHomeAnswer("Osman will call you about it.", facts, q)).toBeNull();
    expect(guardHomeAnswer("See it here: https://example.com/x", facts, q)).toBeNull();
    expect(guardHomeAnswer("Message the broker at wa.me/250788000000", facts, q)).toBeNull();
    expect(guardHomeAnswer("It costs RWF 180,000 a month.", facts, q)).toBeNull();
    expect(guardHomeAnswer("It has 7 bathrooms.", facts, q)).toBeNull();
    expect(guardHomeAnswer("Yes, it is available now.", facts, q)).toBeNull();
    expect(guardHomeAnswer("Yes, it is available now.", { ...facts, homes: [home({ confirmed: true })] }, q)).toBeTruthy();
  });

  it("knows a promise of a person when it reads one", () => {
    for (const t of ["A person from Mkan will reply to you here.", "our team will contact you", "someone will call you tomorrow", "a colleague can get back to you", "سيرد عليك أحد من الفريق", "Umuntu wo muri Mkan azagusubiza hano"]) {
      expect(PERSON_PROMISE_RE.test(t), t).toBe(true);
    }
    for (const t of ["Osman from our team comes to the viewing with you.", "I'll check with its broker that it's still free.", "The broker confirms it at the viewing."]) {
      expect(PERSON_PROMISE_RE.test(t), t).toBe(false);
    }
  });
});

describe("the same words twice", () => {
  // 11-12: "The 1 first one" and then "Okay" each got "A person from Mkan will check …", a minute apart.
  const now = Date.parse("2026-11-12T19:44:40Z");
  const sent = (o: Partial<Sent[number]>): Sent => [{ id: "A1", phone: "250720000019", at: new Date(now - 30_000).toISOString(), ...o }];
  const hash = createHash("sha1").update("I've asked the broker.").digest("hex").slice(0, 12);

  it("are not sent again to the same phone within the window", () => {
    expect(saidJustNow(sent({ h: hash }), "250720000019", "I've asked  the broker.", now)).toBe(true);
    expect(saidJustNow(sent({ h: hash }), "250720000019", "Something else.", now)).toBe(false);
    expect(saidJustNow(sent({ h: hash }), "250720000020", "I've asked the broker.", now)).toBe(false);
  });

  it("go out again once the window has passed, and a reply that never got an id does not count", () => {
    expect(saidJustNow(sent({ h: hash, at: new Date(now - REPEAT_WINDOW_MS - 1_000).toISOString() }), "250720000019", "I've asked the broker.", now)).toBe(false);
    expect(saidJustNow(sent({ h: hash, id: "" }), "250720000019", "I've asked the broker.", now)).toBe(false);
  });
});
