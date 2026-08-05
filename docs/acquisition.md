# Acquisition — more homes, and an owner behind each one

> A home with no owner is a lost home. This is the plan for getting both:
> inventory from beyond Airbnb, and a reachable person attached to every
> listing we already hold.
>
> Extends [growth.md](./growth.md) G1.8. The CRM objects, the trust score and
> the import path do not change — this adds sources to the front of them and an
> outreach loop to the back.

## 1. Where we actually are

| | homes | with a contactable owner |
|---|---|---|
| Airbnb (scraped) | 121 | **0** |
| Real owners 0001–0003 | 23 | 3 |

Zero is not a tooling gap, and it is worth being precise about why, because it
determines the whole shape of this plan.

`contact-extract.ts` handles Sudanese mobile formats (`+249`, `00249`, `09…`,
`01…`, bare 9-digit), Arabic-Indic and Persian digits, eight diaspora country
codes, `wa.me` links, emails, Facebook, Instagram and Telegram, and it scores a
number higher when it sits within 40 characters of واتساب / للحجز / اتصل. It has
been run over every published field in both languages — titles, descriptions,
house rules, host bios — for all 72 hosts: **156,515 characters, containing six
runs of six or more digits, all six the same electricity meter ID.**

Airbnb strips contact details from listing copy by design; that is the product.
No additional pattern changes it. **The channel has to come from outside
Airbnb.**

What Airbnb *does* give us is everything needed to recognise the same person
somewhere else: their name, their cover photos, their city, their listing prose,
and — recovered from the worksheet — where 55 of them live, 37 of those abroad.

## 2. The insight this plan turns on

Facebook groups and WhatsApp groups are the inverse of Airbnb:

| | Airbnb | Facebook / WhatsApp groups |
|---|---|---|
| structure | excellent — price, beds, baths, amenities, photos, geo | poor — a paragraph and some photos |
| contact | **none** | **the phone number is the point of the post** |
| dedupe key | stable listing id | none |

So the second corpus is not merely more inventory. **It is the contact index for
the first one.** A Khartoum owner who lists on Airbnb also posts the same
apartment, with the same photos, to a rentals group — with their WhatsApp
number, because that is how a Sudanese rental actually closes.

That join is the highest-value thing in this document, and the worksheet already
names the mechanism: reverse-image the Airbnb cover photo. Hosts cross-post
photos verbatim. Photo hash → group post → phone number → the Airbnb host record
we already hold.

This is why "scrape more sources" and "get host contacts" are one project rather
than two.

## 3. Source adapters

One shape in, the existing pipeline out. Every adapter emits the same
`RawListing` / `RawHost` records that `airbnb-parse.ts` produces today, so
scoring, re-hosting, import, publish and the CRM sync are untouched.

```
adapters/            → .data/<source>-scrape.json → crm:score → crm:rehost
  airbnb/     (built)                             → crm:import → crm:publish
  facebook/   (new)
  whatsapp/   (new)
  listings/   (new — other rental sites)
  field/      (new — scout submissions)
```

**Schema work first, since everything keys off it:**

- `ListingSource` is `AIRBNB | FACEBOOK | MANUAL`. Twenty's `source` SELECT
  already carries `AIRBNB, FACEBOOK, WHATSAPP, REFERRAL, FIELD_SCOUT, OTHER`, so
  Prisma is the one that is behind. Append-only migration, same rule as the
  amenity widening.
- `sourceListingId` is `@unique` globally. A Facebook post id and an Airbnb room
  id can collide in principle; the dedupe key should be `(source,
  sourceListingId)` as growth.md §4.5 already specifies.

### 3a. Facebook groups

Sudanese rental groups are where the inventory and the numbers both live.

**Access is the constraint, and it is a real one.** Automated scraping of
Facebook violates Meta's terms, most useful groups are private, and an account
that behaves like a crawler gets disabled — taking the group membership with it,
which is the asset. So the design is human-in-the-loop by default:

1. **A member opens the group in the vault browser** (the same CDP session
   pattern the Airbnb scraper uses) and scrolls the feed normally.
2. **A capture hook records what the human is already looking at** — post text,
   photos, author, permalink. No headless crawling, no automated pagination, no
   request volume that looks unlike a person.
3. **Extraction is offline** on the captured payload: `contact-extract.ts`
   unchanged for numbers, plus a new listing-shape parser for the prose
   (bedrooms, price, neighbourhood — Arabic first).

This is slower than a crawler and it is the version that still works in three
months. Where Meta offers a supported path for a group we administer, use it.

### 3b. WhatsApp groups

Same shape, sharper constraint. WhatsApp has **no API for reading groups you are
a member of**. The libraries that claim otherwise drive a logged-in web session
and are a ban risk for the number — and the number is how we then reach hosts,
so burning it costs more than the data is worth.

Two supported paths:

- **Export chat** — WhatsApp's own per-group export produces a `.txt` (and
  media) that a member can hand over. One file, fully parseable, zero ToS
  surface. This is the default.
- **WhatsApp Cloud API for inbound** — a business number that receives, so hosts
  who reply or forward a listing land in the CRM automatically.

The parser is the interesting part and it is shared with Facebook: a group post
is a paragraph of Arabic with a price, a neighbourhood and a number. Same
extractor, different envelope.

### 3c. Other rental platforms

Discovery step first — enumerate what actually carries Sudanese inventory
(classifieds, local property sites, Telegram channels) and measure each for
volume and contact-richness before building an adapter. One adapter per source
only once it clears a threshold worth maintaining.

## 4. Identity resolution — the join

New sources arrive without a stable id, so the merge is the load-bearing piece.
In descending order of confidence:

