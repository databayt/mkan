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
runTurn: requirements_extracted ─► asked (missing stay/budget) ─► DONE
                                └► search_done ─► dedup_grouped ─► filtered ─► ranked
                                   ─► needs_confirmation (uncertain) ─► shortlist_ready ─► DONE
client: polls getAgentTask every 800 ms while RUNNING; a reload resumes from the cookie
```

## Files

| File | Role |
| --- | --- |
| `requirements.ts` | Zod schema + deterministic en/ar/rw reader, merge, missing hard field |
| `llm.ts` | Groq free-tier reader (`openai/gpt-oss-20b`); any failure → rules only |
| `cost.ts` | Short stay (nights + 12% fee) · month in a nightly home · Kigali broker terms (3 months + ½ deposit + 25–30% commission + 5k viewing) |
| `rank.ts` | Duplicate grouping, hard filters, scoring with reasons |
| `search.ts` | Prisma query over published RWF Kigali homes → candidates; shortlist cards |
| `run.ts` | One turn, writing the trace |
| `actions.ts` | `sendAgentMessage`, `getAgentTask` (cookie-scoped, 30 turns/hour) |
| `content.tsx` · `turn.tsx` · `composer.tsx` · `steps.tsx` · `shortlist-card.tsx` | /find UI — assistant-app layout (centred composer → conversation column, steps block folded on the agent's turn, homes inline) |
| `use-agent-task.ts` | Shared conversation state + polling for /find and the bubble |
| `bubble/bubble.tsx` · `bubble/panel.tsx` | The floating chat on home / search / listings / travel / help, launched by the hogwarts robot mark (`public/illustrations/robot-fill.png`); same task as /find, expand → /find. Opening it lands the site on /listings beside the panel |
| `bubble/listings-query.ts` | Agent requirements → /listings filters (district via `state`, beds, baths, guests; budget stays with the agent — RWF/night-or-month vs per-listing nightly currency). The panel re-filters the listings index as the requirements firm up |

## Rules

- The model only reads requirements. Numbers, filters, ranking and money are code.
- `Listing.lastAvailabilityConfirmedAt` is stamped by imports, so it is **not** a
  confirmation. Only a broker's answer (phase 2) makes a card "confirmed".
- Every string lives under `agent.*` in en/ar/rw.
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
cron /api/cron/broker-requests (hourly) ─► unanswered after 24 h = NO_REPLY, said so
```

| File | Role |
| --- | --- |
| `broker.ts` | request creation + dedup, answer fan-out, expiry |
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
