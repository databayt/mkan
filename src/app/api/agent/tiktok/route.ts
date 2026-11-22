import { NextResponse, type NextRequest } from "next/server";
import { ackTikTok, answerTikTok, MAX_LINES } from "@/components/agent/tiktok-chat";
import { ttAllowed } from "@/components/agent/tiktok-auth";
import type { TtLine } from "@/components/agent/tiktok-channel-pure";

/**
 * POST /api/agent/tiktok — the rental agent for TikTok DMs. The Mac's `pnpm tt:inbox` (scripts/crm/tiktok-inbox.ts)
 * reads @mkan.rw's inbox in the session-vault Chrome and posts each handle's new lines here; the reply comes back
 * as text for it to type (tiktok-chat.ts).
 *
 *   { handle, lines: [{ id, text, at, videoId? }] }  →  { reply, why?, taskId?, ackId? }
 *   { handle, ack: ["tt-<id>"], text? }              →  { ok: true }   (the reply was typed: settle it)
 *
 * Guarded by the `x-mkan-tt-secret` header: MKAN_TT_SECRET, else MKAN_WA_BRIDGE_SECRET (the Mac already holds it).
 * No secret configured = closed.
 */
export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;

export async function POST(request: NextRequest) {
  if (!ttAllowed(request.headers.get("x-mkan-tt-secret"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: { handle?: unknown; lines?: unknown; ack?: unknown; text?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const handle = typeof body.handle === "string" ? body.handle : "";
  if (Array.isArray(body.ack)) {
    await ackTikTok(handle, body.ack.filter((x): x is string => typeof x === "string"), typeof body.text === "string" ? body.text : undefined);
    return NextResponse.json({ ok: true });
  }
  const lines: TtLine[] = (Array.isArray(body.lines) ? body.lines : [])
    .slice(-MAX_LINES)
    .map((l: Record<string, unknown>) => ({ id: String(l?.id ?? ""), text: typeof l?.text === "string" ? l.text : "", at: typeof l?.at === "string" ? l.at : new Date().toISOString(), videoId: typeof l?.videoId === "string" ? l.videoId : null }))
    .filter((l) => l.id && (l.text || l.videoId));
  const res = await answerTikTok({ handle, lines });
  return NextResponse.json(res, { status: res.why === "bad-handle" ? 400 : 200 });
}
