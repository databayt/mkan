/**
 * What the agent remembers, and how the ☰ list names and groups chats — the
 * pure parts, with no database.
 */
import { describe, expect, it } from 'vitest';
import { coerceMemory, emptyMemory, mergeMemory, sanitizeNote, MAX_IDS, MAX_NOTES } from '@/components/agent/memory';
import { chatGroup, groupChats } from '@/components/agent/chat-list';
import { chatTitle } from '@/components/agent/chips';

const at = (iso: string) => new Date(iso).toISOString();

describe('memory', () => {
  it('reads garbage as an empty memory instead of failing the turn', () => {
    expect(coerceMemory(null)).toEqual(emptyMemory());
    expect(coerceMemory('nope')).toEqual(emptyMemory());
    const m = coerceMemory({ prefs: { maxPrice: { value: 500_000, at: 'not a date' }, bedrooms: { value: 2, at: at('2026-10-01') } }, liked: [3, '4', -1, 'x', 3] });
    expect(m.prefs.maxPrice).toBeUndefined();
    expect(m.prefs.bedrooms).toEqual({ value: 2, at: at('2026-10-01'), source: 'said' });
    expect(m.liked).toEqual([3, 4]);
  });

  it('merges two browsers: the newest value of each field wins, lists are unioned', () => {
    const phone = { ...emptyMemory(), prefs: { maxPrice: { value: 400_000, at: at('2026-10-01'), source: 'said' as const }, bedrooms: { value: 2, at: at('2026-10-05'), source: 'said' as const } }, liked: [1, 2], notes: [{ id: 'a', text: 'Works near Kigali Heights', at: at('2026-10-01') }] };
    const laptop = { ...emptyMemory(), prefs: { maxPrice: { value: 600_000, at: at('2026-10-09'), source: 'tapped' as const } }, liked: [2, 3], notes: [{ id: 'b', text: 'works near kigali heights', at: at('2026-10-02') }, { id: 'c', text: 'Has a cat', at: at('2026-10-03') }] };
    const m = mergeMemory(phone, laptop);
    expect(m.prefs.maxPrice?.value).toBe(600_000);
    expect(m.prefs.bedrooms?.value).toBe(2);
    expect(m.liked).toEqual([1, 2, 3]);
    // The same fact said twice is kept once (the newer wording).
    expect(m.notes.map((n) => n.text)).toEqual(['Has a cat', 'works near kigali heights']);
  });

  it('caps what it keeps', () => {
    const many = { ...emptyMemory(), seen: Array.from({ length: 150 }, (_, i) => i + 1), notes: Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, text: `fact ${i}`, at: at(`2026-10-0${(i % 9) + 1}`) })) };
    const more = { ...emptyMemory(), seen: Array.from({ length: 150 }, (_, i) => i + 500), notes: Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, text: `other ${i}`, at: at(`2026-09-1${i}`) })) };
    const m = mergeMemory(many, more);
    expect(m.seen).toHaveLength(MAX_IDS);
    expect(m.notes).toHaveLength(MAX_NOTES);
  });

  it('never keeps a phone number or an email in a note', () => {
    expect(sanitizeNote('Call me on +250 788 123 456 any time')).toBe('Call me on any time');
    expect(sanitizeNote('my email is jo@example.com')).toBe('my email is');
    expect(sanitizeNote('Moving with 2 kids in 3 weeks')).toBe('Moving with 2 kids in 3 weeks');
    expect(sanitizeNote('0788123456')).toBeNull();
  });
});

describe('chat list', () => {
  const now = new Date(2026, 9, 21, 15, 0); // Oct 21, 15:00 local

  it('groups by the viewer\'s own days', () => {
    expect(chatGroup(new Date(2026, 9, 21, 0, 5).toISOString(), now)).toBe('today');
    expect(chatGroup(new Date(2026, 9, 20, 23, 59).toISOString(), now)).toBe('yesterday');
    expect(chatGroup(new Date(2026, 9, 15, 12).toISOString(), now)).toBe('week');
    expect(chatGroup(new Date(2026, 9, 13, 12).toISOString(), now)).toBe('older');
  });

  it('keeps the newest-first order inside each group and skips empty groups', () => {
    const rows = [
      { id: 'a', updatedAt: new Date(2026, 9, 21, 14).toISOString() },
      { id: 'b', updatedAt: new Date(2026, 9, 21, 9).toISOString() },
      { id: 'c', updatedAt: new Date(2026, 8, 1).toISOString() },
    ];
    expect(groupChats(rows, now)).toEqual([
      { group: 'today', rows: [rows[0], rows[1]] },
      { group: 'older', rows: [rows[2]] },
    ]);
  });
});

describe('chat titles', () => {
  const a = { req: { beds: '{n} bedrooms', long: 'Long stay', short: 'Short stay', maxMonth: 'Up to {price} a month' }, chat: { untitled: 'New search' } } as never;
  const money = (n: number) => `RWF ${n.toLocaleString('en')}`;

  it('names a chat by what was searched, not by the stay type alone', () => {
    expect(chatTitle({ title: 'hi', requirements: { stay: 'long', district: 'KICUKIRO', bedrooms: 2, maxPrice: 500_000, pricePeriod: 'month' } }, a, 'en', money)).toBe('Kicukiro · 2 bedrooms · Up to RWF 500,000 a month');
  });

  it('falls back to the first words, then to a generic name', () => {
    expect(chatTitle({ title: 'something quiet near town', requirements: { stay: 'long' } }, a, 'en', money)).toBe('something quiet near town');
    expect(chatTitle({ title: null, requirements: null }, a, 'en', money)).toBe('New search');
  });
});
