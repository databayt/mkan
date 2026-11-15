#!/bin/bash
# The Airbnb listings' daily re-check: listings:refresh at 06:30 (before the 07:00
# hygiene run), --apply. Visits the oldest-checked 1/7 of the 4.6k homes (<= 700
# requests), refreshes rating/reviews, retires a home only after two misses.
# See scripts/crm/listings-refresh.ts. Needs vault Chrome (:9222) or a local Chrome.
#
#   bash scripts/crm/install-listings-refresh-cron.sh            # install (does not run now)
#   bash scripts/crm/install-listings-refresh-cron.sh --remove   # stop + remove
# Log: ~/Library/Logs/mkan-listings-refresh.log
set -euo pipefail
LABEL="com.databayt.mkan-listings-refresh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/mkan-listings-refresh.log"
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
    <string>cd $HOME/mkan &amp;&amp; pnpm -s listings:refresh --apply</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
XML
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed: $LABEL (daily 06:30 → $LOG)"
