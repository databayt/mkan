/**
 * Kinyarwanda listing text for the Kigali wave.
 *
 * Airbnb has no `rw` locale, so unlike en/ar there is nothing to capture: the
 * third language has to be translated. It goes through `claude -p` on the Max
 * plan (no API key, the same reader lane as `home-intake.ts`), from the English
 * capture — the one Airbnb verified — and lands in `home.i18n.rw` flagged
 * `machineTranslated`, so nothing downstream can mistake it for host copy.
 *
 *   pnpm crm:translate-rw                       # dry run — counts, one sample prompt
 *   pnpm crm:translate-rw --apply               # translate everything missing
 *   pnpm crm:translate-rw --apply --limit=16    # a slice
 *
 * Flags: --region=<rwanda>  --in=<file>  --batch=<N homes per call>  --limit=<N>  --refresh  --apply
 *
 * Resumable: homes that already carry `i18n.rw` are skipped (unless --refresh),
 * and the file is written after every batch.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { regionFromArgv } from './regions';

const arg = (n: string, d?: string) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const APPLY = process.argv.includes('--apply');
const REFRESH = process.argv.includes('--refresh');
const REGION = regionFromArgv(process.argv.some((a) => a.startsWith('--region=')) ? process.argv : [...process.argv, '--region=rwanda']);
const IN = arg('in', REGION.files.scrape)!;
const BATCH = Math.max(1, parseInt(arg('batch', '6')!, 10));
const LIMIT = parseInt(arg('limit', '0')!, 10);
const MODEL = process.env.TRANSLATE_RW_MODEL?.trim() || 'sonnet';

type Capture = { title?: string | null; description?: string | null; localeVerified?: string; machineTranslated?: boolean; capturedAt?: string };
type Home = { airbnbListingId: string; title: string | null; description: string | null; placeCheck?: string; i18n?: Record<string, Capture> };

/** Prefer the English capture; fall back to whatever the host wrote. */
function source(h: Home): { title: string; description: string } | null {
  const en = h.i18n?.en;
  const title = (en?.localeVerified === 'ok' ? en.title : null) ?? h.title ?? '';
  const description = (en?.localeVerified === 'ok' ? en.description : null) ?? h.description ?? '';
  return title.trim() ? { title: title.trim(), description: description.trim() } : null;
}

function claudeBin(): string {
  const candidates = [process.env.CLAUDE_BIN?.trim(), join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  for (const c of candidates) if (c && existsSync(c)) return c;
  return 'claude';
}

const PROMPT_HEAD = `You translate holiday-rental listings into Kinyarwanda (Ikinyarwanda) for mkan, a home-rental marketplace.

Rules:
- Natural, warm Kinyarwanda as a Kigali host would write it — not word-for-word.
- Keep proper nouns as written: neighbourhood and street names (Kimihurura, Nyarutarama, KG 9 Ave…), brand names (Netflix, Wi-Fi, Airbnb), and numbers.
- Keep line breaks. Do not add, drop or embellish facts. Do not add contact details.
- Titles stay short (under ~60 characters where the source allows).

Input is a JSON array of {id, title, description}. Reply with ONLY a JSON array of {id, title, description} in Kinyarwanda, same ids, same order — no prose, no code fence.

`;

function translate(batch: { id: string; title: string; description: string }[], attempt = 0): Map<string, { title: string; description: string }> {
  const proc = spawnSync(
    claudeBin(),
    ['-p', '--no-session-persistence', '--model', MODEL, '--output-format', 'json', '--disallowedTools', 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent', 'NotebookEdit'],
    {
      input: PROMPT_HEAD + JSON.stringify(batch),
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, PATH: `${join(homedir(), '.local/bin')}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}`, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    },
  );
  if (proc.error) throw new Error(`claude could not start: ${proc.error.message}`);
  const envelope = JSON.parse(proc.stdout || '{}') as { is_error?: boolean; result?: string; subtype?: string };
  if (envelope.is_error) throw new Error(`claude error: ${envelope.result ?? envelope.subtype ?? 'unknown'}`);
  const text = (envelope.result ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const rows = JSON.parse(text) as { id: string; title: string; description: string }[];
    const out = new Map(rows.filter((r) => r?.id && r.title).map((r) => [String(r.id), { title: r.title.trim(), description: (r.description ?? '').trim() }]));
    const missing = batch.filter((b) => !out.has(b.id)).length;
    if (missing) throw new Error(`${missing} id(s) missing from the reply`);
    return out;
  } catch (e) {
    if (attempt >= 1) throw e;
    console.warn(`  ! reply rejected (${(e as Error).message.slice(0, 100)}) — asking once more`);
    return translate(batch, attempt + 1);
  }
}

function writeAtomic(path: string, data: unknown) {
  writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${path}.tmp`, path);
}

function main() {
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { homes: Home[] };
  let todo = payload.homes.filter((h) => h.placeCheck !== 'SUSPECT_FOREIGN' && (REFRESH || !h.i18n?.rw) && source(h));
  if (LIMIT) todo = todo.slice(0, LIMIT);
  console.log(`\n🇷🇼 Kinyarwanda — ${payload.homes.length} homes in ${IN}, ${todo.length} to translate (${BATCH}/call, ${MODEL})`);
  if (!APPLY) {
    const sample = todo.slice(0, 1).map((h) => ({ id: h.airbnbListingId, ...source(h)! }));
    if (sample.length) console.log(`\nsample input: ${JSON.stringify(sample).slice(0, 400)}…`);
    console.log('\nDRY RUN — re-run with --apply.\n');
    return;
  }
  let done = 0;
  let failed = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const started = Date.now();
    try {
      const out = translate(slice.map((h) => ({ id: h.airbnbListingId, ...source(h)! })));
      for (const h of slice) {
        const t = out.get(h.airbnbListingId)!;
        h.i18n = { ...(h.i18n ?? {}), rw: { title: t.title, description: t.description || null, machineTranslated: true, capturedAt: new Date().toISOString() } };
        done++;
      }
      writeAtomic(IN, payload);
      console.log(`  ✓ ${done}/${todo.length}  (${((Date.now() - started) / 1000).toFixed(0)}s)  ${slice[0].i18n!.rw.title?.slice(0, 50)}`);
    } catch (e) {
      failed += slice.length;
      console.warn(`  ! batch at ${i} failed: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  console.log(`\n✅ ${done} translated, ${failed} failed → ${IN}${failed ? '  (re-run to retry the failures)' : ''}\n`);
}

main();
