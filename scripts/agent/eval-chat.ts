/**
 * pnpm agent:eval-chat — the whole-conversation eval (docs/chat-funnel.md). Real tenant chats (tests/agent/fixtures/
 * real-chats.json: 18 WhatsApp threads with both sides, 28 web chats with the tenant's side) scored by deterministic
 * checks (scripts/agent/eval-chat-score.ts).
 *
 *   --baseline   score what the OLD line actually sent (no network, no database, free). Default.
 *   --replay     feed every fixture's tenant turns through the bot's turn function and score the NEW replies.
 *   --only=<id>  one fixture (a fixture id, or a tag); --verbose prints each failed check's detail.
 *   --print      (replay) each chat's tenant turns and the new bot replies, interleaved, photos shown as [photo: caption].
 *   --driver=on|off  sets MKAN_DRIVER for the replay (default: the environment's; the conversational driver, docs/chat-funnel.md).
 *   --json       machine-readable output.
 *
 * --replay writes AgentProfile / AgentTask / AgentEvent rows, so it refuses to run against the production
 * database. It needs EVAL_DATABASE_URL: a Neon branch of production (a copy: it needs the listings), e.g.
 *     neon branches create ... → EVAL_DATABASE_URL="postgresql://…@ep-…-pooler…/neondb?sslmode=require" pnpm agent:eval-chat --replay
 * and refuses when that is the same database as DATABASE_URL in .env. How it stays harmless:
 *   - one made-up number per fixture (+250 720 0099xx), put on the team's test list of that branch, so a pick
 *     reaches no broker (broker-sends.ts) — the same trick as scripts/agent/wa-e2e.ts;
 *   - ./e2e-locks: MKAN_WA_OUTBOX=0 (every WhatsApp send is written SKIPPED), no Slack token, and a fetch guard
 *     that refuses Slack, WhatsApp and Evolution hosts outright. Nothing is ever sent to a person;
 *   - its chats and profiles are deleted from the branch afterwards (--keep leaves them for a look).
 * The model calls (reader, writer) are real and billed to the `agent-eval` lane: ~46 chats ≈ 150 turns, cents.
 * AGENT_ANTHROPIC_API_KEY comes from the Keychain as in agent:eval-writer. Web chats are replayed through the
 * same WhatsApp turn function (one brain behind both doors); their cards are read as the text WhatsApp gets.
 */
import "./e2e-locks";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aggregate, baselineTranscript, CHECKS, scoreChat, type Aggregate, type ChatFixture, type ChatScore, type Msg } from "./eval-chat-score";

const FIXTURE = join(__dirname, "..", "..", "tests", "agent", "fixtures", "real-chats.json");
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const replay = flag("replay");
const verbose = flag("verbose");
const print = flag("print");
const driverArg = args.find((a) => a.startsWith("--driver="))?.slice(9);
if (driverArg) process.env.MKAN_DRIVER = driverArg;

