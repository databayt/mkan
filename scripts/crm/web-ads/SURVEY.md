# Web ads survey: Kigali rental sites (2026-10-21)

This survey decides which Rwandan property websites get an adapter in the web lane (`scripts/crm/web-ads.ts`). Run `pnpm crm:web-ads survey` to re-check the list in `survey.ts`. The command fetches each site's robots.txt and first list page, counts the distinct ad links, and tests a real ad with each adapter. It prints the same table as the one below.

**To pass, a site must have:**
- at least 30 Kigali rental ads, each with a price;
- ads readable without logging in;
- a robots.txt that allows the list and ad pages;
- a phone number or an agency name on each ad.

How the research was done:
- Candidates came from web searches, earlier lead work, and guessed domains. The guessed domains that did not resolve were `house.rw`, `rwandahouses.com`, `realestate.rw`, `lamudi.rw`, `propertypro.rw`, `vision-city.rw` and `rentinrwanda.com`.
- Pages were fetched one at a time, at least 2 s apart, as `mkan-rentals/1.0 (+https://mkan.sd; …)`.

## Result

| site | list page | robots | rendering | ads (est.) | price | phone / agency | login | verdict |
|---|---|---|---|---|---|---|---|---|
| **houseinrwanda.com** | `/for-rent` (`?page=0..4`) | allows | static (Drupal) | 110 per page × 5 ≈ **550** | yes, RWF "/month" | phone + agency on each ad | no | **PASS: adapter** |
| **rwandahouseland.com** | `/forRent` (`?page=1..38`) | allows all | static (Laravel) | 24 per page × 38 ≈ **900** | yes, FRW or USD, "Payable monthly" | broker name + phone + WhatsApp | no | **PASS: adapter** |
| **imali.biz** | `/category/23/27/houses-for-rent?all`, `/23/91/apartment-…`, `/2/88/room-…` | allows all | static | 21 newest per category ≈ **63** (about 40 new a week) | yes, RWF | phone ("Call on") | no | **PASS: adapter** |
| abahuza.com | home page and `sitemap.xml` | allows all | static | 436 rent URLs in the sitemap, about 70 updated in the last 6 months | yes, RWF and USD | phone + publisher | no | near-pass. Same stock as houseinrwanda (both from ESERCOS Ltd), so dupKey would merge it. Not worth an adapter yet. |
| kigaliproperty.com | `/filter/house/rent`, `/filter/apartment/rent` | allows (`/contact-agent` disallowed) | static | about 20 + 7 | yes, RWF | agency only (one agency's catalogue) | no | FAIL: fewer than 30 |
| rw.zimcompass.com | `/houses-for-rent` (`?page=2`) | content-signal header only, no Disallow | static | 45 per page × 2 ≈ 90 | yes, RWF and USD | seller name; **phone behind the "contact seller" button** | no | near-pass. Fresh owner ads (dated the same day). Next adapter if the phone shows without a login. |
| kigalilife.co.rw | `/ad-category/real-estate/houses-apartments-for-rent/` (74 pages) | allows all | static (WordPress) | thousands claimed | mixed | phone in text | no | FAIL: newest ad was July 2026, sale ads are filed under rent, and the site footer carries injected spam links |
| plutproperties.com | home (WordPress, Yoast) | allows all | static | 32 property links, rent and sale mixed | yes | one agency's agents | no | FAIL: one agency with a small catalogue. Leave it to the Phase 1 agency directory. |
| nextlinehomes.com | `/properties?listing_type=rent` | allows | **client-rendered** (Next.js, no ads in the HTML) | 0 in the HTML | n/a | n/a | no | FAIL: would need a browser or their API |
| kigaliapartments.com | home and `/locations/*` | allows all | static | no ad list (location pages and contact form only) | some | contact form | no | FAIL: no ad list |
| jiji.rw | | | | | | | | FAIL: closed in Rwanda (the home page is a "closed" banner) |
| livinginkigali.com | | | | | | | | not a listings site. It is a blog plus a Facebook community, so it went into `fb-seeds.proposed.json`. |

`pnpm crm:web-ads survey` printed this on 2026-10-21:

```
site             http  robots render  ads/pg ~total priced kigali contact verdict
houseinrwanda    200   ok     static  110    550    107    452    yes     PASS ~550 ads
rwandahouseland  200   ok     static  24     912    28     47     yes     PASS ~912 ads
imali            200   ok     static  21     63     21     39     yes     PASS ~63 ads
abahuza          200   ok     static  8      8      18     17     ?       FAIL ~8 ads (< 30)
kigaliproperty   200   ok     static  20     20     20     54     ?       FAIL ~20 ads (< 30)
kigalilife       200   ok     static  100    7400   202    147    ?       PASS ~7400 ads — but stale, sale ads mixed in, spam links
plutproperties   200   ok     static  32     32     101    110    ?       PASS ~32 ads — but one agency, rent + sale
nextlinehomes    200   ok     js      0      0      0      1      ?       FAIL ads render client-side
kigaliapartments 200   ok     none    0      0      6      37     ?       FAIL no ad list
jiji             200   ok     closed  0      —      0      0      ?       FAIL site closed
```

The automated count is only the first gate, and a human verdict overrides it. For example, kigalilife's link count is inflated: each card links its ad more than once, and the pager reaches far into stale pages.

## The three adapters

- **houseinrwanda**
  - The ad id is the Drupal node id.
  - Each ad has labelled fields: Price, Bedrooms, Bathrooms, Address ("Kigali City, Gasabo, Kinyinya"), Property type and Furnished.
  - The description often contains "Neighborhood name: X", which the adapter uses as the place.
  - The poster is in "Contact details" (with a phone) and "Advertiser agent".
  - There is no posted date. The month in the photo upload path (`advert_photos/2026-10/`) stands in for it, and the 90-day age gate uses that month.
- **rwandahouseland**
  - The ad id is the number in `property_view/<id>`. The list is newest first.
  - Each ad has an asking price in FRW or USD (USD is converted at the reader's rate and noted), "Payable monthly", and Province / District / Sector / Cell.
  - The broker is the `/broker/<n>` link. The adapter skips the avatar initial and drops the site's own footer phone.
- **imali**
  - The ad id is the number in `/isaziso/<category>/<n>/<id>/imp…`.
  - Owners post directly, often in Kinyarwanda, so a poor title is replaced by "4-bedroom villa in Masaka".
  - Prices are in RWF with no period. Kigali rents are monthly, so the adapter reads them as monthly. The usual-band check still flags outliers.
  - The posted date is exact.

On these three sites, almost every ad has its price, rooms and place labelled. The reader (Anthropic, falling back to Groq, text only) runs only when an ad is missing a field. In the first dry run that was 1 ad in 13: an ad with no neighbourhood, where the reader found "Kagugu" in the text.

## Adding a site

1. Add it to `SURVEY_SITES` in `survey.ts` and run `pnpm crm:web-ads survey`.
2. If it passes, write `web-ads/<site>.ts` with these exports: `parseList(html) → {adId,url}[]`, `parseAd(html, link) → RawAd` and a `SiteAdapter`.
3. Save one trimmed, **anonymised** list page and ad page under `tests/crm/fixtures/web-ads/` (the repo is public).
4. Add the adapter to `ADAPTERS` in `web-ads.ts`.
5. Dry-run it: `pnpm crm:web-ads run --site=<site> --limit=5`.
