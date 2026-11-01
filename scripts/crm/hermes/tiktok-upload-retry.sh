#!/usr/bin/env bash
# The TikTok page's second chance, run by the Hermes gateway's cron at 13:00 (no agent,
# no model): posts whatever the 07:00 tick rendered but could not upload — the vault
# Chrome was down, TikTok was slow, the Mac was asleep. tt:upload skips anything in the
# day's uploads.json, so a day that already went out does nothing here.
# Installed to ~/.hermes/scripts/mkan-tiktok-upload-retry.sh by scripts/crm/install-tiktok-post.sh.
#
# Same two halves as the 07:00 post (2026-11-01): the tick takes the post lock, so the two
# never upload at once, and starts the run detached from the gateway. tt:upload --notify
# posts its own summary when it posts something; the run posts its failure to #mkan itself.
# The tick prints only when it cannot start. Logs: .data/tiktok-post/post.log.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/tiktok-post"
LOCK="$LOGDIR/.post.lock"
MAX_MINUTES="${TIKTOK_RETRY_MAX_MINUTES:-60}"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"

if [ "${1:-}" != "--run" ]; then
  if ! mkdir "$LOCK" 2>/dev/null; then
    if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then
      rm -rf "$LOCK" && mkdir "$LOCK"
    else
      echo "⚠️ TikTok retry (13:00) skipped — the 07:00 run still holds $LOCK"
      exit 0
    fi
  fi
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ TikTok retry (13:00) could not start detached from the gateway"
  fi
  exit 0
fi

# ── the run, outside the gateway ────────────────────────────────────────────
trap 'rm -rf "$LOCK"' EXIT
cd "$REPO" || exit 0
started=$(date +%s)
echo "── $(date '+%Y-%m-%d %H:%M:%S') hermes cron (13:00 retry, detached) ──" >>"$LOGDIR/post.log"

launchctl kickstart "gui/$(id -u)/com.databayt.chrome-session" >/dev/null 2>&1 || true
set -m
/usr/bin/caffeinate -i pnpm -s tt:upload --notify >>"$LOGDIR/post.log" 2>>"$LOGDIR/post.err.log" &
pid=$!
( sleep $((MAX_MINUTES * 60)); kill -TERM -- "-$pid" 2>/dev/null && echo "  ! stopped after ${MAX_MINUTES} min" >>"$LOGDIR/post.log" ) &
watchdog=$!
wait "$pid"
code=$?
kill -- "-$watchdog" 2>/dev/null
mins=$(( ($(date +%s) - started) / 60 ))

if [ "$code" -ne 0 ]; then
  {
    echo "⚠️ TikTok retry (13:00) still could not post (exit $code after ${mins} min). Last errors:"
    tail -n 8 "$LOGDIR/post.err.log" | cut -c1-240
    echo "Log: $LOGDIR/post.log"
  } | pnpm -s crm:post-mkan >/dev/null 2>&1
fi
exit 0
