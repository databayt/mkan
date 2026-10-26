// mkan watchdog — a separate Worker that watches the /find chatbot and the
// WhatsApp line from outside, so a dead container or a cron that stopped
// firing still reaches a human (the app's own wa-outbox alert is raised by the
// cron it would be reporting on).
//
// Every 5 minutes it runs the checks below. A failure is re-checked a minute
// later; if it holds, it opens one GitHub issue on databayt/mkan (label
// `watchdog`, assigned to abdout → phone push) and posts to #mkan. When every
// check passes again the issue is closed with a note. No storage: the open
// issue is the state.
//
// Secrets (wrangler secret put -c ops/watchdog/wrangler.jsonc):
//   MKAN_WA_BRIDGE_SECRET, MKAN_EVOLUTION_KEY  the /__wa gate + mkan's instance token
//   DATABASE_URL                              read via Neon's HTTP SQL endpoint
//   GITHUB_TOKEN, SLACK_BOT_TOKEN             where alerts go
//   WATCHDOG_TOKEN                            Bearer for GET /run (manual check)

const SITE = "https://www.mkan.sd"
const REPO = "databayt/mkan"
const SLACK_CHANNEL = "C0BS2NZE2AY" // private #mkan
const RECHECK_MS = 60_000
const CRON_STALE_SEC = 600 // the WhatsApp cron runs every 2 min

async function timed(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(20_000), redirect: "manual" })
}

const CHECKS = {
  async find() {
    const res = await timed(`${SITE}/en/find`)
    if (res.status !== 200) throw new Error(`/en/find ${res.status}`)
  },
  async health() {
    const res = await timed(`${SITE}/api/health`)
    const body = await res.json().catch(() => ({}))
    if (res.status !== 200 || body?.checks?.database !== true) throw new Error(`/api/health ${res.status}, database ${body?.checks?.database}`)
  },
  async wa_line(env) {
    const res = await timed(`${SITE}/__wa/instance/connectionState/mkan`, {
      headers: { "x-mkan-wa": env.MKAN_WA_BRIDGE_SECRET, apikey: env.MKAN_EVOLUTION_KEY },
    })
    const state = (await res.json().catch(() => ({})))?.instance?.state
    if (state !== "open") throw new Error(`WhatsApp line ${state ?? `unreachable (${res.status})`}`)
  },
  async wa_cron(env) {
    const host = new URL(env.DATABASE_URL).hostname
    const res = await timed(`https://${host}/sql`, {
      method: "POST",
      headers: { "Neon-Connection-String": env.DATABASE_URL, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `select extract(epoch from now() - "updatedAt")::int as age from "WaState" where key = $1`, params: ["outbox-lease"] }),
    })
    const age = (await res.json().catch(() => ({})))?.rows?.[0]?.age
    if (typeof age !== "number") throw new Error(`WhatsApp cron state unreadable (${res.status})`)
    if (age > CRON_STALE_SEC) throw new Error(`WhatsApp cron last ran ${Math.round(age / 60)} min ago`)
  },
}

const FIX = {
  find: "The site or its container is down — check the mkan Worker (wrangler tail mkan) and redeploy if it is stuck.",
  health: "The app can't reach its database — check Neon project solitary-water-49503410.",
  wa_line: "The WhatsApp link dropped — in /Users/abdout/mkan run `pnpm wa:pair` and scan the QR from the +250780984777 phone (WhatsApp Business → Linked devices).",
  wa_cron: "The `*/2` cron stopped reaching /api/cron/wa-outbox — check the mkan Worker's cron triggers and the container.",
}

async function runChecks(env) {
  const failed = {}
  await Promise.all(
    Object.entries(CHECKS).map(([name, check]) =>
      check(env).catch((err) => { failed[name] = String(err?.message ?? err).slice(0, 200) })
    )
  )
  return failed
}

async function gh(env, path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "mkan-watchdog", "Content-Type": "application/json" },
  })
  if (!res.ok) throw new Error(`GitHub ${res.status} ${path}`)
  return res.json()
}

async function slack(env, text) {
  if (!env.SLACK_BOT_TOKEN) return
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: SLACK_CHANNEL, text, unfurl_links: false }),
  }).catch(() => {})
}

function report(failed) {
  return Object.entries(failed).map(([name, why]) => `- **${name}** — ${why}\n  ${FIX[name]}`).join("\n")
}

async function alert(env, failed) {
  const names = Object.keys(failed)
  const open = (await gh(env, "/issues?labels=watchdog&state=open&per_page=5"))[0]
  if (names.length === 0) {
    if (!open) return
    await gh(env, `/issues/${open.number}/comments`, { method: "POST", body: JSON.stringify({ body: "✅ Every check passes again — closing." }) })
    await gh(env, `/issues/${open.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) })
    await slack(env, `✅ *mkan watchdog*: all checks pass again (${open.html_url})`)
    return
  }
  const title = `watchdog: mkan down — ${names.join(", ")}`
  if (open) {
    if (open.title === title) return
    await gh(env, `/issues/${open.number}`, { method: "PATCH", body: JSON.stringify({ title }) })
    await gh(env, `/issues/${open.number}/comments`, { method: "POST", body: JSON.stringify({ body: `Now failing:\n${report(failed)}` }) })
    await slack(env, `🚨 *mkan watchdog*: ${names.join(", ")} failing (${open.html_url})`)
    return
  }
  const issue = await gh(env, "/issues", {
    method: "POST",
    body: JSON.stringify({
      title,
      body: `Failing for over a minute (checked every 5 min by ops/watchdog):\n\n${report(failed)}\n\nThis issue closes itself when every check passes again.`,
      labels: ["watchdog", "priority/blocking"],
      assignees: ["abdout"],
    }),
  })
  await slack(env, `🚨 *mkan watchdog*: ${names.join(", ")} failing — ${issue.html_url}`)
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil((async () => {
      let failed = await runChecks(env)
      if (Object.keys(failed).length) {
        await new Promise((r) => setTimeout(r, RECHECK_MS))
        failed = await runChecks(env)
      }
      console.log(JSON.stringify({ failed }))
      await alert(env, failed)
    })())
  },
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname !== "/run" || request.headers.get("authorization") !== `Bearer ${env.WATCHDOG_TOKEN}`) return new Response("not found", { status: 404 })
    return Response.json({ failed: await runChecks(env) })
  },
}
