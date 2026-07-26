import { describe, it, expect } from "vitest";
import {
  extractContacts,
  extractContactsFrom,
  normalizeDigits,
  overallConfidence,
} from "../../scripts/crm/contact-extract";

const values = (text: string) => extractContacts(text, "test").map((c) => c.value);
const kinds = (text: string) => extractContacts(text, "test").map((c) => `${c.kind}:${c.value}`);

describe("normalizeDigits", () => {
  it("transliterates Eastern Arabic digits, which hosts routinely type", () => {
    // Nothing else in the extractor can match these, so this runs first on
    // every input — a number typed ٠٩١٢٣٤٥٦٧٨ is invisible to an ASCII regex.
    expect(normalizeDigits("٠٩١٢٣٤٥٦٧٨")).toBe("0912345678");
    expect(normalizeDigits("۰۹۱۲۳۴۵۶۷۸")).toBe("0912345678");
    expect(normalizeDigits("اتصل ٠٩١٢٣٤٥٦٧٨")).toBe("اتصل 0912345678");
  });
});

describe("Sudanese phone numbers", () => {
  it("normalizes every format the same listing might use", () => {
    expect(values("Call 0912345678")).toContain("+249912345678");
    expect(values("Call +249912345678")).toContain("+249912345678");
    expect(values("Call 00249912345678")).toContain("+249912345678");
    expect(values("Call 0912 345 678")).toContain("+249912345678");
    expect(values("Call 091-234-5678")).toContain("+249912345678");
  });

  it("accepts both Sudani (01x) and Zain/MTN (09x) prefixes", () => {
    expect(values("0123456789")).toContain("+249123456789");
    expect(values("0999888777")).toContain("+249999888777");
  });

  it("reads numbers written in Arabic digits", () => {
    expect(values("للحجز ٠٩١٢٣٤٥٦٧٨")).toContain("+249912345678");
  });

  it("rejects things shaped like numbers but not phone numbers", () => {
    expect(values("Built in 2019")).toHaveLength(0);
    expect(values("Only 250 metres from the beach")).toHaveLength(0);
    expect(values("3 guests maximum")).toHaveLength(0);
  });
});

describe("WhatsApp detection", () => {
  it("treats a wa.me link as unambiguous", () => {
    const [c] = extractContacts("Message me https://wa.me/249912345678", "test");
    expect(c.kind).toBe("whatsapp");
    expect(c.value).toBe("+249912345678");
    expect(c.confidence).toBe("HIGH");
  });

  it("promotes a bare number to WhatsApp when the Arabic word is next to it", () => {
    // The distinction that matters for outreach: a number the host is
    // advertising as a contact vs one that merely appears in the text.
    expect(kinds("واتساب ٠٩١٢٣٤٥٦٧٨")).toContain("whatsapp:+249912345678");
    expect(kinds("whatsapp 0912345678")).toContain("whatsapp:+249912345678");
  });

  it("marks a number next to a booking phrase as high confidence", () => {
    const [c] = extractContacts("للحجز والاستفسار 0912345678", "test");
    expect(c.confidence).toBe("HIGH");
  });

  it("leaves an unheralded number at medium confidence", () => {
    const [c] = extractContacts("0912345678", "test");
    expect(c.kind).toBe("phone");
    expect(c.confidence).toBe("MEDIUM");
  });
});

describe("diaspora numbers", () => {
  it("keeps foreign numbers and tags the country", () => {
    // Many Sudanese hosts have lived abroad since the war; their Saudi or
    // Egyptian number is the real way to reach them, not noise to discard.
    const sa = extractContacts("Call +966501234567", "test")[0];
    expect(sa.value).toBe("+966501234567");
    expect(sa.countryGuess).toBe("SA");

    const eg = extractContacts("+201012345678", "test")[0];
    expect(eg.countryGuess).toBe("EG");
  });
});

describe("social and email", () => {
  it("extracts the channels hosts actually publish", () => {
    const found = kinds(
      "email me at Host@Example.COM or facebook.com/myplace or instagram.com/my.place or t.me/myplace",
    );
    expect(found).toContain("email:host@example.com");
    expect(found).toContain("facebook:https://facebook.com/myplace");
    expect(found).toContain("instagram:https://instagram.com/my.place");
    expect(found).toContain("telegram:https://t.me/myplace");
  });

  it("skips Facebook's own tracking and share paths", () => {
    expect(values("https://facebook.com/sharer/sharer.php")).toHaveLength(0);
  });
});

describe("extractContactsFrom", () => {
  it("dedupes across fields and keeps the strongest evidence", () => {
    // The same number appears bare in the description and next to "واتساب" in
    // the house rules; the confident reading should survive.
    const found = extractContactsFrom([
      ["description:en", "Reach us on 0912345678"],
      ["houseRules:ar", "واتساب ٠٩١٢٣٤٥٦٧٨"],
    ]);
    const forNumber = found.filter((c) => c.value === "+249912345678");
    expect(forNumber).toHaveLength(1);
    expect(forNumber[0].confidence).toBe("HIGH");
  });

  it("records which field each candidate came from", () => {
    const found = extractContactsFrom([["hostAbout", "wa.me/249912345678"]]);
    expect(found[0].source).toBe("hostAbout");
  });

  it("handles empty and missing fields", () => {
    expect(extractContactsFrom([["a", null], ["b", ""], ["c", undefined]])).toEqual([]);
  });
});

describe("overallConfidence", () => {
  it("summarises a host in one value for the CRM", () => {
    expect(overallConfidence(extractContacts("واتساب 0912345678", "t"))).toBe("HIGH");
    expect(overallConfidence(extractContacts("0912345678", "t"))).toBe("MEDIUM");
    expect(overallConfidence([])).toBe("NONE");
  });
});

describe("realistic listing text", () => {
  it("pulls the contact out of a bilingual description", () => {
    const text = `شقة مفروشة في الخرطوم بحري، غرفتين وصالة.
      للحجز والاستفسار: ٠٩١٢٣٤٥٦٧٨ (واتساب متاح)
      Furnished apartment in Khartoum Bahri. Contact: 0912345678`;
    const found = extractContacts(text, "description:ar");
    const wa = found.find((c) => c.kind === "whatsapp");
    expect(wa?.value).toBe("+249912345678");
    expect(wa?.confidence).toBe("HIGH");
  });

  it("finds nothing in a description that has no contact — the common case", () => {
    // Airbnb strips most contacts; a clean run must not invent one.
    expect(
      extractContacts("Our Single Room offers a comfortable bed, free high-speed Wi-Fi, and sea views.", "t"),
    ).toEqual([]);
  });
});
