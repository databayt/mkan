#!/usr/bin/env bash
# The TikTok page's weekly numbers (Mondays 10:00), run by the Hermes gateway's cron (no agent,
# no model): tt:stats reads every video on @mkan.rw back with yt-dlp and posts one line to #mkan
# — videos, views, likes, the week's posts, the best one — so the page's reach is a number, not
# a guess. Each run also appends a snapshot to .data/tiktok-post/page-stats.jsonl (the trend).
# Installed to ~/.hermes/scripts/mkan-tiktok-stats.sh by scripts/crm/install-tiktok-post.sh.
#
# Two halves like the other lanes (2026-11-02): the first Monday run fired at 10:59 with the lid
# shut and could not resolve tiktok.com. The tick takes its own lock and starts the run detached;
# the run waits until the Mac is online, then reads the page and posts its own failure to #mkan.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok-post"
LOCK="$LOGDIR/.stats.lock"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
# lane.sh: who holds the lock, and waiting for the internet (the Mac sleeps with its lid shut).
. "$REPO/scripts/crm/hermes/lane.sh"

if [ "${1:-}" != "--run" ]; then
  lane_tick "$LOCK" 'tiktok-stats\.sh' || exit 0
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ TikTok stats could not start detached from the gateway"
  fi
  exit 0
fi

# ── the run, outside the gateway ────────────────────────────────────────────
lane_own "$LOCK"
cd "$REPO" || exit 0
wait_online 600 || exit 0
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (weekly stats, detached) ──" >>"$LOGDIR/post.log"
pnpm -s tt:stats --notify >>"$LOGDIR/post.log" 2>>"$LOGDIR/post.err.log" || {
  echo "⚠️ TikTok stats could not read the page back. Last errors:"
  tail -n 4 "$LOGDIR/post.err.log" | cut -c1-240
} | pnpm -s crm:post-mkan >/dev/null 2>&1
exit 0
