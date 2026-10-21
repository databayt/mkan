#!/usr/bin/env bash
# The Facebook rentals lane's daily tick, run by the Hermes gateway's cron (no agent, no model).
# Installed to ~/.hermes/scripts/mkan-fb-sweep.sh by scripts/crm/install-ads-sweeps.sh fb.
#
# Hermes delivers stdout verbatim to #mkan and stays silent on empty stdout. The
# lane's own --notify posts the day's counts (and a checkpoint/login stop), so this
# prints only when something is wrong: a failed run, a held lock, or the scrape
# browser not running. It drives the DEDICATED scrape account only
# (FB_SCRAPE_PORT / FB_SCRAPE_PROFILE, `bash ~/.claude/bin/chrome-scrape.sh`) —
# never the session vault on 9222. Full output goes to .data/fb-rentals/sweep.log.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/fb-rentals"
LOCK="$LOGDIR/.sweep.lock"
SEED_LIMIT="${FB_SEED_LIMIT:-10}"   # seed groups / Marketplace searches per day
READ_LIMIT="${FB_READ_LIMIT:-40}"   # posts read per day (the TikTok reader's quota is shared)
SCROLLS="${FB_SCROLLS:-6}"          # feed scrolls per seed
MAX_AGE="${FB_MAX_AGE:-3}"          # days; a daily run only needs the last few
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
# The gateway's SLACK_HOME_CHANNEL is Hermes' own home; the sweep's summary belongs in #mkan.
unset SLACK_HOME_CHANNEL

# The scrape identity (FB_SCRAPE_PORT / FB_SCRAPE_PROFILE) comes from the environment or
# mkan's .env; without it the lane refuses to start, and the failure lands below.
export FB_SCRAPE_PORT="${FB_SCRAPE_PORT:-9333}"
export FB_SCRAPE_PROFILE="${FB_SCRAPE_PROFILE:-$HOME/.claude/chrome-fbscrape-profile}"

mkdir -p "$LOGDIR"
if ! mkdir "$LOCK" 2>/dev/null; then
  # A lock older than 2 h is a crashed run, not a live one.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
    rm -rf "$LOCK" && mkdir "$LOCK"
  else
    echo "⚠️ Facebook sweep skipped — the previous run still holds $LOCK"
    exit 0
  fi
fi
trap 'rm -rf "$LOCK"' EXIT

cd "$REPO" || { echo "⚠️ Facebook sweep failed — no repo at $REPO"; exit 0; }
started=$(date +%s)
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron ──" >>"$LOGDIR/sweep.log"
/usr/bin/caffeinate -i pnpm -s crm:fb-rentals --apply --notify \
  --limit="$SEED_LIMIT" --read-limit="$READ_LIMIT" --scrolls="$SCROLLS" --max-age="$MAX_AGE" \
  >>"$LOGDIR/sweep.log" 2>>"$LOGDIR/sweep.err.log"
code=$?
mins=$(( ($(date +%s) - started) / 60 ))

if [ "$code" -ne 0 ]; then
  echo "⚠️ Facebook sweep failed (exit $code after ${mins} min). Last errors:"
  tail -n 8 "$LOGDIR/sweep.err.log" | cut -c1-240
  echo "Is the scrape Chrome up on :$FB_SCRAPE_PORT (logged in as the scrape account)? bash ~/.claude/bin/chrome-scrape.sh"
  echo "Log: $LOGDIR/sweep.log"
fi
exit 0
