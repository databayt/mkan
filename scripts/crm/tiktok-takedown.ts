/**
 * Posts on @mkan.rw whose home is taken: the removal queue (2026-11-22).
 *
 *   pnpm tt:takedown                 queue every POSTED video whose home is taken (Listing.lostAt, or a broker said
 *                                    "taken" after their last yes) and print the open queue
 *   pnpm tt:takedown --done=<postId> mark one done (taken down, or its caption now says taken)
 *   pnpm tt:takedown --reask         the homes held back for want of a fresh broker yes (tt:pick writes them)
 *
 * Why: a TikTok post keeps sending people to its K-code for as long as it is up (11-22: K6823 for days after
 * the broker said taken — "the room advertised on TikTok and the ones you sent me are totally different"). The
 * page itself stops posting a taken home (tiktok-post-pure ineligibleReason) and /k/K… says "taken" with similar
 * homes, but the video already out stays until a person or the Mac job takes it down.
 *
 * The queue is WaState `tiktok-takedown`: [{ postId, listingId, ref, tiktokUrl, tiktokId, queuedAt, doneAt? }].
 * This script only QUEUES. The Mac step that acts on it drives TikTok Studio in the vault Chrome (like tt:upload):
 * open tiktokstudio/content, find the post by tiktokId / its caption's K-code, then Delete — or, if Studio offers
 * caption edit on a posted video, put "TAKEN — see mkan.sd/k/<ref> for similar homes" first in the caption — and
 * run `pnpm tt:takedown --done=<postId>`. Until that step exists, the queue is a person's to-do.
 */
import { config } from 'dotenv';
config({ override: true });

import type { Prisma } from '@prisma/client';
import { refOf, takedownsDue, type PostedRow } from './tiktok-post-pure';

const argv = (n: string, d = ''): string => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const flag = (n: string): boolean => process.argv.includes(`--${n}`);

interface Entry {
  postId: string;
  listingId: number;
  ref: string;
  tiktokUrl: string | null;
  tiktokId: string | null;
  queuedAt: string;
  doneAt?: string;
}

async function main() {
  const { db } = await import('../../src/lib/db');
  const read = async <T>(key: string): Promise<T[]> => ((await db.waState.findUnique({ where: { key } }))?.value as T[] | null) ?? [];
  const write = (key: string, value: unknown) => {
    const v = value as Prisma.InputJsonValue;
    return db.waState.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
  };

  if (flag('reask')) {
    const held = await read<{ listingId: number; ref: string; at: string }>('tiktok-reask');
    console.log(held.length ? held.map((h) => `${h.ref}  held since ${h.at}`).join('\n') : 'no homes are waiting for a fresh broker yes');
    return;
  }

  const queue = await read<Entry>('tiktok-takedown');
  const done = argv('done');
  if (done) {
    const hit = queue.find((e) => e.postId === done);
    if (!hit) return console.log(`no queued post ${done}`);
    hit.doneAt = new Date().toISOString();
    await write('tiktok-takedown', queue);
    return console.log(`${hit.ref}: marked done`);
  }

  const [posts, answers] = await Promise.all([
    db.tikTokPost.findMany({
      where: { status: 'POSTED', postedAt: { gt: new Date(Date.now() - 45 * 86_400_000) } },
      select: { id: true, listingId: true, ref: true, status: true, postedAt: true, tiktokUrl: true, tiktokId: true },
    }),
    db.brokerRequest.groupBy({ by: ['listingId', 'status'], where: { status: { in: ['AVAILABLE', 'RENTED'] }, respondedAt: { not: null } }, _max: { respondedAt: true } }),
  ]);
  const lost = new Map((await db.listing.findMany({ where: { id: { in: [...new Set(posts.map((p) => p.listingId))] }, lostAt: { not: null } }, select: { id: true, lostAt: true } })).map((l) => [l.id, l.lostAt!.toISOString()]));
  const newest = (status: string) => new Map(answers.filter((a) => a.status === status && a._max.respondedAt).map((a) => [a.listingId, a._max.respondedAt!.toISOString()]));
  const yes = newest('AVAILABLE');
  const gone = newest('RENTED');
  const rows: PostedRow[] = posts.map((p) => ({
    id: p.id,
    listingId: p.listingId,
    ref: p.ref || refOf({ id: p.listingId, code: null }),
    status: p.status,
    postedAt: p.postedAt?.toISOString() ?? null,
    tiktokUrl: p.tiktokUrl,
    tiktokId: p.tiktokId,
    lostAt: lost.get(p.listingId) ?? null,
    confirmedAt: yes.get(p.listingId) ?? null,
    rentedAt: gone.get(p.listingId) ?? null,
  }));
  const due = takedownsDue(rows, new Set(queue.map((e) => e.postId)));
  const added: Entry[] = due.map((p) => ({ postId: p.id, listingId: p.listingId, ref: p.ref, tiktokUrl: p.tiktokUrl, tiktokId: p.tiktokId, queuedAt: new Date().toISOString() }));
  if (added.length && !flag('dry')) await write('tiktok-takedown', [...queue, ...added].slice(-500));
  const open = [...queue, ...added].filter((e) => !e.doneAt);
  console.log(`${added.length} newly queued${flag('dry') ? ' (dry: not written)' : ''} · ${open.length} open`);
  for (const e of open) console.log(`  ${e.ref}  post ${e.postId}  ${e.tiktokUrl ?? '(no url — find it by the K-code in the caption)'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
