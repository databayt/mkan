#!/usr/bin/env bash
# The TikTok lane's daily tick: discover → fetch → read → upsert, once a day at
# 06:00, posting a one-line count to #mkan when new Kigali homes land at VETTING.
#
#   bash scripts/crm/install-tiktok-sweep.sh            # install (does not run now)
#   bash scripts/crm/install-tiktok-sweep.sh --remove   # stop + remove
#   launchctl list | grep mkan-tiktok-sweep             # is it loaded
#
# --limit caps how many videos each stage takes per day (the reader is claude -p on
# the Max pool, ~20 s a video). Pattern: install-home-sweep.sh. Logs under .data/tiktok/.
set -euo pipefail
LABEL="com.databayt.mkan-tiktok-sweep"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOGDIR="$REPO/scripts/crm/.data/tiktok"
PNPM="$(command -v pnpm)"
LIMIT="${TIKTOK_DAILY_LIMIT:-40}"
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
    <string>/usr/bin/caffeinate</string><string>-i</string>
    <string>$PNPM</string><string>-s</string><string>crm:tiktok</string><string>--apply</string><string>--notify</string><string>--limit=$LIMIT</string>
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
echo "installed $LABEL — daily 06:00, --limit=$LIMIT, logs in $LOGDIR/sweep.log"
