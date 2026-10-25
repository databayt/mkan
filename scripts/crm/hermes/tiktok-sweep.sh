#!/usr/bin/env bash
# The TikTok lane's tick (06:00 and 18:00), run by the Hermes gateway's cron (no agent, no model).
# Installed to ~/.hermes/scripts/mkan-tiktok-sweep.sh by scripts/crm/install-tiktok-sweep.sh.
#
# Hermes delivers this script's stdout verbatim to #mkan and stays silent on empty
# stdout. The sweep's own --notify already posts the day's counts, so this prints
# only when something is wrong: a failed run, or a run still holding the lock.
# Full output goes to .data/tiktok/sweep.log as it did under launchd.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok"
LOCK="$LOGDIR/.sweep.lock"
FETCH_LIMIT="${TIKTOK_DAILY_LIMIT:-40}"
READ_LIMIT="${TIKTOK_READ_LIMIT:-80}"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
# The gateway's SLACK_HOME_CHANNEL is Hermes' own home; the sweep's summary belongs in #mkan.
unset SLACK_HOME_CHANNEL

mkdir -p "$LOGDIR"
if ! mkdir "$LOCK" 2>/dev/null; then
  # A lock older than 3 h is a crashed run, not a live one.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then
    rm -rf "$LOCK" && mkdir "$LOCK"
  else
    echo "⚠️ TikTok sweep skipped — the previous run still holds $LOCK"
    exit 0
  fi
fi
trap 'rm -rf "$LOCK"' EXIT

cd "$REPO" || { echo "⚠️ TikTok sweep failed — no repo at $REPO"; exit 0; }
started=$(date +%s)
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron ──" >>"$LOGDIR/sweep.log"
/usr/bin/caffeinate -i pnpm -s crm:tiktok --apply --notify \
  --fetch-limit="$FETCH_LIMIT" --read-limit="$READ_LIMIT" \
  >>"$LOGDIR/sweep.log" 2>>"$LOGDIR/sweep.err.log"
code=$?
mins=$(( ($(date +%s) - started) / 60 ))

if [ "$code" -ne 0 ]; then
  echo "⚠️ TikTok sweep failed (exit $code after ${mins} min). Last errors:"
  tail -n 8 "$LOGDIR/sweep.err.log" | cut -c1-240
  echo "Log: $LOGDIR/sweep.log"
fi
exit 0
