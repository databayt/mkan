# Mkan — what it costs, what a deal earns, and what to cut (2026-11-14)

Abdout, 11-14: "make a deep study and search on how you can make Mkan and the Mkan agent cost
effective." This puts the measured numbers in one place. Rates: 1,450 RWF to the dollar
(`src/lib/monetize/costs.ts`). Sources: `docs/costs-2026-11.md`, `docs/off-container-2026-11.md`, the
`ApiSpend` ledger, `scripts/crm/.data/tiktok/spend.json`, Meta's pricing page (read 11-14).

## The short answer

- **Mkan costs about 80,000 RWF ($55) a month to run, and 90% of it is two lines:** one always-on
  container and a database that rarely sleeps.
- **The agent itself costs cents.** Every model call Mkan makes comes to about $1–2 a month, inside the
  plan's included credits.
- **A deal earns Mkan 5,000 to 10,000 RWF** at 10% of the broker's commission, so today's costs need
  **9 to 16 paid deals a month**. With the two cuts below it is **3 to 5**.

## Where the money goes each month

| Line | USD | RWF | Share |
|---|---|---|---|
| Cloudflare container (standard-1, always on) + $1 of the Workers plan | 30.24 | 43,850 | 55% |
| Neon compute (the database is awake most of the day) | 19.40 | 28,130 | 35% |
| WhatsApp line (SIM and data, an estimate) | 3.45 | 5,000 | 6% |
| Mac and internet share (an estimate) | 2.07 | 3,000 | 4% |
| **Fixed total** | **55.16** | **79,980** | |
| Models: the chat agent (Claude Haiku 5.5) | about 0.10–0.50 | | inside the included credits |
| Models: the scrape readers (Haiku, 403 calls so far this month) | 0.56 so far | | inside the included credits |
| Photos and video on S3 and the CDN | about 1.15 | | shared bucket |

Not yet measured, and it will matter: **the person from Mkan who goes to every viewing** (transport and
time). At 5,000–10,000 RWF a deal, one trip can cost as much as the deal earns. Record it per viewing
from the first one.

## What a deal earns

Mkan's cut is 10% of the broker's commission, paid by the broker when the lease is signed
(`intro-pure.ts MKAN_TERMS`); the viewing is free for Mkan's tenants under those terms.

| Home's rent | Broker's commission | Mkan's 10% |
|---|---|---|
| 350,000 | 25–30% of a month, the usual: 87,500–105,000 | 8,750–10,500 |
| 350,000 | a fixed 50,000 (Abdout's note, 11-14) | 5,000 |
| 700,000 | 175,000–210,000 | 17,500–21,000 |
| 1,000,000 | 250,000–300,000 | 25,000–30,000 |

Two things follow:

- **A broker who has not agreed the terms can cost Mkan money.** If Mkan pays the usual 5,000 RWF viewing
  fee and then earns 5,000, the deal nets nothing. The line now asks for the terms in the same message
  that confirms the viewing; the person at the viewing settles them before the tenant signs.
- **The same work on a dearer home earns three times more.** One lease at 1,000,000 a month pays what
  three at 350,000 do. Worth knowing when choosing which homes to post.

## Paid deals needed to break even

| Fixed costs | At 5,000 a deal | At 9,600 a deal |
|---|---|---|
| Today: 79,980 RWF | 16 | 9 |
| Off the container: 37,580 | 8 | 4 |
| Off the container, database asleep when idle: about 21,000 | 5 | 3 |

## What to cut, in order

1. **Move off the container** (mkan#66; plan in `docs/off-container-2026-11.md`, about 4–5 days).
   Saves $29.24 a month, more than half of everything. Food, marketing, codebase and kun already run
   this way on the plan that is paid anyway.
2. **Let the database sleep.** Neon bills compute only while a query is active; it sleeps after five idle
   minutes. What keeps it awake is known: the outbox cron, the watchdog's checks, a visible /monetize
   tab polling, and the Mac's hourly jobs landing at different minutes. Keep them on the same quarter
   hour, and read `pg_stat_activity` for any new waker. Worth about $10–12 a month.
3. **Keep the model spend where it is.** It is already small because the rules read first and the
   model only where they cannot; replies are written by the smallest current model with thinking off;
   the system prompts are cached; WhatsApp replies skip the per-home lines nobody sees. The under-the-
   homes answers added on 11-14 cost one short call each. The caps stay ($15 a month for the agent, $10
   for the readers), so a loop can never run the bill up.
4. **Stay on the current WhatsApp bridge for now.** It costs nothing. Meta's official API gives 1,000
   free replies per number each month and bills by message beyond that, and first messages to brokers
   would need approved templates. Look again past about 1,000 replies a month, or if the number is flagged.
5. **Run the lanes that do not need the Mac on the server already paid for.** The CRM moved to a small
   Hetzner machine on 11-14. The web sweep, the tenant match, the price ask and the CRM sync could run
   beside it at no extra cost, and they would stop failing when the Mac sleeps. TikTok fetching, video
   cleaning and uploads stay on the Mac. A reliability gain more than a saving.
6. **Keep video work local.** Cleaning and encoding on the Mac cost nothing. Exporting at 4K would
   take about four times the disk and time for a gain TikTok may not show: test ten against ten first.

## What not to spend on yet

- A paid video or image API for the TikTok lane.
- TikTok promotion before one video has done well on its own (see `kun/content/docs/mkan-tiktok.mdx`).
- A native app before the web app has shown people install it.

## Watch each week

Cost per chat, per booked viewing and per paid deal (the fixed total divided by each count), beside
Mkan's share per paid deal. When share per deal is above cost per deal, Mkan pays for itself.
