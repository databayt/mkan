# The `kun` Slack app is missing two bot events

Hermes has **never received a single `#mkan` message**. Not a token problem and not a
scope problem — `groups:history` was granted on 2026-08-25 and the read probe answers
`ok: true`. The app is simply not *subscribed* to the event that fires when someone posts
in a private channel, so Slack never sends it and the gateway never wakes.

Everything this lane has done so far was carried by the two-minute launchd timer.

## The fix — about thirty seconds

api.slack.com/apps -> the **kun** app -> **Event Subscriptions** -> *Subscribe to bot
events* -> add these two -> **Save Changes** -> **Reinstall to Workspace**:

| Event | Why |
| --- | --- |
| `message.groups` | messages in a **private** channel. `#mkan` is private; this is the one that matters |
| `message.mpim` | group DMs. The gateway logs a warning about this one on every start |

`message.channels` and `message.im` are already subscribed, which is why the bot works
everywhere except the one channel this lane lives in.

Reinstalling keeps the same bot token: the scopes are unchanged, only the subscriptions.

## After

Post anything in `#mkan`. The reply should arrive in **seconds** rather than up to two
minutes, and the gateway log should name the channel for the first time:

```bash
grep -c C0BS2NZE2AY ~/.hermes/logs/agent.log    # 0 today, > 0 once the ear works
```

Both ears then run against one lock file, so whichever hears first does the work and the
other finds nothing new. Nothing is written twice, and nothing is read twice.

## If you would rather paste a manifest

`hermes slack manifest` prints a complete one with both events already in it. It also
carries Hermes' own name, description and slash commands, so pasting it wholesale would
**rename the `kun` app**. Take only the events array from it:

```json
"bot_events": [
  "app_mention",
  "assistant_thread_context_changed",
  "assistant_thread_started",
  "message.channels",
  "message.groups",
  "message.im",
  "message.mpim"
]
```

Bot scopes that manifest expects, all of which the app already has:

```
app_mentions:read, assistant:write, channels:history, channels:read, chat:write, commands, files:read, files:write, groups:history, groups:read, im:history, im:read, im:write, mpim:history, mpim:read, users:read
```
