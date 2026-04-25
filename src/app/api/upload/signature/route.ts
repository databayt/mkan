import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateUploadSignature, getImageKitConfig, IMAGE_UPLOAD_CONFIG } from "@/lib/imagekit";
import { rateLimitWithFallback, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Returns a signed upload token for direct-to-ImageKit uploads from the
 * browser. The signature is short-lived (~40 min) and scoped to a file name
 * + folder combination so a leaked token can only be used once for its
 * intended destination.
 */
export async function POST(request: NextRequest) {
  try {
    const rl = await rateLimitWithFallback(request, "upload");
    if (!rl.success) return rateLimitResponse("Too many upload signature requests");

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { fileName?: string; folder?: string };
    const fileName = body.fileName;
    const folder = body.folder ?? IMAGE_UPLOAD_CONFIG.folders.listings;
    if (!fileName) {
      return NextResponse.json({ error: "fileName required" }, { status: 400 });
    }

    const config = getImageKitConfig();
    if (!config.publicKey || !config.privateKey || !config.urlEndpoint) {
      return NextResponse.json(
        { error: "Upload not configured" },
        { status: 503 }
      );
    }

    const { signature, expire, token } = await generateUploadSignature(fileName, folder);

    return NextResponse.json({
      signature,
      expire,
      token,
      publicKey: config.publicKey,
      urlEndpoint: config.urlEndpoint,
      folder,
    });
  } catch (error) {
    console.error("Upload signature error:", error);
    return NextResponse.json({ error: "Failed to sign upload" }, { status: 500 });
  }
}
