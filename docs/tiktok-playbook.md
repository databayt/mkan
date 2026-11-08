# TikTok playbook: the page is Mkan's front door

> Abdout, 2026-11-07: "TikTok is our main entity. Take good care of it." Every WEEK sprint carries
> at least one TikTok prompt drawn from this file (`src/lib/monetize/roadmap.ts` STANDING_TASKS, the
> planner prompt in `scripts/sprint-cycle.ts`). Change one thing at a time, measure it, keep what
> moves the numbers. Update this file when an experiment teaches something.

## Why TikTok first

Every tenant who reaches a broker started as a viewer. 30 days to 11-08: 17 posts → 2,248 views →
**0 viewers wrote** — not one chat has ever sent a post's code, and the "58 people wrote → 17 asked a
broker" read on 11-07 was the team testing the bot (Abdout, 2026-11-08; the scorecard now leaves the
team out: `src/lib/monetize/team.ts`). Getting a viewer to write is the first job, before reach.
More reach and more interaction feed every step below them, and a viewer who follows sees the next
home without being found again.

## The numbers (the TikTok tile on /monetize, `scorecard.ts`)

| Number | Target | What it says |
|---|---|---|
| Posts a day | ≥ 3 | Enough chances to be shown |
| New followers a week | ≥ 20 | The page grows, so each post starts warmer |
| Views a week | ≥ 4,200 | 3 posts a day × 200 views |
| Views per post | ≥ 200 | The algorithm keeps showing our videos |
| Like rate (likes ÷ views) | ≥ 3% | The home and the video please |
| Interaction rate ((likes + comments + shares) ÷ views) | ≥ 5% | People engage, which the ranking weighs above likes alone |
| Follow rate (new followers ÷ views, a week) | ≥ 1% | Viewers want the next home too |
| Viewers who write (chats ÷ views, 30 days) | ≥ 1% | Reach turns into tenants: the conversion |

Data we do not have yet, and should add (a loop task): per-post watch time and completion, profile
visits, shares and saves per post (TikTok Studio analytics, read in the logged-in Chrome like `tt:stats`).

## What TikTok rewards (sources below)

- **Watching to the end, and watching again.** TikTok says a strong signal, such as finishing a
  longer video, weighs more than a weak one; the guides rank watch time and completion first,
  then rewatches, shares, saves and comments. Likes count least.
- **What the video says it is.** Captions, sounds and hashtags are "video information". Search
  also reads the on-screen text and the spoken words, so the words people search for belong in the
  first line of the caption and on screen in the first seconds, all saying the same thing.
- **Follower count is not a direct factor** (TikTok). A new page can reach far on one good video;
  the first audience is a small test group, then wider if they watch.
- **Variety.** The feed avoids two videos in a row from one creator or one sound: post spread through
  the day rather than in bursts.
- **Hook early.** TikTok's ad guidance says to put the hook in the first 6 seconds; most guides say 1–3.
  For a home: the best room and the price on screen at once.
- **Native and simple beats polished.** Real tours, natural light, captions on screen (many watch muted).
- **Trust.** Rental scams are common on TikTok: a study flagged most TikTok rental listings it checked;
  a non-local number and below-market prices were top warning signs. A local number, real prices and
  "checked by Mkan" earn the trust a scam page cannot.

## The levers, where they live, and how to test them

Each is one experiment: alternate posts with and without the change (or one week against the last),
at least 10 posts per side, and judge on views per post, like rate, interaction rate and follow
rate per post (`TikTokPost.views`, `likes`; page stats for followers). Record it in **Experiments**
at the end of this file and as the sprint lesson; keep the winner as the default.

1. **The hook on screen.** In the first second, a text line on the video: "2 bedrooms · Kimihurura ·
   400k/month". It is both the hook and the search keyword (on-screen text is read). Where: the render
   step in `scripts/crm/tiktok-post.ts` (the end card is drawn there already).
2. **Length.** Trim listing videos to 12–25 s so most viewers finish; open on the best room, not the gate.
3. **Search-first caption.** First line in plain words people search: "House for rent in Kimihurura,
   Kigali: 2 bedrooms, 400,000 RWF a month". Full sentences, then 3–5 hashtags (#kigali #houseforrent
   #inzuikodeshwa + the area). Where: `captionFor` in `scripts/crm/tiktok-post-pure.ts`.
