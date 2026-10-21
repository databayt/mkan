#!/usr/bin/env bash
# The two daily ad lanes after TikTok's 06:00 sweep, as Hermes gateway crons (no agent, no model):
#   mkan-fb-sweep   06:30  Facebook groups + Marketplace seeds → Twenty  (scripts/crm/hermes/fb-sweep.sh)
#   mkan-web-sweep  06:45  Rwandan property sites → Twenty              (scripts/crm/hermes/web-sweep.sh)
#
#   bash scripts/crm/install-ads-sweeps.sh fb            # install / refresh one job
#   bash scripts/crm/install-ads-sweeps.sh web
#   bash scripts/crm/install-ads-sweeps.sh all
#   bash scripts/crm/install-ads-sweeps.sh fb --remove   # remove it
#   hermes cron list | grep -A8 mkan-                    # next run, last result
#
# A clone of install-tiktok-sweep.sh's Hermes path (no launchd fallback, no chat
# command). Each job body is copied to ~/.hermes/scripts/ (Hermes only runs scripts
# from there); silent on success — the lane posts its own counts to #mkan — and a
# short alert there on failure. Staggered after TikTok so the three never share
# the reader quota at once.
#
# Before installing fb: the scrape Chrome must be up and logged in as the scrape
# account (bash ~/.claude/bin/chrome-scrape.sh), and the seeds promoted from
# scripts/crm/fb-seeds.proposed.json. Before the first web --apply: WEB in Twenty's
# `source` select (pnpm crm:sync-options --apply once twenty-schema.ts declares it).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
MKAN_CHANNEL="C0BS2NZE2AY" # private #mkan
WHICH="${1:-}"
ACTION="${2:-}"

job_ids() {
  hermes cron list 2>/dev/null | awk -v n="$1" '/^  [0-9a-f]{12} \[/{id=$1} $1=="Name:" && $2==n {print id}'
}

install_one() { # <name> <body script> <schedule>
  local name="$1" body="$2" schedule="$3"
  local target="$HERMES_HOME/scripts/$name.sh"
  for id in $(job_ids "$name"); do hermes cron remove "$id" >/dev/null && echo "removed Hermes job $id ($name)"; done
  if [ "$ACTION" = "--remove" ]; then
    rm -f "$target"
    return
  fi
  mkdir -p "$HERMES_HOME/scripts"
  sed -e "s|\${MKAN_REPO:-/Users/abdout/mkan}|\${MKAN_REPO:-$REPO}|" "$REPO/scripts/crm/hermes/$body" >"$target"
  chmod +x "$target"
  hermes cron create "$schedule" --name "$name" --script "$name.sh" --no-agent --deliver "slack:$MKAN_CHANNEL" >/dev/null
  echo "installed Hermes job $name — '$schedule', alerts to #mkan"
}

command -v hermes >/dev/null || { echo "hermes not installed"; exit 1; }
case "$WHICH" in
fb) install_one mkan-fb-sweep fb-sweep.sh "${FB_SCHEDULE:-30 6 * * *}" ;;
web) install_one mkan-web-sweep web-sweep.sh "${WEB_SCHEDULE:-45 6 * * *}" ;;
all)
  install_one mkan-fb-sweep fb-sweep.sh "${FB_SCHEDULE:-30 6 * * *}"
  install_one mkan-web-sweep web-sweep.sh "${WEB_SCHEDULE:-45 6 * * *}"
  ;;
*)
  sed -n '2,21p' "$0"
  exit 1
  ;;
esac
hermes gateway restart >/dev/null 2>&1 || launchctl kickstart -k "gui/$(id -u)/ai.hermes.gateway" || true
hermes cron status 2>&1 | head -3
