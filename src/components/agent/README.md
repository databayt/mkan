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
| `content.tsx` · `execution-panel.tsx` · `shortlist-card.tsx` | UI |

## Rules

- The model only reads requirements. Numbers, filters, ranking and money are code.
- `Listing.lastAvailabilityConfirmedAt` is stamped by imports, so it is **not** a
  confirmation. Only a broker's answer (phase 2) makes a card "confirmed".
- Every string lives under `agent.*` in en/ar/rw.
- Env: `GROQ_API_KEY` (optional — without it the rules reader runs alone), `GROQ_AGENT_MODEL`.

## Phases

1. **Tenant agent** — done (this block).
2. **Broker confirmation loop** — `ListingBroker`, `BrokerRequest`, one-tap broker page `/b/[token]`, Slack `wa.me` cards, 24 h no-reply cron.
3. **Viewings + outcomes** — broker-confirmed `ListingVisit`, follow-up, funnel metrics.

Plan of record: the Kigali rental agent plan (2026-10-17), from the "Kigali Rental Chatbot Plan" discussion.
