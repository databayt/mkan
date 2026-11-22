#!/usr/bin/env bash
# The TikTok inbox pass, every 10 minutes 07:00–22:00 Kigali (installed by scripts/crm/install-tiktok-post.sh),
# run by the Hermes gateway's cron (no agent, no model): tt:inbox reads @mkan.rw's DMs in the session-vault Chrome
# (a hidden page, no focus), answers tenants through /api/agent/tiktok — the same agent WhatsApp has — and types
# what the agent queued for them (WaState tt-outbox). Installed to ~/.hermes/scripts/mkan-tiktok-inbox.sh.
#
# Two halves like the other lanes: the tick takes the lock and starts the run detached (a pass can outlast the
# 10-minute tick: each chat waits out a 25 s burst); the run waits until the Mac is awake and online, then runs
# tt:inbox, which itself does nothing while Abdout is at the keyboard (HID idle < 120 s) or outside 07:00–22:00.
# A failed pass posts to #mkan at most once every 3 hours (a logged-out vault would otherwise post every tick).
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok-inbox"
LOCK="$LOGDIR/.inbox.lock"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
. "$REPO/scripts/crm/hermes/lane.sh"
LANE_JOB=hermes:mkan-tiktok-inbox

if [ "${1:-}" != "--run" ]; then
  lane_tick "$LOCK" 'tiktok-inbox\.sh' || exit 0
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ TikTok inbox could not start detached from the gateway"
  fi
  exit 0
fi

# ── the run, outside the gateway ────────────────────────────────────────────
lane_own "$LOCK"
cd "$REPO" || exit 0
wait_ready 5 || { lane_end defer "$(lane_not_ready)"; exit 0; }
vault_ready || { lane_end fail "the session-vault Chrome (:9222) hangs every CDP attach"; exit 0; }
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (tiktok inbox, detached) ──" >>"$LOGDIR/inbox.log"
if pnpm -s tt:inbox >>"$LOGDIR/inbox.log" 2>>"$LOGDIR/inbox.err.log"; then
  lane_end ok
else
  lane_end fail "tt:inbox failed"
  ALERTED="$LOGDIR/.alerted"
  if [ -z "$(find "$ALERTED" -mmin -180 2>/dev/null)" ]; then
    touch "$ALERTED"
    {
      echo "⚠️ The TikTok inbox pass failed. Last errors:"
      tail -n 4 "$LOGDIR/inbox.err.log" | cut -c1-240
    } | lane_alert
  fi
fi
exit 0
