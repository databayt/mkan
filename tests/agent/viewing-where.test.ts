/**
 * Where to meet, and the booking's words (2026-11-22): the pin when the home has a real one, else its area; the
 * tenant's confirmation in their own language with "{rep} from Mkan will meet you there"; and nothing that promises
 * a person will write to anyone.
 */
import { describe, expect, it } from "vitest";
import { offerHomeLine, signingNotedText, stripTimeAsk, viewingConfirmedMessage } from "@/components/agent/deal-pure";
import { checkingHomeFirstMessage, homeGoneMessage, mapLink, meetingSpot, noBrokerMessage, realPin, viewingFallbackCard } from "@/components/agent/viewing-loop-pure";

describe("realPin", () => {
  it("is real for a pin that is somewhere", () => expect(realPin(-1.935, 30.127)).toBe(true));
  it("is not for the centre of Kigali a lead is stored at, (0, 0), or nothing", () => {
    expect(realPin(-1.9441, 30.0619)).toBe(false);
    expect(realPin(-1.9442, 30.0621)).toBe(false);
    expect(realPin(0, 0)).toBe(false);
    expect(realPin(null, 30)).toBe(false);
    expect(realPin(Number.NaN, 30)).toBe(false);
  });
});

describe("meetingSpot", () => {
  const home = { latitude: -1.935, longitude: 30.127, neighbourhood: null, sector: "gasabo/kimironko" };
  it("the broker's own spot wins", () => expect(meetingSpot("  Simba Kimironko  ", home)).toEqual({ kind: "place", text: "Simba Kimironko" }));
  it("then the home's pin, as a link any maps app opens", () => {
    expect(meetingSpot(null, home)).toEqual({ kind: "pin", text: "📍 https://maps.google.com/?q=-1.935000,30.127000" });
    expect(mapLink(-1.935, 30.127)).toBe("https://maps.google.com/?q=-1.935000,30.127000");
  });
  it("then its area, named in the reader's language; else nothing", () => {
    const stored = { ...home, latitude: -1.9441, longitude: 30.0619 };
    expect(meetingSpot(null, stored)).toEqual({ kind: "area", text: "Kimironko" });
    expect(meetingSpot(null, stored, "ar")).toMatchObject({ kind: "area", text: "كيميرونكو" });
    expect(meetingSpot(null, { ...stored, sector: null })).toBeNull();
    expect(meetingSpot(null, null)).toBeNull();
  });
});

describe("the tenant's confirmation", () => {
  const v = { title: "3-bedroom in Rebero", label: "Tue 17 Nov, 10:00", place: null, rep: "Osman", toConfirm: true };
  const pin = { kind: "pin" as const, text: "📍 https://maps.google.com/?q=-1.935000,30.127000" };

  it("gives the time, the pin, who meets them, and what is settled at the viewing", () => {
    expect(viewingConfirmedMessage("en", { ...v, spot: pin })).toBe(
      'Viewing confirmed: "3-bedroom in Rebero", Tue 17 Nov, 10:00 · 📍 https://maps.google.com/?q=-1.935000,30.127000. Osman from Mkan will meet you there, with the broker. Bring your ID; if you like it, the lease is written and signed the same day. Whatever the broker hasn\'t confirmed yet (months up front, deposit, water and electricity) we settle at the viewing. Tell us here if anything changes.',
    );
  });

  it("restates the terms the broker did confirm instead of the 'settle at the viewing' line", () => {
    const t = viewingConfirmedMessage("en", { ...v, place: "Simba Kimironko", terms: "Confirmed with the broker: 3 months up front." });
    expect(t).toContain("· Simba Kimironko.");
    expect(t).not.toMatch(/settle at the viewing/);
    expect(t.endsWith("\nConfirmed with the broker: 3 months up front.")).toBe(true);
  });

  it("speaks Arabic, Kinyarwanda, French and Swahili", () => {
    expect(viewingConfirmedMessage("ar", { ...v, spot: pin })).toMatch(/^تم تأكيد المعاينة: .*Osman من مكان سيلتقي بك هناك/);
    expect(viewingConfirmedMessage("rw", { ...v, spot: pin })).toMatch(/^Gusura byemejwe: .*Osman wo muri Mkan azahurira nawe aho/);
    expect(viewingConfirmedMessage("fr", { ...v, spot: pin })).toMatch(/^Visite confirmée : .*Osman de Mkan vous y retrouvera/);
    expect(viewingConfirmedMessage("sw", { ...v, spot: pin })).toMatch(/^Ziara imethibitishwa: .*Osman wa Mkan atakutana nawe hapo/);
  });

  it("promises no one beyond the viewing itself, in any language", () => {
    const WRITES = /will (?:message|reply|call|write|speak|contact|get back)|سيراسلك|سيتصل|azakwandikira|vous écrira|atakuandikia/i;
    for (const lang of ["en", "ar", "rw", "fr", "sw"] as const) expect(viewingConfirmedMessage(lang, { ...v, spot: pin }), lang).not.toMatch(WRITES);
    for (const lang of ["en", "ar", "rw"] as const) {
      for (const t of [checkingHomeFirstMessage(lang, "Tue 17 Nov, 10:00"), noBrokerMessage(lang), homeGoneMessage(lang), signingNotedText(lang, { title: "x", label: "y", rep: "Osman" })]) {
        expect(t, t).not.toMatch(/Osman[^.]{0,40}will (?:message|reply|call|write)|سيراسلك|azakwandikira/i);
      }
    }
  });
});

describe("the rest", () => {
  it("the sheet loses only its 'when can you come?' line for a tenant who already named a time", () => {
    expect(stripTimeAsk("a\nb\nWhen can you come?")).toBe("a\nb");
  });

  it("a home offered in a message: what it is, where, what it costs, its code", () => {
    expect(offerHomeLine("en", { id: 6711, bedrooms: 2, zone: "gasabo/kimironko", rent: 350_000 })).toBe("2-bedroom in Kimironko, RWF 350,000 a month (K6711)");
    expect(offerHomeLine("fr", { id: 6711, bedrooms: 1, zone: null, rent: null })).toBe("1 chambre (K6711)");
    expect(offerHomeLine("en", { id: 1, bedrooms: null, zone: null, rent: null })).toBe("home (K1)");
  });

  it("the one card left is an FYI that says why and what it is doing, never 'agree it by hand'", () => {
    const base = { title: "Flat", ref: "K7", label: "Tue 17 Nov, 10:00", tenant: "+250…", broker: "Eric", command: "`pnpm deal:book …`", rep: "Osman" };
    for (const why of ["auto-off", "sends-off", "test-number", "no-whatsapp"] as const) {
      const card = viewingFallbackCard({ ...base, why });
      expect(card, why).toMatch(/^📅 \*FYI — viewing asked\*/);
      expect(card, why).toContain("pnpm deal:book");
      expect(card, why).not.toMatch(/agree the time|by hand|phone the broker/i);
    }
  });
});
