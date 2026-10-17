# Agent — open issues

- **Thin monthly supply.** 20 TikTok leads (2026-10-17) next to 4,566 Airbnb homes. The mirror is
  manual — run `pnpm crm:tiktok-mirror --apply` after the daily TikTok sweep, or chain it into
  `com.databayt.mkan-tiktok-sweep`.
- **Auto-send is off until mkan has a WhatsApp line.** Evolution lives inside the balqalam
  container on loopback; mkan needs its own paired instance (a phone scans the QR) reachable from
  the mkan container, then `MKAN_EVOLUTION_*` secrets. Until then every broker message is a #mkan
  card a person taps — and prod needs `SLACK_BOT_TOKEN` for those cards to appear.
- **Twenty is not mirrored** from the app (Twenty is on the Mac's localhost). Broker answers live
  in `BrokerRequest`; `crm:sync-up` does not carry them yet.
- **Broker replies typed in WhatsApp are not read** — only the one-tap page counts.
- **Furnished is not a column.** Nightly homes are treated as furnished; monthly homes are unknown.
- **Groq free tier** is shared site-wide (~8k tokens/min). On 429 the rules reader runs alone;
  the event shows `read by rules`.
- **Search caps at 400 candidates** ordered by rating; the panel reports the capped number.
- Kinyarwanda strings are machine-written — a native speaker should review `agent.*` in rw.json.
