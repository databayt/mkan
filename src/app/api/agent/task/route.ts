import { NextResponse, type NextRequest } from "next/server";
import { resolveViewer } from "@/components/agent/profile";
import { pollTask } from "@/components/agent/task-view";

export const dynamic = "force-dynamic";

/**
 * The rental agent's poll (src/components/agent/use-agent-task.ts).
 * `?id=` the task, `?v=` the version the client holds. 204 when nothing
 * changed, 404 when the task is not this viewer's, else the task view.
 * A read: it never sets the cookie or creates a profile.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return new NextResponse(null, { status: 404 });
  const viewer = await resolveViewer({ write: false });
  if (viewer.ids.length === 0 && !viewer.legacyKey) return new NextResponse(null, { status: 404 });
  const result = await pollTask(viewer, id, req.nextUrl.searchParams.get("v"));
  if (result === "same") return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (!result) return new NextResponse(null, { status: 404 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
