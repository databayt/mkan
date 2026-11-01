/**
 * Whether the Mkan line messages brokers, and which numbers are the team's own
 * (src/components/agent/broker-sends.ts). Flips a WaState row — no deploy, and
 * the Worker reads it on its next 2-minute pass.
 *
 *   pnpm wa:brokers                       status: the mode, the team numbers, today's broker sends
 *   pnpm wa:brokers off   [--note="…"]    nothing reaches a broker; tenants' picks become #mkan cards
 *   pnpm wa:brokers gated [--note="…"]    real WhatsApp tenants' picks ask the broker, within each broker's budget
 *   pnpm wa:brokers test add +250…        a team number: its chats run, its picks never reach a broker
 *   pnpm wa:brokers test remove +250…
 */
import { config } from "dotenv";
config({ override: true });
import { startOfKigaliDay } from "./outbox-pure";

const args = process.argv.slice(2);
const note = args.find((a) => a.startsWith("--note="))?.slice(7);
const by = process.env.USER || "cli";

async function main() {
  // After the env: the db client reads DATABASE_URL when it is first imported.
  const { db } = await import("../../src/lib/db");
  const { brokerSendMode, setBrokerSendMode, setTestPhones, testPhones } = await import("../../src/components/agent/broker-sends");
  try {
    const [cmd, sub, phone] = args.filter((a) => !a.startsWith("--"));
    if (cmd === "off" || cmd === "gated") {
      await setBrokerSendMode(cmd, by, note);
      console.log(`broker sends → ${cmd.toUpperCase()}`);
    } else if (cmd === "test" && (sub === "add" || sub === "remove") && phone) {
      const digits = phone.replace(/\D/g, "");
      const now = await testPhones();
      if (sub === "add") now.add(digits);
      else now.delete(digits);
      await setTestPhones([...now]);
    } else if (cmd && cmd !== "status") {
      console.error("usage: pnpm wa:brokers [status | off | gated | test add <number> | test remove <number>] [--note=…]");
      process.exitCode = 2;
      return;
    }

    const kinds = { in: ["BROKER_REQUEST" as const, "BROKER_ASK" as const] };
    const [mode, tests, today, queued, week, row] = await Promise.all([
      brokerSendMode(),
      testPhones(),
      db.outboundMessage.count({ where: { status: "SENT", kind: kinds, sentAt: { gte: startOfKigaliDay(new Date()) } } }),
      db.outboundMessage.count({ where: { status: "QUEUED", kind: kinds } }),
      db.outboundMessage.groupBy({
        by: ["to"],
        where: { status: "SENT", kind: kinds, sentAt: { gte: new Date(Date.now() - 7 * 86_400_000) }, NOT: { label: { startsWith: "auto-" } } },
        _count: true,
      }),
      db.waState.findUnique({ where: { key: "broker-sends" }, select: { value: true, updatedAt: true } }),
    ]);
    console.log(`broker sends: ${mode.toUpperCase()}${row ? ` (set ${row.updatedAt.toISOString().slice(0, 16)}Z ${JSON.stringify(row.value)})` : " (no row — off by default)"}`);
    console.log(`team numbers: ${tests.size ? [...tests].map((p) => `+${p}`).join(", ") : "none"}`);
    console.log(`broker messages today: ${today} sent · ${queued} queued`);
    console.log(`last 7 days: ${week.reduce((n, g) => n + g._count, 0)} asks to ${week.length} brokers (max ${Math.max(0, ...week.map((g) => g._count))} to one)`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
