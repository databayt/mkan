# Agent — the Kigali rental agent (`/find`)

A tenant describes the home they need; the agent reads it, searches real Mkan
homes, groups near-identical ads, ranks what fits and prices the move-in — and
shows every step in a live execution panel (plan · live activity · results).

The panel renders `AgentEvent` rows. A step with no row did not happen; the
agent never animates work it is not doing, and never calls a home available
or booked without a person's confirmation.

## Flow

```
sendAgentMessage (server action) ──► AgentTask(RUNNING) + startTurn: the turn begins at once (after(turn.done)),
                                     and the send waits ≤ 6 s for its first reply — a normal turn's cards come
                                     back in the send's own response, no poll needed
runTurn: requirements_extracted (Groq skipped on taps) ─► search_done ─► dedup_grouped ─► filtered ─► ranked
         ─► needs_confirmation (uncertain) + the shortlist reply (cards visible, still RUNNING)
         ─► broker asks ─► shortlist_ready (+ `ms`, the server's clock) ─► DONE / WAITING
         a few nights → "monthly only" + Show monthly homes: no search, no demand, no broker (monthly rentals only)
         no stay type → searched as monthly rent, no broker asks, the budget offered under the cards
         no reply in 15 s → the error reply (+ Try again); everything the turn writes after it is dropped
client: the message shows the moment it is sent. GET /api/agent/task?id=&v=<version> every 800 ms → 2 s while
        RUNNING; 10 s → 30 s → 60 s while WAITING, only with the chat in view (the bubble's panel open) and for
        30 min at most; paused while the tab is hidden; 204 when the version is unchanged.
chats:  /find?c=<id> opens a chat (reload, back and forward work); a bare /find is a new chat. The bubble
        reopens this browser's last chat (localStorage pointer, 3 days). ☰ lists every chat of the profile.
```

## Who a chat belongs to

`AgentProfile` (`profile.ts`). A browser is its httpOnly `mkan_agent` cookie — `<uuid>.<issue day>`, the uuid
stored only as a sha256 (`keyHash`), set for a year when it is new, rotated or 30+ days old. Not on every send:
a Server Action that sets a cookie makes Next re-render the whole current page into its response. Signing in attaches the browser's profile to the
account, or folds it into the account's profile from another device (chats move, memory merges). A profile
with a `userId` opens only with that session: after sign-out the browser gets a fresh cookie and an empty
profile. Reads (page render, poll) never write; writes (actions, the chat list) adopt pre-profile tasks
(`sessionKey` = the raw cookie), merge, create and rotate.

## Files

