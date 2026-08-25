#!/usr/bin/env bash
# Install the #mkan intake skill into the Hermes gateway on this Mac and wire the
# channel: every message in #mkan wakes Hermes (no @mention), the `home` skill is
# bound to the channel, and Hermes stays silent while the script answers.
#
#   bash scripts/crm/hermes/install-home-skill.sh          # copy skill + patch config
#   hermes gateway restart                                  # then apply
#
# The skill is canonical HERE (the repo); ~/.hermes is a deploy target. Re-run after
# editing SKILL.md. Docs: kun.databayt.org/docs/home.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HERMES="${HERMES_HOME:-$HOME/.hermes}"
CHANNEL="${SLACK_HOME_CHANNEL:-C0BS2NZE2AY}"
mkdir -p "$HERMES/skills/databayt/home"
cp "$HERE/home/SKILL.md" "$HERMES/skills/databayt/home/SKILL.md"
echo "skill → $HERMES/skills/databayt/home/SKILL.md"

CFG="$HERMES/config.yaml"
if grep -q "^slack:" "$CFG"; then
  echo "config.yaml already has a top-level slack: block — check it carries these keys:"
else
  cp "$CFG" "$CFG.bak.$(date +%Y%m%d_%H%M%S)"
  cat >> "$CFG" <<YAML

# ── Slack channel wiring for the mkan intake desk (installed by mkan/scripts/crm/hermes) ──
slack:
  free_response_channels:
    - "$CHANNEL"        # private #mkan — every message wakes the bot, no @mention
  channel_skill_bindings:
    - id: "$CHANNEL"
      skill: home
  channel_prompts:
    "$CHANNEL": |
      This is the mkan intake desk. A script handles every message here: run the sweep
      from the home skill and answer [SILENT]. Never reply in your own words.
YAML
  echo "config.yaml patched (backup kept)"
fi
cat <<TXT
  slack.free_response_channels:  ["$CHANNEL"]
  slack.channel_skill_bindings:  [{ id: "$CHANNEL", skill: home }]
  slack.channel_prompts:         { "$CHANNEL": … }
Now: hermes gateway restart   (bindings load at session start — run /new in the channel if a session is open)
TXT
