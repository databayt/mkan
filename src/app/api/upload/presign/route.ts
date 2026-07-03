import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildUploadKey, presignUpload, isS3Configured } from "@/lib/s3";
import { rateLimitWithFallback, rateLimitResponse } from "@/lib/rate-limit";

// Mint a short-lived presigned PUT so the browser uploads image bytes directly
// to S3 (served back via CloudFront/cdn.databayt.org). Mirrors hogwarts
// `api/blob/presign`, scoped to images. Bytes never pass through this function.

const ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/jpg", "image/png"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB (pre-optimization ceiling)

export async function POST(request: NextRequest) {
  const rl = await rateLimitWithFallback(request, "upload");
  if (!rl.success) return rateLimitResponse("Too many upload requests");

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isS3Configured()) {
    return NextResponse.json(
      { error: "Uploads are not configured (S3 credentials missing)." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { contentType, size } = body as { contentType?: string; size?: number };

  if (!contentType || !ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: `Invalid content type: ${contentType ?? "missing"}` },
      { status: 400 },
    );
  }
  if (typeof size === "number" && size > MAX_SIZE) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  const ext = contentType.split("/")[1] || "webp";
  const key = buildUploadKey(session.user.id, ext);
  const result = await presignUpload({ key, contentType });
  if (!result) {
    return NextResponse.json(
      { error: "Uploads are not configured." },
      { status: 503 },
    );
  }

  return NextResponse.json(result);
}
