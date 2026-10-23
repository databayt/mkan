/**
 * Who a chat belongs to: an anonymous browser, merged into the account on
 * sign-in, and closed to the next person after sign-out. The cookie jar, the
 * session and the two tables are in-memory fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

type Profile = { id: string; keyHash: string | null; userId: string | null; memory: unknown; lastSearchAt: Date | null };
type Task = { id: string; profileId: string | null; sessionKey: string | null };

const state = { cookie: null as string | null, sets: 0, userId: null as string | null, profiles: [] as Profile[], tasks: [] as Task[], seq: 0 };
const today = Math.floor(Date.now() / 86_400_000);
/** The cookie's key: `<uuid>.<issue day>` → the uuid. */
const keyOf = (cookie: string) => cookie.split('.')[0]!;
const hash = (k: string) => createHash('sha256').update(k).digest('hex');
const pick = (p: Profile) => ({ id: p.id, userId: p.userId, memory: p.memory, lastSearchAt: p.lastSearchAt });
const findBy = (where: { keyHash?: string; userId?: string }) =>
  state.profiles.find((p) => (where.keyHash !== undefined ? p.keyHash === where.keyHash : p.userId === where.userId)) ?? null;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (state.cookie ? { value: state.cookie } : undefined),
    set: (_name: string, value: string) => {
      state.cookie = value;
      state.sets++;
    },
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: async () => (state.userId ? { user: { id: state.userId } } : null) }));
vi.mock('@/lib/db', () => ({
  db: {
    agentProfile: {
      findUnique: async ({ where }: { where: { keyHash?: string; userId?: string } }) => {
        const p = findBy(where);
        return p ? pick(p) : null;
      },
      upsert: async ({ where, create }: { where: { keyHash?: string; userId?: string }; create: Partial<Profile> }) => {
        let p = findBy(where);
        if (!p) {
          p = { id: `p${++state.seq}`, keyHash: null, userId: null, memory: null, lastSearchAt: null, ...create };
          state.profiles.push(p);
        }
        return pick(p);
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Profile> }) => {
        const p = state.profiles.find((x) => x.id === where.id)!;
        Object.assign(p, data);
        return pick(p);
      },
      deleteMany: async ({ where }: { where: { id: string } }) => {
        state.profiles = state.profiles.filter((p) => p.id !== where.id);
        return { count: 1 };
      },
    },
    agentTask: {
      count: async ({ where }: { where: { sessionKey: string; profileId: null } }) =>
        state.tasks.filter((t) => t.sessionKey === where.sessionKey && t.profileId === null).length,
      updateMany: async ({ where, data }: { where: Partial<Task>; data: Partial<Task> }) => {
        const hit = state.tasks.filter((t) =>
          where.sessionKey !== undefined ? t.sessionKey === where.sessionKey && t.profileId === null : t.profileId === where.profileId,
        );
        hit.forEach((t) => Object.assign(t, data));
        return { count: hit.length };
      },
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

const { resolveViewer, ownedBy } = await import('@/components/agent/profile');

beforeEach(() => {
  Object.assign(state, { cookie: null, sets: 0, userId: null, profiles: [], tasks: [], seq: 0 });
});

describe('agent profiles', () => {
  it('a page render (read) never creates a profile or a cookie', async () => {
    const v = await resolveViewer({ write: false });
    expect(v).toEqual({ profile: null, ids: [], legacyKey: null });
    expect(state.cookie).toBeNull();
    expect(state.profiles).toHaveLength(0);
  });

  it('a first send gives the browser a cookie and an anonymous profile, stored only as a hash', async () => {
    const v = await resolveViewer({ write: true });
    expect(state.cookie).toBeTruthy();
    expect(state.profiles).toEqual([expect.objectContaining({ keyHash: hash(keyOf(state.cookie!)), userId: null })]);
    expect(v.ids).toEqual([v.profile!.id]);
  });

  it('adopts chats from before profiles, keyed by the raw cookie', async () => {
    state.cookie = 'legacy-key';
    state.tasks = [{ id: 't1', profileId: null, sessionKey: 'legacy-key' }, { id: 't2', profileId: null, sessionKey: 'someone-else' }];
    const v = await resolveViewer({ write: true });
    expect(state.tasks[0]).toEqual({ id: 't1', profileId: v.profile!.id, sessionKey: null });
    expect(state.tasks[1]!.profileId).toBeNull();
  });

  it('signing in folds this browser into the account and merges memory', async () => {
    state.profiles = [
      { id: 'mine', keyHash: null, userId: 'u1', memory: { prefs: { bedrooms: { value: 3, at: '2026-10-01T00:00:00.000Z' } } }, lastSearchAt: null },
      { id: 'anon', keyHash: hash('k'), userId: null, memory: { prefs: { bedrooms: { value: 2, at: '2026-10-09T00:00:00.000Z' } }, liked: [9] }, lastSearchAt: new Date('2026-10-09') },
    ];
    state.tasks = [{ id: 't1', profileId: 'anon', sessionKey: null }];
    state.cookie = 'k';
    state.userId = 'u1';
    const v = await resolveViewer({ write: true });
    expect(v.profile!.id).toBe('mine');
    expect(state.profiles.map((p) => p.id)).toEqual(['mine']);
    expect(state.tasks[0]!.profileId).toBe('mine');
    const memory = state.profiles[0]!.memory as { prefs: { bedrooms: { value: number } }; liked: number[] };
    expect(memory.prefs.bedrooms.value).toBe(2);
    expect(memory.liked).toEqual([9]);
  });

  it('before the merge runs, a signed-in read can still open this browser\'s chats', async () => {
    state.profiles = [
      { id: 'mine', keyHash: null, userId: 'u1', memory: null, lastSearchAt: null },
      { id: 'anon', keyHash: hash('k'), userId: null, memory: null, lastSearchAt: null },
    ];
    state.cookie = 'k';
    state.userId = 'u1';
    const v = await resolveViewer({ write: false });
    expect(v.ids.sort()).toEqual(['anon', 'mine']);
    expect(state.profiles).toHaveLength(2);
  });

  it('after sign-out the account\'s chats are closed, and a write gives the browser a fresh start', async () => {
    state.profiles = [{ id: 'mine', keyHash: hash('k'), userId: 'u1', memory: null, lastSearchAt: null }];
    state.cookie = 'k';
    const read = await resolveViewer({ write: false });
    expect(read).toEqual({ profile: null, ids: [], legacyKey: null });
    const write = await resolveViewer({ write: true });
    expect(state.cookie).not.toBe('k');
    expect(write.profile!.id).not.toBe('mine');
    expect(write.ids).toEqual([write.profile!.id]);
  });

  it('a second send leaves the cookie alone, so Next does not re-render the page into the action', async () => {
    await resolveViewer({ write: true });
    const first = state.cookie;
    await resolveViewer({ write: true });
    expect(state.sets).toBe(1);
    expect(state.cookie).toBe(first);
  });

  it('a cookie a month old is rolled for another year, keeping its key', async () => {
    state.profiles = [{ id: 'p', keyHash: hash('k'), userId: null, memory: null, lastSearchAt: null }];
    state.cookie = `k.${(today - 31).toString(36)}`;
    const v = await resolveViewer({ write: true });
    expect(state.sets).toBe(1);
    expect(state.cookie).toBe(`k.${today.toString(36)}`);
    expect(v.profile!.id).toBe('p');
  });

  it('a cookie from before the stamp is stamped once, keeping its key and its chats', async () => {
    state.profiles = [{ id: 'p', keyHash: hash('k'), userId: null, memory: null, lastSearchAt: null }];
    state.cookie = 'k';
    const v = await resolveViewer({ write: true });
    expect(keyOf(state.cookie!)).toBe('k');
    expect(v.profile!.id).toBe('p');
    expect(v.legacyKey).toBe('k');
    await resolveViewer({ write: true });
    expect(state.sets).toBe(1);
  });

  it('ownership: a viewer with nothing owns nothing', () => {
    expect(ownedBy({ profile: null, ids: [], legacyKey: null })).toEqual({ id: '__none__' });
    expect(ownedBy({ profile: null, ids: ['p1'], legacyKey: 'k' })).toEqual({ OR: [{ profileId: { in: ['p1'] } }, { sessionKey: 'k', profileId: null }] });
  });
});
