/**
 * The Kinyarwanda the writer produced (writer.ts noteRwSamples → WaState `rw-samples`), for a native
 * speaker's read: appended to docs/i18n/rw-review-2026-11.csv — redacted, the repo is public — and
 * taken off the list. Haiku has written rw replies since 2026-11-07; a piece the guard held back
 * (looksKinyarwanda) never reached a tenant, but is listed too, so the guard can be tuned.
 *
 *   pnpm agent:rw-samples          append the new samples and take them off the list
 *   pnpm agent:rw-samples --dry    print them, change nothing
 */
import { config } from "dotenv";
config({ override: true });

import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSV = resolve("docs/i18n/rw-review-2026-11.csv");
const dry = process.argv.includes("--dry");
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

type Sample = { kind: string; text: string; passed: boolean; taskId?: string; at?: string };

async function main() {
  const { db } = await import("../../src/lib/db");
  const { redactPublic } = await import("../../src/lib/redact");
  try {
    const row = await db.waState.findUnique({ where: { key: "rw-samples" }, select: { value: true } });
    const all = (row?.value as Sample[] | null) ?? [];
    const have = new Set(readFileSync(CSV, "utf8").split("\n").map((l) => l.split(",")[1]));
    const fresh = all
      .filter((s) => s?.text?.trim())
      .map((s) => ({ key: `${s.kind}:${s.at ?? "?"}:${(s.taskId ?? "").slice(-6)}`, s }))
      .filter(({ key }) => !have.has(key));
    const lines = fresh.map(({ key, s }) =>
      [`writer (${s.kind})`, key, "", redactPublic(s.text), s.passed ? "machine-written (sent)" : "machine-written (held back by the guard)", ""].map(cell).join(","),
    );
    console.log(`${all.length} sample(s) on the list, ${lines.length} new for the review sheet`);
    for (const l of lines.slice(0, 20)) console.log(`  ${l}`);
    if (dry || all.length === 0) return;
    if (lines.length) appendFileSync(CSV, `${lines.join("\n")}\n`);
    // Only the ones read here come off: a sample written meanwhile stays for the next run.
    await db.$executeRaw`UPDATE "WaState" SET "value" = COALESCE((SELECT jsonb_agg(x ORDER BY i) FROM jsonb_array_elements("value") WITH ORDINALITY AS t(x, i) WHERE i > ${all.length}), '[]'::jsonb), "updatedAt" = now() WHERE "key" = 'rw-samples'`;
    console.log(lines.length ? `appended to ${CSV}` : "nothing new to append");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
