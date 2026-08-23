#!/bin/bash
# Install the mastering stall clock as a launchd daily job (10:00) — the
# weekly-digest precedent: deterministic shell, no LLM in the loop. Idempotent;
# re-run after editing. Log: ~/Library/Logs/mkan-mastering-reconcile.log
set -euo pipefail
LABEL="com.databayt.mkan-mastering-reconcile"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/mkan-mastering-reconcile.log"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd $HOME/mkan &amp;&amp; pnpm master:reconcile --apply</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
XML
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed: $LABEL (daily 10:00 → $LOG)"
launchctl list | grep "$LABEL" || true
