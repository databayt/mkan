import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { validateImageFile } from '@/lib/imagekit';
import { rateLimitWithFallback, rateLimitResponse } from '@/lib/rate-limit';

// Handle image upload completion
// This is called after successful upload to ImageKit
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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { fileId, url, filePath, listingId, type = 'listing' } = body;

    if (!fileId || !url || !filePath) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Store image reference based on type
    if (type === 'listing' && listingId) {
      // Update listing with new image
      const listing = await db.listing.findUnique({
        where: { id: parseInt(listingId) },
        select: { hostId: true, photoUrls: true },
      });

      // Verify ownership
      if (listing?.hostId !== session.user.id) {
        return NextResponse.json(
          { error: 'Unauthorized to update this listing' },
          { status: 403 }
        );
      }

      // Add image to listing
      const updatedListing = await db.listing.update({
        where: { id: parseInt(listingId) },
        data: {
          photoUrls: {
            push: url,
          },
        },
      });

      return NextResponse.json({
        success: true,
        data: updatedListing,
      });
    } else if (type === 'profile') {
      // Update user profile image
      const updatedUser = await db.user.update({
        where: { id: session.user.id },
        data: {
          image: url,
        },
      });

      return NextResponse.json({
        success: true,
        data: updatedUser,
      });
    }

    return NextResponse.json({
      success: true,
      data: { fileId, url, filePath },
    });
  } catch (error) {
    console.error('Upload handler error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
}

// Delete uploaded image
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    const listingId = searchParams.get('listingId');
    const imageUrl = searchParams.get('url');

    if (!fileId || !imageUrl) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // If listing ID provided, remove from listing
    if (listingId) {
      const listing = await db.listing.findUnique({
        where: { id: parseInt(listingId) },
        select: { hostId: true, photoUrls: true },
      });

      // Verify ownership
      if (listing?.hostId !== session.user.id) {
        return NextResponse.json(
          { error: 'Unauthorized to update this listing' },
          { status: 403 }
        );
      }

      // Remove image from listing
      const updatedPhotoUrls = listing.photoUrls.filter(url => url !== imageUrl);
      
      await db.listing.update({
        where: { id: parseInt(listingId) },
        data: {
          photoUrls: updatedPhotoUrls,
        },
      });
    }

    // TODO: Call ImageKit API to delete the actual file
    // This requires server-side ImageKit SDK

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