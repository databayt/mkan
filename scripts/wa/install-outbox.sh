#!/usr/bin/env bash
# The Mac sender's timer: a launchd job that drains the WhatsApp outbox every two
# minutes (scripts/wa/outbox.ts). The drain itself enforces the quiet hours and caps,
# and holds a lock so a long run is never doubled.
#
#   bash scripts/wa/install-outbox.sh            # install + start
#   bash scripts/wa/install-outbox.sh --remove   # stop + remove
#   launchctl list | grep mkan-wa-outbox         # is it loaded
#
# Pattern: scripts/crm/install-home-sweep.sh. Logs under scripts/crm/.data/wa/.
# Install only after ops/evolution/up.sh is running and `pnpm wa:pair` shows open.
set -euo pipefail
LABEL="com.databayt.mkan-wa-outbox"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOGDIR="$REPO/scripts/crm/.data/wa"
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
    <string>$PNPM</string><string>-s</string><string>wa:outbox</string><string>--once</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$(dirname "$PNPM"):$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOGDIR/outbox.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/outbox.err.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL — every 120s, logs in $LOGDIR/outbox.log"
