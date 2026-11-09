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
# TIKTOK_POSTS_PER_DAY=<n> bakes a new default into the installed copies; without it the
# scripts' own default stands ("fresh" since 2026-11-07: every postable ad that went up today or
# yesterday, 3 to 15 a day; TIKTOK_POSTS_PER_DAY=0 holds the lane). Logs under .data/tiktok-post/.
# The day's posts go out one home at a time (lever 6 rolled back 2026-11-09: the evening spread
# drew 69 views a post against 139): 07:00 picks and posts the first; mkan-tiktok-upload-retry runs
# at :30 past 08–17, and mkan-tiktok-upload-evening (the same script with SLOT/PICK baked in) at
# :30 past 18–22. Each slot posts its share of the day, then renders ahead for the next. The evening
# slots first add the 15:00 sweep's ads. A slot that missed its turn is caught up by the next
# ones; the day's uploads.json/pending.json keep any piece from posting twice, and every slot
# shares one lock, so no two ever upload at once. The times match SLOT_TIMES in
# tiktok-post-pure.ts.
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
  PER_DAY_SED="s|\${TIKTOK_POSTS_PER_DAY:-[a-z0-9]*}|\${TIKTOK_POSTS_PER_DAY:-$TIKTOK_POSTS_PER_DAY}|"
fi
RETRY="mkan-tiktok-upload-retry"
RETRY_SCRIPT="$HERMES_HOME/scripts/$RETRY.sh"
RETRY_SCHEDULE="${TIKTOK_RETRY_SCHEDULE:-30 8-17 * * *}"
EVENING="mkan-tiktok-upload-evening"
EVENING_SCRIPT="$HERMES_HOME/scripts/$EVENING.sh"
EVENING_SCHEDULE="${TIKTOK_EVENING_SCHEDULE:-30 18-22 * * *}"
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
PER_DAY=$(sed -n 's/^PER_DAY="\${TIKTOK_POSTS_PER_DAY:-\([a-z0-9]*\)}"$/\1/p' "$HERMES_SCRIPT")

remove_hermes_job "$NAME"
hermes cron create "$SCHEDULE" --name "$NAME" --script "$NAME.sh" --no-agent \
  --deliver "slack:$MKAN_CHANNEL" >/dev/null

sed -e "s|\${MKAN_REPO:-/Users/abdout/mkan}|\${MKAN_REPO:-$REPO}|" -e "$PER_DAY_SED" \
  "$REPO/scripts/crm/hermes/tiktok-upload-retry.sh" >"$RETRY_SCRIPT.tmp"
chmod +x "$RETRY_SCRIPT.tmp" && mv -f "$RETRY_SCRIPT.tmp" "$RETRY_SCRIPT"
remove_hermes_job "$RETRY"
hermes cron create "$RETRY_SCHEDULE" --name "$RETRY" --script "$RETRY.sh" --no-agent \
  --deliver "slack:$MKAN_CHANNEL" >/dev/null

# The evening slots: the same uploader, but each first adds the ads the 18:00 sweep fetched to
# today's queue (PICK=1). A longer cap, because a slot that is behind renders and posts two.
sed -e "s|\${MKAN_REPO:-/Users/abdout/mkan}|\${MKAN_REPO:-$REPO}|" -e "$PER_DAY_SED" \
  -e 's|\${TIKTOK_UPLOAD_SLOT:-day}|${TIKTOK_UPLOAD_SLOT:-evening}|' \
  -e 's|\${TIKTOK_SLOT_PICK:-0}|${TIKTOK_SLOT_PICK:-1}|' \
  -e 's|\${TIKTOK_RETRY_MAX_MINUTES:-75}|${TIKTOK_RETRY_MAX_MINUTES:-90}|' \
  -e 's|\${TIKTOK_UPLOAD_JOB:-hermes:mkan-tiktok-upload-retry}|${TIKTOK_UPLOAD_JOB:-hermes:mkan-tiktok-upload-evening}|' \
  "$REPO/scripts/crm/hermes/tiktok-upload-retry.sh" >"$EVENING_SCRIPT.tmp"
# A copy whose substitutions missed would run as a day slot and never pick up the evening's ads.
grep -q 'TIKTOK_SLOT_PICK:-1' "$EVENING_SCRIPT.tmp" || { echo "evening copy: the PICK substitution missed"; rm -f "$EVENING_SCRIPT.tmp"; exit 1; }
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
echo "installed Hermes job $NAME — '$SCHEDULE', picks the day's homes ($PER_DAY: one clean video each) and posts the first to @mkan.rw"
echo "installed Hermes job $RETRY — '$RETRY_SCHEDULE', posts each slot's share and renders ahead (or runs the whole post when 07:00 rendered nothing)"
echo "installed Hermes job $EVENING — '$EVENING_SCHEDULE', adds the 15:00 sweep's ads, then posts each slot's share and renders ahead"
echo "installed Hermes job $STATS — '$STATS_SCHEDULE', the page's views and likes in #mkan"
