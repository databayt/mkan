import { describe, expect, it } from "vitest";
import { buildSweepFields, languageOf, needSummaryOf, sourceOf, type TenantRow } from "@/lib/crm/tenant-sync-pure";

const row: TenantRow = {
  id: "p1",
  waPhone: "+250788000111",
  webPhone: null,
  firstSource: "tiktok",
  memory: { v: 1, prefs: { bedrooms: { value: 2, at: "2026-11-10T10:00:00Z", source: "said" }, maxPrice: { value: 450000, at: "2026-11-10T10:00:00Z", source: "said" }, district: { value: "GASABO", at: "2026-11-10T10:00:00Z", source: "said" }, neighbourhood: { value: "Kimironko", at: "2026-11-10T10:00:00Z", source: "said" } }, notes: [], liked: [], dismissed: [], seen: [] },
  name: null,
  createdAt: new Date("2026-11-01T10:00:00Z"),
  task: { id: "task1", locale: "rw", updatedAt: new Date("2026-11-14T10:00:00Z"), shown: true },
};

describe("tenant sweep", () => {
  it("maps the profile's facts", () => {
    const f = buildSweepFields(row, { stageKnown: false, stopped: false, chatLink: "https://x/en/find?c=task1" });
    expect(f).toMatchObject({ mkanProfileId: "p1", $phone: "+250788000111", source: "TIKTOK_CODE", language: "RW", district: "GASABO", budgetRwf: 450000, bedrooms: 2, stage: "SHOWN_HOMES" });
    expect(f.needSummary).toBe("2 bed · Kimironko · up to 450,000/mo");
    expect(f.chatLink).toEqual({ primaryLinkUrl: "https://x/en/find?c=task1", primaryLinkLabel: "Chat" });
    expect(f).not.toHaveProperty("optOut");
  });
  it("never sends a stage for a tenant Twenty already holds", () => {
    expect(buildSweepFields(row, { stageKnown: true, stopped: false, chatLink: null })).not.toHaveProperty("stage");
  });
  it("a new tenant with no shortlist is NEW", () => {
    expect(buildSweepFields({ ...row, task: { ...row.task!, shown: false } }, { stageKnown: false, stopped: false, chatLink: null }).stage).toBe("NEW");
  });
  it("a STOP is reported as optOut true, never false", () => {
    expect(buildSweepFields(row, { stageKnown: true, stopped: true, chatLink: null }).optOut).toBe(true);
  });
  it("source and language fall back sensibly", () => {
    expect(sourceOf(null, true)).toBe("WHATSAPP");
    expect(sourceOf(null, false)).toBe("WEB");
    expect(sourceOf("k_page", true)).toBe("K_PAGE");
    expect(languageOf("ar-SD")).toBe("AR");
    expect(languageOf("zz")).toBeUndefined();
    expect(needSummaryOf(null).text).toBeUndefined();
  });
});
