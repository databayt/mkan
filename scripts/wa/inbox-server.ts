/**
 * The Mac's WhatsApp inbox — tenants get the rental agent within seconds.
 *
 *   pnpm wa:inbox     listen on 127.0.0.1:8091 (launchd com.databayt.mkan-wa-inbox keeps it up)
 *
 * Evolution (ops/evolution) posts every new message to
 * http://host.docker.internal:8091/wa/<key> — `pnpm wa:pair` sets the webhook,
 * and <key> is the Evolution API key, so nothing else on the network can feed
 * it messages. Colima forwards host.docker.internal to this Mac's loopback.
 *
 *   - a message from a broker number is left to the outbox drain, which reads
 *     broker bursts (album + caption) as one reply;
 *   - a message from anyone else in a one-to-one chat is a tenant: tenant.ts
 *     runs it through the agent on the Worker and sends the reply;
 *   - a message Mkan's side typed by hand pauses the agent in that chat.
 *
 * The 2-minute poll in outbox.ts answers what this missed (it was down, the
 * webhook failed); the Worker answers each message id once.
 */
import { config } from 'dotenv';
config({ override: true });
import { createServer } from 'node:http';
import { evolutionKey, type EvoMessage } from './evolution';
import { messageText, phoneKey, senderPhone } from './outbox-pure';
import { answerTenant, noteFromMe } from './tenant';
import { isDirectChat } from './tenant-pure';

const PORT = Number(process.env.MKAN_WA_INBOX_PORT ?? 8091);
const MAX_BODY = 2 * 1024 * 1024;

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

type Db = (typeof import('../../src/lib/db'))['db'];
let dbPromise: Promise<Db> | null = null;
const getDb = () => (dbPromise ??= import('../../src/lib/db').then((m) => m.db));

/** Broker numbers, refreshed every 10 minutes — the directory changes daily, not per message. */
let brokers: { at: number; phones: Set<string> } = { at: 0, phones: new Set() };
async function isBroker(phone: string): Promise<boolean> {
  if (Date.now() - brokers.at > 10 * 60_000) {
    const db = await getDb();
    const rows = await db.broker.findMany({ select: { phones: true } });
    brokers = { at: Date.now(), phones: new Set(rows.flatMap((b) => b.phones.map(phoneKey))) };
  }
  return brokers.phones.has(phone);
}

async function handle(m: EvoMessage) {
  const key = m.key;
  if (!key?.id || !isDirectChat(key.remoteJid)) return;
  const phone = senderPhone(key);
  if (!phone) return;
  const ts = Number(m.messageTimestamp ?? 0);
  const sentAt = ts > 0 ? new Date(ts * 1000) : new Date();
  if (key.fromMe) {
    // The echo of the agent's own reply can arrive before sendText returns and tenant.ts records its id.
    if (!(await isBroker(phone))) setTimeout(() => noteFromMe(phone, key.id, sentAt), 10_000);
    return;
  }
  if (await isBroker(phone)) return;
  await answerTenant({ phone, text: messageText(m.message), msgId: key.id, sentAt }, log);
}

/** Evolution v2 posts `{ event, instance, data }`; data is one message or a list. */
function messagesOf(payload: unknown): EvoMessage[] {
  const p = payload as { event?: string; data?: EvoMessage | EvoMessage[] | { messages?: EvoMessage[] } };
  if (p?.event && !/messages[._]upsert/i.test(p.event)) return [];
  const d = p?.data;
  if (Array.isArray(d)) return d;
  if (d && 'messages' in d && Array.isArray(d.messages)) return d.messages;
  return d ? [d as EvoMessage] : [];
}

const server = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0] ?? '';
  const key = evolutionKey();
  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200).end('ok');
    return;
  }
  // Evolution appends the event name to the path when byEvents is on: accept /wa/<key>[/messages-upsert].
  if (req.method !== 'POST' || !key || !(path === `/wa/${key}` || path.startsWith(`/wa/${key}/`))) {
    res.writeHead(404).end();
    return;
  }
  let size = 0;
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => {
    size += c.length;
    if (size <= MAX_BODY) chunks.push(c);
  });
  req.on('end', () => {
    // Answer Evolution at once; the agent's turn takes seconds.
    res.writeHead(200).end('ok');
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return;
    }
    for (const m of messagesOf(payload)) handle(m).catch((err) => log(`✗ ${(err as Error).message}`));
  });
});

server.listen(PORT, '127.0.0.1', () => log(`wa inbox listening on 127.0.0.1:${PORT}`));
