#!/usr/bin/env bash
# The web lane's daily tick (Rwandan property sites → Twenty), run by the Hermes
# gateway's cron (no agent, no model). Installed to ~/.hermes/scripts/mkan-web-sweep.sh
# by scripts/crm/install-ads-sweeps.sh web.
#
# Two halves, like the TikTok lanes (2026-11-02): the tick takes the lock and starts the
# run detached from the gateway (detached.sh); the run waits until the Mac is online (the
# 11-01 evening and 11-02 morning runs fired with the lid shut and found no network), then
# lists, reads and files, re-checks the live ads, and posts its own failure to #mkan. The
# lane's --notify posts the day's counts. No browser, no login: plain HTTP, one request
# every 2.5 s. Full output goes to .data/web-ads/sweep.log.
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
# lane.sh: who holds the lock, and waiting for the internet (the Mac sleeps with its lid shut).
. "$REPO/scripts/crm/hermes/lane.sh"

if [ "${1:-}" != "--run" ]; then
  # A live run holds the lock — paused by sleep, or waiting for the network: let it be.
  lane_tick "$LOCK" 'web-sweep\.sh' || exit 0
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ Web ads sweep could not start detached from the gateway"
  fi
  exit 0
fi

# ── the run, outside the gateway ────────────────────────────────────────────
lane_own "$LOCK"
cd "$REPO" || exit 0
# Wait for the internet — wall clock, up to 10 h — instead of every site "fetch failed".
wait_online 600 || exit 0
started=$(date +%s)
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (detached) ──" >>"$LOGDIR/sweep.log"
/usr/bin/caffeinate -i pnpm -s crm:web-ads run --apply --notify \
  --limit="$PER_SITE" --read-limit="$READ_LIMIT" --max-age="$MAX_AGE" \
  >>"$LOGDIR/sweep.log" 2>>"$LOGDIR/sweep.err.log"
code=$?
mins=$(( ($(date +%s) - started) / 60 ))

# Then the live web homes' ads, read again every 3 days: a removed ad's home leaves /find
# (lostAt AD_GONE). It posts to #mkan only when some went; its failure streak alerts there too.
/usr/bin/caffeinate -i pnpm -s crm:web-ads recheck --apply --notify >>"$LOGDIR/sweep.log" 2>>"$LOGDIR/sweep.err.log"

if [ "$code" -ne 0 ]; then
  {
    echo "⚠️ Web ads sweep failed (exit $code after ${mins} min). Last errors:"
    tail -n 8 "$LOGDIR/sweep.err.log" | cut -c1-240
    echo "Log: $LOGDIR/sweep.log"
  } | pnpm -s crm:post-mkan >/dev/null 2>&1
fi
exit 0
