/**
 * Route-level wiring tests for the Twenty webhook.
 *
 * `twenty-webhook.test.ts` proves the parser and the HMAC in isolation. This
 * file proves the ROUTE actually uses them: that it reads the raw body rather
 * than a re-parsed object, reads the right header names, and dispatches to the
 * right branch. A wiring mistake in any of those would leave the module tests
 * green and the endpoint just as dead as it was before — which is exactly the
 * failure this whole fix exists to close, so it deserves its own coverage.
 *
 * The database is mocked, so nothing here touches Neon.
 */
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listingFindFirst = vi.fn();
const listingFindUnique = vi.fn();
const listingUpdate = vi.fn();
const userFindFirst = vi.fn();
const userFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    listing: { findFirst: listingFindFirst, findUnique: listingFindUnique, update: listingUpdate },
    user: { findFirst: userFindFirst, findUnique: userFindUnique, update: vi.fn() },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const SECRET = 'route-test-secret';

async function post(body: string, opts: { sign?: boolean; secret?: string } = {}) {
  process.env.TWENTY_WEBHOOK_SECRET = opts.secret === undefined ? SECRET : opts.secret;
  const { POST } = await import('@/app/api/webhooks/twenty/route');
  const ts = String(Date.now());
  let sig = createHmac('sha256', SECRET).update(`${ts}:${body}`).digest('hex');
  if (opts.sign === false) sig = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
  const req = new Request('https://mk.databayt.org/api/webhooks/twenty', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-twenty-webhook-timestamp': ts,
      'x-twenty-webhook-signature': sig,
    },
    body,
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}

const homeUpdated = JSON.stringify({
  eventName: 'home.updated',
  objectMetadata: { id: 'o1', nameSingular: 'home' },
  workspaceId: 'w1',
  webhookId: 'wh1',
  eventDate: '2026-08-18T11:00:00.000Z',
  record: { id: 'r1', airbnbListingId: 'AB-1', stillListed: false },
  updatedFields: ['stillListed'],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('POST /api/webhooks/twenty', () => {
  it('accepts a signed delivery and reaches the home branch', async () => {
    listingFindFirst.mockResolvedValue({ id: 42, claimedAt: null });
    listingUpdate.mockResolvedValue({});
    const { status, json } = await post(homeUpdated);
    expect(status).toBe(200);
    expect(json.matched).toBe(true);
    expect(json.listingId).toBe(42);
    // stillListed:false must unpublish — proof the branch body ran, not just the guard
    expect(listingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42 }, data: expect.objectContaining({ isPublished: false }) }),
    );
  });

  it('reports matched:false when the listing is unknown, without writing', async () => {
    listingFindFirst.mockResolvedValue(null);
    const { status, json } = await post(homeUpdated);
    expect(status).toBe(200);
    expect(json.matched).toBe(false);
    expect(listingUpdate).not.toHaveBeenCalled();
  });

  it('THE BUG: the old {event,object,action} shape is refused, not answered 200', async () => {
    const old = JSON.stringify({
      event: 'home.updated',
      object: 'home',
      action: 'updated',
      record: { id: 'r1', airbnbListingId: 'AB-1' },
    });
    const { status, json } = await post(old);
    expect(status).toBe(400);
    expect(json.error).toBe('unrecognized_payload');
    expect(listingFindFirst).not.toHaveBeenCalled();
  });

  it('refuses a tampered signature before touching the database', async () => {
    const { status } = await post(homeUpdated, { sign: false });
    expect(status).toBe(401);
    expect(listingFindFirst).not.toHaveBeenCalled();
  });

  it('THE BUG: refuses everything when no secret is configured', async () => {
    const { status, json } = await post(homeUpdated, { secret: '' });
    expect(status).toBe(401);
    expect(json.reason).toBe('no_secret_configured');
    expect(listingFindFirst).not.toHaveBeenCalled();
  });

  it('dispatches host events to the host branch', async () => {
    userFindFirst.mockResolvedValue({ id: 'u1', phoneNumber: null });
    const hostUpdated = JSON.stringify({
      eventName: 'host.updated',
      objectMetadata: { id: 'o2', nameSingular: 'host' },
      record: { id: 'h1', airbnbHostId: 'H-1', phone: { primaryPhoneNumber: '+249912345678' } },
    });
    const { status, json } = await post(hostUpdated);
    expect(status).toBe(200);
    expect(json.userId).toBe('u1');
  });
});