| signal | how | strength |
|---|---|---|
| **Cover-photo match** | perceptual hash (pHash/dHash) of every Airbnb photo vs every captured photo | **strongest** — hosts cross-post verbatim |
| Phone → existing host | a number already on a CRM Host | strong |
| Name + city | fuzzy, Arabic-normalised (ال- prefix, ة/ه, ي/ى) | weak alone |
| Listing prose | distinctive title/description n-gram overlap | medium |
| Price + layout + neighbourhood | 3-bed in Al-Riyadh at ~40k | corroborating only |

Two or more independent signals → `crossSourceCorroborated: CONFIRMED`, which
growth.md §trust already scores at 9 points. One signal → `PARTIAL` and it goes
to a human.

**This is where the 121 anonymous Airbnb homes become reachable.** Every
confirmed match writes the phone onto the existing Twenty Host — no new record,
no duplicate listing.

Photo hashing is cheap and offline: we already hold every Airbnb photo on our own
CDN from the re-host step.

## 5. Contact acquisition, in priority order

1. **Photo-match against captured group posts** (§4) — highest yield, fully
   automatable, no new outreach surface.
2. **The operator worksheet** — already generated for all 72 hosts, ordered by
   portfolio size, with a reverse-image link, an Arabic name+rentals search, a
   `site:facebook.com` search, and for the 37 diaspora hosts a search against
   where they actually live. This is human work and it is not wasted: the
   biggest portfolios are 16, 8 and 6 listings, so the top ten hosts carry a
   large share of the inventory.
3. **Re-run `crm:host-profile`** — needs the vault-Chrome CDP session, which is
   not currently listening. `about` and `work` are free text and are the last
   Airbnb-side surface; the wipe bug that emptied them is fixed, so a re-run now
   sticks.
4. **Inbound** — a claim link, a listed WhatsApp business number, and the
   `/claim/<token>` flow that already exists. An owner who finds their own home
   on mkan.sd and asks for it is the cheapest contact we will ever get.

Everything lands the same way: `contact-hunt.json` (or
`contact-hunt-manual.json` for human finds) → `crm:sync-contacts --apply` →
Twenty Host. That path is built, has the fill-if-empty / never-overwrite rule,
and routes conflicts to `notes` rather than clobbering.

## 6. Then wire it to mkan.sd

Already built, and currently reporting `0 host phone numbers to fill in` purely
because the CRM has none: `crm:sync-down` reads Twenty Hosts and fills
`User.phoneNumber` on the matching mkan account, fill-if-empty only. The moment
contacts exist in the CRM they reach the site on the next 6-hourly sync with no
further work.

**One real gap to close.** `outreach.ts` reads `host.whatsapp` from
`.data/airbnb-scored.json`, and nothing ever writes a contact back into that
file — `crm:sync-contacts` writes only into Twenty. So every draft lands as
`needs-contact-hunt` even after a contact is found. Outreach should read hosts
from Twenty, making the CRM the single source of truth for contact, exactly as
it now is for publish state.

## 7. Hermes agents

`hermes-gateway.service` is running, with adapters for WhatsApp Cloud, Signal,
Slack and generic webhooks; only Slack is connected today. Four roles, in the
order they earn their keep:

1. **Capture assistant** — sits beside the human browsing a group, extracts
   structure from each post, asks only when a field is ambiguous. Turns an hour
   of scrolling into clean records instead of a screenshot folder.
2. **Extraction and matching** — runs §4 over new captures, proposes merges with
   evidence, escalates `PARTIAL` to Slack for one-click confirm. This is the
   biggest time win and carries no messaging risk.
3. **Outreach** — drafts per host from `outreach-templates.ts` (Arabic first,
   already written), sends via WhatsApp Cloud, threads replies back onto the CRM
   Opportunity, and escalates anything that is not a clean yes/no to a human.
4. **Follow-up and claim** — chases the claim link, answers the three questions
   every owner asks, hands over on anything else.

**Constraints to design against, not discover later:**

- WhatsApp Cloud API business-initiated messages need **pre-approved templates**,
  and cold outreach at volume to numbers that never opted in is how a business
  number gets restricted. Template approval, a warm-up ramp, per-day caps and an
  instant stop on the first block signal are part of the build, not a follow-up.
- The 37 diaspora hosts are not on +249. Route by `livesIn`, and expect that
  some are better reached on Facebook Messenger than WhatsApp.
- **Every message is a real message to a real person about their own property.**
  Human-send stays the default until reply quality is measured; `outreach.ts`
  already works this way and that default should survive the automation.

## 8. Sequence

| # | Step | Depends on | Notes |
|---|---|---|---|
| 1 | `ListingSource` + composite dedupe key | — | append-only migration |
| 2 | Outreach reads contacts from Twenty | — | closes the §6 gap |
| 3 | Re-run `crm:host-profile` | CDP session up | recovers `about`/`work` |
| 4 | Photo-hash index over the CDN photos | — | offline, cheap, no new surface |
| 5 | WhatsApp export parser | a member's export file | simplest real source |
| 6 | Facebook capture hook + parser | vault browser | human-in-the-loop |
| 7 | Identity resolution + merge into CRM | 4, 5, 6 | the join |
| 8 | Hermes capture + matching agents | 7 | no messaging risk |
| 9 | Hermes outreach on WhatsApp Cloud | 2, 7, templates approved | human-send first |

Steps 1, 2 and 4 need nothing external and are worth doing first. Step 5 needs
one person to export one group.

## 9. How we will know it worked

- **hosts with a contactable channel** — 0 of 72 today. This is the number.
- homes with a `CONFIRMED` cross-source match
- reply rate per channel and per language
- claimed listings (`Listing.claimedAt`) — the only measure that a home has
  found its owner
- homes per source, and how many of those were already in the Airbnb corpus
  (overlap is a signal the join is working, not waste)
