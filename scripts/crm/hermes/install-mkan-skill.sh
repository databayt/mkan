#!/usr/bin/env bash
# Hermes learns mkan: copies the `mkan` skill into the gateway's skills.
#
#   bash scripts/crm/hermes/install-mkan-skill.sh
#
# The skill is canonical HERE (the repo); ~/.hermes is a deploy target. It teaches the
# gateway's free model the /find chat, the WhatsApp line, the CRM and the TikTok page,
# and gives it one read-only command (pnpm mkan:read). Deeper work goes to Claude Code
# through the kun bridge (kun/scripts/hermes). New sessions pick it up: /new in the DM.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="${HERMES_HOME:-$HOME/.hermes}/skills/databayt/mkan"
mkdir -p "$DEST"
cp "$HERE/mkan/SKILL.md" "$DEST/SKILL.md"
echo "skill → $DEST/SKILL.md"
