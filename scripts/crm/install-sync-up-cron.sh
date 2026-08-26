#!/bin/bash
# The trigger: the site's new homes and hosts reach the board on their own.
#
# A host can sign up on mkan.sd, add a home and upload photos without anyone
# running a script for them — and until this ran on a schedule, nothing on the
# board would ever know. Hourly, because "some time today" is the honest
# resolution for an operator picking up new inventory, and the sync is cheap:
# it reads, diffs, and writes only what differs.
#
# Deterministic shell, no LLM in the loop — the reconcile-clock precedent.
# Idempotent; re-run after editing.
# Log: ~/Library/Logs/mkan-crm-sync-up.log
set -euo pipefail
LABEL="com.databayt.mkan-crm-sync-up"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/mkan-crm-sync-up.log"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd $HOME/mkan &amp;&amp; pnpm crm:sync-up --apply</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
XML
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed: $LABEL (hourly → $LOG)"
launchctl list | grep "$LABEL" || true
