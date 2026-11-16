# Demand — the people who reach Mkan

**Written 2026-11-16. The bottleneck now is the top of the funnel: almost nobody reaches Mkan.** The rental
agent, the WhatsApp line, the viewing loop and the deal pipeline all work. In the last two days 0 real people
wrote, on the web or on WhatsApp. This doc studies that number, says why it is low, and ranks what to do about
it. The live number is on [/monetize](https://www.mkan.sd/en/monetize): two cards, Web and WhatsApp, at the top
of the page.

> Abdout, 2026-11-16: "We want to know how many approach us in web alone and how many approach us from
> WhatsApp also alone … this number we will decide on all the processes that can rise with this number. So we
> know we have a problem even before, not after."

---

## 1. The number, defined once

- **A person** is a real profile: not the team, not a test phone, not one of Abdout's contacts, not an admin,
  not a headless browser, not a browser the team marked as its own (`REAL_PERSON`,
  `src/lib/monetize/team.ts`).
- **Their day** is the Kigali day of their first message.
- **Their channel** is where they first wrote:
  - **Web**: the /find chat or the bubble.
  - **WhatsApp**: the line, +250 780 984 777.
  - Someone who starts on the web and taps "Continue on WhatsApp" counts **once, under web**, and shows as
    "→ WhatsApp" there.
- **Target: 1 new person a day, both channels together (7 a week).** It is a floor, not a goal. It moves up
  once the data says what is reachable.
- **Upstream of a person**, counted since 2026-11-16 (`SiteSignal`), always as people, not hits:
  - **visitors**: home, /find, /today, /tt, /k, listings;
  - **chat opens**: the bubble or /find;
  - **WhatsApp taps**: every "Chat / Ask / Check availability on WhatsApp" button;
  - **where each came from**: a `?s=` marker, else the referrer.

Code: `src/lib/monetize/inbound-pure.ts` (the definition), `src/lib/monetize/inbound.ts` (the loader),
`src/components/monetize/inbound-cards.tsx` (the cards).

## 2. The study — what the numbers say

### The series (real people, by first day, 45 days to 2026-11-16)

| Kigali day | Web | WhatsApp |
| --- | --- | --- |
| 10-21 | 3 | |
| 10-22 | 13 | |
| 10-23 | 2 | |
| 10-24 | 6 | |
| 10-25 … 10-27 | 3 | |
| 11-01 … 11-05 | 3 | |
| 11-11 | 1 | |
| 11-12 | | 1 (from a /k page) |
| 11-13 … 11-16 | 0 | 0 |
| **Total** | **31** | **1** |

### What that means

1. **Launch week was mostly us.** On 10-22 the same starter-card text ("2 bedroom in Kicukiro") arrives from
   fresh browsers every one to two minutes. Next to it come wizard taps ("Months, Kicukiro"), the second
   starter card, and Sudanese Arabic ("داير بيت في كبيزا", "شقتي بغرفتين في كيا") from a Kigali site in its
   first days. That is the team testing from anonymous browsers, which pass the real-person filter. **The true
   baseline is lower than every number shown until now.**
   - The cards' admin list shows each person's first words with an "Ours" tap.
   - Cleaning launch week is the first job; every number below should be re-read after it.
2. **Since 10-27: 6 people in 20 days (0.3 a day), against a floor of 1 a day.**
   - A few read like real renters: "i want two bed rooms in kimironkio", "I need your services please! A friend
     of mine is looking for…", "Check K5811 for me".
   - Real demand exists, at a trickle.
3. **WhatsApp: 1 person, ever.** They came from a home's /k page on the web, not from TikTok directly.
4. **TikTok:**
   - About 2,700 views on 10 days of posting, 0 comments, 25 followers.
   - 1 chat traced to it: **about 1 chat per 2,700 views**.
   - At ~70 views a post and 5 posts a day, TikTok alone would bring about one person every 8 days.
5. **No source is recorded for any web person.** Every web chat says "web": nobody knows how they found the
   site. From 2026-11-16 the `?s=` marker and the referrer fix that.
6. **What happens after they arrive** (the next bottleneck, §7):
   - 30 of 32 were shown homes and 8 picked one;
   - 22 saw homes and picked none.

### What we could not see before 2026-11-16

- Site visits, WhatsApp-button taps and chat opens were not counted, outside the listing pages. So nobody
  could tell **reach** problems (nobody saw us) from **conversion** problems (they saw us and left).
- That is now counted, and the early-warning ladder (§5) reads it.

## 3. Why almost nobody arrives

1. **No audience yet.** 25 TikTok followers, about 70 views a post, no comment ever.
   - TikTok shows a new account to few people until it earns watch time and interaction.
   - We post houses, and houses alone don't make people stop, comment or follow.
2. **The web has no traffic source.**
   - Nothing sends people to mkan.sd:
     - no Google presence for "house for rent Kigali";
     - no Google Business Profile;
     - /k and /tt are noindex;
     - the trust gate hid the 4,685 Airbnb homes;
     - nobody shares links in the places renters ask.
   - A website with no inbound links is invisible.
3. **The WhatsApp door depends on one step that rarely happens.** A viewer must read the caption, find the
   number, open WhatsApp and type the code. The bio link isn't clickable under 1,000 followers. Every extra step
   loses most people.
4. **The first screen doesn't speak to a Kigali renter.** The English homepage hero offers nightly stays
   ("Book unique accommodations", islands, boats) and ends on "Inspiration for your next trip in Sudan". The
   Kigali calls to action sit in the strip under it.
5. **Trust.** Kigali renters have been burned by fake listings and brokers who vanish. A new brand with no
   reviews, no office photo and no faces asks for trust it hasn't earned yet.

## 4. The levers — ranked by people per hour of effort

The method is *Bullseye* (Weinberg, *Traction*): test the cheapest channels in parallel for a week each,
measure them with a `?s=` marker, then put the effort into the one or two that work. Every lever below has its
marker, a guess at people a week, a cost, and a rule to kill or keep it after one week.

| # | Lever | Marker | People/week (guess) | Cost | Keep if |
| --- | --- | --- | --- | --- | --- |
| 1 | **Post the day's homes where Kigali renters already ask.** 5–10 Kigali housing Facebook groups, WhatsApp groups and WhatsApp Status: the /today link plus the best home, every day. 20 minutes a day by a person. | `s=fb-<group>`, `s=wa-group-<name>`, `s=wa-status` | 3–10 | time only | ≥ 2 people from one group in a week |
| 2 | **Brokers repost their own cleaned video, tagging @mkan.rw.** Every broker who said yes gets their clean cut on WhatsApp with one line to post. | `s=broker-<handle>` (in the caption link) | 1–5 | time only | any broker's repost brings a chat |
| 3 | **Google Business Profile**, "Mkan — homes for rent, Kigali", at the Kimironko office, linking to /today, with weekly photo posts. Free; it shows in Maps searches. | `s=gbp` | 1–3 after verification | free, ~1 h set-up | profile views > 0 in 2 weeks |
| 4 | **Be findable on Google.** Make /today and the published homes indexable, with the words people type: "house for rent Kigali", "apartment Kimironko", "inzu ikodeshwa", "maison à louer Kigali". Each home's page title: "2-bedroom house for rent in Kimironko — 350,000 RWF". | referrer `google` | slow (4–8 weeks), then steady | dev time | impressions in Search Console grow week on week |
| 5 | **TikTok, comments first.** End every post with a question ("Which area should we show next?"), answer every comment within the hour, pin "WhatsApp +250… send the code". Add an informational video a week ("What 300k gets you in Kigali", "How renting works: deposit, commission"). | referrer `tiktok`, code | 1–3 | time only | comments > 0 and a chat a week |
| 6 | **Posters with a QR code** to /today at the campuses (UR, ALU, AUCA, Mount Kenya University) and in Kimironko / Remera kiosks: "Find a room near campus — free viewing". Students move every term. | `s=poster-<place>` | 2–5 per placement | ~5,000 RWF printing | ≥ 1 chat per poster in 2 weeks |
| 7 | **Partners who see people arriving in Kigali:** university housing and international offices, HR at employers who hire from outside Kigali, relocation agents, NGO admin teams. One message each, with a link that tells us they sent the person. | `s=partner-<name>` | lumpy; 1 partner can mean 5 a month | time only | any partner sends one person |
| 8 | **Referral.** Every tenant who gets a viewing gets a link to send a friend ("your friend's viewing is free too"). | `s=ref-<code>` | grows with deals | free | after the first viewings |
| 9 | **Paid Promote**, only on a post that already beat 200 views and 5% interaction. Goal: messages on WhatsApp, Kigali, 20–45, three days. Judge on people per dollar. | `s=promote-<post>` | unknown; test with $5 | money (Abdout chose $0 for now) | cost per person < 2,000 RWF |

**My advice: start with levers 1, 2 and 3 this week.** They cost nothing but a person's time, they put Mkan
where renters already are, and the markers make each one countable by next Sunday. Levers 4 and 6 come next.
Lever 9 waits until something organic works.

Two fixes make every lever pay more and need no new channel:

- **The homepage hero.** For English and Kinyarwanda visitors, lead with "Find a home to rent in Kigali — free
  viewing", one button to the chat and one to WhatsApp. The Sudan site keeps its own. This is Abdout's call;
  the hero is shared with the Sudan site.
- **Trust on every page.** Show the office in Kimironko, "a person from Mkan comes to every viewing", that Mkan
  never asks for money before a viewing, and the company name and TIN once Databayt Ltd's details are public.

## 5. Knowing before, not after — the early-warning ladder

A drop shows upstream before it shows in people. Each Sunday the numbers message reads the ladder from the top
and names the first step that fell by 30% or more:

| Step | Counted as | If it falls | First thing to do |
| --- | --- | --- | --- |
| **Reach** | TikTok views, site visitors | Fewer people saw us | More posting where renters are (levers 1–3); check TikTok didn't bury the posts (5-a-day cap) |
| **Intent** | Chat opens, WhatsApp taps | People came but didn't act | The pages' call to action: the hero, the strip, the /today and /k buttons |
| **Arrival** | New people (the two cards) | They tapped but didn't write | The WhatsApp door: is the line paired, is the hook alive (📡 alert), is the prefilled text right? |
| **First reply** | Shown homes | They wrote but left | The first screen of the chat: speed, the homes shown, the language |

The cards show the same ladder for the week: Web shows visitors → opened the chat → wrote; WhatsApp shows taps →
arrived, plus TikTok views.

## 6. The weekly rhythm

The canon is EOS, *Traction* (Wickman), principle #17: a weekly Scorecard of a few numbers, each with one owner.
A red number becomes an Issue to Identify, Discuss and Solve.

- **Owner:** one person owns "people reaching us" (suggested: whoever runs Mkan's social and sales).
- **Sunday 20:00:** the numbers message to Abdout leads with this number: web and WhatsApp this week vs last
  week vs 7, what moved upstream, the bottleneck, and the sources (which marker brought whom).
- **Monday:** the same block as a #mkan card. The owner picks **one** experiment from §4, gives its links a
  marker, and runs it all week.
- **The next Sunday:** keep it, kill it, or double it, by the rules in §4.
- **The sprint loop** carries a standing weekly "Inbound" task, so it plans for this number whenever it runs.

## 7. The next bottleneck — after people arrive

Once 7 people a week arrive, the funnel's weakest step is **shown → picked: 27%.** 22 of 32 saw homes and picked
none. The likely reasons are fit, not the bot:

- the area they asked for has few homes;
- the price is above what they said;
- the homes don't match on furnishing or size;
- they only wanted to look.

The work then:

- read each "picked none" chat's request against what was shown;
- widen supply where requests cluster (the TikTok sweep and broker asks by area);
- add one line under the homes, "None of these? Tell me what's wrong", so a quiet tenant tells us why.

The /monetize ladder marks it as "next" now, so the move is ready when this one turns green.

## 8. What not to do

- **No more conversion features until people arrive.** The 11-15 report said it, and these numbers say it
  again.
- **No bought followers, no spam in groups.** One useful post a day per group, the way a member would.
- **No paid reach before an organic post shows it works** (lever 9's rule).
- **Never stop the TikTok house posting.** Only the count is tuned. The other video kinds come on top.
