#!/usr/bin/env bash
# The TikTok lane's tick (06:00 and 18:00), run by the Hermes gateway's cron (no agent, no model).
# Installed to ~/.hermes/scripts/mkan-tiktok-sweep.sh by scripts/crm/install-tiktok-sweep.sh.
#
# Two halves (2026-11-01). The tick takes the lock and starts the run detached from the
# gateway (detached.sh): a gateway restart used to kill the run mid-way (07:48 on 11-01,
# during the mirror). The run itself (`--run`) does the work and posts its own failure to
# #mkan; the sweep's --notify posts the day's counts. Hermes delivers this script's stdout
# to #mkan — so the tick prints only when the previous run still holds the lock.
# Full output goes to .data/tiktok/sweep.log as it did under launchd.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok"
LOCK="$LOGDIR/.sweep.lock"
FETCH_LIMIT="${TIKTOK_DAILY_LIMIT:-40}"
READ_LIMIT="${TIKTOK_READ_LIMIT:-80}"
# A run past this is stuck (10-27's evening run took 15 h and ate the next morning's slot).
MAX_MINUTES="${TIKTOK_MAX_MINUTES:-150}"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
# The gateway's SLACK_HOME_CHANNEL is Hermes' own home; the sweep's summary belongs in #mkan.
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
# lane.sh: who holds the lock, and waiting for the internet (the Mac sleeps with its lid shut).
. "$REPO/scripts/crm/hermes/lane.sh"
LANE_JOB=hermes:mkan-tiktok-sweep

if [ "${1:-}" != "--run" ]; then
  # A live run holds the lock — paused by sleep, or waiting for the network: let it be.
  lane_tick "$LOCK" 'tiktok-sweep\.sh' || exit 0
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ TikTok sweep could not start detached from the gateway"
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
started=$(date +%s)
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (detached) ──" >>"$LOGDIR/sweep.log"
# Job control: each background job gets its own process group, so the cap can stop the whole run.
set -m
/usr/bin/caffeinate -i pnpm -s crm:tiktok --apply --notify \
  --fetch-limit="$FETCH_LIMIT" --read-limit="$READ_LIMIT" \
  >>"$LOGDIR/sweep.log" 2>>"$LOGDIR/sweep.err.log" &
pid=$!
# The cap: a run still going after MAX_MINUTES is stopped, so the next tick finds the lane free.
( sleep $((MAX_MINUTES * 60)); kill -TERM -- "-$pid" 2>/dev/null && echo "  ! stopped after ${MAX_MINUTES} min" >>"$LOGDIR/sweep.log" ) &
watchdog=$!
wait "$pid"
code=$?
kill -- "-$watchdog" 2>/dev/null
mins=$(( ($(date +%s) - started) / 60 ))

if [ "$code" -eq 0 ]; then
  lane_end ok
else
  lane_end fail "TikTok sweep exit $code after ${mins} min: $(grep -v '^[[:space:]]*$' "$LOGDIR/sweep.err.log" | tail -n 1 | cut -c1-160)"
  {
    echo "⚠️ TikTok sweep failed (exit $code after ${mins} min). Last errors:"
    tail -n 8 "$LOGDIR/sweep.err.log" | cut -c1-240
    echo "Log: $LOGDIR/sweep.log"
  } | pnpm -s crm:post-mkan >/dev/null 2>&1
fi
exit 0
