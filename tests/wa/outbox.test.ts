/**
 * The Mac sender's outbox policy, driven by a fake clock. Numbers are made up
 * (+250 700 000 0xx) — the repo is public.
 */
import { describe, expect, it } from 'vitest';
import {
  type OutboxRow,
  brokerRest,
  dailyCap,
  inSendWindow,
  isOptOut,
  kigaliDay,
  messageText,
  planOutbox,
  randomGapMs,
  recipientKey,
  senderPhone,
  startOfKigaliDay,
} from '../../scripts/wa/outbox-pure';

/** A Kigali wall-clock time (UTC+2) as the UTC instant it is. */
const kigali = (iso: string) => new Date(`${iso}+02:00`);

let n = 0;
const row = (over: Partial<OutboxRow> = {}): OutboxRow => {
  n += 1;
  return { id: `m${n}`, kind: 'BROKER_ASK', to: `+25070000000${n % 10}`, brokerId: `b${n}`, createdAt: kigali('2026-10-21T07:00:00'), ...over };
};

const base = (rows: OutboxRow[], over: Partial<Parameters<typeof planOutbox>[0]> = {}) =>
  planOutbox({ now: kigali('2026-10-21T10:00:00'), rows, sentToday: 0, lastSentAt: new Map(), optedOutBrokers: new Set(), cap: 40, ...over });

describe('wa outbox — Kigali clock', () => {
  it('opens at 08:00 and closes at 20:00 Kigali time', () => {
    expect(inSendWindow(kigali('2026-10-21T07:59:59'))).toBe(false);
    expect(inSendWindow(kigali('2026-10-21T08:00:00'))).toBe(true);
    expect(inSendWindow(kigali('2026-10-21T19:59:59'))).toBe(true);
    expect(inSendWindow(kigali('2026-10-21T20:00:00'))).toBe(false);
    // 06:30 UTC is 08:30 in Kigali.
    expect(inSendWindow(new Date('2026-10-21T06:30:00Z'))).toBe(true);
  });

  it('starts the day at Kigali midnight, not UTC midnight', () => {
    expect(startOfKigaliDay(kigali('2026-10-21T01:00:00')).toISOString()).toBe('2026-10-20T22:00:00.000Z');
    expect(kigaliDay(new Date('2026-10-20T22:30:00Z'))).toBe('2026-10-21');
    expect(kigaliDay(new Date('2026-10-20T21:59:00Z'))).toBe('2026-10-20');
  });

  it('waits 20–60 s between sends', () => {
    expect(randomGapMs(() => 0)).toBe(20_000);
    expect(randomGapMs(() => 0.999999)).toBe(60_000);
    for (let i = 0; i < 200; i++) {
      const g = randomGapMs();
      expect(g).toBeGreaterThanOrEqual(20_000);
      expect(g).toBeLessThanOrEqual(60_000);
    }
  });

  it('reads the cap from MKAN_WA_DAILY_CAP, 40 by default', () => {
    expect(dailyCap(undefined)).toBe(40);
    expect(dailyCap('80')).toBe(80);
    expect(dailyCap('nonsense')).toBe(40);
    expect(dailyCap('0')).toBe(40);
  });
});

