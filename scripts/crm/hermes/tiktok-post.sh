#!/usr/bin/env bash
# The TikTok page's daily tick, run by the Hermes gateway's cron (no agent, no model):
# tt:run renders today's pieces, then tt:upload posts them to @mkan.rw through the
# session-vault Chrome — fully automatic since 2026-10-21, no human gate.
# Installed to ~/.hermes/scripts/mkan-tiktok-post.sh by scripts/crm/install-tiktok-post.sh.
#
# Both commands post their own summary to #mkan (--notify); stdout here, which Hermes
# delivers to #mkan, carries only failures. Logs: .data/tiktok-post/post.log.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok-post"
# Broker videos are on hold (0) until their burned-in captions and phone numbers are
# stripped before the brand pass (2026-11-01): a broker's own number on our page sends the
# tenant straight to them. The daily picture video still posts. Back to 3 once it ships.
PER_DAY="${TIKTOK_POSTS_PER_DAY:-0}"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL

mkdir -p "$LOGDIR"
cd "$REPO" || { echo "⚠️ TikTok post failed — no repo at $REPO"; exit 0; }
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron ──" >>"$LOGDIR/post.log"

run() { /usr/bin/caffeinate -i pnpm -s "$@" >>"$LOGDIR/post.log" 2>>"$LOGDIR/post.err.log"; }

# Wake the session-vault Chrome now, so it is up and settled by the upload (~10 min
# later). Its launchd job respects a Cmd-Q, so a quit or a reboot left it down and
# the upload failed on 10-26, 10-29 and 11-01. kickstart starts it only if it is down.
launchctl kickstart "gui/$(id -u)/com.databayt.chrome-session" >/dev/null 2>&1 || true

# The 07:00 query has failed on a waking Neon; one retry after a minute.
run tt:run --notify --n="$PER_DAY" || { sleep 60; run tt:run --notify --n="$PER_DAY"; } || {
  echo "⚠️ TikTok render failed twice. Last errors:"
  tail -n 8 "$LOGDIR/post.err.log" | cut -c1-240
  exit 0
}
run tt:upload --notify || {
  echo "⚠️ TikTok auto-post had failures. Last errors:"
  tail -n 8 "$LOGDIR/post.err.log" | cut -c1-240
}
exit 0
