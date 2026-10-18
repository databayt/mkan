#!/bin/bash
# The board's daily check-up: crm:hygiene at 07:00, after the 06:00 TikTok
# sweep, with the safe fixes applied and one report posted to #mkan.
#
# What "safe" means is in scripts/crm/hygiene-pure.ts — marks, never deletes;
# copies from the site, never decisions. Mondays add the TikTok stale check.
#
#   bash scripts/crm/install-hygiene-cron.sh            # install (does not run now)
#   bash scripts/crm/install-hygiene-cron.sh --remove   # stop + remove
# Log: ~/Library/Logs/mkan-crm-hygiene.log
set -euo pipefail
LABEL="com.databayt.mkan-crm-hygiene"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/mkan-crm-hygiene.log"
if [ "${1:-}" = "--remove" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL"
  exit 0
fi
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/caffeinate</string><string>-i</string>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd $HOME/mkan &amp;&amp; TWENTY_API_URL=http://localhost:3100 pnpm -s crm:hygiene --apply --notify</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
XML
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed: $LABEL (daily 07:00 → $LOG)"
