#!/bin/bash
# The standing rule, on a timer: a photo that reached the CRM and has never
# been mastered joins the queue.
#
# Nobody decides that a photo looks bad first — the queue is cheap and
# idempotent, and the scarce thing is the human at the far end. This job only
# QUEUES; it never posts to Slack and never hands anything out. The drain rate
# is `master:next` and its in-flight cap, which is where the human's limit
# lives.
#
# Hourly, matching the site→board sync: a photo that arrives at 10:05 is queued
# by 11:00, and nothing queued is urgent by definition.
#
# Idempotent; re-run after editing. Log: ~/Library/Logs/mkan-master-sweep.log
set -euo pipefail
LABEL="com.databayt.mkan-master-sweep"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/mkan-master-sweep.log"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd $HOME/mkan &amp;&amp; pnpm master:queue --all --apply</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
XML
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed: $LABEL (hourly → $LOG)"
