/**
 * One-off: brokers' typed answers to "is this available?" from the last hours,
 * read again with the inbox's reader (broker-inbox.ts readAvailabilityReply).
 * Until 10-27 a typed "yes" never reached the tenant — the ask was looked up by
 * a broker id it never carried — so those answers sat in #mkan. Applies yes /
 * taken only: no word goes back to a broker and nothing is posted; the tenants
 * who asked on WhatsApp hear the answer through the outbox, as they would have.
 *
 *   tsx --require ./scripts/agent/no-server-only.js scripts/wa/replay-answers.ts [--hours 48] [--apply]
 */
import { config } from 'dotenv';
config({ override: true });
import './evolution';

async function main() {
  const apply = process.argv.includes('--apply');
  const at = process.argv.indexOf('--hours');
  const hours = at > 0 ? Number(process.argv[at + 1]) || 48 : 48;
  // Production queues tenant messages for the outbox; without this they would become manual #mkan cards.
  process.env.MKAN_WA_OUTBOX = '1';
  const { findMessages } = await import('../../src/lib/whatsapp/evolution');
  const { readAvailabilityReply, recordTypedAnswer } = await import('../../src/components/agent/broker-inbox');
  const { db } = await import('../../src/lib/db');
  const { messageText, senderPhone } = await import('./outbox-pure');
  const { isDirectChat } = await import('./tenant-pure');
  try {
    const now = new Date();
    const records = await findMessages(new Date(now.getTime() - hours * 3_600_000), now, 1000);
    const replies = records
      .filter((m) => !m.key?.fromMe && isDirectChat(m.key?.remoteJid))
      .map((m) => ({ phone: senderPhone(m.key), text: messageText(m.message), sentAt: new Date(Number(m.messageTimestamp ?? 0) * 1000) }))
      .filter((m): m is { phone: string; text: string; sentAt: Date } => !!m.phone && !!m.text && m.sentAt.getTime() > 0)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
    const answered = new Set<string>();
    const homes = new Set<number>();
    let news = 0;
    for (const m of replies) {
      const read = await readAvailabilityReply(m.phone, m.text, m.sentAt);
      if (!read?.answer || read.home == null || answered.has(read.ask.id)) continue;
      answered.add(read.ask.id);
      const what = `${m.sentAt.toISOString()} +${m.phone} "${m.text.replace(/\s+/g, ' ').slice(0, 80)}" → home #${read.home} ${read.answer}`;
      if (!read.isNews || homes.has(read.home)) {
        console.log(`${what} (already known)`);
        continue;
      }
      news += 1;
      homes.add(read.home);
      console.log(`${apply ? '' : '[dry] '}${what}`);
      if (apply) await recordTypedAnswer(read.ask.brokerRequestIds, read.home, read.answer, m.phone);
    }
    console.log(`${replies.length} broker/tenant messages read · ${answered.size} answers · ${news} new${apply ? ' applied' : ' (dry — pass --apply)'}`);
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).stack ?? err}`);
  process.exit(1);
});