4. **Ask for the follow.** "Follow for new Kigali homes every day" in the caption and on the end card.
5. **Ask a question.** "Which area should we show next? 👇": comments are a stronger signal than likes,
   and the answers are demand data. Replies to comments go out from a person (Abdout's call), never automatically.
6. **Cadence.** Every day, spread over the evening hours Kigali scrolls (17:00–21:30, the plan-B slots);
   never two in a row from the same broker's footage.
7. **Series and pins.** Playlists by price and area ("Under 200k", "Kimihurura"); pin three videos: "How
   renting with Mkan works" (free viewing, no fee, WhatsApp the code), the best-viewed home, a trust video.
8. **Conversion path.** The code in the caption + WhatsApp number (live; the second line since 11-08,
   where TikTok shows it before "more"); a chat that says "on TikTok" or "saw your video" counts as
   TikTok's without the code (`refSourceOf`); the WhatsApp link in the bio
   (Business account: check the follower minimum), and the same instruction as the pinned comment.
   The whole setup behind it — Databayt Ltd, the business number, mkan.rw, the verified Business page,
   MoMo — is [kun.databayt.org/en/docs/mkan-setup](https://kun.databayt.org/en/docs/mkan-setup); the bio link
   opens mkan.rw → the homes from our videos (`/[lang]/tt`), and those chats are tagged `tiktok_bio`.
9. **Sound.** Keep the broker's sound with spoken numbers muted, or test a Commercial Music Library
   track (business accounts may only use that library).
10. **Trust line.** "Checked by Mkan: real home, real price, free viewing" on the end card.

## Rules

- One lever at a time; the loop never posts by hand and never replies to people (gated).
- A change that cuts views per post by more than 20% over 10 posts is rolled back.
- Every finished experiment updates this file: what moved, by how much, kept or dropped.

## Experiments

One line each, newest first: date started · lever · the change · baseline · result (date judged) · kept or dropped.

- 2026-11-08 · lever 8 (conversion path) · the `📲 WhatsApp … — send "K…"` line moves from the third caption line to the second (under the search line when lever 3 is on), so it shows before "more"; both lever-4 arms get it, so the follow test stays fair · baseline 0 TikTok chats in 17 posts / 2,248 views (no message ever carried a code; viewsToChats now counts TikTok-tagged chats only) · metric: TikTok chats per 1,000 views on /monetize ("TikTok viewers who write") · judge after 10 posts with the new caption · result: pending

- 2026-11-08 · lever 3 (search-first caption) · QUEUED, switch OFF (`TIKTOK_SEARCH_CAPTION=1` turns it on) · first line in plain searched words ("House for rent in Kimihurura, Kigali: 2 bedrooms, 400,000 RWF a month"), then 3–5 hashtags incl. #inzuikodeshwa and the area; code, WhatsApp line and askFollow tag kept · baseline follow rate 0.32%, viewsPerPost 115, like rate 2.5% (66 likes / 2,650 views, tt:stats 11-07 19:01) · turns on the day lever 4 is judged, never before · result: not started
- 2026-11-07 · lever 4 (ask for the follow) · every even post number's caption adds "Follow for new Kigali homes every day" (English + Kinyarwanda) after the home code and WhatsApp lines; odd posts unchanged; tagged `askFollow` in the ledger and queue · baseline follow rate 0.31%, followersWeek 5.8 · judge after 10 posts per side, compare views, likes and follower gain · result: pending
  2026-11-08 fix: the 11-07 posts carried no tag because they were queued before lever 4 shipped (20:33); every pick since writes `askFollow` to the ledger and to `TikTokPost` (new columns `askFollow`, `waLine`), and `tt:stats` now reads both marks back from the live caption, so the 11-07 posts are classified too. Per-post comments, shares, saves, watch time and completion are stored by `tt:stats` (Studio fields need the logged-in Chrome; migration 20261108120000_tiktok_post_per_post_numbers).
  interim 2026-11-08: askFollow 0 of 10 posts per side in the ledger (the 11-07 posts predate the tag or carry none; 3 posted 11-07, none tagged), so no per-side numbers yet. Page-level tt:stats 11-07 19:01: followers 21, views 2,650, likes 66, comments 0, shares 5, 10 home videos; followers gained since lever 4 began (20 → 21) = 1, not attributable to a side.
- 2026-11-06 · lever 6 (cadence) · posts spread ~5.5 h apart instead of one 07:00 burst · baseline viewsPerPost 139 · not due until 10 spread posts · result: pending
  interim 2026-11-08: 11 spread posts in the ledger (9 on 11-07, 2 on 11-08), 13 home videos / 836 views = 64 views a post against 139 (−54%, past the −20% rollback line). Not a verdict: 5 of the 11 are under 24 h old and views keep growing for days, only 6 are mature, and levers 4 and 8 changed the captions in the same window. Judge on 10 mature spread posts (≈ 11-10); roll back only if the mature ones still sit under 111.
  interim 2026-11-08 18:00: 16 spread posts in the ledger (2 on 11-06, 9 on 11-07, 5 on 11-08); the 6 older than a day average 109 views against 139 (−22%, just past the −20% rollback line but 2 under the 111 floor of the rule above), all 16 average 54. Still not a verdict: 10 mature posts are due ≈ 11-10 and levers 4 and 8 share the window. Per-post interaction (likes+comments+shares+saves over views) last 7 days: 2.1% of 856 views; best K6552 4.9% of 184, worst K6496 0.0% of 83. The comments/shares/saves/watch-time columns exist in code but migration 20261108120000_tiktok_post_per_post_numbers is not applied, so tt:stats cannot write TikTokPost yet (the ledger file is filled).
  interim 2026-11-08 evening: 17 spread posts in the ledger, 7 older than a day averaging 93 views against 139 (−33%, under the 111 floor); all 17 average 50. Not due: 10 mature posts arrive ≈ 11-10, and levers 4 and 8 share the window. tt:stats now fills the ledger for every post (16 of 17 carry the askFollow tag, 3 asked, and the lever-8 line mark); the TikTokPost columns stay unwritten until migration 20261108120000_tiktok_post_per_post_numbers is applied. Interaction last 7 days, 16 posts: best K6552 4.9% of 184, worst K6496 0.0% of 83.
  interim 2026-11-08 night: 20 spread posts in the ledger, 8 older than a day averaging 104 views against 139 (−25%, under the 111 floor); all 20 average 44. Not due: 10 mature posts arrive ≈ 11-10, and levers 4 and 8 share the window. tt:stats re-run: ledger filled, TikTokPost write still fails ("column comments does not exist") until migration 20261108120000_tiktok_post_per_post_numbers is applied. Interaction last 7 days, 20 posts: 2.07%; best K6552 4.9% of 184, worst K6496 0.0% of 83.
  interim 2026-11-08 late: 20 spread posts in the ledger, 9 older than a day averaging 94 views against 139 (−32%, under the 111 floor); all 20 average 44. Not due: 9 of the 10 mature posts needed, the tenth matures ≈ 11-09/11-10; levers 4 and 8 share the window. Ledger carries askFollow on 20 of 20 spread posts (5 asked) and the lever-8 line on all 20; the TikTokPost write waits on migration 20261108120000_tiktok_post_per_post_numbers. Interaction last 7 days, 15 posts: 2.07% of 871 views; best K6552 4.9% of 184, worst with 50+ views K6496 0.0% of 83.
  interim 2026-11-08 (lever 4 count, sprint run): ledger counts per side = 5 asked / 15 not asked (20 spread posts); the asked side is short by 5 of 10, so lever 4 is NOT judged and lever 3 stays OFF (`TIKTOK_SEARCH_CAPTION` untouched). tt:stats could not refresh in this run (no logged-in Chrome), so the numbers are the ledger's; the TikTokPost columns still wait on migration 20261108120000_tiktok_post_per_post_numbers (apply it). Due: the 10th asked post lands ≈ 11-10 at the current pace and needs a day to mature, so judge ≈ 11-11; lever 3 goes live the same day with a baseline refreshed from that day's tt:stats.
  interim 2026-11-08 (sprint run, migration applied): tt:stats ran against Studio and wrote 20 TikTokPost rows (comments, shares, saves, watch time, completion where shown; askFollow and waLine marks). Lever 6 count: 20 spread posts, 9 mature (older than a day) averaging 94 views against 139 (−32%); the tenth matures ≈ 11-09, so NOT judged, no verdict. Levers 4 (5 asked of 20) and 8 share the window; lever 3 stays off. Interaction last 7 days: best K6552 4.9% of 184, worst K6496 0.0% of 83.
  (note: lever 4 overlaps the cadence run; judge its two sides against each other, never against 139.)

## Sources (read 2026-11-07)

- [How TikTok recommends videos #ForYou (TikTok Newsroom)](https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you)
- [Introduction to the TikTok recommendation system (TikTok Transparency)](https://www.tiktok.com/transparency/en/recommendation-system)
- [Creative best practices for performance ads (TikTok Ads help)](https://ads.tiktok.com/help/article/creative-best-practices?lang=en)
- [How the TikTok algorithm works in 2026 (Hootsuite)](https://blog.hootsuite.com/tiktok-algorithm/)
- [TikTok Algorithm 2026 Explained (SocialPilot)](https://www.socialpilot.co/blog/tiktok-algorithm)
- [TikTok SEO: actionable tips (SocialPilot)](https://www.socialpilot.co/blog/tiktok-seo)
- [How to Use TikTok for Real Estate in 2026 (Tom Ferry)](https://www.tomferry.com/blog/tiktok-for-real-estate/)
- [TikTok for Real Estate Agents: 2026 Guide (reel-e)](https://www.reel-e.ai/blog/tiktok-real-estate-agents)
- [Nearly 70% of TikTok rental listings raise red flags (Multifamily Executive)](https://www.multifamilyexecutive.com/apartment-trends/nearly-70-tiktok-rental-listings-raise-red-flags-study-finds)
- [How to drive TikTok leads to WhatsApp (ManyChat help)](https://help.manychat.com/hc/en-us/articles/19074496861468-How-to-drive-TikTok-leads-to-WhatsApp)
- [How to add a WhatsApp link to TikTok (Trengo)](https://trengo.com/blog/how-to-add-whatsapp-link-to-tiktok)
- [Pinned TikTok posts (Planoly)](https://www.planoly.com/blog/pinned-tiktok-post.md)

Most guide figures (point weights, the "3-second" rule, caption lengths) are vendor claims TikTok has
not confirmed: treat them as hypotheses for experiments, not facts.
