#!/usr/bin/env bash
# The TikTok page's daily tick, run by the Hermes gateway's cron (no agent, no model):
# tt:run renders today's pieces, then tt:upload posts them to @mkan.rw through the
# session-vault Chrome — fully automatic since 2026-10-21, no human gate.
# Installed to ~/.hermes/scripts/mkan-tiktok-post.sh by scripts/crm/install-tiktok-post.sh.
#
# Two halves, like the sweep (2026-11-01). The tick takes the post lock and starts the run
# detached from the gateway (detached.sh): a gateway restart killed the 11-01 sweep and demand
# runs mid-way, and a render + upload takes 15–30 min. The 13:00 retry takes the same lock, so
# the two never upload at once. Both commands post their own summary to #mkan (--notify); the
# run posts its failures there itself (crm:post-mkan), since Hermes no longer reads its output.
# The tick prints only when it cannot start. Logs: .data/tiktok-post/post.log.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok-post"
LOCK="$LOGDIR/.post.lock"
# Broker videos are on hold (0) until their burned-in captions and phone numbers are
# stripped before the brand pass (2026-11-01): a broker's own number on our page sends the
# tenant straight to them. The daily picture video still posts. Back to 3 once it ships.
PER_DAY="${TIKTOK_POSTS_PER_DAY:-0}"
# A run past this is stuck; the cap frees the lock long before the 13:00 retry.
MAX_MINUTES="${TIKTOK_POST_MAX_MINUTES:-120}"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
# lane.sh: who holds the lock, and waiting for the internet (the Mac sleeps with its lid shut).
. "$REPO/scripts/crm/hermes/lane.sh"
LANE_JOB=hermes:mkan-tiktok-post

if [ "${1:-}" != "--run" ]; then
  # A live run holds the lock — paused by sleep, or waiting for the network: let it be.
  lane_tick "$LOCK" 'tiktok-(post|upload-retry)\.sh' || exit 0
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ TikTok post could not start detached from the gateway"
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
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (detached) ──" >>"$LOGDIR/post.log"

run() { /usr/bin/caffeinate -i pnpm -s "$@" >>"$LOGDIR/post.log" 2>>"$LOGDIR/post.err.log"; }
steps() {
  # Wake the session-vault Chrome now, so it is up and settled by the upload (~10 min
  # later). Its launchd job respects a Cmd-Q, so a quit or a reboot left it down and
  # the upload failed on 10-26, 10-29 and 11-01. kickstart starts it only if it is down.
  launchctl kickstart "gui/$(id -u)/com.databayt.chrome-session" >/dev/null 2>&1 || true
  # The 07:00 query has failed on a waking Neon; one retry after a minute.
  run tt:run --notify --n="$PER_DAY" || { sleep 60; run tt:run --notify --n="$PER_DAY"; } || return 2
  run tt:upload --notify
  local up=$?
  # 77: a post was clicked but never confirmed — a re-run could post it twice; Abdout looks.
  [ "$up" -eq 77 ] && return 77
  [ "$up" -eq 0 ] || return 3
}

# Job control: the steps get their own process group, so the cap can stop all of them.
set -m
steps &
pid=$!
( sleep $((MAX_MINUTES * 60)); kill -TERM -- "-$pid" 2>/dev/null && echo "  ! stopped after ${MAX_MINUTES} min" >>"$LOGDIR/post.log" ) &
watchdog=$!
wait "$pid"
code=$?
kill -- "-$watchdog" 2>/dev/null
mins=$(( ($(date +%s) - started) / 60 ))

case "$code" in
  0) lane_end ok; exit 0 ;;
  2) what="TikTok render failed twice"; lane_end fail "$what" ;;
  3) what="TikTok auto-post had failures — the 13:00 retry posts what is left"; lane_end warn "$what" ;;
  77) what="TikTok: a post was clicked but never confirmed — check @mkan.rw, then pnpm tt:upload --repost=<key> if it is missing"; lane_end fail "$what" 1 ;;
  *) what="TikTok post failed (exit $code after ${mins} min)"; lane_end fail "$what" ;;
esac
{
  echo "⚠️ $what. Last errors:"
  tail -n 8 "$LOGDIR/post.err.log" | cut -c1-240
  echo "Log: $LOGDIR/post.log"
} | lane_alert
exit 0
