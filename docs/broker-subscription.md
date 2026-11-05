# Broker lead subscription — price and first offer (draft, 2026-11-05)

**Status: DRAFT. Nothing has been sent.** Abdout approves the price and the text, then sends it by
hand from his own WhatsApp (these five brokers already talk to him there). Broker sends from
Mkan's line stay gated.

## The offer in one line

**RWF 20,000 a month.** A broker gets the tenants Mkan finds in the zones they work, and Mkan books
the viewings. **They keep their whole commission.** The first month is free, so nobody pays until
they have seen leads.

## Price and why (the canon moves applied)

| Canon move | What it means here |
| --- | --- |
| **Price against the real alternative** (Obviously Awesome) | A broker's alternative today is free: posting on TikTok, Facebook and Jiji, then waiting for calls. Mkan doesn't sell "a listing". It sells **tenants who already said what they want and what they can pay, in your zone**. So the price is set by what one tenant is worth to a broker, not by what ads cost. |
| **Value at least 10× the price** | Tenants on Mkan want around RWF 400,000 a month (the median `maxPrice` of monthly asks, last 30 days). One signed tenant earns the broker a commission worth many times 20k, and each viewing earns them the usual RWF 5,000 visit fee. 20k is about **4 visit fees**, so a single closed tenant pays for the subscription many times over. |
| **No bare monthly promise; take a deposit or prepay** (CEO-OS cash mechanics) | After the free month: **RWF 50,000 for 3 months paid up front** (instead of 60,000), or 20,000 a month. Push the 3-month option. |
| **Repackage upward before discounting** | Never cut below 20k. If a broker hesitates, give them more (more zones, the 3-month package) instead of a lower price. |
| **Test a price on new clients first** | These 5 brokers are the test. Keep 20k fixed for this cohort and judge it on their answers before changing it. |
| **No gharar: say exactly what they get** | A lead guarantee written in numbers: **fewer than 3 matched tenants in a paid month means the next month is free.** No hidden fees, and no share of their commission. |
| **Mom Test: get a commitment, not a compliment** | "Sounds good" is not a yes. A yes is a broker who confirms their zones and agrees to the free month. A paid prepay at the end of the month is the real signal. |
| **Break-even** (/monetize todo) | Fixed bills are about RWF 27,250 a month (Cloudflare 7,250, WhatsApp line 5,000, Mac and internet 15,000). **Two subscribers cover them.** That is the target the todo set ("two or three brokers cover the fixed bills"). |

**Cap: 3 subscribers per zone.** This keeps the leads worth having. "Only three brokers get
Kimironko's tenants" makes the value obvious and gives a reason to commit now.

### What a subscriber gets

1. **Matched tenants.** Each tenant who asks Mkan for a home in one of the broker's zones (from the
   `Broker.zoneSlugs` / Twenty `brokerZone` rows), and whose budget fits the broker's price range,
   is sent to the broker on WhatsApp. They get what the tenant needs (bedrooms, area, budget,
   move-in date), not a cold "someone called".
2. **The viewing flow.** When a tenant picks one of the broker's homes, Mkan asks the broker for a
   time, confirms it with the tenant, reminds both, and follows up after the visit. This is the
   existing `deal:book` → viewed → signed path. The broker keeps the visit fee the tenant pays.
3. **Their whole commission.** Mkan takes no share on tenants brought to a subscriber. A
   non-subscriber partner deal stays on the commission-share terms (`Broker.sharePct`).
4. **Their homes on Mkan at no cost.** Their TikTok and WhatsApp homes already appear on Mkan;
   subscribers get them shown first when they match a tenant.

### Read this before sending: how much demand there really is

- Last 30 days: **86 tenant chats** with the agent, 84 of them with parsed requirements and 74 that
  reached a shortlist. Kicukiro is the most-asked district (about 30 of the chats); after it come
  Niboye, Kimironko, Kimihurura, Kiyovu and Remera.
- But only **2 `TenantRequest` rows** (tenants who left a phone number), **0 viewings and 0 deals**.
  Many of the 86 chats are tests.
- So the free month carries the weight here. Don't let a broker pay before Mkan has sent them
  tenants. If the free month ends with fewer than 3 matched tenants per broker, the problem is
  demand, not price. Fix demand before asking for money.

## The first 5 brokers

Rules: most homes, has a phone, **answered Abdout on WhatsApp before** (`'whatsapp' ∈ sources`
and a `lastReplyAt`), and is a broker or agency (not a landlord). Ties were broken by how fast they
reply.

| # | Broker | Homes | Phone | Last replied · typical reply time | Zones | Rents (RWF/mo) |
| - | --- | --: | --- | --- | --- | --- |
| 1 | **Kigali Students Living Services** | 39 | +250 781 819 453 (also +250 799 520 225) | 22 Oct · ~3 h | Remera, Kimironko, Kicukiro, Nyamirambo, Gikondo, Niboye, Kanombe… | 200k–500k |
| 2 | **Asset** (agency) | 28 | +250 791 860 222 | 1 Nov · 11 min · charges 5k visit fee | Kabeza, Kagarama, Remera, Niboye, Kacyiru, Rebero | 450k–1M |
| 3 | **A Brother To All.** | 25 | +250 792 107 133 | 21 Oct · 13 min | Gisozi, Remera, Gacuriro, Kimironko, Kibagabaga, Kagugu | 300k–870k |
| 4 | **Real Smarts Move Group Ltd** (agency) | 17 | +250 738 183 225 | 22 Oct · 11 min | Gikondo, Gisozi, Kimironko, Kagarama, Rebero, Remera | 300k–600k |
| 5 | **Kigali House Find** | 15 | +250 732 530 996 | 22 Oct · ~1 min | Kicukiro, Kimironko, Kibagabaga, Remera, Kanombe, Gahanga | 350k–800k |

