#!/usr/bin/env bash
# mkan's Kigali TikTok page, daily at 07:00 (after the 06:00 broker sweep):
# pick today's homes → render the 9:16 videos → upload each with its caption to
# #mkan, where the poster saves it to the phone and posts it to @mkan.kigali.
#
#   bash scripts/crm/install-tiktok-post.sh            # install (does not run now)
#   bash scripts/crm/install-tiktok-post.sh --remove   # stop + remove
#   launchctl list | grep mkan-tiktok-post             # is it loaded
#
# TIKTOK_POSTS_PER_DAY sets how many (default 3). MKAN_KIGALI_WHATSAPP comes from
# the central .env (dotenv in the script). Pattern: install-tiktok-sweep.sh.
# Logs under .data/tiktok-post/.
set -euo pipefail
LABEL="com.databayt.mkan-tiktok-post"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOGDIR="$REPO/scripts/crm/.data/tiktok-post"
PNPM="$(command -v pnpm)"
PER_DAY="${TIKTOK_POSTS_PER_DAY:-3}"
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
    <string>$PNPM</string><string>-s</string><string>tt:run</string><string>--notify</string><string>--n=$PER_DAY</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$(dirname "$PNPM"):$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOGDIR/post.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/post.err.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL — daily 07:00, $PER_DAY videos, logs in $LOGDIR/post.log"
