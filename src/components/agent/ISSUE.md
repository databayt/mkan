# Agent — open issues

- **Thin monthly supply.** 20 TikTok leads (2026-10-17) next to 4,566 Airbnb homes. Since 10-18 the
  06:00 TikTok sweep runs the mirror itself (`crm:tiktok run --apply`), but its reader is Groq's free
  vision tier: ~30 videos a day, plus caption-only reads of posts that state price and rooms.
- **Auto-send waits on pairing the mkan line (+250780984777).** Since 2026-10-21 every message is
  an `OutboundMessage` row when `MKAN_WA_OUTBOX=1`, drained on the Mac by `scripts/wa/outbox.ts`
  through a local Evolution (`ops/evolution/`). Until the line is paired and the flag is set, every
  message — availability asks, demand asks, tenant alerts — is a #mkan wa.me card a person taps
  (rows kept as SKIPPED), and prod needs `SLACK_BOT_TOKEN` for those cards to appear.
- **Broker photos for a sent home** come by WhatsApp reply only; `/b/d/<token>` takes price, rooms,
  place and a note, so those leads show without photos until someone adds them.
- **Demand reaches only brokers in the directory.** `crm:brokers` builds it from ad history; a
  district with no known broker gets "kept open" and no asks.
- **Twenty is mirrored once a day, not live.** `crm:hygiene` (07:00) notes every broker answer on
  its Twenty home and stamps `lastAvailabilityConfirmedAt` from an AVAILABLE only.
- **Broker replies typed in WhatsApp are not read** — only the one-tap page counts.
- **Furnished is not a column.** Nightly homes are treated as furnished; monthly homes are unknown.
- **Groq free tier** is shared site-wide (~8k tokens/min). On 429 the rules reader runs alone and
  the model is skipped for 60 s; the event shows `read by rules`. Timeout 3.5 s.
- **No re-ping yet.** A broker who stays silent for 24 h hands the home to the next broker linked to
  it (`ListingBroker`, filled by the mirror when two brokers post one house). There is no 6-h nudge:
  a manual card cannot tell whether a person tapped it, and Evolution is not live.
- **Search caps at 400 candidates** ordered by rating; the panel reports the capped number. (Since Airbnb homes left the
  agent, only ~277 homes are agent-visible, so the cap is never reached.)
- Kinyarwanda strings are machine-written — a native speaker should review `agent.*` in rw.json.

## Bubble + assistant-style /find (2026-10-17)