Next in line: **Mushinzimana Real Estate** (15 homes, replied 28 Oct, reply time unknown) and
**Thierry** (14 homes, ~1 min, visit fee 5k).

Data notes, not fixed in this run:
- **Kigali Students Living Services has two `Broker` rows** with the same phone
  (`cmvi8d2k6002geksdoupbbg2o` with 39 homes, `cmvi8aq6p0008eksd07rq4kpp` with 37). Merge them in
  Twenty (`mergeInto`), then run `pnpm crm:brokers --apply`. It was left alone because a merge
  deletes a row.
- **Ibra real estate** (45 homes), **Rwanda Real Estate** (39) and **Scan Rwanda** (33) have a
  `lastReplyAt` but no WhatsApp source, so "answered before" can't be confirmed for them. Check
  before adding them to the next wave.
- Every broker shows `answers = 0`, because the agent's broker asks are all `SKIPPED` (gated).
  The real reply history is Abdout's own WhatsApp (`scripts/wa/chats.ts`).

## The offer text

Fill `{zones}` per broker from the table above, at most three, using the most-asked first (for
example Asset: "Kabeza, Niboye, Remera"). All five have `preferredLanguage` EN or unset: **send
English first and Kinyarwanda right under it.**

### English

> Hi {name}, it's Abdout from Mkan (mkan.org). Thank you for the homes you've shown me.
>
> Every week, people ask Mkan for a home in Kigali and tell us exactly what they want: the area,
> the bedrooms, their budget and when they move in. I'd like to send you the ones looking in
> **{zones}**.
>
> **Mkan for brokers:**
> • Tenants who want a home in your zones, sent to you on WhatsApp with what they need and what they can pay.
> • When a tenant picks one of your homes, we book the viewing for you: we ask you for a time, confirm it with the tenant, and remind you both.
> • **Your commission stays 100% yours.** Mkan takes no share.
> • Your homes are shown first on Mkan when they match a tenant.
>
> **RWF 20,000 a month. The first month is free**, so you only pay after you've seen the tenants.
> If we send you fewer than 3 tenants in a month, the next month is free. Pay 3 months at once:
> RWF 50,000.
>
> Only 3 brokers per area. Reply **YES** and tell me your areas to start your free month.
> If you'd rather not get messages from Mkan, reply STOP.

### Kinyarwanda

> Muraho {name}, ni Abdout wo kuri Mkan (mkan.org). Murakoze ku mazu mwanyeretse.
>
> Buri cyumweru, abantu batubwira inzu bashaka i Kigali: aho bashaka, ibyumba, amafaranga bafite
> n'igihe bazimukira. Nifuza kukoherereza abashaka inzu muri **{zones}**.
>
> **Mkan ku bakomisiyoneri:**
> • Abakiriya bashaka inzu mu duce ukoreramo, tukakoherereza kuri WhatsApp, n'icyo bashaka n'amafaranga bafite.
> • Iyo umukiriya ahisemo inzu yawe, tubategurira gusura: tukubaza isaha, tukayibwira umukiriya, tukabibutsa mwembi.
> • **Komisiyo yawe yose ni iyawe.** Mkan ntifata umugabane.
> • Amazu yawe agaragara mbere kuri Mkan iyo ahuye n'ibyo umukiriya ashaka.
>
> **Ifatabuguzi: RWF 20,000 ku kwezi. Ukwezi kwa mbere ni ubuntu**: wishyura gusa umaze kubona
> abakiriya. Nitutakoherereza nibura abakiriya 3 mu kwezi, ukwezi gukurikira ni ubuntu. Wishyuye
> amezi 3 icyarimwe: RWF 50,000.
>
> Abakomisiyoneri 3 gusa kuri buri gace. Subiza **YEGO** umbwire uduce ukoreramo, dutangire ukwezi
> kwawe k'ubuntu. Niba udashaka ko tukwandikira, subiza STOP.

_The Kinyarwanda was written by the model, using the vocabulary of `broker-message.ts`
(komisiyoneri, umukiriya, gusura, ku kwezi). Have a native speaker check it before sending, the
same way as `docs/i18n/rw-review-2026-11.csv`._

## What Abdout decides

1. **The price:** 20k a month, 50k for 3 months up front, first month free, and the "3 tenants or the
   next month is free" guarantee. Approve it or change the numbers.
2. **The text:** approve it, and have the Kinyarwanda checked.
3. **Send:** from your own WhatsApp to the 5 above. When one says YES: record their zones in Twenty
   (`brokerZone`), set `relationship = PARTNER`, and put "subscription · free month from <date>" in
   `agreementNote` (then `pnpm crm:brokers --apply`).
4. **Not built yet** (build only once a broker says yes): sending matched tenants to subscribers
   when broker sends are gated, a `SUBSCRIPTION` money entry per payment on /monetize, and
   counting the per-zone cap of 3.
