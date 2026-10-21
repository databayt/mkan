# Agent — the Kigali rental agent (`/find`)

A tenant describes the home they need; the agent reads it, searches real Mkan
homes, groups near-identical ads, ranks what fits and prices the move-in — and
shows every step in a live execution panel (plan · live activity · results).

The panel renders `AgentEvent` rows. A step with no row did not happen; the
agent never animates work it is not doing, and never calls a home available
or booked without a person's confirmation.

## Flow

```
sendAgentMessage (server action) ──► AgentTask(RUNNING) + after(runTurn)
                                          │
runTurn: requirements_extracted (Groq skipped on taps) ─► search_done ─► dedup_grouped ─► filtered ─► ranked
         ─► needs_confirmation (uncertain) + the shortlist reply (cards visible, still RUNNING)
         ─► broker asks ─► shortlist_ready ─► DONE / WAITING
         no stay type → searched as monthly rent, no broker asks, "months or nights?" offered under the cards
client: GET /api/agent/task?id=&v=<version> every 800 ms → 2 s while RUNNING, 10 s → 30 s → 60 s while WAITING,
        paused while the tab is hidden; 204 when the version is unchanged.
chats:  /find?c=<id> opens a chat (reload, back and forward work); a bare /find is a new chat. The bubble
        reopens this browser's last chat (localStorage pointer, 3 days). ☰ lists every chat of the profile.
```

## Who a chat belongs to

`AgentProfile` (`profile.ts`). A browser is its httpOnly `mkan_agent` cookie — a random UUID, stored only as
a sha256 (`keyHash`), rolled for a year on every send. Signing in attaches the browser's profile to the
account, or folds it into the account's profile from another device (chats move, memory merges). A profile
with a `userId` opens only with that session: after sign-out the browser gets a fresh cookie and an empty
profile. Reads (page render, poll) never write; writes (actions, the chat list) adopt pre-profile tasks
(`sessionKey` = the raw cookie), merge, create and rotate.

## Files

