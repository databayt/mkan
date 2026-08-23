#!/bin/bash
# Install the Twenty→mastering pull as a launchd job (every 5 minutes).
# Idempotent; re-run after edits. Log: ~/Library/Logs/mkan-mastering-pull.log
# "Right away" tradeoff, on record: polling means 0-5 min from the Twenty
# upload to the queued run. True-instant would be a Twenty Workflow → local
# HTTP listener (the Hermes :8644 pattern) — more moving parts for ~4 minutes
# on a step whose human half takes hours. Polling wins until that math changes.
set -euo pipefail
LABEL="com.databayt.mkan-mastering-pull"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/mkan-mastering-pull.log"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd $HOME/mkan &amp;&amp; pnpm master:pull --apply</string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
XML
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed: $LABEL (every 5 min → $LOG)"
