# Agent — open issues

- **Thin monthly supply.** 20 TikTok leads (2026-10-17) next to 4,566 Airbnb homes. Since 10-18 the
  06:00 TikTok sweep runs the mirror itself (`crm:tiktok run --apply`), but its reader is Groq's free
  vision tier: ~30 videos a day, plus caption-only reads of posts that state price and rooms.
- **Auto-send is off until mkan has a WhatsApp line.** Evolution lives inside the balqalam
  container on loopback; mkan needs its own paired instance (a phone scans the QR) reachable from
  the mkan container, then `MKAN_EVOLUTION_*` secrets. Until then every broker message is a #mkan
  card a person taps — and prod needs `SLACK_BOT_TOKEN` for those cards to appear.
- **Twenty is mirrored once a day, not live.** `crm:hygiene` (07:00) notes every broker answer on
  its Twenty home and stamps `lastAvailabilityConfirmedAt` from an AVAILABLE only.
- **Broker replies typed in WhatsApp are not read** — only the one-tap page counts.
- **Furnished is not a column.** Nightly homes are treated as furnished; monthly homes are unknown.
- **Groq free tier** is shared site-wide (~8k tokens/min). On 429 the rules reader runs alone and
  the model is skipped for 60 s; the event shows `read by rules`. Timeout 3.5 s.
- **No re-ping yet.** A broker who stays silent for 24 h hands the home to the next broker linked to
  it (`ListingBroker`, filled by the mirror when two brokers post one house). There is no 6-h nudge:
  a manual card cannot tell whether a person tapped it, and Evolution is not live.
- **Search caps at 400 candidates** ordered by rating; the panel reports the capped number.
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
