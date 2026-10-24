import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { handleTenantWhatsApp, silenceTenant } from "@/components/agent/whatsapp-chat";

/**
 * The rental agent's WhatsApp door. Only the Mac bridge calls it
 * (scripts/wa/inbox-server.ts and the fallback poll in scripts/wa/outbox.ts),
 * with `Authorization: Bearer $MKAN_WA_BRIDGE_SECRET`: the Worker cannot reach
 * the WhatsApp session, so the Mac brings each tenant message here and sends
 * back the reply this returns. `{ stop: true }` is a tenant's STOP.
 */
export const dynamic = "force-dynamic";

function unauthorized(request: NextRequest): boolean {
  const expected = process.env.MKAN_WA_BRIDGE_SECRET?.trim();
  if (!expected) return true;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${expected}`);
  return !(given.length === wanted.length && timingSafeEqual(given, wanted));
}

export async function POST(request: NextRequest) {
  if (unauthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { phone?: unknown; text?: unknown; msgId?: unknown; stop?: unknown } | null;
  const phone = typeof body?.phone === "string" ? body.phone : "";
  const msgId = typeof body?.msgId === "string" ? body.msgId.slice(0, 128) : "";
  if (!/\d{8,15}/.test(phone.replace(/[^\d]/g, "")) || !msgId) return NextResponse.json({ error: "phone and msgId required" }, { status: 400 });
  if (body?.stop === true) {
    await silenceTenant(phone);
    return NextResponse.json({ reply: null, why: "stopped" });
  }
  const text = typeof body?.text === "string" ? body.text : "";
  try {
    return NextResponse.json(await handleTenantWhatsApp({ phone, text, msgId }));
  } catch (err) {
    console.error("[agent/whatsapp]", err);
    return NextResponse.json({ error: "turn failed" }, { status: 500 });
  }
}
