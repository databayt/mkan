import { describe, it, expect } from "vitest";
import en from "@/components/internationalization/en.json";
import ar from "@/components/internationalization/ar.json";

/**
 * Arabic-first guard: en.json and ar.json must stay structurally identical.
 * The Dictionary type is inferred from en.json, so a missing *en* key is caught
 * by tsc — but a missing *ar* key is invisible to the compiler. This test (the
 * vitest peer of scripts/dev-i18n-sync.ts) fails the build on any drift so the
 * Arabic locale never silently falls back to English.
 */
function keyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return [prefix];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out.push(...keyPaths(v, prefix ? `${prefix}.${k}` : k));
  }
  return out;
}

describe("i18n dictionary parity (en ⇄ ar)", () => {
  const enKeys = new Set(keyPaths(en));
  const arKeys = new Set(keyPaths(ar));

  it("has no keys present in en.json but missing from ar.json", () => {
    const missing = [...enKeys].filter((k) => !arKeys.has(k));
    expect(missing, `Missing in ar.json:\n${missing.join("\n")}`).toEqual([]);
  });

  it("has no keys present in ar.json but missing from en.json", () => {
    const missing = [...arKeys].filter((k) => !enKeys.has(k));
    expect(missing, `Missing in en.json:\n${missing.join("\n")}`).toEqual([]);
  });

  it("has the same total key count in both locales", () => {
    expect(enKeys.size).toBe(arKeys.size);
  });
});
