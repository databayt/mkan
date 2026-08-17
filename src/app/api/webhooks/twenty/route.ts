import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Twenty CRM Webhook Handler (Epic G1 - Real-Time Two-Way Sync).
 *
 * Listens for events from Twenty CRM (mkan workspace) and updates the
 * Mkan Postgres database in real time:
 *
 *   - `home.updated`: Price changes, publish state overrides, delisting signals
 *   - `opportunity.updated`: Host agreement / claim stage advances
 *   - `host.updated`: Phone & WhatsApp contact verification updates
 */
export async function POST(req: Request) {
  const secret = process.env.TWENTY_WEBHOOK_SECRET;
  const authHeader = req.headers.get('authorization') || req.headers.get('x-twenty-webhook-secret');

  // Verify webhook secret if configured in production
  if (secret && authHeader !== secret && authHeader !== `Bearer ${secret}`) {
    logger.warn('twenty_webhook_unauthorized', { authHeader: Boolean(authHeader) });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { event, object, action, record } = body ?? {};
  logger.info('twenty_webhook_received', { event, object, action, recordId: record?.id });

  if (!record) {
    return NextResponse.json({ error: 'missing_record' }, { status: 400 });
  }

  try {
    // ── 1. Home Events (Pricing, Status, De-listing) ────────────────────────
    if (object === 'home' || event?.startsWith('home.')) {
      const airbnbListingId = record.airbnbListingId || record.sourceListingId;
      const mkanListingId = record.mkanListingId ? Number(record.mkanListingId) : null;

      // Find listing in Mkan DB
      const listing = mkanListingId
        ? await db.listing.findUnique({ where: { id: mkanListingId } })
        : airbnbListingId
          ? await db.listing.findFirst({ where: { sourceListingId: String(airbnbListingId) } })
          : null;

      if (!listing) {
        logger.warn('twenty_webhook_home_not_found', { mkanListingId, airbnbListingId });
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

      // Price update: only if operator confirmed price or if listing had no price
      if (record.priceConfirmedByHost && record.priceNightSdg?.amountMicros != null) {
        updates.pricePerNight = Math.round(record.priceNightSdg.amountMicros / 1_000_000);
      }

      // Publish state override from CRM
      if (record.mkanPublishState === 'LIVE' && listing.claimedAt != null) {
        updates.isPublished = true;
        updates.lastAvailabilityConfirmedAt = new Date();
      } else if (record.mkanPublishState === 'UNPUBLISHED') {
        updates.isPublished = false;
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
    if (object === 'host' || event?.startsWith('host.')) {
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
    if (object === 'opportunity' || event?.startsWith('opportunity.')) {
      const stage = record.onboardingStage || record.stage;
      const hostId = record.hostId;

      if (stage === 'CLAIMED' || stage === 'AGREED') {
        logger.info('twenty_webhook_deal_advanced', { hostId, stage });
      }

      return NextResponse.json({ received: true, stage });
    }

    return NextResponse.json({ received: true, unhandled: true });
  } catch (error) {
    logger.error('twenty_webhook_error', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
