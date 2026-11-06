#!/usr/bin/env bash
# mkan's Kigali TikTok page, daily at 07:00 (after the 06:00 broker sweep):
# tt:run renders today's homes, one video each → tt:upload posts them to @mkan.rw through the
# session-vault Chrome (fully automatic since 2026-10-21). Summaries land in #mkan.
#
# The scheduler is the Hermes gateway's cron (no agent, no model), like the sweep:
#   bash scripts/crm/install-tiktok-post.sh            # install / refresh the Hermes job
#   bash scripts/crm/install-tiktok-post.sh --remove   # remove the Hermes job
#   hermes cron list | grep -A8 mkan-tiktok-post       # next run, last result
#
# One-time: the vault Chrome (127.0.0.1:9222) must be logged in to TikTok as @mkan.rw
# (QR scan at tiktok.com/login). If it logs out, the run says so in #mkan.
# TIKTOK_POSTS_PER_DAY=<n> bakes a new default into the installed copy; without it the
# script's own default stands (3 homes a day since the clean-video strip, 2026-11-05;
# TIKTOK_POSTS_PER_DAY=0 holds the lane). Logs under .data/tiktok-post/.
# The day's posts are spread over three slots (2026-11-06): 07:00 renders all and posts one,
# mkan-tiktok-upload-retry (12:30) brings the day to two, mkan-tiktok-upload-evening (18:30,
# the same script with SLOT/UPTO baked in) posts the rest, after any live 18:00 sweep. A slot
# that missed its turn is caught up by the next; the day's uploads.json/pending.json keep any
# piece from posting twice, and all three share one lock, so they never upload at once.
#   bash scripts/crm/hermes/tiktok-post.sh --plan; bash scripts/crm/hermes/tiktok-upload-retry.sh --plan
# A fourth, mkan-tiktok-stats (daily
# 21:00), reads followers, views, likes, comments and shares per post for /monetize, and
# puts the page's numbers in #mkan on Mondays.
set -euo pipefail
NAME="mkan-tiktok-post"
LABEL="com.databayt.$NAME"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
HERMES_SCRIPT="$HERMES_HOME/scripts/$NAME.sh"
MKAN_CHANNEL="C0BS2NZE2AY" # private #mkan
SCHEDULE="${TIKTOK_POST_SCHEDULE:-0 7 * * *}"
PER_DAY_SED='s/^$//' # no-op unless TIKTOK_POSTS_PER_DAY is set
if [ -n "${TIKTOK_POSTS_PER_DAY:-}" ]; then
  PER_DAY_SED="s|\${TIKTOK_POSTS_PER_DAY:-[0-9]*}|\${TIKTOK_POSTS_PER_DAY:-$TIKTOK_POSTS_PER_DAY}|"
fi
RETRY="mkan-tiktok-upload-retry"
RETRY_SCRIPT="$HERMES_HOME/scripts/$RETRY.sh"
RETRY_SCHEDULE="${TIKTOK_RETRY_SCHEDULE:-30 12 * * *}"
EVENING="mkan-tiktok-upload-evening"
EVENING_SCRIPT="$HERMES_HOME/scripts/$EVENING.sh"
EVENING_SCHEDULE="${TIKTOK_EVENING_SCHEDULE:-30 18 * * *}"
STATS="mkan-tiktok-stats"
STATS_SCRIPT="$HERMES_HOME/scripts/$STATS.sh"
STATS_SCHEDULE="${TIKTOK_STATS_SCHEDULE:-0 21 * * *}"

hermes_job_ids() {
  hermes cron list 2>/dev/null | awk -v n="${1:-$NAME}" '/^  [0-9a-f]{12} \[/{id=$1} $1=="Name:" && $2==n {print id}'
}
remove_hermes_job() {
  for id in $(hermes_job_ids "${1:-$NAME}"); do hermes cron remove "$id" >/dev/null && echo "removed Hermes job $id"; done
}

if [ "${1:-}" = "--remove" ]; then
  remove_hermes_job "$NAME"
  remove_hermes_job "$RETRY"
  remove_hermes_job "$EVENING"
  remove_hermes_job "$STATS"
  rm -f "$HERMES_SCRIPT" "$RETRY_SCRIPT" "$EVENING_SCRIPT" "$STATS_SCRIPT"
  exit 0
fi

