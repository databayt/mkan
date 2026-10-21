import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { coerceMemory } from "@/components/agent/memory";
import { AGENT_COOKIE, resolveViewer } from "@/components/agent/profile";
import type { AgentChatRow, AgentChatsView } from "@/components/agent/types";

export const dynamic = "force-dynamic";

const PAGE = 30;

/**
 * The ☰ sheet: this viewer's chats, newest first, 30 at a time
 * (`?before=<updatedAt>` for the next page), plus what the agent remembers.
 * A browser that has a cookie resolves as a write, so its chats from before
 * profiles are adopted and a just-signed-in account folds this browser in.
 */
export async function GET(req: NextRequest) {
  const hasCookie = !!(await cookies()).get(AGENT_COOKIE)?.value;
  const viewer = await resolveViewer({ write: hasCookie });
  const empty: AgentChatsView = { chats: [], next: null, signedIn: !!viewer.profile?.userId, memory: null };
  if (viewer.ids.length === 0) return NextResponse.json(empty, { headers: { "Cache-Control": "no-store" } });

  const beforeParam = req.nextUrl.searchParams.get("before");
  const before = beforeParam && !Number.isNaN(Date.parse(beforeParam)) ? new Date(beforeParam) : null;
  const rows = await db.$queryRaw<
    { id: string; title: string | null; requirements: Prisma.JsonValue; updatedAt: Date; status: AgentChatRow["status"]; homes: number; confirmed: boolean }[]
  >`
    SELECT t.id, t.title, t.requirements, t."updatedAt", t.status::text AS status,
      COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(t.shortlist) = 'array' THEN t.shortlist END), 0)::int AS homes,
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.shortlist) = 'array' THEN t.shortlist ELSE '[]'::jsonb END) s
        WHERE s->>'availability' = 'confirmed'
      ) AS confirmed
    FROM "AgentTask" t
    WHERE t."profileId" IN (${Prisma.join(viewer.ids)})
      ${before ? Prisma.sql`AND t."updatedAt" < ${before}` : Prisma.empty}
    ORDER BY t."updatedAt" DESC
    LIMIT ${PAGE + 1}`;

  const chats: AgentChatRow[] = rows.slice(0, PAGE).map((r) => ({
    id: r.id,
    title: r.title,
    requirements: (r.requirements as AgentChatRow["requirements"]) ?? null,
    updatedAt: r.updatedAt.toISOString(),
    status: r.status,
    homes: r.homes,
    confirmed: r.confirmed,
  }));
  const view: AgentChatsView = {
    chats,
    next: rows.length > PAGE ? chats.at(-1)!.updatedAt : null,
    signedIn: !!viewer.profile?.userId,
    memory: viewer.profile ? coerceMemory(viewer.profile.memory) : null,
  };
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
