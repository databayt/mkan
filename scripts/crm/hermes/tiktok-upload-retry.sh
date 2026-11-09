#!/usr/bin/env bash
# The TikTok page's upload slots, run by the Hermes gateway's cron (no agent, no model).
# Every ad that went up today, posted when Kigali scrolls (2026-11-07, plan B). 07:00 picks the
# day's homes and posts the first (tiktok-post.sh). This script is job mkan-tiktok-upload-retry at
# 08:30–17:30, and job mkan-tiktok-upload-evening at 18:30–22:30
# (the installer bakes SLOT, PICK and the job name into that copy). These are SLOT_TIMES in
# tiktok-post-pure.ts. Each slot posts its share of the day (tt:upload --spread, slotQuota), then
# renders ahead for the slots to come (tt:render --ahead), so a post goes out on the minute; it
# renders its own share first only when nothing was ready. The evening slots first add the ads that
# the 15:00 sweep fetched (tt:pick adds to today's queue, up to the day's cap of 15).
# A piece counts as out once it is in the day's uploads.json or pending.json, so a slot that
# missed its turn (vault Chrome down, TikTok slow, the Mac asleep) is caught up by the next ones,
# and nothing clicked-but-unconfirmed is posted twice. When 07:00 rendered nothing at all (Neon
# refused it twice on 10-24, 10-25, 10-27 and 10-28), this runs the whole morning post.
# Installed to ~/.hermes/scripts/mkan-tiktok-upload-{retry,evening}.sh by scripts/crm/install-tiktok-post.sh.
#   bash scripts/crm/hermes/tiktok-upload-retry.sh --plan   what this slot would post (no browser)
#
# Same two halves as the 07:00 post (2026-11-01): the tick takes the post lock, so no two slots
# ever upload at once, and starts the run detached from the gateway. A slot also waits for a live
# TikTok sweep to finish: two lanes on the one vault Chrome time out.
# tt:upload --notify posts to #mkan when the day's last home is up or a post fails; the run posts
# its own failures to #mkan once a day each. The tick prints only when it cannot start.
# Logs: .data/tiktok-post/post.log.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok-post"
LOCK="$LOGDIR/.post.lock"
# A slot posts one home (two when it is behind) and renders up to three ahead.
MAX_MINUTES="${TIKTOK_RETRY_MAX_MINUTES:-75}"
SLOT="${TIKTOK_UPLOAD_SLOT:-day}"
# "spread": the slot renders and posts its share of the day. A number brings the day to that
# many posts and "all" posts everything rendered.
UPTO="${TIKTOK_UPLOAD_UPTO:-spread}"
if [ "$UPTO" = spread ]; then UP_ARG=--spread; else UP_ARG="--upto=$UPTO"; fi
# 1: add the ads fetched since the morning pick to today's queue first (the evening copy).
PICK="${TIKTOK_SLOT_PICK:-0}"
# The pick's count, as in tiktok-post.sh; the installer bakes the same value into both.
PER_DAY="${TIKTOK_POSTS_PER_DAY:-fresh}"
SWEEP_LOCK="$REPO/scripts/crm/.data/tiktok/.sweep.lock"
SWEEP_WAIT_MINUTES="${TIKTOK_SWEEP_WAIT_MINUTES:-90}"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
# lane.sh: who holds the lock, and waiting for the internet (the Mac sleeps with its lid shut).
. "$REPO/scripts/crm/hermes/lane.sh"
LANE_JOB="${TIKTOK_UPLOAD_JOB:-hermes:mkan-tiktok-upload-retry}"

if [ "${1:-}" = "--plan" ]; then
  cd "$REPO" && echo "$SLOT slot — upload $UP_ARG:" && pnpm -s tt:upload --plan $UP_ARG
  exit 0
fi

if [ "${1:-}" != "--run" ]; then
  # A live run holds the lock — paused by sleep, or waiting for the network: let it be.
  lane_tick "$LOCK" 'tiktok-(post|upload-[a-z]+)\.sh' || exit 0
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ TikTok upload ($SLOT) could not start detached from the gateway"
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
vault_ready || { lane_end fail "the session-vault Chrome (:9222) hangs every CDP attach, even after a restart"; echo "⚠️ The session-vault Chrome is stuck — restart it: launchctl kickstart -k gui/$(id -u)/com.databayt.chrome-session"; exit 0; }
# The TikTok sweep drives the same vault Chrome (06:00/18:00, 30–75 min): let a live one finish.
waited=0
while lane_alive "$(cat "$SWEEP_LOCK/pid" 2>/dev/null)" 'tiktok-sweep\.sh' && [ "$waited" -lt "$SWEEP_WAIT_MINUTES" ]; do
  sleep 60; waited=$((waited + 1))
