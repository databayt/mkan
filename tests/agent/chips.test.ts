import { describe, expect, it } from "vitest";
import en from "@/components/internationalization/en.json";
import ar from "@/components/internationalization/ar.json";
import { requirementChips } from "@/components/agent/chips";

const money = (n: number) => `RWF ${n}`;

describe("requirementChips", () => {
  it("reads one bedroom singular (\"1 bedrooms\" showed under Continue your search, 11-02)", () => {
    expect(requirementChips({ bedrooms: 1 }, en.agent, "en", money)).toEqual(["1 bedroom"]);
    expect(requirementChips({ bedrooms: 2 }, en.agent, "en", money)).toEqual(["2 bedrooms"]);
    expect(requirementChips({ bedrooms: 1 }, ar.agent, "ar", money)).toEqual(["غرفة نوم واحدة"]);
    expect(requirementChips({ bedrooms: 0 }, en.agent, "en", money)).toEqual(["Studio"]);
  });
});
