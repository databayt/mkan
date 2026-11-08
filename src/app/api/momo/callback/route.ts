import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { settleByReference } from "@/lib/momo/share";

/**
 * MTN MoMo Request-to-Pay callback. MTN PUTs here when a prompt is answered. The body is NOT trusted —
 * it only says which request to re-read from MTN (share.ts settleByReference), which marks the deal
 * paid once. Always 200 so MTN doesn't retry-storm; an unknown reference is a no-op.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { referenceId?: unknown } | null;
  const ref = request.nextUrl.searchParams.get("ref") ?? (typeof body?.referenceId === "string" ? body.referenceId : null);
  let result = "ignored";
  if (ref && UUID.test(ref)) {
    try {
      result = await settleByReference(ref.toLowerCase());
    } catch (error) {
      logger.error("momo:callback", error);
      result = "error";
    }
  }
  return NextResponse.json({ ok: true, result });
}

export const PUT = handle;
export const POST = handle;
