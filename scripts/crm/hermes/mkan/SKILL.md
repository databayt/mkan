---
name: mkan
description: "Know mkan (mkan.sd, Kigali monthly rentals): the /find rental chat, the WhatsApp line +250 780 984 777, brokers, the Twenty CRM (homes, hosts, brokers, TikTok videos) and the @mkan.rw TikTok page. Answer mkan questions with one read-only command; hand anything deeper to Claude Code."
version: 1.0.0
author: databayt
license: SSPL
platforms: [macos]
metadata:
  hermes:
    tags: [mkan, rentals, Kigali, find, chat, WhatsApp, brokers, Twenty, CRM, TikTok]
    related_skills: [kun, home, crm]
prerequisites:
  commands: [pnpm]
---

# mkan — what it is and how to read it

mkan (mkan.sd) finds **monthly rentals in Kigali**. A tenant asks in plain words; an
agent searches the homes, shortlists the best and asks the broker if each is still free.
Brokers live on TikTok and WhatsApp; mkan meets them there.

## The parts

- **/find chat** (mkan.sd/find + the floating bubble on the site): the tenant types or
  dictates; the agent reads the need (Claude Haiku → Groq → rules), searches, ranks,
  shows homes as cards, asks brokers. Monthly only. Code: `src/components/agent/`
  (README.md is the map). Tables: AgentProfile, AgentTask, AgentEvent, BrokerRequest.
- **WhatsApp line +250 780 984 777** (WhatsApp Business "Mkan", runs on Cloudflare —
  the Mac can be off): tenants chat with the same agent; brokers get "is this
  available?" asks (40/day, one per broker per day, 08:00–20:00) and their answers are
  read back (yes / taken / photos + price). STOP opts a broker out. A person typing in a
  chat pauses the bot there for 12 h. A watchdog checks the site, the line and the outbox
  every 5 min and opens a GitHub issue + #mkan line when one breaks.
- **Twenty CRM** (localhost:3100, workspace mkan): `home` (~7,700, codes like 0004-02),
  `host`, `broker` (~130), `zone` (54 Kigali zones), `tiktokPost` (brokers' TikTok
  videos — links, not files). Brokers' repost permission lives on the host:
  `repostConsent` = ASKED / YES / NO.
- **TikTok @mkan.rw**: 06:00 a sweep finds brokers' new videos → CRM; 07:00 a post is
  rendered and uploaded automatically; 13:00 a retry posts whatever 07:00 could not.
  A broker's video is used **only after that broker said YES**. Until then the daily post
  is mkan's own picture video.
- **#mkan** (`C0BS2NZE2AY`) is the intake desk — owned by the `home` skill. Never answer
  mkan questions there.

## Read it — one command, then answer in a few lines

```bash
cd /Users/abdout/mkan && pnpm -s mkan:read <topic>
```

| Abdout asks about | topic |
|---|---|
| how mkan is doing, anything general | *(none)* — one screen |
| tenants, conversations, the /find chat | `chats --days=1` |
| WhatsApp, brokers answering, the line | `wa --days=1` |
| homes in the CRM | `crm homes` |
| brokers | `crm brokers` |
| which brokers agreed to reposts | `crm consent` |
| TikTok videos in the CRM | `crm tiktok` |
| today's TikTok post | `tiktok` |

Add `--days=7` for a week, `--n=20` for more rows. Phones come masked (…777) — never
ask for or guess full numbers. Other safe reads: `pnpm -s agent:funnel --days=7`,
`pnpm -s crm:tiktok-status`, `pnpm -s tt:stats`.

## Brokers who said YES to reposts

When Abdout says brokers agreed ("@kun these brokers said yes: a, b, c"):

```bash
cd /Users/abdout/mkan && pnpm -s tt:consent --yes=<handle,handle> --source="<how they said it, per Abdout>" --apply
```

Use the handles exactly as he wrote them. It prints each broker's videos waiting to post;
tell him that line. **This is the only write you may run here**, and only for Abdout.

## Hand off to Claude Code (skill `kun`) when

- the answer needs code, the database beyond these commands, or several steps;
- something looks broken (a failed post, the line not `open`, the outbox lease old);
- he asks to change, fix, send, post or deploy anything.

## Never

- `wa:outbox` without `--dry-run`, `tt:upload`, `tt:run`, `home:publish`, `wa:pair`, or any
  other command with `--apply` — they send messages, post publicly or change data.
- Never message a broker or a tenant yourself.
