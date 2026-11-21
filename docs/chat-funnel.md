# The chat funnel — sell a viewing, not a list

> Written 2026-11-21 from every real chat (117 web + WhatsApp, 39 WhatsApp tenant threads, 51 broker threads, 75 days). Tenant numbers are masked to their last 3 digits. Decision (Abdout, 2026-11-21): the chat stays fully autonomous — no hand-off to a person; full rebuild in three phases.

**60-day funnel (real people only):** 44 chats → 42 shown homes (95%) → **11 picked (26%)** → 11 broker asked → 4 broker yes (36%, median wait 25 h) → **0 viewing times → 0 viewings, ever**. 31 of 44 saw homes and walked away. Claude spend is $0.07 this month, so cost is not the constraint; the conversation design is.

## What the chats show (evidence)

1. **It's a search box in a chat skin.** Every message re-runs search and replies with the same template: "I found 6 homes that match. Each card shows why it fits and what you would pay to move in." (WhatsApp has no cards.) "Babe / How are you / What is this / ?" got the same 6 homes 7 times (…077). A vendor got "Happy to help. Tell me the area, the size and your budget" 4 times in a row (…612).
2. **It doesn't listen.** "400k–500k, furnished" → 800k villas, twice (…715). "1 bedroom, max 150k" → 500k flats first (…114). A student asking for "1 room + kitchen, 200–250k, furnished, Kimironko" restated the budget 3 times and kept getting "These are still the best homes for your search" (…196). Someone asking for 150k furnished got a **shop** and a **business room** (…922). It asks "Want me to keep these within a budget?" right after being given one. It says "I found 1 homes".
3. **It can't show the home.** Each reply is a wall: 3 titles + 3 links + a /find link + a TikTok plug. Tenants said "the photos don't show well" and "it opens but it's limited" (…922), and asked "Do you have video?" (…162). Nothing is ever sent as a photo or video in WhatsApp.
4. **It refuses people who ask for a person, and the opposite failed too.** "Need talk with a human" / "Please can you link me with a human?" → "I can't connect you to a person here" (…114). "Can we talk" → a template (…099). "Can we meet and talk about the house?" → "A person from Mkan will check", twice, then 3 days of silence (…466). The fix for the empty promise turned into a flat no.
5. **'Taken' is a dead end, and almost every pick is taken.** Every November K-code pick died within minutes (K6603, K6823, K6442). The reply is "is taken, sorry. Your other homes are here: <link>" and the chat ends. Broker …180 answered "taken, **but I have another one in Gikondo, 2 bedrooms 200k**, and a 1-bed in Kagarama 200k". The bot said "Okay, thank you" and dropped it.
6. **Brokers are being burned.** The same video was asked about daily for 5–6 days. Replies: "You are not serious… you ask me every day without visiting" (…769), "Do you need a house or you keep sending sending??" (…095), "Could you explain why you keep sending different links?" Meanwhile several brokers offered viewings ("Can we visit", "What time will you come?", "Tomorrow 10am we can see it") and nobody followed up.
7. **Yes → time dies because of timing.** The broker's yes arrives a median 25 h later. By then the tenant has cooled off, and they're asked to "reply with a day and time, like 'tomorrow 10am'", which is homework, not an offer.
8. **The voice is robotic and mixed.** The same sentence ("I'll check with its broker that it's still free…") ends almost every message. Language flips: a Kinyarwanda greeting followed by an English list, French questions answered half in English. The web side is chips ("Months", "Cheaper") with replies that are cards only.
9. **The line is noisy.** Personal contacts and vendors reach the bot (…100, …612, …638). The rep feed also posts into a chat on the line. Until the dedicated number lands this skews the data and embarrasses the brand.

**What tenants actually want:** to *see* the place, a price they can trust, furnished or not, where it is, and to *talk to someone and go see it*. Most budgets are under 250k (rooms, studios, 1-beds).

## The funnel I recommend: "a good Kigali broker on WhatsApp"

One idea runs through it: **the bot sells a viewing, not a list.** Each stage has one job and one exit.

| # | Stage | What the bot does | Exit / metric |
|---|---|---|---|
| 0 | **Hook** (TikTok K-code, /k page, web, plain hi) | Greets in their language and names what they came for ("The 1-bed in Gikondo from TikTok? Let me check it's still free"). Starts the availability check *now*. | replied |
| 1 | **Understand** (≤2 turns) | Fills 5 slots: area(s), max budget, size/type, furnished, move-in date. Asks only for what's missing, one question at a time. Then confirms in one line: "So: 1-bed, Kicukiro/Remera/Kabeza, up to 150k, from December. Right?" Never re-searches on small talk. | brief confirmed |
| 2 | **Pre-verify** | Pings the brokers of the top 3–5 matches **in parallel, before showing anything**: "Checking 3 that fit. Back in about 30 min." Shows confirmed-free homes first and labels the rest honestly. This fixes "every pick is taken". | ≥1 confirmed home |
| 3 | **Show 1–2, as media** | Sends the home's photo or clip *natively in WhatsApp* with a 3-line caption: rent, area, move-in total, one reason it fits *their* brief. Then: "Want to see it?" The /find link goes once, at the end, for "more". | picked (target 26% → 50%) |
| 4 | **Book in the same breath** | Offers two concrete slots that work for the broker and for Abdout's hours (9–18, Mon–Sat): "Thursday 4pm or Saturday 10am? Osman from Mkan meets you there." One tap books it. | slot chosen (today 0%) |
| 5 | **"Can I talk to someone?" (autonomous, your call)** | Never says "I can't connect you". It reads the need behind the ask, which is usually "I want to meet / see it / trust this", and answers it itself: "I handle everything here, so ask me anything. When you're ready to see it, someone from Mkan meets you at the house. Thursday 4pm or Saturday 10am?" That is true: a Mkan person attends every viewing. No ping to the rep feed and no promise that someone will reply. You can still take over a chat with `take K…`. | ask → slot offer |
| 6 | **Recover from "taken"** | Never ends on "sorry". Goes straight to the next confirmed home. Reads the broker's "I have another one…" as fresh inventory and offers it. | recovered pick |
| 7 | **Viewing day** | Evening-before + 2 h-before reminder, location pin, Osman's name. After: "How was it? Want to take it?" → deal (the existing `deal.ts` / 48 h flow). | viewed → signed → paid |
| 8 | **Nurture** | New *confirmed* homes that match their brief, at most one every 2 days. STOP works on the first try (it already does). | returning |

**The broker side** (it feeds stage 2/4):
- One batched message per broker per day.
- Never ask about the same home twice within 72 h.
- Lead with value: "a tenant with 150k for a 1-bed, ready to view this week".
- Ask *availability and viewing slots together*: "Is it free? Can we come Thursday 4pm or Saturday 10am?" One broker reply then gives a yes **and** a time.
- Log every "I also have…" as a listing lead.

**Voice rules:** Kigali-local, mirrors the tenant's language (rw / en / fr / ar), 1–3 short lines, varies its wording, names the home and the area, no boilerplate tail on every message, never claims to be human, and never states a price or availability the data doesn't back. The guards in `writer.ts` stay.


## Status (2026-11-21)

All three phases are on main and not deployed yet. The public page is `content/docs-{en,ar}/chat-funnel.mdx`
(`/docs/chat-funnel`). For what shipped, see `src/components/agent/README.md` ("The chat funnel", "The conversational
driver"). For the scores and what is still owed, see `src/components/agent/ISSUE.md` (2026-11-21).
