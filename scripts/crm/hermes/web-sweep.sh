#!/usr/bin/env bash
# The web lane's daily tick (Rwandan property sites → Twenty), run by the Hermes
# gateway's cron (no agent, no model). Installed to ~/.hermes/scripts/mkan-web-sweep.sh
# by scripts/crm/install-ads-sweeps.sh web.
#
# Hermes delivers stdout verbatim to #mkan and stays silent on empty stdout. The
# lane's own --notify posts the day's counts, so this prints only on a failed run
# or a held lock. No browser, no login: plain HTTP, one request every 2.5 s.
# Full output goes to .data/web-ads/sweep.log.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/web-ads"
LOCK="$LOGDIR/.sweep.lock"
PER_SITE="${WEB_PER_SITE:-40}"      # new ads per site per day (≈ 2 min of fetching each)
READ_LIMIT="${WEB_READ_LIMIT:-30}"  # model reads, only for ads whose labels leave a gap
MAX_AGE="${WEB_MAX_AGE:-90}"        # days, by the site's own date where it has one
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
# The gateway's SLACK_HOME_CHANNEL is Hermes' own home; the sweep's summary belongs in #mkan.
unset SLACK_HOME_CHANNEL

mkdir -p "$LOGDIR"
if ! mkdir "$LOCK" 2>/dev/null; then
  # A lock older than 2 h is a crashed run, not a live one.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
    rm -rf "$LOCK" && mkdir "$LOCK"
  else
    echo "⚠️ Web ads sweep skipped — the previous run still holds $LOCK"
    exit 0
  fi
fi
trap 'rm -rf "$LOCK"' EXIT

cd "$REPO" || { echo "⚠️ Web ads sweep failed — no repo at $REPO"; exit 0; }
started=$(date +%s)
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron ──" >>"$LOGDIR/sweep.log"
/usr/bin/caffeinate -i pnpm -s crm:web-ads run --apply --notify \
  --limit="$PER_SITE" --read-limit="$READ_LIMIT" --max-age="$MAX_AGE" \
  >>"$LOGDIR/sweep.log" 2>>"$LOGDIR/sweep.err.log"
code=$?
mins=$(( ($(date +%s) - started) / 60 ))

if [ "$code" -ne 0 ]; then
  echo "⚠️ Web ads sweep failed (exit $code after ${mins} min). Last errors:"
  tail -n 8 "$LOGDIR/sweep.err.log" | cut -c1-240
  echo "Log: $LOGDIR/sweep.log"
fi
exit 0
