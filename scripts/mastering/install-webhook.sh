#!/bin/bash
# Install box 2 — the Twenty trigger.
#
#   1. a launchd agent that keeps the listener alive on :8646
#   2. a Twenty webhook on attachment.created pointing at host.docker.internal
#
# Idempotent: re-run after edits. It reuses the existing secret and webhook
# record rather than minting duplicates, so running it twice is safe.
#
# Why host.docker.internal: Twenty runs in Docker on this Mac (twenty-server-1),
# and from inside that container the Mac is host.docker.internal — verified to
# resolve to 192.168.5.2. localhost inside the container is the container.
#
# Log: ~/Library/Logs/mkan-mastering-webhook.log
set -euo pipefail

LABEL="com.databayt.mkan-mastering-webhook"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/mkan-mastering-webhook.log"
REPO="$HOME/mkan"
PORT="${MASTERING_WEBHOOK_PORT:-8646}"
TARGET="http://host.docker.internal:$PORT/"
API="${TWENTY_API_URL:-http://localhost:3100}"

cd "$REPO"

# ── secret ────────────────────────────────────────────────────────────────────
# Generated once and kept in .env, because both sides must agree on it: the
# listener verifies with it, Twenty signs with it.
if ! grep -q '^MASTERING_WEBHOOK_SECRET=' .env 2>/dev/null; then
  SECRET="$(openssl rand -base64 32)"
  printf '\n# Box 2 — Twenty attachment.created → local mastering listener\nMASTERING_WEBHOOK_SECRET=%s\n' "$SECRET" >> .env
  echo "minted MASTERING_WEBHOOK_SECRET into .env"
else
  SECRET="$(grep '^MASTERING_WEBHOOK_SECRET=' .env | head -1 | cut -d= -f2-)"
  echo "reusing MASTERING_WEBHOOK_SECRET from .env"
fi

KEY="${TWENTY_API_KEY:-$(security find-generic-password -s databayt-twenty -a mkan -w 2>/dev/null || true)}"
if [ -z "$KEY" ]; then
  echo "✗ no Twenty API key (env TWENTY_API_KEY or Keychain databayt-twenty/mkan)" >&2
  exit 1
fi

# ── 1. the listener ───────────────────────────────────────────────────────────
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd $REPO &amp;&amp; pnpm master:webhook</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
XML
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed: $LABEL (listening on :$PORT → $LOG)"

# ── 2. the Twenty webhook ─────────────────────────────────────────────────────
# attachment.created only. `.updated` would fire again on every rename and the
# pull would have nothing new to do; the cursor makes that harmless but noisy.
EXISTING="$(curl -s --max-time 20 "$API/rest/webhooks?limit=100" -H "Authorization: Bearer $KEY" \
  | python3 -c "import json,sys
try: rows=json.load(sys.stdin)
except Exception: rows=[]
rows = rows if isinstance(rows, list) else rows.get('data',{}).get('webhooks',[])
print(next((w['id'] for w in rows if w.get('targetUrl')=='$TARGET'), ''))" 2>/dev/null || true)"

BODY="$(python3 -c "import json;print(json.dumps({'targetUrl':'$TARGET','operations':['attachment.created'],'description':'mastering — photo dropped on a Home','secret':'''$SECRET'''}))")"

if [ -n "$EXISTING" ]; then
  curl -s --max-time 20 -X PATCH "$API/rest/webhooks/$EXISTING" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d "$BODY" >/dev/null
  echo "updated existing Twenty webhook $EXISTING → $TARGET"
else
  curl -s --max-time 20 -X POST "$API/rest/webhooks" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d "$BODY" >/dev/null
  echo "registered Twenty webhook → $TARGET (attachment.created)"
fi

echo
echo "test it: drop a photo on a Home in Twenty, then"
echo "  tail -f $LOG"
