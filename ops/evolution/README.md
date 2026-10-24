# Evolution API — mkan's WhatsApp bridge on the Mac

The Cloudflare Worker can't reach a WhatsApp session, so it only writes
`OutboundMessage` rows. This Mac runs Evolution API v2 (Baileys, the same 2.3.7
hogwarts embeds) on `127.0.0.1:8081`, and `scripts/wa/outbox.ts` drains the rows
through it every two minutes. Paired number: **+250780984777**, instance `mkan`.

| Piece | What it does |
| --- | --- |
| `docker-compose.yml` | Evolution + its Postgres. API on 127.0.0.1:8081 only; Postgres has no host port. Volumes `evolution_instances` (the paired session) and `evolution_pg`. |
| `up.sh` | Reads the secrets from the Keychain and runs `docker compose`. Default `up -d`; `down`, `logs -f`, … pass through. |
| `scripts/wa/pair.ts` | `pnpm wa:pair`: creates the instance if missing and saves the QR to `scripts/crm/.data/wa/qr.png`. |
| `scripts/wa/outbox.ts` | `pnpm wa:outbox [--dry-run]`: sends under the caps, then reads replies (opt-outs, broker answers to #mkan). |
| `scripts/wa/install-outbox.sh` | Installs launchd `com.databayt.mkan-wa-outbox` (every 120 s, logs in `scripts/crm/.data/wa/outbox.log`). |
| `scripts/wa/inbox-server.ts` | `pnpm wa:inbox`: the webhook listener (127.0.0.1:8091) — tenants' messages to the rental agent on the Worker, replies sent back at once. |
| `scripts/wa/install-inbox.sh` | Installs launchd `com.databayt.mkan-wa-inbox` (KeepAlive, logs in `scripts/crm/.data/wa/inbox.log`). |

## Secrets

There is no `ops/evolution/.env`. Under the house rule there is only the central `.env`,
and the root `.gitignore` already ignores `.env*`. `up.sh` exports the values from
the Keychain at `up` time, and the compose file refuses to start without them.

| Keychain item | Who creates it |
| --- | --- |
| `mkan-EVOLUTION_API_KEY` | You, once: `security add-generic-password -s mkan-EVOLUTION_API_KEY -a mkan -w "$(openssl rand -hex 24)"` |
| `mkan-EVOLUTION_DB_PASSWORD` | `up.sh`, on the first run (random) |

The scripts read the same key: from `MKAN_EVOLUTION_KEY`, then from `EVOLUTION_API_KEY`, then from the Keychain item.
`MKAN_EVOLUTION_URL` (default `http://127.0.0.1:8081`) and `MKAN_EVOLUTION_INSTANCE`
(default `mkan`) override the target.

## Bring it live

1. Create the Keychain key (see the table above).
2. Start the bridge with `bash ops/evolution/up.sh`. It pulls about 1 GB of images, so check `df -h` first. Confirm it is up with `curl -s 127.0.0.1:8081 -H "apikey: $(security find-generic-password -s mkan-EVOLUTION_API_KEY -w)"`.
3. Pair with `pnpm wa:pair`, then open `scripts/crm/.data/wa/qr.png`. On the phone that holds +250780984777, go to WhatsApp → Settings → Linked devices → Link a device and scan the code. The QR expires in about a minute, so run the command again for a fresh one. `pnpm wa:pair --number=250780984777` also prints a pairing code that you can type in instead of scanning.
4. Check with `pnpm wa:outbox --dry-run`, which should log neither "unreachable" nor "close", and should list the queue plan.
5. Schedule it with `bash scripts/wa/install-outbox.sh`. Remove it with `--remove`.
6. Tenant chat: `bash scripts/wa/install-inbox.sh`, then `pnpm wa:pair --webhook-only` (pairing sets it too).
   Evolution posts to `http://host.docker.internal:8091/wa/<api key>`; Colima forwards that to this Mac's
   loopback. The bridge's Bearer is Keychain `cf-mkan-MKAN_WA_BRIDGE_SECRET` (cf-secrets.sh pushes it to the Worker).

## Caps (scripts/wa/outbox-pure.ts)

- Sends happen only between 08:00 and 20:00 Kigali time (UTC+2).
- `MKAN_WA_DAILY_CAP` messages per Kigali day: 40 during the two-week warm-up, then set it to 80.
- One message per broker per day. A `TENANT_ALERT` is exempt from this rule, but it counts toward the total.
- Sends are spaced by a random gap of 20 to 60 s.
- A broker who opted out has their rows marked `SKIPPED`. The opt-out words are STOP, HAGARIKA, ARRÊTE/ARRETE and UNSUBSCRIBE, each as the whole reply.
- After 3 failed sends a row becomes `FAILED`, and #mkan gets a card with a wa.me link. A `BROKER_REQUEST` that fails this way falls back to `channel: "manual"`.
- If the bridge is down or unpaired, nothing is sent and no attempt is used up. `recordRun` alerts #mkan after 3 failed runs in a row.

## Troubleshooting

- **A tenant got no answer.** `curl -s 127.0.0.1:8091/health`, then `scripts/crm/.data/wa/inbox.log`: each
  message logs `answered`, `skip-human` (someone at Mkan typed there in the last 12 h — delete the phone from
  `tenant-human.json` to resume), `skip-stopped`, `skip-old` or `failed: agent 401` (the Worker lacks
  `MKAN_WA_BRIDGE_SECRET`).

- **The pairing was lost** (the phone unlinked the device, or the session expired). The drain logs `instance "mkan" is close`, and #mkan gets the streak alert. Run `pnpm wa:pair` again.
- **No QR is returned.** Wait a few seconds after `up` and retry. If it keeps failing, `bash ops/evolution/up.sh logs -f evolution-api` shows why.
- **Replies are missing.** Newer WhatsApp addresses some chats by `@lid`, and the drain reads the number from `remoteJidAlt`/`senderPn`. A reply that carries neither cannot be matched to a broker and is ignored.
