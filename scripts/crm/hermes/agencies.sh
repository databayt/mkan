#!/usr/bin/env bash
# Kigali estate agencies from Google Maps → the broker directory, daily at 11:00, run by the
# Hermes gateway's cron (no agent, no model). Installed to ~/.hermes/scripts/mkan-agencies.sh by
# scripts/crm/install-ads-sweeps.sh agencies. 11:00 because the session-vault Chrome is shared:
# the 06:00/18:00 TikTok sweep and the 07:00 post / 13:00 retry uploads drive it too, and two
# lanes on one Chrome time out (the 11-05 18:00 sweep did). New agencies are merged into the
# directory (crm:brokers --apply) right after, so they are askable the same day.
#
# Each search phrase (term × neighbourhood, agencies-discover.ts QUERIES) is searched once a
# week; up to AGENCIES_LIMIT places are detailed a day (phone, website, WhatsApp). It drives the
# session-vault Chrome on :9222 read-only (Google Maps, no sign-in). Goal: 1,000 brokers and
# agencies in the directory (2026-11-05). Full output goes to .data/agencies/sweep.log.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/agencies"
LOCK="$LOGDIR/.sweep.lock"
LIMIT="${AGENCIES_LIMIT:-40}"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL

mkdir -p "$LOGDIR"
. "$REPO/scripts/crm/hermes/lane.sh"
LANE_JOB=hermes:mkan-agencies

if [ "${1:-}" != "--run" ]; then
  lane_tick "$LOCK" 'agencies\.sh' || exit 0
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ Agencies sweep could not start detached from the gateway"
  fi
  exit 0
fi

lane_own "$LOCK"
cd "$REPO" || exit 0
wait_ready 600 || { lane_end defer "$(lane_not_ready)"; exit 0; }
vault_ready || { lane_end fail "the session-vault Chrome (:9222) hangs every CDP attach, even after a restart"; echo "⚠️ The session-vault Chrome is stuck — restart it: launchctl kickstart -k gui/$(id -u)/com.databayt.chrome-session"; exit 0; }
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (detached) ──" >>"$LOGDIR/sweep.log"
/usr/bin/caffeinate -i pnpm -s crm:agencies --limit "$LIMIT" >>"$LOGDIR/sweep.log" 2>>"$LOGDIR/sweep.err.log"
code=$?
# Merge the new agencies into the directory the agent asks (the 09:00 demand-match run does it too).
[ "$code" -eq 0 ] && pnpm -s crm:brokers --apply >>"$LOGDIR/sweep.log" 2>>"$LOGDIR/sweep.err.log"
if [ "$code" -ne 0 ]; then
  lane_end fail "agencies exit $code: $(grep -v '^[[:space:]]*$' "$LOGDIR/sweep.err.log" | tail -n 1 | cut -c1-160)"
  echo "⚠️ Agencies sweep failed (exit $code) — tail .data/agencies/sweep.err.log"
else
  lane_end ok "$(grep -E 'place\(s\)|done' "$LOGDIR/sweep.log" | tail -n 1 | cut -c1-160)"
fi
exit 0