describe('wa outbox — plan', () => {
  it('holds everything outside 08:00–20:00', () => {
    const rows = [row(), row({ kind: 'TENANT_ALERT', brokerId: null })];
    const plan = base(rows, { now: kigali('2026-10-21T21:15:00') });
    expect(plan.send).toEqual([]);
    expect(plan.hold.map((h) => h.reason)).toEqual(['quiet-hours', 'quiet-hours']);
  });

  it('sends oldest first up to the daily cap, counting what already went today', () => {
    const rows = Array.from({ length: 6 }, () => row());
    const plan = base(rows, { sentToday: 37, cap: 40 });
    expect(plan.send.map((r) => r.id)).toEqual(rows.slice(0, 3).map((r) => r.id));
    expect(plan.hold.every((h) => h.reason === 'daily-cap')).toBe(true);
    expect(base(rows, { sentToday: 40, cap: 40 }).send).toEqual([]);
  });

  it('sends one message per broker number per Kigali day, whatever kind of ask', () => {
    const a1 = row({ brokerId: 'A', to: '+250700000011' });
    const a2 = row({ brokerId: null, kind: 'BROKER_REQUEST', to: '+250700000011' });
    const b1 = row({ brokerId: 'B', to: '+250700000012' });
    const plan = base([a1, a2, b1]);
    expect(plan.send.map((r) => r.id)).toEqual([a1.id, b1.id]);
    expect(plan.hold).toEqual([{ row: a2, reason: 'broker-today' }]);
  });

  it('remembers numbers sent to earlier today, and forgets yesterday', () => {
    const r = row({ brokerId: 'A', to: '+250700000013' });
    const today = base([r], { lastSentAt: new Map([[recipientKey(r), kigali('2026-10-21T08:30:00')]]) });
    expect(today.hold).toEqual([{ row: r, reason: 'broker-today' }]);
    const yesterday = base([r], { lastSentAt: new Map([[recipientKey(r), kigali('2026-10-20T19:30:00')]]) });
    expect(yesterday.send).toEqual([r]);
  });

  it('skips a broker ask that waited too long, never a tenant alert', () => {
    const old = row({ createdAt: kigali('2026-10-20T15:00:00') });
    const alert = row({ kind: 'TENANT_ALERT', brokerId: null, createdAt: kigali('2026-10-20T15:00:00') });
    const plan = base([old, alert]);
    expect(plan.skip).toEqual([{ row: old, reason: 'stale' }]);
    expect(plan.send).toEqual([alert]);
  });

  it('skips every broker row while broker sends are off; tenant alerts still go', () => {
    const ask = row();
    const alert = row({ kind: 'TENANT_ALERT', brokerId: null });
    const plan = base([ask, alert], { brokerSendsOff: true });
    expect(plan.skip).toEqual([{ row: ask, reason: 'sends-off' }]);
    expect(plan.send).toEqual([alert]);
  });

  it('holds an ask for a broker who is resting', () => {
    const r = row({ to: '+250700000014' });
    const plan = base([r], { resting: new Map([['250700000014', 'broker-resting']]) });
    expect(plan.hold).toEqual([{ row: r, reason: 'broker-resting' }]);
  });

  it('caps a row without a broker by its number', () => {
    const x1 = row({ brokerId: null, kind: 'BROKER_REQUEST', to: '+250 700 000 077' });
    const x2 = row({ brokerId: null, kind: 'BROKER_REQUEST', to: '250700000077' });
    expect(recipientKey(x1)).toBe(recipientKey(x2));
    expect(base([x1, x2]).send).toEqual([x1]);
  });

  it('lets tenant alerts through the per-broker rule, but counts them toward the total', () => {
    const t1 = row({ kind: 'TENANT_ALERT', brokerId: null, to: '+250700000099' });
    const t2 = row({ kind: 'TENANT_ALERT', brokerId: null, to: '+250700000099' });
    const b = row({ brokerId: 'B' });
    const plan = base([t1, t2, b], { cap: 2 });
    expect(plan.send).toEqual([t1, t2]);
    expect(plan.hold).toEqual([{ row: b, reason: 'daily-cap' }]);
  });

  it('skips opted-out brokers at any hour, by id or by number, never a tenant alert', () => {
    const byId = row({ brokerId: 'gone' });
    const byPhone = row({ brokerId: null, kind: 'BROKER_REQUEST', to: '+250700000055' });
    const alert = row({ kind: 'TENANT_ALERT', brokerId: null, to: '+250700000055' });
    const plan = base([byId, byPhone, alert], {
      now: kigali('2026-10-21T23:00:00'),
      optedOutBrokers: new Set(['gone']),
      optedOutPhones: new Set(['250700000055']),
    });
    expect(plan.skip.map((s) => s.row)).toEqual([byId, byPhone]);
    expect(plan.hold).toEqual([{ row: alert, reason: 'quiet-hours' }]);
  });
});

