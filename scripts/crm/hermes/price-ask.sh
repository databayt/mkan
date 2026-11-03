#!/usr/bin/env bash
# The daily price ask (09:30, after demand-match), run by the Hermes gateway's cron (no agent,
# no model): crm:price-ask posts one #mkan list of the CRM homes that came in with no rent, each
# with a prefilled WhatsApp ask a person sends, and the command that records the answer. Nothing
# reaches a broker by itself. Why (2026-11-03): 40 of the 55 homes kept out of /find had no price.
#
#   install -S -m 755 scripts/crm/hermes/price-ask.sh ~/.hermes/scripts/mkan-price-ask.sh   # never cp
#   hermes cron create "30 9 * * *" --name mkan-price-ask --script mkan-price-ask.sh --no-agent
#
# Two halves like the other lanes: the tick takes the lock and starts the run detached; the run
# waits until the Mac is awake and online, then posts the list.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/price-ask"
LOCK="$LOGDIR/.ask.lock"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
. "$REPO/scripts/crm/hermes/lane.sh"
LANE_JOB=hermes:mkan-price-ask

if [ "${1:-}" != "--run" ]; then
  lane_tick "$LOCK" 'price-ask\.sh' || exit 0
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ price ask could not start detached from the gateway"
  fi
  exit 0
fi

# ── the run, outside the gateway ────────────────────────────────────────────
lane_own "$LOCK"
cd "$REPO" || exit 0
wait_ready 600 || { lane_end defer "$(lane_not_ready)"; exit 0; }
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (detached) ──" >>"$LOGDIR/ask.log"
if pnpm -s crm:price-ask --apply >>"$LOGDIR/ask.log" 2>&1; then
  lane_end ok
else
  lane_end fail "crm:price-ask failed: $(tail -n 1 "$LOGDIR/ask.log" | cut -c1-160)"
  { echo "⚠️ price ask failed. Last lines:"; tail -n 4 "$LOGDIR/ask.log" | cut -c1-240; } | lane_alert
fi
exit 0
