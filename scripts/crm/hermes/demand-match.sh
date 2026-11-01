#!/usr/bin/env bash
# The rental agent's daily demand tick, run by the Hermes gateway's cron (no agent, no model):
# mirror the day's homes into /find, rebuild the broker directory, match open tenant requests
# against the day's new homes, alert opted-in tenants, post the digest.
# Install (09:00 Kigali, after the 06:00–06:45 scrapes):
#   cp scripts/crm/hermes/demand-match.sh ~/.hermes/scripts/mkan-demand-match.sh
#   hermes cron create "0 9 * * *" --name mkan-demand-match --script mkan-demand-match.sh --no-agent
#
# The tick starts the run detached from the gateway (detached.sh) and returns: a gateway restart
# killed the 11-01 run at 09:09. The run (`--run`) posts its own failure to #mkan; the digest
# goes there via --notify. Hermes delivers the tick's stdout, so it prints only when it cannot start.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/demand"
LOCK="$LOGDIR/.match.lock"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"

if [ "${1:-}" != "--run" ]; then
  if ! mkdir "$LOCK" 2>/dev/null; then
    if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
      rm -rf "$LOCK" && mkdir "$LOCK"
    else
      echo "⚠️ demand match skipped — the previous run still holds $LOCK"
      exit 0
    fi
  fi
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ demand match could not start detached from the gateway"
  fi
  exit 0
fi

# ── the run, outside the gateway ────────────────────────────────────────────
trap 'rm -rf "$LOCK"' EXIT
cd "$REPO" || exit 0
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (detached) ──" >>"$LOGDIR/match.log"
# Facebook (06:30) and web (06:45) homes reach the lead pool here; TikTok's 06:00 run mirrors its own.
PRISMA_QUIET=1 pnpm -s crm:tiktok-mirror --apply >>"$LOGDIR/match.log" 2>&1
# Brokers from Abdout's own WhatsApp chats (reviewed ones only), then into the directory.
pnpm -s wa:chats >>"$LOGDIR/match.log" 2>&1 && PRISMA_QUIET=1 pnpm -s crm:brokers --apply >>"$LOGDIR/match.log" 2>&1
pnpm -s crm:demand-match --notify >>"$LOGDIR/match.log" 2>&1
code=$?
if [ "$code" -ne 0 ]; then
  {
    echo "⚠️ demand match failed (exit $code). Last lines:"
    tail -n 8 "$LOGDIR/match.log" | cut -c1-240
  } | pnpm -s crm:post-mkan >/dev/null 2>&1
fi
exit 0
