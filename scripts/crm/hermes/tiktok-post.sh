#!/usr/bin/env bash
# The TikTok page's morning tick, run by the Hermes gateway's cron (no agent, no model):
# tt:run picks the day's homes and renders the first slot's share (one video each), then
# tt:upload posts it to @mkan.rw through the session-vault Chrome — fully automatic since
# 2026-10-21, no human gate.
# Installed to ~/.hermes/scripts/mkan-tiktok-post.sh by scripts/crm/install-tiktok-post.sh.
#
# Two halves, like the sweep (2026-11-01). The tick takes the post lock and starts the run
# detached from the gateway (detached.sh): a gateway restart killed the 11-01 sweep and demand
# runs mid-way. Every upload slot takes the same lock, so no two ever upload at once. Both
# commands post their own summary to #mkan (--notify); the run posts its failures there itself
# (crm:post-mkan), since Hermes no longer reads its output. The tick prints only when it cannot
# start. Logs: .data/tiktok-post/post.log.
#
# Every ad that went up today, posted when Kigali scrolls (2026-11-07, plan B). This tick picks
# every postable home whose ad went up today or yesterday (3 to 15, pickFresh), renders the first,
# posts it, then renders ahead for the 08:30 slot. The later slots (tiktok-upload-retry.sh: 08:30,
# 12:30, 13:30, then every 30 minutes from 17:00 to 21:30) each post their share and render ahead,
# and the evening ones first add the 15:00 sweep's ads. TikTok spreads reach per account: three
# posts in one 07:00 burst competed with each other.
#   bash scripts/crm/hermes/tiktok-post.sh --plan      what this slot would post (no browser)
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok-post"
LOCK="$LOGDIR/.post.lock"
# Homes posted a day, one post each (2026-11-05): the broker's own video with every burned-in
# text and logo stripped and nothing of ours burned on, their sound kept with spoken numbers
# muted, the code + WhatsApp + credit in the caption only. A render whose strip leaves text is
# REJECTED and never uploads. "fresh" (2026-11-07): every postable ad from today or yesterday,
# 3 to 15 a day (TIKTOK_POSTS_MIN / TIKTOK_POSTS_MAX). A number fixes the day's count; 0 holds
# the lane.
PER_DAY="${TIKTOK_POSTS_PER_DAY:-fresh}"
# How this slot uploads. "spread" renders and posts the slot's share of the day (slotQuota). A
# number brings the day to that many posts and "all" posts everything; both render the whole
# queue first. A later slot that finds nothing rendered hands this script its own UPTO.
UPTO="${TIKTOK_UPLOAD_UPTO:-spread}"
if [ "$UPTO" = spread ]; then RENDER_ARG=--slot; UP_ARG=--spread; else RENDER_ARG=; UP_ARG="--upto=$UPTO"; fi
# A run past this is stuck; the cap frees the lock for the later slots.
MAX_MINUTES="${TIKTOK_POST_MAX_MINUTES:-120}"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
# lane.sh: who holds the lock, and waiting for the internet (the Mac sleeps with its lid shut).
. "$REPO/scripts/crm/hermes/lane.sh"
LANE_JOB=hermes:mkan-tiktok-post

if [ "${1:-}" = "--plan" ]; then
  cd "$REPO" && echo "07:00 slot — pick $PER_DAY, upload $UP_ARG:" && pnpm -s tt:upload --plan $UP_ARG
  exit 0
fi
if [ "${1:-}" != "--run" ]; then
  # A live run holds the lock — paused by sleep, or waiting for the network: let it be.
  lane_tick "$LOCK" 'tiktok-(post|upload-[a-z]+)\.sh' || exit 0
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
vault_ready || { lane_end fail "the session-vault Chrome (:9222) hangs every CDP attach, even after a restart"; echo "⚠️ The session-vault Chrome is stuck — restart it: launchctl kickstart -k gui/$(id -u)/com.databayt.chrome-session"; exit 0; }
started=$(date +%s)
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (detached) ──" >>"$LOGDIR/post.log"

run() { /usr/bin/caffeinate -i pnpm -s "$@" >>"$LOGDIR/post.log" 2>>"$LOGDIR/post.err.log"; }
steps() {
  # Wake the session-vault Chrome now, so it is up and settled by the upload (~10 min
  # later). Its launchd job respects a Cmd-Q, so a quit or a reboot left it down and
  # the upload failed on 10-26, 10-29 and 11-01. kickstart starts it only if it is down.
  launchctl kickstart "gui/$(id -u)/com.databayt.chrome-session" >/dev/null 2>&1 || true
  # The 07:00 query has failed on a waking Neon; one retry after a minute.
  run tt:run --notify --n="$PER_DAY" $RENDER_ARG || { sleep 60; run tt:run --notify --n="$PER_DAY" $RENDER_ARG; } || return 2
  run tt:upload --notify $UP_ARG
  local up=$?
  # Then the 08:30 slot's video (and the next ones), so it posts on the minute.
  [ "$UPTO" = spread ] && run tt:render --ahead
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
  3) what="TikTok auto-post had failures — the next slots post what is left"; lane_end warn "$what" ;;
  77) what="TikTok: a post was clicked but never confirmed — check @mkan.rw, then pnpm tt:upload --repost=<key> if it is missing"; lane_end fail "$what" 1 ;;
  *) what="TikTok post failed (exit $code after ${mins} min)"; lane_end fail "$what" ;;
esac
{
  echo "⚠️ $what. Last errors:"
  tail -n 8 "$LOGDIR/post.err.log" | cut -c1-240
  echo "Log: $LOGDIR/post.log"
} | lane_alert
exit 0
