// @vitest-environment node
/** language.ts — rules-first language detection for the WhatsApp line (en / rw / fr / ar / sw). */
import { describe, expect, it } from "vitest";
import { detectLang, isNeutralText, replyLang } from "@/components/agent/language";
import { waLang } from "@/components/agent/whatsapp-format";

const lang = (t: string, prev?: string) => detectLang(t, prev).lang;

describe("detectLang", () => {
  it("reads the languages seen on the real line", () => {
    expect(lang("Can i know about this?")).toBe("en");
    expect(lang("Hello, I need a 2 bedroom in Kimironko, max 300k")).toBe("en");
    expect(lang("Mwiriwe, ndashaka inzu i Remera")).toBe("rw");
    expect(lang("Iyo apartment ya 120k ndayishaka")).toBe("rw");
    expect(lang("Ibi nibyo???")).toBe("rw");
    expect(lang("Ese iracyahari? ntago irahenze")).toBe("rw");
    expect(lang("Mwaramutse, nashakaga icyumba na salon itarengeje ibihumbi 150")).toBe("rw");
    expect(lang("J'aimerais savoir si c'est meublé ?")).toBe("fr");
    expect(lang("Bonjour, vous avez un appartement à Kicukiro pour moins de 200k ?")).toBe("fr");
    expect(lang("أبحث عن شقة في كيميهورورا")).toBe("ar");
    expect(lang("Habari, nataka nyumba ya vyumba viwili, bei gani?")).toBe("sw");
    expect(lang("Asante sana")).toBe("sw");
  });

  it("flags a mix without flipping the language on a loan word", () => {
    expect(detectLang("Iyo apartment ya 120k ndayishaka")).toMatchObject({ lang: "rw", mixed: false });
    expect(detectLang("Je cherche une chambre, ndashaka inzu nziza")).toMatchObject({ mixed: true });
    expect(detectLang("I need a room ndashaka icyumba i Kacyiru").mixed).toBe(true);
  });

  it("keeps the chat's language for a message with none in it", () => {
    for (const t of ["kimironko, remera", "150k", "K6823", "300k", "ok", "👍", "2", "k6516 ?"]) {
      expect(detectLang(t, "rw")).toMatchObject({ lang: "rw", neutral: true });
      expect(lang(t, "fr")).toBe("fr");
      expect(lang(t, "ar")).toBe("ar");
    }
    expect(lang("kimironko, remera")).toBe("en");
  });

  it("switches when the person does", () => {
    expect(lang("I want 2 bedrooms in Remera", "ar")).toBe("en");
    expect(lang("hey, stop sending me messages", "rw")).toBe("en");
    expect(lang("ndashaka inzu", "en")).toBe("rw");
    expect(lang("merci, c'est combien par mois ?", "en")).toBe("fr");
    expect(lang("أريد شقة", "rw")).toBe("ar");
  });

  it("treats a bare greeting or thanks as neutral", () => {
    expect(isNeutralText("ok")).toBe(true);
    expect(isNeutralText("Thanks K6823 150k")).toBe(true);
    expect(isNeutralText("ndashaka inzu")).toBe(false);
  });
});

describe("replyLang", () => {
  it("answers in the latest substantive message's language", () => {
    expect(replyLang(["Mwiriwe, ndashaka inzu", "150k", "ok"])).toBe("rw");
    expect(replyLang(["Mwiriwe, ndashaka inzu", "Actually, do you have anything in English? I need a room near the city"])).toBe("en");
    expect(replyLang(["Bonjour, je cherche une chambre meublée", "Kimironko"])).toBe("fr");
  });

  it("ignores Mkan's own lines and falls back to English", () => {
    expect(
      replyLang([
        { who: "tenant", text: "Murakoze, ndashaka inzu" },
        { who: "mkan", text: "Which area do you prefer? Do you want it furnished?" },
        { who: "tenant", text: "Kicukiro" },
      ]),
    ).toBe("rw");
    expect(replyLang([])).toBe("en");
    expect(replyLang(["K6823", "ok"])).toBe("en");
    expect(replyLang(["K6823"], "rw")).toBe("rw");
  });
});

describe("waLang delegates and keeps its return type", () => {
  it("never returns fr or sw", () => {
    expect(waLang("J'aimerais savoir si c'est meublé ?")).toBe("en");
    expect(waLang("Habari, nataka nyumba")).toBe("en");
    expect(waLang("Iyo apartment ya 120k ndayishaka")).toBe("rw");
    expect(waLang("Mwaramutse, nashakaga icyumba")).toBe("rw");
    expect(waLang("kimironko", "rw")).toBe("rw");
  });
});
