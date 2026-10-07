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
 * Flags: --region=<rwanda>  --in=<file>  --batch=<N homes per call>  --parallel=<N calls>
 *        --limit=<N>  --refresh  --apply
 *        --sidecar=<file>   read --in, write translations ONLY to the sidecar, so this can
 *                           run while another pass (the ar PDP) is writing --in
 *        --merge            fold the sidecar into --in (run once the other pass is done)
 *
 * Resumable: homes that already carry `i18n.rw` are skipped (unless --refresh),
 * and the file is written after every batch.
 */
import { spawn } from 'node:child_process';
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
const BATCH = Math.max(1, parseInt(arg('batch', '8')!, 10));
const PARALLEL = Math.max(1, parseInt(arg('parallel', '2')!, 10));
const SIDECAR = arg('sidecar', '');
const MERGE = process.argv.includes('--merge');
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

function runClaude(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      claudeBin(),
      ['-p', '--no-session-persistence', '--model', MODEL, '--output-format', 'json', '--disallowedTools', 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent', 'NotebookEdit'],
      { env: { ...process.env, PATH: `${join(homedir(), '.local/bin')}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}`, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } },
    );
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 420_000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new Error(`claude could not start: ${e.message}`)));
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const envelope = JSON.parse(out || '{}') as { is_error?: boolean; result?: string; subtype?: string };
        if (envelope.is_error) return reject(new Error(`claude error: ${envelope.result ?? envelope.subtype ?? 'unknown'}`));
        resolve(envelope.result ?? '');
      } catch {
        reject(new Error(`claude returned non-JSON: ${(out || err).slice(0, 200)}`));
      }
    });
    child.stdin.end(input);
  });
}

async function translate(batch: { id: string; title: string; description: string }[], attempt = 0): Promise<Map<string, { title: string; description: string }>> {
  const text = (await runClaude(PROMPT_HEAD + JSON.stringify(batch))).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
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

type RwCapture = NonNullable<Home['i18n']>[string];

async function main() {
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { homes: Home[] };
  const side: Record<string, RwCapture> = SIDECAR && existsSync(SIDECAR) ? JSON.parse(readFileSync(SIDECAR, 'utf8')) : {};

  if (MERGE) {
    if (!SIDECAR) throw new Error('--merge needs --sidecar=<file>');
    let merged = 0;
    for (const h of payload.homes) {
      const rw = side[h.airbnbListingId];
      if (rw && (REFRESH || !h.i18n?.rw)) {
        h.i18n = { ...(h.i18n ?? {}), rw };
        merged++;
      }
    }
    writeAtomic(IN, payload);
    console.log(`\n🇷🇼 merged ${merged} Kinyarwanda captures from ${SIDECAR} → ${IN}\n`);
    return;
  }

  const has = (h: Home) => !!(h.i18n?.rw || side[h.airbnbListingId]);
  let todo = payload.homes.filter((h) => h.placeCheck !== 'SUSPECT_FOREIGN' && (REFRESH || !has(h)) && source(h));
  if (LIMIT) todo = todo.slice(0, LIMIT);
  console.log(`\n🇷🇼 Kinyarwanda — ${payload.homes.length} homes in ${IN}, ${todo.length} to translate (${BATCH}/call × ${PARALLEL} parallel, ${MODEL})${SIDECAR ? ` → sidecar ${SIDECAR}` : ''}`);
  if (!APPLY) {
    const sample = todo.slice(0, 1).map((h) => ({ id: h.airbnbListingId, ...source(h)! }));
    if (sample.length) console.log(`\nsample input: ${JSON.stringify(sample).slice(0, 400)}…`);
    console.log('\nDRY RUN — re-run with --apply.\n');
    return;
  }

  const batches: Home[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  let done = 0;
  let failed = 0;
  let next = 0;
  const save = () => (SIDECAR ? writeAtomic(SIDECAR, side) : writeAtomic(IN, payload));
  const worker = async () => {
    for (;;) {
      const slice = batches[next++];
      if (!slice) return;
      const started = Date.now();
      try {
        const out = await translate(slice.map((h) => ({ id: h.airbnbListingId, ...source(h)! })));
        for (const h of slice) {
          const t = out.get(h.airbnbListingId)!;
          const rw: RwCapture = { title: t.title, description: t.description || null, machineTranslated: true, capturedAt: new Date().toISOString() };
          if (SIDECAR) side[h.airbnbListingId] = rw;
          else h.i18n = { ...(h.i18n ?? {}), rw };
          done++;
        }
        save();
        console.log(`  ✓ ${done}/${todo.length}  (${((Date.now() - started) / 1000).toFixed(0)}s)  ${out.get(slice[0].airbnbListingId)?.title.slice(0, 50)}`);
      } catch (e) {
        failed += slice.length;
        console.warn(`  ! batch failed: ${(e as Error).message.slice(0, 160)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(`\n✅ ${done} translated, ${failed} failed → ${SIDECAR || IN}${failed ? '  (re-run to retry the failures)' : ''}\n`);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
