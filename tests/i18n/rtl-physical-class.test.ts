import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Arabic-first guard: the launch-critical surfaces (homepage, /listings,
 * /search, /listings/[id]) must use logical Tailwind utilities so they mirror
 * correctly under dir="rtl". Physical margin/padding/text-align utilities
 * (ml-/mr-/pl-/pr-/text-left/text-right) stay pinned to one side and break the
 * Arabic layout — this test fails the build if any reappear in these dirs.
 *
 * Scope note: left-/right- and space-x- are intentionally NOT flagged — the
 * codebase uses `left-1/2 -translate-x-1/2` centering and a few `space-x` gaps
 * on purpose. The fix for a real hit is ms/me/ps/pe/text-start.
 */
const SCAN_DIRS = ["src/components/site", "src/components/listings"];
const SCAN_FILES = [
  "src/components/listing-details-client.tsx",
  "src/components/atom/property-info.tsx",
];

const PHYSICAL = /className="[^"]*\b(ml-\d|mr-\d|pl-\d|pr-\d|text-left|text-right)\b/;

function walk(dir: string): string[] {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

describe("RTL: launch surfaces use logical properties (no physical ml/mr/pl/pr/text-align)", () => {
  const files = [...SCAN_DIRS.flatMap(walk), ...SCAN_FILES].filter((f) =>
    fs.existsSync(path.resolve(f))
  );

  it("scans a non-empty set of launch component files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} has no physical RTL classes`, () => {
      const offenders = fs
        .readFileSync(path.resolve(file), "utf8")
        .split("\n")
        .map((line, i) => ({ n: i + 1, line: line.trim() }))
        .filter(({ line }) => PHYSICAL.test(line));
      expect(
        offenders,
        `${file} → use ms/me/ps/pe/text-start:\n${offenders
          .map((o) => `  L${o.n}: ${o.line}`)
          .join("\n")}`
      ).toEqual([]);
    });
  }
});