- Shipped: `/find` in the ChatGPT/Claude/Gemini layout (centred composer → conversation column, steps block folded on the agent's turn, homes inline); the floating bubble on home / search / listings / travel / help, sharing the task via the `mkan_agent` cookie.
- Not done (deliberately): "Copy link" on a turn — tasks are private to the browser's cookie, so a link would not open for anyone else; editing a requirement chip in place.
- The bubble shows an amber dot on the launcher only after it has been opened once in the page (it does not fetch the task on every page load).

## Smarter, fewer steps (2026-10-17)

- Only the stay type blocks a search, and it is inferred when the message answers it (a 450k figure is a month, 40k a night; guests or nights → short; unfurnished / compound / family → long). The budget is offered after the homes, not before.
- The Groq reader is a delta reader: it gets the current search plus the newest message and returns `{set, clear}`, so "cheaper", "Kacyiru instead" or "anywhere" move the search instead of restating it. The rules reader does the same for cheaper / bigger / anywhere / any budget (`parseAdjustments`); `reconcile` keeps neighbourhood ↔ district and nights ↔ months budgets consistent.
- Zero matches widen automatically (`relax.ts`) instead of answering "no homes". Data reality: a 2-bed monthly under ~390k barely exists on mkan yet, so such a search widens to all of Kigali and may show one home — the reply says so.
- Speed (2026-10-17, Worker 2083fc7d): a turn went from 10–13s to ~2–3s on prod. Ranking reads a slim select (158 KB vs 1.5 MB for 400 rows); card fields load for the winners only; trace writes overlap the Groq call and the search and batch with `createMany`. Keep terminal events before the DONE status — the client stops polling at DONE.

## Fewer queries, honest recovery (2026-10-18)

- Zero-match widening loads one pool (the widest ladder step, up to 2,000 slim rows) and ranks every attempt in memory — `passesHardFilters` re-applies each attempt's constraints. A pool that hit its cap falls back to one search per attempt. Was up to 13 searches + 13 broker-answer reads.
- Polling sends the latest turn's events only (bounded at 60) and backs off from 800 ms to 2 s after 4 s.
- A task RUNNING for 90 s lost its `after()`: the next poll fails it with an error reply, the next message runs instead of "busy", and the hourly cron fails any left for an hour.
- The broker loop batches: one read of today's requests, `createManyAndReturn`, one event insert; answers update waiting tasks in parallel and settle them with one `groupBy`.
- Cross-broker duplicates: TikTok leads group by bedrooms + district + neighbourhood + price within 5% (site homes keep the host in the key). The mirror adds a second broker to an existing lead instead of a second listing.
- A lead whose video was taken down loses its `sourceUrl` (crm:hygiene, Mondays) and leaves /find.
- `pnpm agent:funnel` — conversations → shortlists → broker asks → answers → slots → viewings; in the daily #mkan hygiene report. 30 days to 10-18: 15 conversations, 10 shortlists, 0 broker asks.
- With the panel open, the /listings header's "Become a host" link is hidden (`data-agent-panel-hide`) — the centred tabs ran into it at ~60% width.

## ChatGPT iOS shell, lighter polling (2026-10-20)

- /find drops the site header: the conversation owns the screen like ChatGPT on iOS (`header.tsx`). The empty state is the greeting alone with starter cards (`suggestions.tsx`, the long-unused `agent.examples`) above the pill composer; the 4-step wizard sits behind the "Guided search" card and the composer's `+`. The mic dictates through the Web Speech API where the browser has it (hidden otherwise).
- The bubble panel uses the same bar, turns and composer; on phones it slides up as a full-height sheet instead of in from the side.
- Polling moved off a server action to `GET /api/agent/task`: Next runs a client's actions one at a time, so polls queued ahead of every chip, answer and viewing pick. The client sends its `version` (status · updatedAt · last event seq) and gets 204 when nothing moved — one indexed head read instead of messages + shortlist + 60 events. `sendAgentMessage` returns the view, so a send is one round trip, not two.
- Polling pauses in a hidden tab and a broker-waiting task backs off 10 s → 30 s → 60 s (was 10 s forever). The hook keeps unchanged messages and cards by reference; `UserTurn`, `PastAgentTurn` and `ShortlistCard` are memoised, so a poll re-renders the latest turn only. The steps' 1 s ticker is gone, and `AskCard` no longer re-binds its key listener on every render.
- The rate limit counts user turns in Postgres (`jsonb_array_elements`) instead of loading every recent transcript.
- The panel's `/listings` re-filter is debounced 400 ms; the body margin no longer animates (only the panel's transform does).
- The global `p { text-muted-foreground }` (`styles/typography.css`) greyed the replies — chat text sets `text-foreground` explicitly.
- Not done: a separate Dialog for desktop (the bottom sheet is capped at `max-w-lg` and reads fine there); lazy-loading `Wizard` (its `usePicksLabel` is needed by every search).

## Homes before questions (2026-10-20)

