# CRM — Twenty is the record, the Mkan agent writes it (2026-11-15)

Abdout's call: **Twenty is the source of truth** for tenants, deals and their viewings. The agent writes
every tenant and every deal step into Twenty's `mkan` workspace (https://crm-api.databayt.org); a person's
edit there flows back and acts. Neon stays the working copy the WhatsApp line runs on, so a Twenty outage
only delays the record — it never stops a deal.

```
deal step ─► deal-event.ts ─► deal-sync.ts crmStep ─► CrmOp rows (tenant → deal → viewing Task)
chat activity ─► tenant-sync.ts (sweep of AgentProfile since a WaState cursor, real people only)
drain: crm-ops.ts drainCrm — on events (kickCrm) and inside /api/cron/wa-outbox (time-boxed 25 s);
       oldest first, ≤ 40 calls a minute (Twenty allows 100 / 60 s, shared with the Mac scripts),
       upsert by CrmLink → mkanKey / mkanProfileId → POST; transient errors retry, FAILED after 8 tries;
       a backlog older than 30 min posts one 📡 #mkan card per 6 h
Twenty → mkan: api/webhooks/twenty (signed) → twenty-inbound.ts
       deal.updated  stage → deal.ts setDealStatus (SIGNED sends the share request, PAID records revenue);
                     mkanShareRwf / tripCostRwf → Deal; terms → a "terms:" line in Deal.notes;
                     viewingAt → ListingVisit.scheduledFor (reminders re-armed)
       tenant.updated optOut → the same as a STOP
       broker.updated relationship / share / agreement / DO_NOT_CONTACT → Prisma Broker at once
```

**The truth rule.** Twenty wins on every field a person edits (stage, terms, share, notes, relationship,
optOut); mkan reports what it observes (messages, timestamps, counts). An event whose fields are only what
mkan itself wrote in the last 2 minutes (`CrmLink.pushedFields`) is our own echo and is ignored.
`pnpm crm:reconcile [--apply]` diffs open deals and tenants and applies Twenty's values;
`pnpm crm:backfill [--apply]` queues the last 60 days of real tenants and deals.

**Keys.** A deal is `"<taskId>:<listingId>"` from the pick to the payment (deal-event-pure.ts `dealKey`); a
tenant is their profile id; `CrmLink.key` is `"<object>:<mkan key>"`. Team and test chats never reach Twenty:
`REAL_PERSON` (src/lib/monetize/team.ts) on the profile, and `isOurPhone` (ours.ts) on the tenant's number itself —
a team number typed into a web chat got past the first alone on 11-15.

**Twenty objects** (scripts/crm/twenty-schema.ts, `pnpm crm:seed-objects`): `tenant` (stage NEW → SHOWN_HOMES
→ PICKED → VIEWING → SIGNED / LOST), `deal` (stage = DEAL_STEPS, money, viewing, terms, relations to tenant,
broker and home), and a standard Task per booked viewing, assigned to `MKAN_CRM_ASSIGNEE_EMAIL`
(abdout@databayt.org).

**Env.** `TWENTY_API_URL`, `TWENTY_API_KEY`, `TWENTY_WEBHOOK_SECRET`. Without the first two every op stays
QUEUED (logged once) and nothing is lost.

**Known gaps.** Deal terms live in `Deal.notes` (no column yet); unticking optOut in Twenty does not undo a
STOP (START does); brokers still reach Twenty through `crm:brokers`, not the queue; overnight the drain runs
hourly with the outbox tick.