done
started=$(date +%s)
note=""; [ "$waited" -gt 0 ] && note=", waited ${waited} min for the sweep"
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron ($SLOT slot, $UPTO, detached$note) ──" >>"$LOGDIR/post.log"

# Today's pick writes queue.json once the database answered; without it nothing was
# rendered, so the morning post runs now (it renders, uploads, caps itself, reports its
# own failure and frees the lock). Installed beside this script, or the repo's copy.
POST="$(dirname "$0")/mkan-tiktok-post.sh"
[ -f "$POST" ] || POST="$(dirname "$0")/tiktok-post.sh"
if [ ! -f "$LOGDIR/$(date +%F)/queue.json" ] && [ -f "$POST" ]; then
  echo "  … nothing rendered today — running the morning post now" >>"$LOGDIR/post.log"
  # This run's record ends here; the post records its own under hermes:mkan-tiktok-post.
  lane_end ok "nothing rendered — handed the day to the morning post"
  lane_finish
  trap - EXIT
  TIKTOK_UPLOAD_UPTO="$UPTO" exec /bin/bash "$POST" --run
fi

launchctl kickstart "gui/$(id -u)/com.databayt.chrome-session" >/dev/null 2>&1 || true
run() { /usr/bin/caffeinate -i pnpm -s "$@" >>"$LOGDIR/post.log" 2>>"$LOGDIR/post.err.log"; }
steps() {
  local rc=0
  # The evening copy: the 15:00 sweep's ads join today's queue (a pick adds, never past the cap).
  if [ "$PICK" = 1 ]; then run tt:pick --n="$PER_DAY" || rc=5; fi
  # This slot's own share, rendered now only when the slots before did not render it ahead.
  if [ "$UPTO" = spread ]; then run tt:render --slot || rc=4; fi
  run tt:upload --notify $UP_ARG
  local up=$?
  # Posts out first, then the next slots' videos: up to 3 before a gap of an hour or more, 1 before
  # a half-hour one, none started within 20 minutes of the next slot.
  if [ "$UPTO" = spread ]; then run tt:render --ahead || rc=4; fi
  # Evening only: once today's homes are all rendered, tomorrow's three clean videos (tt:buffer picks and
  # renders them, settles lost ledger rows, and at 21:00 Kigali posts one #mkan line if fewer than three are ready).
  if [ "$PICK" = 1 ] && [ "$UPTO" = spread ]; then run tt:buffer || { [ "$rc" -eq 0 ] && rc=6; }; fi
  [ "$up" -ne 0 ] && return "$up"
  return "$rc"
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
  0)
    lane_end ok
    # The day's post is going out: to the supervisor this slot counts for the morning one too.
    runs_record hermes:mkan-tiktok-post ok "posted by the $SLOT slot"
    exit 0
    ;;
  77) what="a post was clicked but never confirmed — check @mkan.rw, then pnpm tt:upload --repost=<key> if it is missing"; lane_end fail "$what" 1 ;;
  4) what="the $SLOT slot could not render its share (disk under 10 GiB free, or the video tools failed)"; lane_end fail "$what" ;;
  6) what="the $SLOT slot posted, but tt:buffer (tomorrow's videos) failed"; lane_end warn "$what" ;;
  5) what="the $SLOT slot could not add the evening's ads to today's queue"; lane_end warn "$what" ;;
  *) what="the $SLOT slot could not post (exit $code after ${mins} min)"; lane_end fail "$what" ;;
esac
# Sixteen slots a day: each failure reaches #mkan once a day, except a post that needs a look.
seen="$LOGDIR/$(date +%F)/.alerted-$code"
if [ "$code" -eq 77 ] || [ ! -e "$seen" ]; then
  mkdir -p "$(dirname "$seen")" && : >"$seen"
  {
    echo "⚠️ TikTok ($SLOT slot): $what. Last errors:"
    tail -n 8 "$LOGDIR/post.err.log" | cut -c1-240
    echo "Log: $LOGDIR/post.log"
  } | lane_alert
fi
exit 0
