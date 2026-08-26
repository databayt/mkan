#!/usr/bin/env bash
# Install the #mkan intake skill into the Hermes gateway on this Mac and wire the
# channel: every message in #mkan wakes Hermes (no @mention), the `home` skill is
# bound to the channel, and Hermes stays silent while the script answers.
#
#   bash scripts/crm/hermes/install-home-skill.sh          # copy skill + rewrite the wiring
#   hermes gateway restart                                  # then apply
#
# The skill and the channel prompt are canonical HERE (the repo); ~/.hermes is a deploy
# target. Re-run after editing either. Docs: kun.databayt.org/docs/home.
#
# The wiring block is delimited by MARKER below and rewritten in full every run, so the
# live config cannot drift from the repo. It used to only print a reminder and hope —
# which is how the channel prompt ended up a version behind the skill it points at.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HERMES="${HERMES_HOME:-$HOME/.hermes}"
CHANNEL="${SLACK_HOME_CHANNEL:-C0BS2NZE2AY}"
CFG="$HERMES/config.yaml"
MARKER="# ── Slack channel wiring for the mkan intake desk (installed by mkan/scripts/crm/hermes) ──"

mkdir -p "$HERMES/skills/databayt/home"
cp "$HERE/home/SKILL.md" "$HERMES/skills/databayt/home/SKILL.md"
echo "skill → $HERMES/skills/databayt/home/SKILL.md"

[ -f "$CFG" ] || { echo "no $CFG — run 'hermes gateway setup' first"; exit 1; }
cp "$CFG" "$CFG.bak.$(date +%Y%m%d_%H%M%S)"

# Everything before our marker is somebody else's config — keep it byte for byte.
python3 - "$CFG" "$MARKER" "$HERE/home/CHANNEL_PROMPT.txt" "$CHANNEL" <<'PY'
import sys
cfg, marker, prompt_file, channel = sys.argv[1:5]
body = open(cfg, encoding='utf-8').read()
head = body.split(marker)[0].rstrip('\n')
prompt = open(prompt_file, encoding='utf-8').read().rstrip('\n')
indented = '\n'.join(('      ' + line) if line.strip() else '' for line in prompt.split('\n'))
block = f'''{marker}
slack:
  free_response_channels:
    - "{channel}"        # private #mkan — every message wakes the bot, no @mention
  channel_skill_bindings:
    - id: "{channel}"
      skill: home
  channel_prompts:
    "{channel}": |
{indented}
'''
open(cfg, 'w', encoding='utf-8').write(head + '\n\n' + block)
print(f'config.yaml wiring rewritten for {channel} (backup kept)')
PY

python3 -c "import yaml,sys; d=yaml.safe_load(open('$CFG')); s=d.get('slack') or {}; assert '$CHANNEL' in (s.get('channel_prompts') or {}), 'channel prompt missing'; print('yaml parses · prompt', len((s['channel_prompts']['$CHANNEL'])), 'chars · bindings', s.get('channel_skill_bindings'))"

cat <<TXT
Now: hermes gateway restart   (bindings load at session start — run /new in the channel if a session is open)
TXT
