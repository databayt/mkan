#!/usr/bin/env bash
# The tenant inbox: a launchd job that keeps scripts/wa/inbox-server.ts running
# (127.0.0.1:8091), so a tenant's WhatsApp gets the rental agent within seconds.
# Evolution posts each message to it; `pnpm wa:pair --webhook-only` sets that up.
#
#   bash scripts/wa/install-inbox.sh            # install + start
#   bash scripts/wa/install-inbox.sh --remove   # stop + remove
#   curl -s 127.0.0.1:8091/health               # is it up
#
# Separate from install-outbox.sh so re-installing one never rewrites the other's plist.
set -euo pipefail
LABEL="com.databayt.mkan-wa-inbox"
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
    <string>$PNPM</string><string>-s</string><string>wa:inbox</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$(dirname "$PNPM"):$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOGDIR/inbox.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/inbox.err.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL — kept alive, logs in $LOGDIR/inbox.log"
