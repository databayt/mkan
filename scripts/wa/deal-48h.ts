/**
 * The 48-hour rule's switch (src/components/agent/deal-48h.ts). OFF by default.
 *
 *   pnpm wa:deal48h            status
 *   pnpm wa:deal48h on         broker "available" → the tenant gets the deal sheet within the hour, one nudge at 24 h
 *   pnpm wa:deal48h off
 */
import { config } from "dotenv";
config({ override: true });

import { refuseUnattended } from "../unattended";

async function main() {
  const [cmd] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (cmd === "on") refuseUnattended("turning the 48-hour deal-sheet rule on");
  const { db } = await import("../../src/lib/db");
  const { deal48hOn, setDeal48h } = await import("../../src/components/agent/deal-48h");
  try {
    if (cmd === "on" || cmd === "off") await setDeal48h(cmd === "on", process.env.USER || "cli");
    else if (cmd && cmd !== "status") {
      console.error("usage: pnpm wa:deal48h [status | on | off]");
      process.exitCode = 2;
      return;
    }
    console.log(`48-hour rule: ${(await deal48hOn()) ? "ON" : "OFF"}`);
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