describe('wa outbox — replies', () => {
  it.each(['STOP', 'stop', '  Stop  ', 'stop.', 'HAGARIKA', 'hagarika!', 'ARRÊTE', 'arrête', 'ARRETE', 'Unsubscribe'])('%s opts out', (t) => {
    expect(isOptOut(t)).toBe(true);
  });

  it.each(['stop by tomorrow?', 'I have a 2 bed', 'no stop', '', null])('%s does not', (t) => {
    expect(isOptOut(t)).toBe(false);
  });

  it('reads text from plain, extended and captioned messages', () => {
    expect(messageText({ conversation: ' STOP ' })).toBe('STOP');
    expect(messageText({ extendedTextMessage: { text: 'yes I have one' } })).toBe('yes I have one');
    expect(messageText({ imageMessage: { caption: '350k Kicukiro' } })).toBe('350k Kicukiro');
    expect(messageText(null)).toBe('');
  });

  it('finds the sender number, preferring the phone over a lid, ignoring groups', () => {
    expect(senderPhone({ remoteJid: '250700000011@s.whatsapp.net' })).toBe('250700000011');
    expect(senderPhone({ remoteJid: '123456789@lid', remoteJidAlt: '250700000012@s.whatsapp.net' })).toBe('250700000012');
    expect(senderPhone({ remoteJid: '123456789@lid' })).toBeNull();
    expect(senderPhone({ remoteJid: '120363000000000000@g.us' })).toBeNull();
  });
});

describe("broker bursts", () => {
  it("reads an album and its caption as one reply per broker", async () => {
    const { groupByPhone, isImage } = await import("../../scripts/wa/outbox-pure");
    const items = [
      { id: "1", phone: "250700000011", text: "", image: true, type: "imageMessage" },
      { id: "2", phone: "250700000011", text: "", image: true, type: "imageMessage" },
      { id: "3", phone: "250700000011", text: "Kibagabaga\n2 bedrooms\nPrice: 300k", image: false, type: "conversation" },
      { id: "4", phone: "250700000017", text: "How much?", image: false, type: "conversation" },
      { id: "5", phone: null, text: "group noise", image: false, type: "conversation" },
    ];
    const groups = groupByPhone(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ phone: "250700000011", imageIds: ["1", "2"], text: "Kibagabaga\n2 bedrooms\nPrice: 300k" });
    expect(isImage({ imageMessage: {} })).toBe(true);
    expect(isImage({ conversation: "hi" }, "conversation")).toBe(false);
  });
});

describe('wa outbox — a broker is never pestered', () => {
  const now = kigali('2026-11-01T10:00:00');
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);

  it('caps asks at three a week', () => {
    expect(brokerRest([ago(2), ago(30), ago(60)], ago(1), now)).toBe('broker-week');
    expect(brokerRest([ago(2), ago(30), ago(24 * 8)], ago(1), now)).toBeNull();
  });

  it('rests a broker for two weeks after two asks in a row went unanswered (11-01: "you keep sending sending??")', () => {
    expect(brokerRest([ago(2), ago(30)], null, now)).toBe('broker-resting');
    expect(brokerRest([ago(2), ago(30)], ago(40), now)).toBe('broker-resting');
    // They answered the older ask: only the newest is still open.
    expect(brokerRest([ago(2), ago(30)], ago(20), now)).toBeNull();
    // The rest ends two weeks after the last ask.
    expect(brokerRest([ago(24 * 15), ago(24 * 16)], null, now)).toBeNull();
    expect(brokerRest([ago(2)], null, now)).toBeNull();
  });
});

describe('wa outbox — opting out in a sentence', () => {
  it.each(['stop', 'STOP!', 'Please stop', 'stop sending me these', "don't message me again", 'you keep sending sending??', 'Leave me alone', 'wrong number', 'Ntimwongere', 'Sinshaka', 'Arrêtez de m’écrire'])('"%s" opts out', (t) => {
    expect(isOptOut(t.replace('’', "'"))).toBe(true);
  });
  it.each(['stop by tomorrow at 3', 'Yes it is available', 'When can you stop by to see it?', 'Price 300k, no stopping fee'])('"%s" does not', (t) => {
    expect(isOptOut(t)).toBe(false);
  });
});
