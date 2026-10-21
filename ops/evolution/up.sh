#!/usr/bin/env bash
# Start (or stop) mkan's Evolution API with its secrets read from the Keychain.
#
#   bash ops/evolution/up.sh          # docker compose up -d
#   bash ops/evolution/up.sh down     # docker compose down (volumes kept — the pairing survives)
#   bash ops/evolution/up.sh logs -f  # any other compose subcommand passes through
#
# Keychain items (service names, no account needed to read):
#   mkan-EVOLUTION_API_KEY      required — create it once:
#       security add-generic-password -s mkan-EVOLUTION_API_KEY -a mkan -w "$(openssl rand -hex 24)"
#   mkan-EVOLUTION_DB_PASSWORD  created here on first run (random); Postgres is internal-only
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

kc() { security find-generic-password -s "$1" -w 2>/dev/null || true; }

EVOLUTION_API_KEY="$(kc mkan-EVOLUTION_API_KEY)"
if [ -z "$EVOLUTION_API_KEY" ]; then
  echo "✗ Keychain item mkan-EVOLUTION_API_KEY is missing. Create it once:" >&2
  echo '    security add-generic-password -s mkan-EVOLUTION_API_KEY -a mkan -w "$(openssl rand -hex 24)"' >&2
  exit 1
fi

EVOLUTION_DB_PASSWORD="$(kc mkan-EVOLUTION_DB_PASSWORD)"
if [ -z "$EVOLUTION_DB_PASSWORD" ]; then
  EVOLUTION_DB_PASSWORD="$(openssl rand -hex 24)"
  security add-generic-password -s mkan-EVOLUTION_DB_PASSWORD -a mkan -w "$EVOLUTION_DB_PASSWORD"
  echo "· created Keychain item mkan-EVOLUTION_DB_PASSWORD"
fi

export EVOLUTION_API_KEY EVOLUTION_DB_PASSWORD
if [ $# -eq 0 ]; then set -- up -d; fi
exec docker compose -f "$HERE/docker-compose.yml" "$@"
