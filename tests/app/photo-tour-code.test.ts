import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// databayt/mkan#54 case 2: the photo tour is linked with the public code
// ("1002-01"); parseInt turned it into 1002, another home's photos or none.
describe("photo tour id (mkan#54)", () => {
  const src = readFileSync("src/app/[lang]/listings/[id]/photos/page.tsx", "utf8");
  it("hands the code to getListing untouched", () => {
    expect(src).toMatch(/getListing\(params\.id\)/);
    expect(src).not.toMatch(/parseInt\(\s*params\.id/);
  });
});