- Nothing is asked before the first homes. A message without a stay type ("2 bedroom in Kicukiro") used to get "Months or nights?" first; it now searches monthly rent (every home, nightly ones priced by the month) and offers months-or-nights as the card under the shortlist (`refine: "stay"`), then the budget. Brokers are not asked on a guessed stay type — only after the tenant taps Months.
- The shortlist reply is written as soon as the cards are ranked; the broker asks run after it. Prod traces had the cards waiting 1–5 s on broker contact.
- A tap (wizard picks, an answer card, a refine chip) skips the Groq reader: the fields are exact, and Groq took 0.3–3.6 s per turn in the traces.
- The "Looking for" chips drop a neighbourhood named like its district (duplicate React key).
- No budget → typical prices first (same day): the going rate stands in for a budget. For a monthly search it is the median of the real monthly rents that matched (≥3, else every home); homes score by log-distance from it and within ±25% carry a "Typical price" badge. A stated budget or "cheapest" still rules.
- Search bug found on the way: broker monthly homes carry no ratings, so the best-rated 400 shut them out of every monthly search with a truncated pool (0 of 40 two-bed broker homes reached a Kicukiro search). They now load in a pool of their own (`MAX_MONTHLY`, cheapest first). Real data, 2-bed Kicukiro with no budget: first cards RWF 660k–1.1M a month, were 2.4–3.2M. 2-bed monthly in Kigali: broker rents p25–p75 330k–700k, nightly homes ×30 1.8M–4M.
- Kimihurura still opens at ~3.6M: one broker home matches there, so the median is the nightly market's — a stock gap, not a ranking one.

## ☰ chats, profiles, hardening (2026-10-21)

- Shipped: `AgentProfile` (anonymous cookie, merged on sign-in, closed after sign-out), `/find?c=<id>` chats,
  the ☰ sheet (/find + bubble), delete, 👍 / 👎 saved as silent events. Migration
  `20261022000000_agent_profiles` (additive; `sessionKey` made nullable — apply it before the code ships).
- Fixed on the way: every cron trusted a spoofable `x-vercel-cron` header (now Bearer only, `lib/cron-auth.ts`);
  the rate limit counted a chat's whole history whenever anything touched it (now user messages by time, plus
  120 / h per `cf-connecting-ip`); the cron failed stuck turns without a reply (now error reply, or DONE if
  the cards were up); a confirmed viewing never named the signed-in tenant (`guestUserId`); a neighbourhood
  the model invents no longer forces zero results; `stay` / `nights` / `guests` / `maxUpfront` can be cleared.
- Sheet primitive: side sheets slide from their logical edge (Arabic slid from the wrong side before).
- Next: Claude Haiku 5.5 reader on the included API credits (capped ledger `ApiSpend`), memory reads/writes,
  welcome back, saved homes, best-match ranking, model-written replies — see the plan of 2026-10-21.

## Smart reader, memory, best match, written replies (2026-10-21)

- Shipped dark until the key exists: Claude Haiku 5.5 reader + writer on the included credits, capped in
  code. **Blocker: the credits are not claimed** — Keychain `mkan-ANTHROPIC_API_KEY` and
  `cf-mkan-AGENT_ANTHROPIC_API_KEY` are missing, so prod reads with Groq then the rules, and replies stay templates.
  Once stored: `pnpm agent:eval` (gate) → `scripts/cf-secrets.sh` → redeploy → one warm-up turn (the first call
  with a new schema compiles its grammar and can pass the 3 s timeout).
- Memory: sticky fields, notes, liked / dismissed / seen; written only from a trusted reader. A Groq-only turn
  cannot teach it a place (seen: "near Kigali Heights" → Kicukiro).
- Best match: must-haves scored on listing data (`hasMustHave`: null = ask the broker), distance to a landmark
  (24 approximate pins in `areas.ts` — refine against a map), neutral rating for unrated homes, leads stay in area
  searches, "unfurnished" leaves out nightly homes. `Listing.furnished` + `WaterTank` / `BackupGenerator` filled for
  leads by the mirror from the video's features (from the next mirror run).
- One tap: ♥ (site favorites; guest hearts merge on sign-in), Not for me (too expensive → 85% ceiling, too small →
  +1 bedroom, not this one → hidden), Check availability on a lead the agent did not ask about.
