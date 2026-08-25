#!/bin/bash
# Install the inbox relay as a launchd WatchPaths agent — the moment an image
# lands in ~/mkan/inbox, master:relay ingests it. Same deterministic-shell
# precedent as install-reconcile-cron.sh; no LLM in the loop. Idempotent;
# re-run after editing. Log: ~/Library/Logs/mkan-mastering-relay.log
#
# WatchPaths fires on ANY change in the directory, including the relay's own
# move into consumed/ — that re-run finds nothing waiting and exits, which is
# why the relay is a scan-and-exit script rather than a daemon.
set -euo pipefail
LABEL="com.databayt.mkan-mastering-relay"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/mkan-mastering-relay.log"
INBOX="${MASTERING_INBOX:-$HOME/mkan/inbox}"
# Watch ~/Downloads too when asked, so a render can be saved wherever the
# browser defaults to. Only files whose NAME proves a generator made them are
# ever considered there — see the reasoning in relay.ts.
WATCH_DOWNLOADS="$(grep -c '^MASTERING_WATCH_DOWNLOADS=1' "$HOME/mkan/.env" 2>/dev/null || echo 0)"
DOWNLOADS="${MASTERING_DOWNLOADS:-$HOME/Downloads}"
WATCHED="<string>$INBOX</string>"
if [ "$WATCH_DOWNLOADS" != "0" ]; then WATCHED="$WATCHED<string>$DOWNLOADS</string>"; fi
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs" "$INBOX"
cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd $HOME/mkan &amp;&amp; pnpm master:relay</string>
  </array>
  <key>WatchPaths</key><array>$WATCHED</array>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
XML
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed: $LABEL (watching $INBOX${WATCH_DOWNLOADS:+ + $DOWNLOADS} → $LOG)"
launchctl list | grep "$LABEL" || true
