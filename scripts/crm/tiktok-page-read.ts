import { execFileSync } from 'node:child_process';

const firstLine = (e: unknown): string => String((e as { stderr?: string }).stderr || (e as Error).message).trim().split('\n')[0]!.slice(0, 160);

/** yt-dlp's read of the page, retried with backoff: a waking Mac has failed DNS for tiktok.com (11-02). */
export async function readPage(target: string, handle: string): Promise<string> {
  const waits = [0, 20_000, 60_000, 180_000];
  let last: unknown;
  for (const [i, wait] of waits.entries()) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      return execFileSync('yt-dlp', ['--no-warnings', '--socket-timeout', '30', '--retries', '3', '--flat-playlist', '-J', '--playlist-end', '60', target], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      last = e;
      console.warn(`  … page read ${i + 1}/${waits.length} failed: ${firstLine(e)}`);
    }
  }
  throw new Error(`yt-dlp could not read @${handle} after ${waits.length} tries: ${firstLine(last)}`);
}