- Not done: Kinyarwanda writing (`AGENT_WRITER_LOCALES`) waits for a native review of `pnpm agent:eval-writer`
  samples; the e2e suite needs a test branch (the repo `.env` is production); "new since" only counts homes created
  after the last search (a price drop on an old home is not "new").
- 2026-10-21: the composer is read-only until hydration — a message typed on a slow phone before the page was interactive used to vanish (Enter went nowhere, hydration cleared the box).

## Fast and stall-free (2026-10-24)

Prod said otherwise than "2–3 s": 81 turns over 7 days ran p50 3.4 s, p90 14.4 s, 27 over 6 s, tap turns
sat 23–25 s before their first step, and one hung 27 s and errored. `pnpm agent:latency` splits every turn;
Workers Logs (the observability telemetry API) showed why:

- **The one half-vCPU container ran out of CPU.** AhrefsBot sent 251 image resizes in 40 s (10-21) and walked
  `/ar|/rw/listings/*`; a /listings grid behind the bubble pushed 132 resizes into the container in 10 minutes
  (10-22: images up to 66 s, the chat's sends up to 35 s, its polls up to 13 s). → WebP only (AVIF encodes several times slower), card images sized
  50vw for the 2-up phone grid, SEO crawlers disallowed in robots.txt and answered 403 by the Worker, and the
  bubble no longer sends the site to /listings.
- **Every send re-rendered the page before the turn started.** `requireProfile()` set the cookie on each
  write, which makes Next re-render the current page into the action's response, and `after()` waited for
  it. → The cookie is set only when new, rotated or a month old; `startTurn` begins the turn at once, and the
  send waits ≤ 6 s for its first reply.
- **The database was ~96 ms away per query** (container in London, Neon in Virginia), ~20 queries a turn. →
  `constraints.regions: ["ENAM"]` (now Columbus, `cmh02`): 17–24 ms. Kigali requests travel further, and still
  come back faster (liveness 0.65–0.72 s, was 0.71–0.91 s).
- **Nothing bounded a stalled query.** The pool is now bounded (connect 5 s, query 15 s), and a turn with no
  reply after 15 s answers with the error and a Try again chip. Correction to the commit `eaf2ec2` message:
  production already ran `PrismaPg` over TCP (its env never set `DATABASE_URL_ADAPTER`; the WebSocket driver is
  `.env`'s local setting) — the fix was the pool's missing timeouts, not the driver.

Reading Workers Logs: what a visitor waited is the Worker's event (no `entrypoint`). The container's Durable
Object logs the same request again, and that event runs on until the object's next event or its 3-minute
alarm tick (~1 ms CPU, no status). So a 2–3 minute `MkanContainer` fetch in a quiet hour is bookkeeping, not
a stall: the 10-23 Bingbot `/ar/travel/trips/15097` (158.6 s) and 10-24's 05:00–05:45Z cron, favicon and
`/ar/host` (116–172 s) all answered in 0.1–1.1 s.

Numbers on prod from Kigali at 393 px after both deploys: typed first message → cards 1.55 s (server 0.7 s),
a tap → cards 0.83 s (server 0.3 s), both inside the send's own response.

Monthly only (Abdout, 2026-10-24): a few nights get one honest line and "Show monthly homes"; the wizard lost its
months/nights step; a stay-less search offers the budget under the cards (a budget tap settles the stay, so
brokers are still asked only once the tenant engages). New `agent.reply.*` / `agent.examples.room` rw strings are
machine-written like the rest.

Not done (measure first): the in-memory pool of agent homes and Prisma `relationJoins` (the search step is
~0.1–0.3 s now); long-poll/SSE (the send carries the first reply); lazy-loading the conversation-only
components on /find; a bigger container or edge image resizing (only if Workers Logs still show slow
`/_next/image` misses).
