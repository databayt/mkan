import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { rateLimitWithFallback, rateLimitResponse } from '@/lib/rate-limit';

// ImageKit authentication endpoint
// This generates authentication parameters for client-side uploads
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rl = await rateLimitWithFallback(request, 'upload');
    if (!rl.success) {
      return rateLimitResponse('Too many upload auth requests');
    }

    // Check if user is authenticated
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get ImageKit configuration
    const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;

    if (!publicKey || !privateKey || !urlEndpoint) {
      console.error('ImageKit configuration missing');
      return NextResponse.json(
        { error: 'Upload service not configured' },
        { status: 500 }
      );
    }

    // Generate authentication parameters
    const token = crypto.randomBytes(16).toString('hex');
    const expire = Math.floor(Date.now() / 1000) + 2400; // 40 minutes
    
    const signature = crypto
      .createHmac('sha1', privateKey)
      .update(`${token}${expire}`)
      .digest('hex');

    return NextResponse.json({
      token,
      expire,
      signature,
      publicKey,
      urlEndpoint,
    });
  } catch (error) {
    console.error('Upload auth error:', error);
    return NextResponse.json(
      { error: 'Failed to generate upload credentials' },
      { status: 500 }
    );
  }
}