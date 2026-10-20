#!/usr/bin/env bash
# The TikTok lane's daily tick: discover → fetch → read → upsert → posts → /find mirror,
# once a day at 06:00, posting the day's counts to #mkan.
#
# Since 2026-10-20 the scheduler is the Hermes gateway's cron (no agent, no model):
#   bash scripts/crm/install-tiktok-sweep.sh            # install / refresh the Hermes job
#   bash scripts/crm/install-tiktok-sweep.sh --remove   # remove the Hermes job
#   bash scripts/crm/install-tiktok-sweep.sh --launchd  # fallback: back to the launchd job
#   hermes cron list | grep -A8 mkan-tiktok-sweep       # next run, last result
#   /tiktok (Slack DM or WhatsApp self-chat)            # run it now
#
# Only one scheduler may own the sweep: two runs race on the ledger and the Groq quota,
# so each mode switches the other off. The job body is scripts/crm/hermes/tiktok-sweep.sh,
# copied to ~/.hermes/scripts/ (Hermes only runs scripts from there). Silent on success,
# a short alert in #mkan on failure. Hermes catches a daily job up to 2 h late after sleep.
#
# --fetch-limit / --read-limit cap each stage per day. The reader is Groq's free
# vision tier (~45 s apart to stay under its token minute), so 80 reads ≈ an hour;
# the Hermes script timeout is raised to 2 h for it. Logs under .data/tiktok/.
set -euo pipefail
NAME="mkan-tiktok-sweep"
LABEL="com.databayt.$NAME"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOGDIR="$REPO/scripts/crm/.data/tiktok"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
HERMES_SCRIPT="$HERMES_HOME/scripts/$NAME.sh"
CONFIG="$HERMES_HOME/config.yaml"
MKAN_CHANNEL="C0BS2NZE2AY" # private #mkan
SCHEDULE="${TIKTOK_SCHEDULE:-0 6 * * *}"
PNPM="$(command -v pnpm)"
LIMIT="${TIKTOK_DAILY_LIMIT:-40}"
READ_LIMIT="${TIKTOK_READ_LIMIT:-80}"

hermes_job_ids() {
  hermes cron list 2>/dev/null | awk -v n="$NAME" '/^  [0-9a-f]{12} \[/{id=$1} $1=="Name:" && $2==n {print id}'
}
remove_hermes_job() {
  for id in $(hermes_job_ids); do hermes cron remove "$id" >/dev/null && echo "removed Hermes job $id"; done
}
retire_launchd() {
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  if [ -f "$PLIST" ]; then
    mkdir -p "$HOME/Library/LaunchAgents/disabled"
    mv "$PLIST" "$HOME/Library/LaunchAgents/disabled/$LABEL.plist"
    echo "launchd $LABEL off (plist kept in LaunchAgents/disabled/)"
  fi
}

case "${1:-}" in
--remove)
  remove_hermes_job
  rm -f "$HERMES_SCRIPT"
  exit 0
  ;;
--launchd)
  remove_hermes_job
  mkdir -p "$LOGDIR"
  cat >"$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/caffeinate</string><string>-i</string>
    <string>$PNPM</string><string>-s</string><string>crm:tiktok</string><string>--apply</string><string>--notify</string><string>--fetch-limit=$LIMIT</string><string>--read-limit=$READ_LIMIT</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$(dirname "$PNPM"):$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOGDIR/sweep.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/sweep.err.log</string>
</dict></plist>
PL
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "installed launchd $LABEL — daily 06:00, fetch $LIMIT / read $READ_LIMIT, logs in $LOGDIR/sweep.log"
  exit 0
  ;;
esac

