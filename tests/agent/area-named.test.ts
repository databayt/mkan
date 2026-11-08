import { describe, expect, it } from "vitest";
import { parseRequirements } from "@/components/agent/requirements";

const hood = (t: string) => parseRequirements(t).neighbourhood;

// databayt/mkan#54: a search that names an area must keep the area.
describe("an area the tenant names (mkan#54)", () => {
  it.each([
    ["Kinyarwanda", "nshaka inzu i Kimironko", "Kimironko"],
    ["Kinyarwanda mu", "inzu mu Nyamirambo", "Nyamirambo"],
    ["misspelt Kimironko", "apartment in Kimirunko", "Kimironko"],
    ["misspelt Remera (doubled m)", "apartment in remmera", "Remera"],
    ["misspelt long name (dropped letter)", "house in Nyarutarma", "Nyarutarama"],
    ["alias spelling", "kaciyiru", "Kacyiru"],
    ["alias place name", "something in vision city", "Gacuriro"],
  ])("%s", (_n, text, want) => {
    expect(hood(text)).toBe(want);
  });

  it("a district word or another real place is not read as a typo", () => {
    expect(hood("studio in Kicukiro")).toBeNull();
    expect(parseRequirements("studio in Kicukiro").district).toBe("KICUKIRO");
    expect(hood("apartment in Kigarama")).toBeNull();
    expect(hood("a remedy for rent")).toBeNull();
  });
});
