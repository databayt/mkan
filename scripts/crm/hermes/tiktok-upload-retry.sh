#!/usr/bin/env bash
# The TikTok page's second chance, run by the Hermes gateway's cron at 13:00 (no agent,
# no model): posts whatever the 07:00 tick rendered but could not upload — the vault
# Chrome was down, TikTok was slow, the Mac was asleep. tt:upload skips anything in the
# day's uploads.json, so a day that already went out does nothing here.
# Installed to ~/.hermes/scripts/mkan-tiktok-upload-retry.sh by scripts/crm/install-tiktok-post.sh.
#
# stdout is delivered to #mkan, so it carries only failures; tt:upload --notify posts
# its own summary when it does post something. Logs: .data/tiktok-post/post.log.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok-post"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL

mkdir -p "$LOGDIR"
cd "$REPO" || { echo "⚠️ TikTok retry failed — no repo at $REPO"; exit 0; }
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (13:00 retry) ──" >>"$LOGDIR/post.log"

launchctl kickstart "gui/$(id -u)/com.databayt.chrome-session" >/dev/null 2>&1 || true
/usr/bin/caffeinate -i pnpm -s tt:upload --notify >>"$LOGDIR/post.log" 2>>"$LOGDIR/post.err.log" || {
  echo "⚠️ TikTok retry (13:00) still could not post. Last errors:"
  tail -n 8 "$LOGDIR/post.err.log" | cut -c1-240
}
exit 0
