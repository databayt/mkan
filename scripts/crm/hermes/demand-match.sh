#!/usr/bin/env bash
# The rental agent's daily demand tick, run by the Hermes gateway's cron (no agent, no model):
# mirror the day's homes into /find, rebuild the broker directory, match open tenant requests
# against the day's new homes, alert opted-in tenants, post the digest.
# Install (09:00 Kigali, after the 06:00–06:45 scrapes):
#   install -S -m 755 scripts/crm/hermes/demand-match.sh ~/.hermes/scripts/mkan-demand-match.sh   # never cp: a run reads it
#   hermes cron create "0 9 * * *" --name mkan-demand-match --script mkan-demand-match.sh --no-agent
#
# The tick starts the run detached from the gateway (detached.sh) and returns: a gateway restart
# killed the 11-01 run at 09:09. The run (`--run`) posts its own failure to #mkan; the digest
# goes there via --notify. Hermes delivers the tick's stdout, so it prints only when it cannot start.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/demand"
LOCK="$LOGDIR/.match.lock"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
# lane.sh: who holds the lock, and waiting for the internet (the Mac sleeps with its lid shut).
. "$REPO/scripts/crm/hermes/lane.sh"
LANE_JOB=hermes:mkan-demand-match

if [ "${1:-}" != "--run" ]; then
  # A live run holds the lock — paused by sleep, or waiting for the network: let it be.
  lane_tick "$LOCK" 'demand-match\.sh' || exit 0
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ demand match could not start detached from the gateway"
  fi
  exit 0
fi

# ── the run, outside the gateway ────────────────────────────────────────────
lane_own "$LOCK"
cd "$REPO" || exit 0
# The tick may have fired in a short maintenance wake (lid shut, network off): wait for the
# internet — wall clock, up to 10 h — instead of failing every stage. A run that finds it
# never comes back exits quietly; the next tick tries again.
wait_ready 600 || { lane_end defer "$(lane_not_ready)"; exit 0; }
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (detached) ──" >>"$LOGDIR/match.log"
# Errors only from Prisma: without it the match step logged every query (179 lines on 11-02).
export PRISMA_QUIET=1
# A step that fails on the network runs once more when the Mac is back online. On 11-02 the
# directory and the match both died at 13:53 on a dropped connection (Slack was unreachable
# too), half an hour into a clean run; the lid shut three minutes later. Every step here is
# safe to repeat: the mirror and the directory upsert, and the match skips homes it already
# sent (matchedListingIds) and catches up from its last good run.
failed=""
step() {
  local name=$1
  shift
  "$@" >>"$LOGDIR/match.log" 2>&1 && return 0
  sleep "${DEMAND_RETRY_PAUSE:-60}"
  if wait_online 600; then
    echo "  ↻ $name failed — once more, online again ($(date '+%H:%M'))" >>"$LOGDIR/match.log"
    "$@" >>"$LOGDIR/match.log" 2>&1 && return 0
  fi
  failed="$failed $name"
  return 1
}
# Facebook (06:30) and web (06:45) homes reach the lead pool here; TikTok's 06:00 run mirrors its own.
step mirror pnpm -s crm:tiktok-mirror --apply
# Brokers from Abdout's own WhatsApp chats (reviewed ones only), then into the directory.
# The directory builds either way: wa:chats needs Full Disk Access to WhatsApp's
# ChatStorage.sqlite, and its EPERM under the gateway (10-23 → 11-01) used to skip the
# whole build behind an `&&` — no new brokers for nine days. The last snapshot is kept.
pnpm -s wa:chats >>"$LOGDIR/match.log" 2>&1 || echo "  ! wa:chats failed — the directory builds from the last WhatsApp snapshot" >>"$LOGDIR/match.log"
step directory pnpm -s crm:brokers --apply
step match pnpm -s crm:demand-match --notify
if [ -n "$failed" ]; then
  lane_end fail "$(echo $failed | sed 's/ /, /g') failed twice"
  {
    echo "⚠️ demand run: $(echo $failed | sed 's/ /, /g') failed twice. Last lines:"
    tail -n 8 "$LOGDIR/match.log" | cut -c1-240
  } | pnpm -s crm:post-mkan >/dev/null 2>&1
else
  lane_end ok
fi
exit 0
