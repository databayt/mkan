#!/usr/bin/env bash
# The second ear: a launchd timer that runs the #mkan intake sweep every two minutes,
# so a home typed into Slack is caught even when the Hermes gateway is down or asleep.
#
#   bash scripts/crm/install-home-sweep.sh            # install + start
#   bash scripts/crm/install-home-sweep.sh --remove   # stop + remove
#   launchctl list | grep mkan-home-sweep             # is it loaded
#
# Pattern: scripts/mastering/install-reconcile-cron.sh. Logs under scripts/crm/.data/home-intake/.
set -euo pipefail
LABEL="com.databayt.mkan-home-sweep"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOGDIR="$REPO/scripts/crm/.data/home-intake"
PNPM="$(command -v pnpm)"
if [ "${1:-}" = "--remove" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL"
  exit 0
fi
mkdir -p "$LOGDIR"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$PNPM</string><string>-s</string><string>home:sweep</string><string>--apply</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$(dirname "$PNPM"):$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
    <key>FORCE_SEED</key><string>1</string>
  </dict>
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOGDIR/sweep.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/sweep.err.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL — every 120s, logs in $LOGDIR/sweep.log"
