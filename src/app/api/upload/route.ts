import { NextRequest, NextResponse } from 'next/server';
import { auth, canOverride } from '@/lib/auth';
import { db } from '@/lib/db';
import { deleteObjectByUrl } from '@/lib/s3';
import { rateLimitWithFallback, rateLimitResponse } from '@/lib/rate-limit';

// Attach an uploaded image URL to a listing (or profile). The bytes were
// already PUT directly to S3 via a presigned URL (see /api/upload/presign);
// this endpoint only records the resulting CloudFront/CDN URL.
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rl = await rateLimitWithFallback(request, 'upload');
    if (!rl.success) {
      return rateLimitResponse('Too many upload requests');
    }

    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { url, listingId, type = 'listing' } = body as {
      url?: string;
      key?: string;
      listingId?: number | string;
      type?: string;
    };

    if (!url) {
      return NextResponse.json({ error: 'Missing image url' }, { status: 400 });
    }

    // Store image reference based on type
    if (type === 'listing' && listingId) {
      const listing = await db.listing.findUnique({
        where: { id: parseInt(String(listingId)) },
        select: { hostId: true, photoUrls: true },
      });

      // Verify ownership (admins bypass)
      if (!listing || !canOverride(session, listing.hostId)) {
        return NextResponse.json(
          { error: 'Unauthorized to update this listing' },
          { status: 403 }
        );
      }

      const updatedListing = await db.listing.update({
        where: { id: parseInt(String(listingId)) },
        data: { photoUrls: { push: url } },
      });

      return NextResponse.json({ success: true, data: updatedListing });
    } else if (type === 'profile') {
      const updatedUser = await db.user.update({
        where: { id: session.user.id },
        data: { image: url },
      });

      return NextResponse.json({ success: true, data: updatedUser });
    }

    return NextResponse.json({ success: true, data: { url } });
  } catch (error) {
    console.error('Upload handler error:', error);
    return NextResponse.json({ error: 'Failed to process upload' }, { status: 500 });
  }
}

// Remove an uploaded image from a listing + best-effort delete from S3.
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get('listingId');
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Missing required parameter: url' },
        { status: 400 }
      );
    }

    // If listing ID provided, remove from listing
    if (listingId) {
      const listing = await db.listing.findUnique({
        where: { id: parseInt(listingId) },
        select: { hostId: true, photoUrls: true },
      });

      // Verify ownership (admins bypass)
      if (!listing || !canOverride(session, listing.hostId)) {
        return NextResponse.json(
          { error: 'Unauthorized to update this listing' },
          { status: 403 }
        );
      }

      const updatedPhotoUrls = listing.photoUrls.filter(u => u !== imageUrl);
      await db.listing.update({
        where: { id: parseInt(listingId) },
        data: { photoUrls: updatedPhotoUrls },
      });
    }

    // Best-effort S3 delete — guarded to the `uploads/` prefix inside
    // deleteObjectByUrl, so shared `stock/` images can never be removed.
    // No-ops when S3 is unconfigured.
    await deleteObjectByUrl(imageUrl);

    return NextResponse.json({
      success: true,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    console.error('Delete image error:', error);
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    );
  }
}
