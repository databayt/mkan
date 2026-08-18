/**
 * Regression tests for the two defects that made the Twenty webhook a silent
 * no-op from the day it was written until 2026-08-18.
 *
 * Both failures were invisible from either end: the handler answered HTTP 200
 * for every delivery while processing none of them, and Twenty logged each one
 * as successfully delivered. Nothing short of reading the payload shape would
 * have surfaced it, which is exactly why these assertions exist.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  MAX_TIMESTAMP_SKEW_MS,
  parseTwentyEvent,
  verifyTwentySignature,
} from '@/lib/twenty-webhook';

const SECRET = 'test-secret-do-not-use';

const sign = (rawBody: string, timestamp: string, secret = SECRET) =>
  createHmac('sha256', secret).update(`${timestamp}:${rawBody}`).digest('hex');

/** A real delivery shape, verified against the fork's webhook-job-data.type.ts. */
const realDelivery = {
  targetUrl: 'https://mkan.sd/api/webhooks/twenty',
  eventName: 'home.updated',
  objectMetadata: { id: '370985db-22d8-4463-8e5f-2271d30913bd', nameSingular: 'home' },
  workspaceId: '872cfcf1-c79f-42bc-877d-5829f06eb3f9',
  webhookId: '90056586-1228-4e03-a507-70140aa85c05',
  eventDate: '2026-08-18T11:27:01.779Z',
  record: { id: 'abc', airbnbListingId: '12345', stillListed: false },
  updatedFields: ['stillListed'],
};

describe('parseTwentyEvent — defect #1: the payload shape', () => {
  it('reads a real Twenty delivery', () => {
    const evt = parseTwentyEvent(realDelivery);
    expect(evt).not.toBeNull();
    expect(evt!.object).toBe('home');
    expect(evt!.action).toBe('updated');
    expect(evt!.eventName).toBe('home.updated');
    expect(evt!.updatedFields).toEqual(['stillListed']);
    expect(evt!.record.airbnbListingId).toBe('12345');
  });

  it('prefers objectMetadata.nameSingular over splitting eventName', () => {
    const evt = parseTwentyEvent({
      ...realDelivery,
      eventName: 'weird.name.updated',
      objectMetadata: { id: 'x', nameSingular: 'opportunity' },
    });
    expect(evt!.object).toBe('opportunity');
    expect(evt!.action).toBe('updated');
  });

  it('THE BUG: the old { event, object, action } shape yields nothing', () => {
    // This is precisely what the handler used to read. Twenty never sent it, so
    // the correct answer is null — and the route must return 400, not 200.
    const evt = parseTwentyEvent({
      event: 'home.updated',
      object: 'home',
      action: 'updated',
      record: { id: 'abc' },
    });
    expect(evt).toBeNull();
  });

  it('rejects a body with no record', () => {
    expect(parseTwentyEvent({ ...realDelivery, record: undefined })).toBeNull();
  });

  it('rejects junk', () => {
    expect(parseTwentyEvent(null)).toBeNull();
    expect(parseTwentyEvent('nope')).toBeNull();
    expect(parseTwentyEvent({})).toBeNull();
  });
});

describe('verifyTwentySignature — defect #2: the auth check', () => {
  const rawBody = JSON.stringify(realDelivery);
  const now = 1_760_000_000_000;
  const timestamp = String(now);

  it('accepts a correctly signed delivery', () => {
    const r = verifyTwentySignature({
      rawBody,
      signature: sign(rawBody, timestamp),
      timestamp,
      secret: SECRET,
      now,
    });
    expect(r.ok).toBe(true);
  });

  it('THE BUG: refuses to accept when no secret is configured', () => {
    // The old check accepted ANY request when TWENTY_WEBHOOK_SECRET was unset,
    // which meant an unauthenticated caller could drive listing publish state.
    const r = verifyTwentySignature({
      rawBody,
      signature: sign(rawBody, timestamp),
      timestamp,
      secret: undefined,
      now,
    });
    expect(r).toEqual({ ok: false, reason: 'no_secret_configured' });
  });

  it('rejects a tampered body', () => {
    const good = sign(rawBody, timestamp);
    const tampered = rawBody.replace('"stillListed":false', '"stillListed":true');
    const r = verifyTwentySignature({
      rawBody: tampered,
      signature: good,
      timestamp,
      secret: SECRET,
      now,
    });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a signature made with the wrong secret', () => {
    const r = verifyTwentySignature({
      rawBody,
      signature: sign(rawBody, timestamp, 'wrong'),
      timestamp,
      secret: SECRET,
      now,
    });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a replayed delivery past the skew window', () => {
    const old = String(now - MAX_TIMESTAMP_SKEW_MS - 1000);
    const r = verifyTwentySignature({
      rawBody,
      signature: sign(rawBody, old),
      timestamp: old,
      secret: SECRET,
      now,
    });
    expect(r).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('rejects the Authorization header the old code expected', () => {
    // Twenty sends X-Twenty-Webhook-Signature, never Authorization. Passing the
    // bare secret as a signature must not authenticate.
    const r = verifyTwentySignature({
      rawBody,
      signature: SECRET,
      timestamp,
      secret: SECRET,
      now,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects missing headers', () => {
    expect(
      verifyTwentySignature({ rawBody, signature: null, timestamp, secret: SECRET, now }),
    ).toEqual({ ok: false, reason: 'missing_signature_headers' });
  });
});
