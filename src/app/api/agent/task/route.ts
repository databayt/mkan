import { NextResponse, type NextRequest } from "next/server";
import { pollTask, sessionKey } from "@/components/agent/task-view";

export const dynamic = "force-dynamic";

/**
 * The rental agent's poll (src/components/agent/use-agent-task.ts).
 * `?id=` the task, `?v=` the version the client holds. 204 when nothing
 * changed, 404 when the task is not this browser's, else the task view.
 */
export async function GET(req: NextRequest) {
  const key = await sessionKey(false);
  const id = req.nextUrl.searchParams.get("id");
  if (!key || !id) return new NextResponse(null, { status: 404 });
  const result = await pollTask(key, id, req.nextUrl.searchParams.get("v"));
  if (result === "same") return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (!result) return new NextResponse(null, { status: 404 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
