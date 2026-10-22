#!/usr/bin/env bash
# The rental agent's daily demand tick, run by the Hermes gateway's cron (no agent, no model):
# match open tenant requests against the day's new homes, alert opted-in tenants, post the digest.
# Install (09:00 Kigali, after the 06:00–06:45 scrapes):
#   cp scripts/crm/hermes/demand-match.sh ~/.hermes/scripts/mkan-demand-match.sh
#   hermes cron create "0 9 * * *" --name mkan-demand-match --script mkan-demand-match.sh --no-agent
# Prints only on failure (Hermes posts stdout); the digest itself goes to #mkan via --notify.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/demand"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
cd "$REPO" || { echo "⚠️ demand match failed — no repo at $REPO"; exit 0; }
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron ──" >>"$LOGDIR/match.log"
# Facebook (06:30) and web (06:45) homes reach the lead pool here; TikTok's 06:00 run mirrors its own.
PRISMA_QUIET=1 pnpm -s crm:tiktok-mirror --apply >>"$LOGDIR/match.log" 2>&1
# Brokers from Abdout's own WhatsApp chats (reviewed ones only), then into the directory.
pnpm -s wa:chats >>"$LOGDIR/match.log" 2>&1 && PRISMA_QUIET=1 pnpm -s crm:brokers --apply >>"$LOGDIR/match.log" 2>&1
pnpm -s crm:demand-match --notify >>"$LOGDIR/match.log" 2>&1
code=$?
if [ "$code" -ne 0 ]; then
  echo "⚠️ demand match failed (exit $code). Last lines:"
  tail -n 8 "$LOGDIR/match.log" | cut -c1-240
fi
exit 0
