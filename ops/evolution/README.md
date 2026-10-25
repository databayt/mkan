# Evolution API — mkan's WhatsApp bridge

**Since 2026-10-25 the line runs on Cloudflare, not this Mac.** mkan's instance (`mkan`, number
**+250780984777**) lives on the Evolution process inside the hogwarts container, shared through
hogwarts' private `WhatsappBridge` entrypoint (the same one Space uses). The Docker stack in this
folder is the old Mac bridge, kept only to read back history; leave it stopped (`bash ops/evolution/up.sh down`).

| Piece | What it does |
| --- | --- |
| `cf/worker.js` `/__wa/*` | Forwards to the WHATSAPP service binding — only with `x-mkan-wa: $MKAN_WA_BRIDGE_SECRET`. |
| `src/lib/whatsapp/evolution.ts` | The client the app and the Mac scripts share (`MKAN_EVOLUTION_KEY` = the instance token). |
| `/api/whatsapp/hook/<token>` | The instance's webhook (MESSAGES_UPSERT): tenants answered at once, human takeovers noted. |
| `/api/cron/wa-outbox` | Every 2 min (cf/crons.json): sends under the caps, reads broker replies, catches missed tenants. |
| `pnpm wa:pair` | Creates the instance if missing (admin key `cf-hogwarts-EVOLUTION_API_KEY`), stores its token as `cf-mkan-MKAN_EVOLUTION_KEY`, sets the webhook, saves the QR to `scripts/crm/.data/wa/qr.png`. |
| `pnpm wa:outbox --dry-run` | The cron's pass from a terminal, sending nothing. |

## Re-link (device_removed, a new phone)

1. `pnpm wa:pair`, then scan `scripts/crm/.data/wa/qr.png` from the phone: WhatsApp → Settings →
   Linked devices → Link a device. The QR expires in about a minute; run it again for a fresh one.
   `--number=250780984777` also prints a pairing code to type in instead.
2. If the instance was new, push its token: `scripts/cf-secrets.sh` (Keychain override), then
   restart the container (a redeploy) so the app sees `MKAN_EVOLUTION_KEY`.
3. `pnpm wa:outbox --dry-run` shows `state: open` and the queue plan.

## Caps (scripts/wa/outbox-pure.ts)

- Broker sends only between 08:00 and 20:00 Kigali time (UTC+2), one per 2-minute tick.
- `MKAN_WA_DAILY_CAP` messages per Kigali day: 40 during the warm-up, then 80.
- One message per broker per day. A `TENANT_ALERT` is exempt, goes at any hour, and counts toward the total.
- Opt-out words (STOP, HAGARIKA, ARRÊTE/ARRETE, UNSUBSCRIBE) mark a broker's rows `SKIPPED`.
- After 3 failed sends a row becomes `FAILED`, and #mkan gets a wa.me card.
- Bridge down or unpaired: nothing is sent, no attempt used up; #mkan hears after 3 failed runs.

## Troubleshooting

- **A tenant got no answer.** Worker logs for `[wa]` lines: `answered`, `skip-human` (someone at Mkan
  typed there in the last 12 h — remove the phone from `WaState` key `tenant-human`), `skip-stopped`,
  `skip-old`, `failed: …`. Evolution 401 → `MKAN_EVOLUTION_KEY` missing or stale in the Worker.
- **Nothing sends.** `pnpm wa:outbox --dry-run`: `bridge close` → re-link; `unreachable` → the hogwarts
  container or the WHATSAPP binding.