| File | Role |
| --- | --- |
| `requirements.ts` | Zod schema + deterministic en/ar/rw reader, merge, missing hard field |
| `reader.ts` | The reader: Claude Haiku 5.5 first (structured output — a flat, fully required `ReaderOut`, every value range-checked here), Groq with what is left of the 3.5 s budget, then the rules. Reads the screen as [h1]…[h6] (`like` / `notLike`), landmarks (`near`), must-haves, move-in, USD, memory continuity, `intent` (search / question / other) |
| `llm.ts` | Groq free-tier reader (`openai/gpt-oss-20b`) — the fallback; a place it names counts only when the message names it |
| `claude.ts` | The capped Claude client: `ApiSpend` ledger (priced from `usage`), $15/month (`AGENT_API_CAP_USD`), daily pacing, 429/5xx cooldowns, a 402 or a `capped` row stops every instance |
| `writer.ts` · `knowledge.ts` | Claude writes the reply and one "why this home" per card from facts with no money and no dates; answers renting questions from `knowledge.ts` (built from the cost constants and the areas). `guardText` drops any piece with a number not in the facts, a price, an "available" without a broker's yes, or the wrong script — the template stands instead |
| `memory.ts` · `feedback-actions.ts` | What the agent remembers (sticky search fields, ≤10 sanitized notes, liked / dismissed / seen homes) — written after each turn from a trusted reader only; ♥ / Not for me / Check availability / the Memory view's edits |
| `welcome.tsx` · `app/api/agent/welcome` | Welcome back: the remembered search as one tap, and homes listed since the last search |
| `saved-view.tsx` · `memory-view.tsx` | ☰ → Saved homes (the site's favorites) and ☰ → Memory (change, remove, forget) |
| `amenities.ts` | A TikTok video's features → `Amenity` values, furnishing, parking, pets (the mirror writes them onto leads) |
| `cost.ts` | Short stay (nights + 12% fee) · month in a nightly home · Kigali broker terms: the ad's own deposit / commission / viewing fee when the lead reader found them (each line `source: "ad"`), else the typical 3 months + ½ deposit + 25–30% commission + 5k viewing (`"typical"`); an owner's post or "no commission" has no commission line; water and electricity are status lines (included / paid separately / not stated) |
| `rank.ts` | Duplicate grouping, hard filters, scoring with reasons. A stated furnishing, home type (apartment / house / room; studio = 0 bedrooms), "water included" or "no commission" drops only homes known to be the opposite — an ad that is silent stays, ranked lower, with `ask` ("ask the broker"). Purpose: family 2+ bedrooms and houses, study campus / rooms / cheaper, work the business areas. A lead is placed by its `Location.neighbourhood` / `sector` zone slug (its centre scores areas and "near"), else its address text |
| `search.ts` | Prisma query over published RWF Kigali homes → candidates; shortlist cards. Airbnb imports (`source = AIRBNB`) are excluded — the agent shows broker leads and hosts' own homes only |
| `run.ts` | One turn, writing the trace. `startTurn` runs it at once and says when its first reply is written (`shown`); a 15 s deadline answers with the error (`appendReply`) and a write gate drops the turn's later writes |
| `actions.ts` | `sendAgentMessage` (starts the turn, waits ≤ 6 s for its first reply, returns the task view; 30 turns/hour counted in SQL), `getAgentTask` (page render) |
| `scripts/agent/latency.ts` | `pnpm agent:latency [--days=N]` — every turn split by its trace rows (start, reader, search, cards), p50/p90 and the slowest |
| `task-view.ts` · `app/api/agent/task/route.ts` | Cookie-scoped task loading, stuck-turn recovery, and the GET poll (`pollTask`: one head read, 204 when `version` holds) |
| `fields.ts` | Client-safe requirement constants (district codes, clearable fields, `roundPrice`) — keeps zod and the parsers out of the browser bundle |
| `content.tsx` · `header.tsx` · `turn.tsx` · `composer.tsx` · `suggestions.tsx` · `steps.tsx` · `use-stick-to-bottom.ts` | /find UI mirroring ChatGPT on iOS — chat bar (☰ · Mkan start-aligned · new chat · ⋯ guided search / delete), greeting mid-screen with starter cards; a grey round `+` beside a grey pill composer ("Ask anything", a mic that dictates into the box, one black button: send, or a stop square while a turn runs — no voice conversation; Mkan always answers in the chat), grey user bubbles, agent text as light markdown (`Prose`: bold, bullets, steps, heads) with copy / 👍 / 👎 / share / ⋯ search again, a folded thinking line, scroll that sticks to the bottom only when the reader is there. The ☰ drawer: bold Mkan, round tiles (Saved · Memory · Homes), bold day heads, a floating black ✎ Chat pill |
| `shortlist-card.tsx` · `card-sheet.tsx` | Homes as a swipeable inline card row; a tap opens a bottom sheet (cost breakdown, reasons, viewing booking, listing link), loaded on first tap |
| `clarify-card.tsx` | A vague first message (no place, size or budget) missing 2+ of home / furnishing / purpose (the stay is never asked — monthly only): run.ts answers a `clarify` message and this stepper card asks them all at once — tab strip (☐ → ☑, ✔ Submit), bold question with a start-side rule, numbered options with the usual one "(Recommended)", "Type something…" to the composer (sent with the answers so far). 1–n pick, ←/→ move (mirrored in Arabic), Enter on Submit sends one message with every answer's fields; skipped questions stay unset |
| `wizard.tsx` · `areas.ts` | The opening: three tap questions (where → what home (bedrooms, baths, furnishing, Apartment / House with its own gate / Room, Family / Study / Work) → budget), every pick a monthly search, with "Show homes" on every step that set requirement fields exactly; the composer stays under it, so typing works at any step. `areas.ts` holds the neighbourhoods and the centre / business / university areas |
| `relax.ts` · `refine.tsx` | No dead ends: when nothing fits every detail, run.ts tries each single widening and the cumulative ladder (neighbourhood → its district, area, home type, bathrooms, furnished, budget +30%, all Kigali) in parallel and keeps the fewest-changes attempt; the reply names each change. After a shortlist, `Refine` offers the budget (when the search ran without one) and one-tap follow-ups — cheaper, more bedrooms, furnished, anywhere |
| `use-agent-task.ts` | Shared conversation state + polling for /find and the bubble; the sent message shows at once (a stand-in task with no id for a new chat), chats load over GET; `open(id)` / `reset()` keep `?c=` and the bubble's last-chat pointer in step, `popstate` follows back and forward; `active` (the panel open) gates WAITING polls |
| `profile.ts` | `resolveViewer({ write })` — the profile behind the cookie and the session; `ownedBy(viewer)` is the `where` every task query uses |
| `memory.ts` | The `AgentProfile.memory` shape: sticky search fields, short notes (phones and emails stripped), liked / dismissed / seen homes; `mergeMemory` for sign-in |
| `chats-sheet.tsx` · `chat-list.ts` · `chips.ts` · `app/api/agent/chats` | The ☰ sheet: New chat, chats by day (Today / Yesterday / Previous 7 days / Older, the viewer's own days), inline delete, a sign-in line for anonymous chats; titles from the search's chips, else the first words. z-60, above the bubble panel |
| `bubble/bubble.tsx` · `bubble/panel.tsx` | The floating chat on home / search / listings / travel / help, launched by the hogwarts robot mark (`public/illustrations/robot-fill.png`, through the optimiser); same task as /find, expand → /find. The page behind it stays as it is (until 2026-10-24 it was sent to /listings and re-filtered — a page render and a grid of image resizes per change, and the sends queued behind it); the panel's chunk is warmed when the page is idle |

## Rules

- Monthly rentals only (Abdout, 2026-10-24): no nightly home reaches the agent (Airbnb imports are left out), so a
  few nights — a night count or a nightly price — get one honest line and a one-tap "Show monthly homes". Any bare
  figure is a month's rent.
- The model reads the tenant and writes words. Numbers, filters, ranking and money are code, and every written piece passes the guard.
- Claude spends only the Max plan's included API credits (D-20261021-included-api-credits-for-find): `AGENT_ANTHROPIC_API_KEY` (never `ANTHROPIC_API_KEY` — that switches on the uncapped report triage), `AGENT_API_CAP_USD` (15), `AGENT_CLAUDE=off`, `AGENT_CLAUDE_MODEL`, `AGENT_WRITER_LOCALES` (en,ar), `USD_TO_RWF` (1450). Kill switch without a restart: insert an `ApiSpend` row with lane `capped` for today.
- Quality gates: `pnpm agent:eval` (45 golden reader cases, Claude vs Groq vs rules; gate ≥ 90%, never worse than the rules, p95 ≤ 2.5 s) and `pnpm agent:eval-writer` (guard pass rate + ar/rw samples for a person). E2E: `tests/e2e/find.spec.ts` against a dev server on a Neon **test branch** only (`AGENT_E2E=1`).
- Retention: `/api/cron/agent-retention` (03:00 UTC) deletes anonymous profiles idle 180 days with their chats.
- `Listing.lastAvailabilityConfirmedAt` is stamped by imports, so it is **not** a
  confirmation. Only a broker's answer (phase 2) makes a card "confirmed".
- Every string lives under `agent.*` in en/ar/rw.
- The tenant's own taps (👍 / 👎, saves) are `SILENT_EVENTS`: kept for counting, never drawn, never part of
  the poll's version or its 60-row window.
- Env: `GROQ_API_KEY` (optional — without it the rules reader runs alone), `GROQ_AGENT_MODEL`.
- Where it runs: one Cloudflare container in Eastern North America (`wrangler.jsonc` `constraints.regions: ["ENAM"]`),
  next to Neon (us-east-1) — `/api/health?detailed=true` shows the placement, DB latency and event-loop lag. Prisma
  uses `PrismaPg` over TCP with a bounded pool (connect 5 s, idle 60 s, query 15 s; `src/lib/db.ts`).

## Broker loop (phase 2) and viewings (phase 3)

```
shortlist ─► requestConfirmations: one WhatsApp per broker, as the tenant: "Hey there, is this
             available?" + the broker's own ad (ListingBroker.sourceUrl) for each of their homes,
             BrokerRequest per home (24 h, sha256 token), task WAITING
             └─ already asked today? the task joins that question (channel "joined"), nothing re-sent
broker types "yes" / "taken" (broker-inbox.ts) — or, for asks sent before 10-27, taps /b/<token>
             ─► Available (+ up to 3 times on the form, Kigali time) | Rented
             └─ applyAnswer: every pending question about the home answered,
                every waiting task's card + panel updated, lastAvailabilityConfirmedAt set
tenant picks a time + name + phone + consent ─► new token → broker "confirm" message
broker confirms ─► ListingVisit(Scheduled) — the only place a viewing is booked;
                   the broker sees the tenant's name and phone only now
after the time ─► tenant taps how it went ─► ListingVisit outcome + notes
cron /api/cron/broker-requests (hourly) ─► unanswered after 24 h = NO_REPLY → the next broker
                                          linked to the home is asked; only when none is left
                                          is the tenant told "no reply". Also fails stuck turns.
```

| File | Role |
| --- | --- |
| `broker.ts` | request creation + dedup (batched), `pickBroker`, answer fan-out, expiry → next broker, stuck-turn sweep |
| `broker-message.ts` | the exact words a broker receives, written as the tenant (tested); rw for the form |
| `whatsapp.ts` | Outbound WhatsApp: with `MKAN_WA_OUTBOX=1` every message is an `OutboundMessage` row the 2-minute cron drains (`wa-outbox.ts`, daily cap `MKAN_WA_DAILY_CAP`, default 40); otherwise a #mkan card with a wa.me link (`SLACK_BOT_TOKEN`) |
| `whatsapp-chat.ts` | Tenants chatting on WhatsApp: `handleTenantWhatsApp` runs the same turn for a phone (profile `sha256("wa:<digits>")`), digit picks, `ref:` hand-off, auto opt-in for demand alerts |
| `whatsapp-format.ts` | Pure: the turn as one WhatsApp message (3 homes, numbered options, /find link), `readPick`, `waLang` |
| `append.ts` · `availability.ts` | The message append and the "check availability" loop, shared by the web actions and WhatsApp |
| `wa-link.ts` | Mkan's WhatsApp number and the /find ⋯ "Continue on WhatsApp" link |
| `wa-tenant.ts` | `answerTenant`: the guardrails, "typing…", the turn, the send; `noteFromMe` (a person took the chat over) |
| `wa-outbox.ts` | `runOutbox`: the 2-minute drain (sends under the caps, broker replies, missed tenant messages) |
| `wa-state.ts` | The bridge's small state in `WaState` (seen ids, STOP list, human holds, lease, streak) |
| `broker-actions.ts` | broker answer/confirm, tenant choose/outcome |
| `broker-answer.tsx` + `app/[lang]/b/[token]` | the broker's one-tap page (noindex, no account) |
| `viewing.tsx` | the tenant's viewing panel on a card |

**Supply for the loop:** `pnpm crm:tiktok-mirror --apply` mirrors Twenty TikTok homes (monthly,
with a broker phone) as **leads** — `draft`, unpublished, `source TIKTOK`, `ListingBroker` rows.
They appear only in long-stay `/find` results, labelled with the broker's handle and linking to
the ad; public search, listing pages and the sitemap never show them.

Plan of record: the Kigali rental agent plan (2026-10-17), from the "Kigali Rental Chatbot Plan" discussion.

## Unmet demand (2026-10-21)

A search with nothing that fits — or only widened homes — opens a `TenantRequest` (14 days) in
`demand.ts`. `pickBrokersForDemand` (`demand-pure.ts`) scores the `Broker` directory by district /
neighbourhood coverage, price band, stay, recency and answer rate; the top 8 not asked in 24 h and
not opted out get a `BROKER_ASK` with a `/b/d/<token>` link. A broker's sent home becomes a WEB
lead (`demand-actions.ts` `submitDemandHome`) matched to the chat at once. The tenant can leave a
WhatsApp number (`demand-card.tsx`); `pnpm crm:demand-match` (09:00, Hermes) matches every open
request against the day's new homes, alerts opted-in tenants and posts the #mkan digest.

Sends: `whatsapp.ts` `sendMessages` writes `OutboundMessage` rows. With `MKAN_WA_OUTBOX=1` the cron
drains them (`wa-outbox.ts`, `/api/cron/wa-outbox`: 40/day warm-up, one per broker per day, 08:00–20:00 Kigali,
STOP / HAGARIKA / ARRÊTE opt out); without it one #mkan card carries the wa.me links.

**Brokers answer in WhatsApp words (2026-10-22).** Abdout's own chats with ~20 Kigali brokers
showed it: a vague ask gets "How much?" / "Features&budget", homes come as an album plus a
"Kibagabaga / 2 bedrooms / Price: 300k" caption, never through a link, and a visit costs ~5k.
So `needSummary` names type (self compound / apartment / room), furnishing, neighbourhood,
budget, move-in and household. `broker-reply.ts` reads replies by rules, and
`broker-inbox.ts` (called from the outbox's reply poll) acts on them:

- an offer becomes a lead through `broker-home.ts` `createBrokerHome`, the same path as the
  form, with its photos copied to S3;
- a question gets the need in the tenant's words, once;
- photos without a price get "what's the rent, and where?";
- "yes" / "taken" anywhere in the reply answers an availability ask about one home, recorded like a
  tap on the form and thanked once; "budget?" gets the need, a bare hello gets one "is it still
  available?". A reply goes with the last question its number got, so an older ask never takes it.

**Asked as the tenant (2026-10-27).** A broker gets what a renter would send: "Hey there, is this
available?" and the link to their own ad — no Mkan line, no form, no need summary; follow-ups say
only what the tenant told the agent ("I'm looking for a 2-bedroom in Kibagabaga, up to 400k. It's
for my family."). The bot never says it is a person: "are you a bot?" goes to #mkan for one, and the
line's WhatsApp name stays Mkan. Queued asks are worded when they go (`broker.ts` `askBodyNow`), and
skipped when every home on them was answered meanwhile. Whoever posted a home we ask about counts as a
broker even when the directory has another number for them, so the tenant agent never answers one.

`brokerFitScore` favours fast repliers (`Broker.replyMinutes`). Brokers from those chats enter
the directory through `pnpm wa:chats` (`scripts/wa/chats.ts`, reviewed chats only, facts not
messages).

## WhatsApp chat (2026-10-24; on Cloudflare since 10-25)

Tenants message **+250780984777** and get the same agent, free (the agent's rules → Groq →
capped-Claude ladder; `AGENT_CLAUDE=off` keeps it at $0). No Mac in the path.

```
tenant WA → Evolution in the hogwarts container (instance "mkan", shared WhatsappBridge entrypoint)
          ─webhook→ www.mkan.sd/api/whatsapp/hook/<token> → wa-tenant.ts → runTurn in-process
          → reply → Evolution sendText via www.mkan.sd/__wa (cf/worker.js → WHATSAPP binding)
```

- The bridge: hogwarts' Evolution, reached only through mkan's Worker (`/__wa/*`, header
  `x-mkan-wa: MKAN_WA_BRIDGE_SECRET`); Evolution checks `MKAN_EVOLUTION_KEY`, mkan's instance token.
- A chat continues while under a day old; "new" starts another; a bare digit answers the last numbered
  question (a clarify option, or "check home N" → the broker loop, the tenant's consent).
- `/find` ⋯ → Continue on WhatsApp sends `ref:<task id>`: the phone's new chat starts from the web one.
- A search kept open from WhatsApp alerts that same number (`TenantRequest.phone` set on the turn).
- A broker's answer about a home the tenant asked on (WhatsApp words or the link) reaches the tenant on
  WhatsApp (`broker.ts` `tellWhatsAppTenants`, via `AgentProfile.waPhone`).
- Rules (`scripts/wa/tenant-pure.ts`): reply only to messages a tenant sent (never a first message);
  STOP silences until START; a person at Mkan typing in the chat pauses the agent there for 12 h;
  messages older than 1 h are not answered; 20 replies/phone/hour, 120/line/hour.
- Brokers (any number in `Broker.phones`) are left to the outbox's burst reader. The 2-minute poll also
  passes tenant messages the webhook missed; the turn answers each message id once.
- Re-link after a `device_removed`: `pnpm wa:pair` (QR at `scripts/crm/.data/wa/qr.png`).
