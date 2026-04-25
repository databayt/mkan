import { NextRequest, NextResponse } from "next/server";
import { markOverduePayments } from "@/lib/actions/payment-actions";

/**
 * Daily cron — flips Pending payments past their due date to Overdue.
 * Gated by `CRON_SECRET` so only Vercel's cron (or a manual curl with the
 * right Bearer token) can invoke it. Vercel sets the `x-vercel-cron`
 * header on scheduled invocations; we accept either that or the Bearer
 * token so local/manual runs work too.
 *
 * Schedule lives in `vercel.json` at `0 2 * * *` (02:00 UTC daily).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  const isVercelCron = request.headers.has("x-vercel-cron");

  if (!isVercelCron) {
    if (!expected || authHeader !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await markOverduePayments();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