| File | Role |
| --- | --- |
| `requirements.ts` | Zod schema + deterministic en/ar/rw reader, merge, missing hard field |
| `llm.ts` | Groq free-tier reader (`openai/gpt-oss-20b`); any failure → rules only |
| `cost.ts` | Short stay (nights + 12% fee) · month in a nightly home · Kigali broker terms (3 months + ½ deposit + 25–30% commission + 5k viewing) |
| `rank.ts` | Duplicate grouping, hard filters, scoring with reasons |
| `search.ts` | Prisma query over published RWF Kigali homes → candidates; shortlist cards |
| `run.ts` | One turn, writing the trace |
| `actions.ts` | `sendAgentMessage` (returns the task view, 30 turns/hour counted in SQL), `getAgentTask` (page render) |
| `task-view.ts` · `app/api/agent/task/route.ts` | Cookie-scoped task loading, stuck-turn recovery, and the GET poll (`pollTask`: one head read, 204 when `version` holds) |
| `fields.ts` | Client-safe requirement constants (district codes, clearable fields, `roundPrice`) — keeps zod and the parsers out of the browser bundle |
| `content.tsx` · `header.tsx` · `turn.tsx` · `composer.tsx` · `suggestions.tsx` · `steps.tsx` · `use-stick-to-bottom.ts` | /find UI in ChatGPT's iOS shell — chat bar (back · Mkan · new chat), greeting mid-screen with starter cards over a pill composer (`+` guided search, mic dictation, send), grey user bubbles, plain agent text with copy / 👍 / 👎 / search again, a folded thinking line, scroll that sticks to the bottom only when the reader is there |
| `shortlist-card.tsx` · `card-sheet.tsx` | Homes as a swipeable inline card row; a tap opens a bottom sheet (cost breakdown, reasons, viewing booking, listing link), loaded on first tap |
| `wizard.tsx` · `areas.ts` | The opening: four tap questions (how long → where → what home → budget), with "Show homes" on every step after the first that set requirement fields exactly; the composer stays under it, so typing works at any step. `areas.ts` holds the neighbourhoods and the centre / business / university areas |
| `relax.ts` · `refine.tsx` | No dead ends: when nothing fits every detail, run.ts tries each single widening and the cumulative ladder (neighbourhood → its district, area, home type, bathrooms, furnished, budget +30%, all Kigali) in parallel and keeps the fewest-changes attempt; the reply names each change. After a shortlist, `Refine` offers the budget (when the search ran without one) and one-tap follow-ups — cheaper, more bedrooms, furnished, anywhere |
| `use-agent-task.ts` | Shared conversation state + polling for /find and the bubble; `open(id)` / `reset()` keep `?c=` and the bubble's last-chat pointer in step, `popstate` follows back and forward |
| `profile.ts` | `resolveViewer({ write })` — the profile behind the cookie and the session; `ownedBy(viewer)` is the `where` every task query uses |
| `memory.ts` | The `AgentProfile.memory` shape: sticky search fields, short notes (phones and emails stripped), liked / dismissed / seen homes; `mergeMemory` for sign-in |
| `chats-sheet.tsx` · `chat-list.ts` · `chips.ts` · `app/api/agent/chats` | The ☰ sheet: New chat, chats by day (Today / Yesterday / Previous 7 days / Older, the viewer's own days), inline delete, a sign-in line for anonymous chats; titles from the search's chips, else the first words. z-60, above the bubble panel |
| `bubble/bubble.tsx` · `bubble/panel.tsx` | The floating chat on home / search / listings / travel / help, launched by the hogwarts robot mark (`public/illustrations/robot-fill.png`); same task as /find, expand → /find. Opening it lands the site on /listings beside the panel |
| `bubble/listings-query.ts` | Agent requirements → /listings filters (district via `state`, beds, baths, guests; budget stays with the agent — RWF/night-or-month vs per-listing nightly currency). The panel re-filters the listings index as the requirements firm up |

## Rules

- The model only reads requirements. Numbers, filters, ranking and money are code.
- `Listing.lastAvailabilityConfirmedAt` is stamped by imports, so it is **not** a
  confirmation. Only a broker's answer (phase 2) makes a card "confirmed".
- Every string lives under `agent.*` in en/ar/rw.
- The tenant's own taps (👍 / 👎, saves) are `SILENT_EVENTS`: kept for counting, never drawn, never part of
  the poll's version or its 60-row window.
- Env: `GROQ_API_KEY` (optional — without it the rules reader runs alone), `GROQ_AGENT_MODEL`.

## Broker loop (phase 2) and viewings (phase 3)

```
shortlist ─► requestConfirmations: one WhatsApp per broker listing all their homes,
             BrokerRequest per home (24 h, sha256 token), task WAITING
             └─ already asked today? the task joins that question (channel "joined"), nothing re-sent
broker /b/<token> ─► Available (+ up to 3 times, Kigali time) | Rented
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
| `broker-message.ts` | the exact en + rw words a broker receives (tested) |
| `whatsapp.ts` | Evolution `message/sendText` when `MKAN_EVOLUTION_{URL,KEY,INSTANCE}` are set (daily cap `MKAN_EVOLUTION_DAILY_CAP`, default 40); otherwise a #mkan card with a wa.me link (`SLACK_BOT_TOKEN`) |
| `broker-actions.ts` | broker answer/confirm, tenant choose/outcome |
| `broker-answer.tsx` + `app/[lang]/b/[token]` | the broker's one-tap page (noindex, no account) |
| `viewing.tsx` | the tenant's viewing panel on a card |

**Supply for the loop:** `pnpm crm:tiktok-mirror --apply` mirrors Twenty TikTok homes (monthly,
with a broker phone) as **leads** — `draft`, unpublished, `source TIKTOK`, `ListingBroker` rows.
They appear only in long-stay `/find` results, labelled with the broker's handle and linking to
the ad; public search, listing pages and the sitemap never show them.

Plan of record: the Kigali rental agent plan (2026-10-17), from the "Kigali Rental Chatbot Plan" discussion.