command -v hermes >/dev/null || { echo "hermes not installed — use --launchd"; exit 1; }
mkdir -p "$HERMES_HOME/scripts" "$LOGDIR"
sed -e "s|\${MKAN_REPO:-/Users/abdout/mkan}|\${MKAN_REPO:-$REPO}|" \
  -e "s|\${TIKTOK_DAILY_LIMIT:-40}|\${TIKTOK_DAILY_LIMIT:-$LIMIT}|" \
  -e "s|\${TIKTOK_READ_LIMIT:-80}|\${TIKTOK_READ_LIMIT:-$READ_LIMIT}|" \
  "$REPO/scripts/crm/hermes/tiktok-sweep.sh" >"$HERMES_SCRIPT"
chmod +x "$HERMES_SCRIPT"

# The default 1 h script timeout is shorter than a full read day.
if ! grep -q '^cron:' "$CONFIG"; then
  cp "$CONFIG" "$CONFIG.bak.$(date +%Y%m%d)"
  printf '\ncron:\n  script_timeout_seconds: 7200   # mkan-tiktok-sweep reads for ~1 h\n' >>"$CONFIG"
elif ! grep -q 'script_timeout_seconds' "$CONFIG"; then
  echo "! $CONFIG has a cron: block — add script_timeout_seconds: 7200 under it by hand"
fi

remove_hermes_job
hermes cron create "$SCHEDULE" --name "$NAME" --script "$NAME.sh" --no-agent \
  --deliver "slack:$MKAN_CHANNEL" >/dev/null
retire_launchd

# Chat commands (Slack DM to the bot or the WhatsApp self-chat), no model:
#   /tiktok      start the sweep now (detached), and reply with the ledger status
# Merged into quick_commands the way kun's scripts/seek/hermes-setup.sh does: other keys survive.
HERMES_BIN="$(command -v hermes)"
"$HERMES_HOME/hermes-agent/venv/bin/python" - "$CONFIG" "$REPO" "$HERMES_BIN" <<'PY'
import sys, yaml, shutil, datetime, os
cfg_path, repo, hermes = sys.argv[1:4]
cfg = yaml.safe_load(open(cfg_path)) or {}
path = "PATH=/opt/homebrew/bin:/usr/local/bin:$PATH"
run_id = f"$({hermes} cron list 2>/dev/null | awk '/^  [0-9a-f]{{12}} \\[/{{id=$1}} $2==\"mkan-tiktok-sweep\"{{print id}}')"
want = {
    # `hermes cron run` runs the whole job in its own process, so detach it: quick commands die at 30 s.
    "tiktok": f"(nohup {hermes} cron run {run_id} >/dev/null 2>&1 &) && echo 'TikTok sweep started — counts land in #mkan when it ends (~1 h).' && cd {repo} && {path} pnpm -s crm:tiktok-status",
}
qc = cfg.get("quick_commands") or {}
qc.pop("tiktokrun", None)  # folded into /tiktok on 2026-10-20
qc.update({k: {"type": "exec", "command": c} for k, c in want.items()})
block = yaml.safe_dump({"quick_commands": qc}, sort_keys=False, allow_unicode=True, width=1000)
out, skip = [], False
for line in open(cfg_path).read().split("\n"):
    if line.startswith("# jobs lane — managed by kun"):
        continue
    if line.startswith("quick_commands:"):
        skip = True
        continue
    if skip and (line.startswith(" ") or line == ""):
        continue
    skip = False
    out.append(line)
bak = f"{cfg_path}.bak-tiktok-{datetime.date.today()}"
if not os.path.exists(bak):
    shutil.copy(cfg_path, bak)
open(cfg_path, "w").write("\n".join(out).rstrip("\n") + "\n\n# jobs lane — managed by kun scripts/seek/hermes-setup.sh\n" + block)
assert (yaml.safe_load(open(cfg_path)) or {}).get("quick_commands", {}).keys() >= want.keys()
print("quick_commands:", ", ".join("/" + k for k in want))
PY
hermes gateway restart >/dev/null 2>&1 || launchctl kickstart -k "gui/$(id -u)/ai.hermes.gateway"
echo "installed Hermes job $NAME — '$SCHEDULE', fetch $LIMIT / read $READ_LIMIT, alerts to #mkan, logs in $LOGDIR/sweep.log"
hermes cron status 2>&1 | head -3
