#!/usr/bin/env bash
# The TikTok page's weekly numbers (Mondays 10:00), run by the Hermes gateway's cron (no agent,
# no model): tt:stats reads every video on @mkan.rw back with yt-dlp and posts one line to #mkan
# — videos, views, likes, the week's posts, the best one — so the page's reach is a number, not
# a guess. Each run also appends a snapshot to .data/tiktok-post/page-stats.jsonl (the trend).
# Under a minute, so it runs inside the gateway; a restart costs one week's line, nothing else.
# Installed to ~/.hermes/scripts/mkan-tiktok-stats.sh by scripts/crm/install-tiktok-post.sh.
#
# Hermes delivers stdout to #mkan, so it carries only failures; the line itself is --notify's.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok-post"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
cd "$REPO" || { echo "⚠️ TikTok stats failed — no repo at $REPO"; exit 0; }
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (weekly stats) ──" >>"$LOGDIR/post.log"
pnpm -s tt:stats --notify >>"$LOGDIR/post.log" 2>>"$LOGDIR/post.err.log" || {
  echo "⚠️ TikTok stats could not read the page back. Last errors:"
  tail -n 4 "$LOGDIR/post.err.log" | cut -c1-240
}
exit 0