function loadFixtures(): ChatFixture[] {
  const all = JSON.parse(readFileSync(FIXTURE, "utf8")) as ChatFixture[];
  return only ? all.filter((f) => f.id === only || f.tags.includes(only) || f.channel === only) : all;
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%`.padStart(4) : " n/a");

function table(title: string, agg: Aggregate): string {
  const rows = CHECKS.map((c) => {
    const { passed, applicable } = agg.perCheck[c];
    return `  ${c.padEnd(18)} ${String(passed).padStart(3)}/${String(applicable).padEnd(3)} ${pct(passed, applicable)}  ${"█".repeat(applicable ? Math.round((10 * passed) / applicable) : 0).padEnd(10, "░")}`;
  });
  return `${title} (${agg.threads} chats)\n  ${"check".padEnd(18)} ${"pass".padEnd(7)} rate\n${rows.join("\n")}\n  ${"OVERALL".padEnd(18)} ${(agg.overall * 100).toFixed(1)}%  (mean of each chat's applicable checks)`;
}

function failures(fixtures: ChatFixture[], scores: ChatScore[]): string {
  const lines: string[] = [];
  fixtures.forEach((f, i) => {
    const bad = CHECKS.filter((c) => scores[i].checks[c].pass === false);
    if (!bad.length) return;
    lines.push(`  ${f.id.padEnd(14)} ${(scores[i].score * 100).toFixed(0).padStart(3)}%  ${bad.join(", ")}`);
    if (verbose) for (const c of bad) lines.push(`      ${c}: ${scores[i].checks[c].detail ?? ""}`);
  });
  return lines.join("\n");
}

function baseline(fixtures: ChatFixture[]) {
  // Web chats kept only the card kind and a snippet of the reply, not the reply: nothing to score for them.
  const scoreable = fixtures.filter((f) => !f.oldBotTruncated && (f.timeline || f.oldBotReplies.length));
  const scores = scoreable.map((f) => scoreChat(baselineTranscript(f), f));
  const agg = aggregate(scores);
  if (flag("json")) {
    console.log(JSON.stringify({ mode: "baseline", fixtures: fixtures.length, scored: scoreable.length, ...agg, perChat: scoreable.map((f, i) => ({ id: f.id, score: scores[i].score })) }, null, 2));
    return;
  }
  console.log(`baseline — the old line's real replies, ${scoreable.length} of ${fixtures.length} chats scoreable (the rest are web chats, which kept no reply text)\n`);
  console.log(table("OLD BOT", agg));
  console.log(`\nchats with a failed check:\n${failures(scoreable, scores) || "  none"}`);
}

// ── --replay ─────────────────────────────────────────────────────────────────

function hostOf(url: string | undefined): string | null {
  try {
    const u = new URL((url ?? "").trim().replace(/^"|"$/g, ""));
    return `${u.hostname.replace(/-pooler/, "")}${u.pathname}`;
  } catch {
    return null;
  }
}

/** The branch only: refuses anything that is, or might be, the production database. */
function evalDatabase(): string {
  const url = process.env.EVAL_DATABASE_URL?.trim();
  if (!url) {
    console.error(`--replay writes chats (profiles, tasks, events), so it will not touch the production database.

  1. Branch production in Neon (a copy — it needs the listings):  neon branches create --name eval-chat  (or the console)
  2. Run it against the branch:

       EVAL_DATABASE_URL="postgresql://…/neondb?sslmode=require" pnpm agent:eval-chat --replay

  Nothing is sent to anyone either way (see the header of scripts/agent/eval-chat.ts). For the free check of the
  old line's replies, run:  pnpm agent:eval-chat --baseline`);
    process.exit(2);
  }
  const prod = hostOf(process.env.DATABASE_URL);
  const target = hostOf(url);
  if (!target || !/^postgres(ql)?:\/\//.test(url)) {
    console.error("EVAL_DATABASE_URL is not a postgres URL.");
    process.exit(2);
  }
  if (target === prod || (prod && target.split("/")[0] === prod.split("/")[0])) {
    console.error(`EVAL_DATABASE_URL points at the same Neon endpoint as DATABASE_URL (${target.split("/")[0]}). That is production, or a copy that shares its endpoint. Use a branch with its own endpoint.`);
    process.exit(2);
  }
  return url;
}

const fakeDigits = (i: number) => `2507200099${String(i).padStart(2, "0")}`;

async function replayAll(fixtures: ChatFixture[]) {
  const url = evalDatabase();
  // e2e-locks loaded .env with override; the branch wins from here, before any src module reads the environment.
  process.env.DATABASE_URL = url;
  delete process.env.DIRECT_URL;
  process.env.AGENT_TURN_DEADLINE_MS ??= "60000";
  // The branch's own ledger: the production month cap (15) and daily pacing (2x the month's share) would stop a full replay.
  process.env.AGENT_API_CAP_USD ??= "300";
  process.env.MKAN_INTRO_CAP = "0";
  if (!process.env.AGENT_ANTHROPIC_API_KEY) {
    try {
      process.env.AGENT_ANTHROPIC_API_KEY = execFileSync("security", ["find-generic-password", "-s", "mkan-ANTHROPIC_API_KEY", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      console.warn("  ! no Anthropic key: the reader and writer fall back to their rules, so these replies are not the shipped ones.");
    }
  }
  const { db } = await import("../../src/lib/db");
  const { hashKey } = await import("../../src/components/agent/profile");
  const { setTestPhones, testPhones } = await import("../../src/components/agent/broker-sends");
  const { handleTenantWhatsApp } = await import("../../src/components/agent/whatsapp-chat");
  console.log(`replay against ${hostOf(url)?.split("/")[0]} (EVAL_DATABASE_URL) · outbox off · sends blocked\n`);

  const spendNow = async () => {
    const rows = await db.apiSpend.findMany({ where: { lane: { startsWith: "agent-" } }, select: { lane: true, usd: true, calls: true } });
    const by = new Map<string, { usd: number; calls: number }>();
    for (const r of rows) {
      const x = by.get(r.lane) ?? { usd: 0, calls: 0 };
      by.set(r.lane, { usd: x.usd + Number(r.usd), calls: x.calls + Number(r.calls) });
    }
    return by;
  };
  const spendBefore = await spendNow().catch(() => new Map<string, { usd: number; calls: number }>());
  const numbers = fixtures.map((_, i) => fakeDigits(i));
  const prior = await testPhones();
  await setTestPhones([...prior, ...numbers]);
  const RUN = `evalchat-${Date.now().toString(36)}`;
  const cleanup = async () => {
    for (const d of numbers) {
      const profile = await db.agentProfile.findUnique({ where: { keyHash: hashKey(`wa:${d}`) }, select: { id: true, waPhone: true } });
      if (!profile || profile.waPhone !== `+${d}`) continue; // only the made-up numbers' own rows
      const ids = (await db.agentTask.findMany({ where: { profileId: profile.id }, select: { id: true } })).map((t) => t.id);
      await db.brokerRequest.deleteMany({ where: { taskId: { in: ids } } }).catch(() => {});
      await db.agentEvent.deleteMany({ where: { taskId: { in: ids } } }).catch(() => {});
      await db.tenantRequest.deleteMany({ where: { taskId: { in: ids } } }).catch(() => {});
      await db.agentTask.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
      await db.agentProfile.deleteMany({ where: { id: profile.id } }).catch(() => {});
      await db.outboundMessage.deleteMany({ where: { to: { in: [`+${d}`, d] } } }).catch(() => {});
      await db.waState.deleteMany({ where: { key: { contains: d } } }).catch(() => {});
    }
    await db.waState.deleteMany({ where: { key: { startsWith: `tmsg:${RUN}` } } }).catch(() => {});
    await setTestPhones([...prior]).catch(() => {});
  };

  const transcripts: Msg[][] = [];
  try {
    if (!flag("keep")) await cleanup(); // residue of an interrupted run
    for (let i = 0; i < fixtures.length; i++) {
      const f = fixtures[i];
      const msgs: Msg[] = [];
      let n = 0;
      if (print) console.log(`── ${f.id} (${f.lang}) ──────────────────────────────`);
      for (const text of f.tenantTurns) {
        msgs.push({ role: "tenant", text });
        const r = await handleTenantWhatsApp({ phone: numbers[i], text, msgId: `${RUN}-${i}-${++n}` });
        if ("done" in r && r.done) await r.done;
        // The turn may outlive its reply; the next message needs it settled.
        const taskId = "taskId" in r ? r.taskId : null;
        for (let k = 0; taskId && k < 30; k++) {
          const s = await db.agentTask.findUnique({ where: { id: taskId }, select: { status: true } });
          if (s?.status !== "RUNNING") break;
          await new Promise((res) => setTimeout(res, 2_000));
        }
        if (r.reply) msgs.push({ role: "bot", text: r.reply });
        if (print) {
          console.log(`  [tenant] ${text}`);
          if (r.reply) console.log(`  [bot]    ${r.reply.replace(/\n/g, "\n           ")}`);
          else console.log(`  [bot]    (no reply: ${"why" in r ? r.why : "none"})`);
          for (const m of "media" in r && r.media ? r.media : []) console.log(`           [photo: ${m.caption.replace(/\n/g, " · ")}]`);
        }
      }
      transcripts.push(msgs);
      process.stdout.write(`  ${f.id.padEnd(14)} ${msgs.filter((m) => m.role === "bot").length} replies\n`);
      if (print) console.log("");
    }
  } finally {
    const spendAfter = await spendNow().catch(() => new Map<string, { usd: number; calls: number }>());
    for (const [lane, v] of spendAfter) {
      const b = spendBefore.get(lane) ?? { usd: 0, calls: 0 };
      if (v.calls > b.calls) console.log(`  spend ${lane}: $${(v.usd - b.usd).toFixed(4)} over ${v.calls - b.calls} calls`);
    }
    if (!flag("keep")) await cleanup();
    await db.$disconnect();
  }

  const scores = fixtures.map((f, i) => scoreChat(transcripts[i], f));
  const agg = aggregate(scores);
  if (flag("json")) {
    console.log(JSON.stringify({ mode: "replay", ...agg, perChat: fixtures.map((f, i) => ({ id: f.id, score: scores[i].score })) }, null, 2));
    return;
  }
  console.log(`\n${table("NEW BOT", agg)}`);
  // The same fixtures on the old line, for a like-for-like column.
  const old = fixtures.filter((f) => !f.oldBotTruncated && (f.timeline || f.oldBotReplies.length));
  if (old.length) console.log(`\n${table("OLD BOT, same chats where replies were kept", aggregate(old.map((f) => scoreChat(baselineTranscript(f), f))))}`);
  console.log(`\nchats with a failed check:\n${failures(fixtures, scores) || "  none"}`);
}

async function main() {
  const fixtures = loadFixtures();
  if (!fixtures.length) {
    console.error(`no fixture matches --only=${only}`);
    process.exit(2);
  }
  if (replay) await replayAll(fixtures);
  else baseline(fixtures);
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