command -v hermes >/dev/null || { echo "hermes not installed"; exit 1; }
mkdir -p "$HERMES_HOME/scripts" "$REPO/scripts/crm/.data/tiktok-post"
# Each copy is written beside the live one and renamed over it, so a run still reading the
# old copy keeps it: cp or > rewrites a file in place, and that cut the 11-01 demand run short.
sed -e "s|\${MKAN_REPO:-/Users/abdout/mkan}|\${MKAN_REPO:-$REPO}|" -e "$PER_DAY_SED" \
  "$REPO/scripts/crm/hermes/tiktok-post.sh" >"$HERMES_SCRIPT.tmp"
chmod +x "$HERMES_SCRIPT.tmp" && mv -f "$HERMES_SCRIPT.tmp" "$HERMES_SCRIPT"
PER_DAY=$(sed -n 's/^PER_DAY="\${TIKTOK_POSTS_PER_DAY:-\([0-9]*\)}"$/\1/p' "$HERMES_SCRIPT")

remove_hermes_job "$NAME"
hermes cron create "$SCHEDULE" --name "$NAME" --script "$NAME.sh" --no-agent \
  --deliver "slack:$MKAN_CHANNEL" >/dev/null

sed -e "s|\${MKAN_REPO:-/Users/abdout/mkan}|\${MKAN_REPO:-$REPO}|" \
  "$REPO/scripts/crm/hermes/tiktok-upload-retry.sh" >"$RETRY_SCRIPT.tmp"
chmod +x "$RETRY_SCRIPT.tmp" && mv -f "$RETRY_SCRIPT.tmp" "$RETRY_SCRIPT"
remove_hermes_job "$RETRY"
hermes cron create "$RETRY_SCHEDULE" --name "$RETRY" --script "$RETRY.sh" --no-agent \
  --deliver "slack:$MKAN_CHANNEL" >/dev/null

# The evening slot: the same uploader, posting whatever is left (and a longer cap — a day whose
# earlier slots all missed posts three here, a few minutes apart).
sed -e "s|\${MKAN_REPO:-/Users/abdout/mkan}|\${MKAN_REPO:-$REPO}|" \
  -e 's|\${TIKTOK_UPLOAD_SLOT:-12:30}|${TIKTOK_UPLOAD_SLOT:-18:30}|' \
  -e 's|\${TIKTOK_UPLOAD_UPTO:-2}|${TIKTOK_UPLOAD_UPTO:-all}|' \
  -e 's|\${TIKTOK_RETRY_MAX_MINUTES:-60}|${TIKTOK_RETRY_MAX_MINUTES:-90}|' \
  -e 's|\${TIKTOK_UPLOAD_JOB:-hermes:mkan-tiktok-upload-retry}|${TIKTOK_UPLOAD_JOB:-hermes:mkan-tiktok-upload-evening}|' \
  "$REPO/scripts/crm/hermes/tiktok-upload-retry.sh" >"$EVENING_SCRIPT.tmp"
chmod +x "$EVENING_SCRIPT.tmp" && mv -f "$EVENING_SCRIPT.tmp" "$EVENING_SCRIPT"
remove_hermes_job "$EVENING"
hermes cron create "$EVENING_SCHEDULE" --name "$EVENING" --script "$EVENING.sh" --no-agent \
  --deliver "slack:$MKAN_CHANNEL" >/dev/null

sed -e "s|\${MKAN_REPO:-/Users/abdout/mkan}|\${MKAN_REPO:-$REPO}|" \
  "$REPO/scripts/crm/hermes/tiktok-stats.sh" >"$STATS_SCRIPT.tmp"
chmod +x "$STATS_SCRIPT.tmp" && mv -f "$STATS_SCRIPT.tmp" "$STATS_SCRIPT"
remove_hermes_job "$STATS"
hermes cron create "$STATS_SCHEDULE" --name "$STATS" --script "$STATS.sh" --no-agent \
  --deliver "slack:$MKAN_CHANNEL" >/dev/null

# Only one scheduler may own the tick: the old launchd job rendered without posting.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ -f "$PLIST" ]; then
  mkdir -p "$HOME/Library/LaunchAgents/disabled"
  mv "$PLIST" "$HOME/Library/LaunchAgents/disabled/$LABEL.plist"
  echo "launchd $LABEL off (plist kept in LaunchAgents/disabled/)"
fi
echo "installed Hermes job $NAME — '$SCHEDULE', renders $PER_DAY homes a day (one clean video each), posts the first to @mkan.rw"
echo "installed Hermes job $RETRY — '$RETRY_SCHEDULE', brings the day to two posts (or runs the whole post when 07:00 rendered nothing)"
echo "installed Hermes job $EVENING — '$EVENING_SCHEDULE', posts the rest of the day's videos"
echo "installed Hermes job $STATS — '$STATS_SCHEDULE', the page's views and likes in #mkan"
