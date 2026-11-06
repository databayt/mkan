#!/usr/bin/env bash
# The TikTok page's later upload slots, run by the Hermes gateway's cron (no agent, no model).
# Since 2026-11-06 the day's posts are spread over the day instead of one 07:00 burst: 07:00
# renders all three and posts one (tiktok-post.sh), this script at 12:30 brings the day to two
# (UPTO=2, job mkan-tiktok-upload-retry) and the same script at 18:30 posts the rest (UPTO=all,
# job mkan-tiktok-upload-evening — the installer bakes SLOT/UPTO into that copy). TikTok spreads
# reach per account, so one post every few hours reaches more people.
# tt:upload --upto counts a piece out once it is in the day's uploads.json or pending.json, so a
# slot that missed its turn (vault Chrome down, TikTok slow, the Mac asleep) is caught up by the
# next, and nothing clicked-but-unconfirmed is posted twice. When 07:00 rendered nothing at all
# (Neon refused it twice on 10-24, 10-25, 10-27 and 10-28), this runs the whole morning post.
# Installed to ~/.hermes/scripts/mkan-tiktok-upload-{retry,evening}.sh by scripts/crm/install-tiktok-post.sh.
#   bash scripts/crm/hermes/tiktok-upload-retry.sh --plan   what this slot would post (no browser)
#
# Same two halves as the 07:00 post (2026-11-01): the tick takes the post lock, so no two slots
# ever upload at once, and starts the run detached from the gateway. The 18:30 slot also waits
# for a live 18:00 TikTok sweep to finish: two lanes on the one vault Chrome time out.
# tt:upload --notify posts its own summary when it posts something; the run posts its failure
# to #mkan itself. The tick prints only when it cannot start. Logs: .data/tiktok-post/post.log.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok-post"
LOCK="$LOGDIR/.post.lock"
MAX_MINUTES="${TIKTOK_RETRY_MAX_MINUTES:-60}"
SLOT="${TIKTOK_UPLOAD_SLOT:-12:30}"
# How many of the day's posts are out once this slot is done; "all" posts what is left.
UPTO="${TIKTOK_UPLOAD_UPTO:-2}"
SWEEP_LOCK="$REPO/scripts/crm/.data/tiktok/.sweep.lock"
SWEEP_WAIT_MINUTES="${TIKTOK_SWEEP_WAIT_MINUTES:-90}"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
# lane.sh: who holds the lock, and waiting for the internet (the Mac sleeps with its lid shut).
. "$REPO/scripts/crm/hermes/lane.sh"
LANE_JOB="${TIKTOK_UPLOAD_JOB:-hermes:mkan-tiktok-upload-retry}"

if [ "${1:-}" = "--plan" ]; then
  cd "$REPO" && echo "$SLOT slot — upload up to $UPTO:" && pnpm -s tt:upload --plan --upto="$UPTO"
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
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron ($SLOT slot, upto=$UPTO, detached$note) ──" >>"$LOGDIR/post.log"

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
set -m
/usr/bin/caffeinate -i pnpm -s tt:upload --notify --upto="$UPTO" >>"$LOGDIR/post.log" 2>>"$LOGDIR/post.err.log" &
pid=$!
( sleep $((MAX_MINUTES * 60)); kill -TERM -- "-$pid" 2>/dev/null && echo "  ! stopped after ${MAX_MINUTES} min" >>"$LOGDIR/post.log" ) &
watchdog=$!
wait "$pid"
code=$?
kill -- "-$watchdog" 2>/dev/null
mins=$(( ($(date +%s) - started) / 60 ))

if [ "$code" -eq 0 ]; then
  lane_end ok
  # The day's post is done: its slot (07:00 + this retry) is one slot to the supervisor.
  runs_record hermes:mkan-tiktok-post ok "posted by the $SLOT slot"
elif [ "$code" -eq 77 ]; then
  lane_end fail "a post was clicked but never confirmed — check @mkan.rw, then pnpm tt:upload --repost=<key> if it is missing" 1
else
  lane_end fail "the $SLOT slot could not post (exit $code after ${mins} min)"
fi
if [ "$code" -ne 0 ]; then
  {
    echo "⚠️ TikTok upload ($SLOT) could not post (exit $code after ${mins} min). Last errors:"
    tail -n 8 "$LOGDIR/post.err.log" | cut -c1-240
    echo "Log: $LOGDIR/post.log"
  } | lane_alert
fi
exit 0
