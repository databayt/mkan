# Agent — open issues

- **No monthly supply yet.** All 4,566 published Kigali homes are Airbnb (nightly). Long-term
  searches under ~450k/month return nothing until TikTok/broker homes are published with
  `rentPeriod=MONTHLY` + `priceMonth` (phase 2). The empty reply says so honestly.
- **Furnished is not a column.** Nightly homes are treated as furnished; monthly homes are unknown.
- **Groq free tier** is shared site-wide (~8k tokens/min). On 429 the rules reader runs alone;
  the event shows `read by rules`.
- **Search caps at 400 candidates** ordered by rating; the panel reports the capped number.
- Kinyarwanda strings are machine-written — a native speaker should review `agent.*` in rw.json.
