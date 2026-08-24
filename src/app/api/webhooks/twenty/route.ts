import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { parseTwentyEvent, verifyTwentySignature } from '@/lib/twenty-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Twenty CRM Webhook Handler (Epic G1 - Real-Time Two-Way Sync).
 *
 * Listens for events from Twenty CRM (mkan workspace) and updates the
 * Mkan Postgres database in real time:
 *
 *   - `home.updated`: Price changes, publish state overrides, delisting signals
 *   - `host.updated`: Phone & WhatsApp contact verification updates
 *   - `opportunity.updated`: Host agreement / claim stage advances
 *
 * FIXED 2026-08-18: this handler had never processed a single event. It read
 * `body.event` / `body.object` / `body.action`, none of which Twenty sends, so
 * every branch guard compared `undefined` and every delivery fell through to a
 * cheerful `{ received: true, unhandled: true }` with HTTP 200. Its auth check
 * was wrong in the other direction — an `Authorization` header Twenty does not
 * send, so a configured secret 401'd every real delivery and an unset one left
 * the endpoint open. Parsing and signature verification now live in
 * `@/lib/twenty-webhook`, which has tests. The branch logic below is unchanged.
 *
 * Twenty gives a webhook **5 seconds and no retries**, so each branch does at
 * most one indexed lookup and one single-row update. Anything slower than that
 * belongs behind a queue — a timeout here is a permanently lost event.
 */
export async function POST(req: Request) {
  // The HMAC is over exact bytes, so read the body as text and parse it
  // ourselves. `req.json()` would discard the only representation we can verify.
  const rawBody = await req.text();

  const verdict = verifyTwentySignature({
    rawBody,
    signature: req.headers.get('x-twenty-webhook-signature'),
    timestamp: req.headers.get('x-twenty-webhook-timestamp'),
    secret: process.env.TWENTY_WEBHOOK_SECRET,
  });
  if (!verdict.ok) {
    logger.warn('twenty_webhook_unauthorized', { reason: verdict.reason });
    return NextResponse.json({ error: 'unauthorized', reason: verdict.reason }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const evt = parseTwentyEvent(body);
  if (!evt) {
    // A body we cannot read is a 400. Answering 200 is what let the previous
    // version look healthy while processing nothing.
    logger.warn('twenty_webhook_unparseable', { keys: Object.keys(body ?? {}) });
    return NextResponse.json({ error: 'unrecognized_payload' }, { status: 400 });
  }

  const { object, record, updatedFields } = evt;
  logger.info('twenty_webhook_received', {
    eventName: evt.eventName,
    recordId: record?.id,
    updatedFields,
  });

  try {
    // ── 1. Home / Port Sudan Events (Pricing, Status, Title, Description) ────────
    if (object === 'home' || object === 'portSudan' || object === 'portSudans') {
      const listingIdStr = record.listingId ? String(record.listingId).trim() : null;
      const airbnbListingId = record.airbnbListingId || record.sourceListingId;
      const mkanListingId = record.mkanListingId ? Number(record.mkanListingId) : (listingIdStr && /^\d+$/.test(listingIdStr) ? Number(listingIdStr) : null);
      const pubState = record.publishState ?? record.mkanPublishState;

      // Twenty's `listingId` is the mkan code (`0001-01`). It lived in
      // `sourceListingId` until 2026-08-24 and moved to its own column, so
      // both are tried — the old value is still on 26 rows until the backfill
      // clears them, and a CRM record edited mid-migration must still match.
      const listing = listingIdStr && isNaN(Number(listingIdStr))
        ? await db.listing.findFirst({
            where: { OR: [{ code: listingIdStr }, { sourceListingId: listingIdStr }] },
          })
        : mkanListingId
          ? await db.listing.findUnique({ where: { id: mkanListingId } })
          : airbnbListingId
            ? await db.listing.findFirst({ where: { sourceListingId: String(airbnbListingId) } })
            : null;

      if (!listing) {
        logger.warn('twenty_webhook_home_not_found', { mkanListingId, airbnbListingId, listingIdStr });
        return NextResponse.json({ received: true, matched: false });
      }

      const updates: Record<string, any> = {};

      // If operator manually set trustBandOverride to REJECT -> Unpublish
      if (record.trustBandOverride === 'REJECT') {
        updates.isPublished = false;
      }

      // If source listing was delisted -> Unpublish
      if (record.stillListed === false) {
        updates.isPublished = false;
      }

      // Price update
      if (record.priceNightSdg?.amountMicros != null) {
        updates.pricePerNight = Math.round(record.priceNightSdg.amountMicros / 1_000_000);
      }

      // Title update
      if (record.titleAr || record.name) {
        updates.title = record.titleAr || record.name;
      }

      // Description update
      if (record.descriptionAr || record.description) {
        updates.description = record.descriptionAr || record.description;
      }

      // Publish state override from CRM
      if (pubState === 'LIVE') {
        updates.isPublished = true;
        updates.draft = false;
        updates.lastAvailabilityConfirmedAt = new Date();
      } else if (pubState === 'UNPUBLISHED' || pubState === 'DRAFT') {
        updates.isPublished = false;
        updates.draft = true;
      }

      if (Object.keys(updates).length > 0) {
        await db.listing.update({
          where: { id: listing.id },
          data: updates,
        });
        logger.info('twenty_webhook_home_updated', { listingId: listing.id, updates });
      }

      return NextResponse.json({ received: true, matched: true, listingId: listing.id, updates });
    }

    // ── 2. Host Events (Phone / WhatsApp Verification) ──────────────────────
    if (object === 'host') {
      const airbnbHostId = record.airbnbHostId;
      const mkanUserId = record.mkanUserId;

      const user = mkanUserId
        ? await db.user.findUnique({ where: { id: mkanUserId } })
        : airbnbHostId
          ? await db.user.findFirst({ where: { sourceHostId: String(airbnbHostId) } })
          : null;

      if (user) {
        const phone = record.phone?.primaryPhoneNumber || record.whatsapp?.primaryPhoneNumber;
        if (phone && phone !== user.phoneNumber) {
          await db.user.update({
            where: { id: user.id },
            data: { phoneNumber: phone },
          });
          logger.info('twenty_webhook_host_phone_updated', { userId: user.id, phone });
        }
      }

      return NextResponse.json({ received: true, matched: Boolean(user), userId: user?.id });
    }

    // ── 3. Opportunity Events (Acquisition Pipeline Stage Advances) ─────────
    if (object === 'opportunity') {
      const stage = record.onboardingStage || record.stage;
      const hostId = record.hostId;

      if (stage === 'CLAIMED' || stage === 'AGREED') {
        logger.info('twenty_webhook_deal_advanced', { hostId, stage });
      }

      return NextResponse.json({ received: true, stage });
    }

    // A real object we have no branch for. 200 is correct here — Twenty
    // delivered it fine, we simply do not act on it.
    logger.info('twenty_webhook_unhandled_object', { object, eventName: evt.eventName });
    return NextResponse.json({ received: true, unhandled: true, object });
  } catch (error) {
    logger.error('twenty_webhook_error', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
