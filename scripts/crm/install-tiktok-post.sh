#!/usr/bin/env bash
# mkan's Kigali TikTok page, daily at 07:00 (after the 06:00 broker sweep):
# tt:run renders today's pieces → tt:upload posts them to @mkan.rw through the
# session-vault Chrome (fully automatic since 2026-10-21). Summaries land in #mkan.
#
# The scheduler is the Hermes gateway's cron (no agent, no model), like the sweep:
#   bash scripts/crm/install-tiktok-post.sh            # install / refresh the Hermes job
#   bash scripts/crm/install-tiktok-post.sh --remove   # remove the Hermes job
#   hermes cron list | grep -A8 mkan-tiktok-post       # next run, last result
#
# One-time: the vault Chrome (127.0.0.1:9222) must be logged in to TikTok as @mkan.rw
# (QR scan at tiktok.com/login). If it logs out, the run says so in #mkan.
# TIKTOK_POSTS_PER_DAY sets how many homes (default 3). Logs under .data/tiktok-post/.
# A second job, mkan-tiktok-upload-retry (13:00), posts whatever 07:00 rendered but could
# not upload; the day's uploads.json keeps it from posting anything twice.
set -euo pipefail
NAME="mkan-tiktok-post"
LABEL="com.databayt.$NAME"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
HERMES_SCRIPT="$HERMES_HOME/scripts/$NAME.sh"
MKAN_CHANNEL="C0BS2NZE2AY" # private #mkan
SCHEDULE="${TIKTOK_POST_SCHEDULE:-0 7 * * *}"
PER_DAY="${TIKTOK_POSTS_PER_DAY:-3}"
RETRY="mkan-tiktok-upload-retry"
RETRY_SCRIPT="$HERMES_HOME/scripts/$RETRY.sh"
RETRY_SCHEDULE="${TIKTOK_RETRY_SCHEDULE:-0 13 * * *}"

hermes_job_ids() {
  hermes cron list 2>/dev/null | awk -v n="${1:-$NAME}" '/^  [0-9a-f]{12} \[/{id=$1} $1=="Name:" && $2==n {print id}'
}
remove_hermes_job() {
  for id in $(hermes_job_ids "${1:-$NAME}"); do hermes cron remove "$id" >/dev/null && echo "removed Hermes job $id"; done
}

if [ "${1:-}" = "--remove" ]; then
  remove_hermes_job "$NAME"
  remove_hermes_job "$RETRY"
  rm -f "$HERMES_SCRIPT" "$RETRY_SCRIPT"
  exit 0
fi

command -v hermes >/dev/null || { echo "hermes not installed"; exit 1; }
mkdir -p "$HERMES_HOME/scripts" "$REPO/scripts/crm/.data/tiktok-post"
sed -e "s|\${MKAN_REPO:-/Users/abdout/mkan}|\${MKAN_REPO:-$REPO}|" \
  -e "s|\${TIKTOK_POSTS_PER_DAY:-3}|\${TIKTOK_POSTS_PER_DAY:-$PER_DAY}|" \
  "$REPO/scripts/crm/hermes/tiktok-post.sh" >"$HERMES_SCRIPT"
chmod +x "$HERMES_SCRIPT"

remove_hermes_job "$NAME"
hermes cron create "$SCHEDULE" --name "$NAME" --script "$NAME.sh" --no-agent \
  --deliver "slack:$MKAN_CHANNEL" >/dev/null

sed -e "s|\${MKAN_REPO:-/Users/abdout/mkan}|\${MKAN_REPO:-$REPO}|" \
  "$REPO/scripts/crm/hermes/tiktok-upload-retry.sh" >"$RETRY_SCRIPT"
chmod +x "$RETRY_SCRIPT"
remove_hermes_job "$RETRY"
hermes cron create "$RETRY_SCHEDULE" --name "$RETRY" --script "$RETRY.sh" --no-agent \
  --deliver "slack:$MKAN_CHANNEL" >/dev/null

# Only one scheduler may own the tick: the old launchd job rendered without posting.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ -f "$PLIST" ]; then
  mkdir -p "$HOME/Library/LaunchAgents/disabled"
  mv "$PLIST" "$HOME/Library/LaunchAgents/disabled/$LABEL.plist"
  echo "launchd $LABEL off (plist kept in LaunchAgents/disabled/)"
fi
echo "installed Hermes job $NAME — '$SCHEDULE', $PER_DAY homes + the picture video, auto-posted to @mkan.rw"
echo "installed Hermes job $RETRY — '$RETRY_SCHEDULE', posts what the morning tick could not upload"
