#!/usr/bin/env bash
# Guarded auto-deploy of mkan's main (Abdout, 2026-11-07: "the loop may deploy mkan itself, with guards").
# Run by the sprint loop between sessions (sprint-runner.sh) — deterministic code, never a model session.
#
#   bash scripts/crm/hermes/ship.sh            deploy origin/main when every guard passes
#   bash scripts/crm/hermes/ship.sh --dry      say what it would do, change nothing
#   bash scripts/crm/hermes/ship.sh --drill    Abdout's session: deploy now (no spacing, no held paths), roll
#                                               back to the last good image, then forward again — proves the way back
#
# Guards, in order (most are silent waits; the first that fails ends the run):
#   one deploy at a time · AC power · ≥ 9 GB free · Docker up
#   origin/main moved past what production serves (/api/health build, else the state file)
#   the range changes what the Worker serves (src/, public/) — scripts and docs alone never deploy
#   the range touches nothing that stays with Abdout: prisma/, cf/, wrangler.jsonc, Dockerfile*, the lockfile,
#     package.json, auth, the proxy, next.config, the guard and deploy scripts → held, #mkan told once
#   ≥ 3 h since the last deploy (wrangler's own list, so a manual deploy counts) · not a sha that failed in 12 h
# Then: build the exact sha (pinned export) → typecheck + tests + i18n in that build → the route table
# (/api/listings/published static, 5m) → smoke (the container prints Ready) → deploy → wait until /api/health
# reports the sha (≤ 12 min: wrangler returns when the rollout starts) → /en/find, /en/monetize and
# /api/monetize/live answer 200. A failure after the deploy re-pins the last good image (deploy-cloudflare.sh
# rollback: no build, no Docker). State: ~/.claude/state/mkan-deploy.json. Every outcome → #mkan.
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
SITE="${MKAN_SITE:-https://www.mkan.sd}"
STATE="$HOME/.claude/state/mkan-deploy.json"
LOCK="$HOME/.claude/state/locks/mkan-deploy.lock"
BUILD_DIR="$HOME/.cache/cf-build/mkan"
ENV_FILE="$HOME/.cache/cf-build/mkan-prod.env"
DATA="$REPO/scripts/crm/.data/sprint"
SPACING_H=3
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
# Under Hermes (launchd) the shell's token is not there: the Keychain's is (kun's run ledger uses the same).
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || CLOUDFLARE_API_TOKEN=$(/usr/bin/security find-generic-password -s cloudflare-api -w 2>/dev/null) && export CLOUDFLARE_API_TOKEN
MODE="${1:-run}"; MODE="${MODE#--}"
mkdir -p "$DATA" "$(dirname "$LOCK")" "$(dirname "$STATE")"
cd "$REPO" || exit 0

say() { echo "ship: $*"; }
post() { printf '%s\n' "$1" | pnpm -s crm:post-mkan >/dev/null 2>&1 || true; }
state() { /usr/bin/python3 -c "import json,sys;d=json.load(open('$STATE'));print(d.get('$1') or '')" 2>/dev/null; }
health_build() { curl -s --max-time 15 "$SITE/api/health?probe=live" | /usr/bin/python3 -c 'import json,sys;print((json.load(sys.stdin).get("build") or "").replace("-dirty",""))' 2>/dev/null; }

# ── preconditions ──────────────────────────────────────────────────────
mkdir "$LOCK" 2>/dev/null || { [ -n "$(find "$LOCK" -maxdepth 0 -mmin +90 2>/dev/null)" ] && rm -rf "$LOCK" && mkdir "$LOCK"; } || { say "another deploy holds the lock"; exit 0; }
trap 'rm -rf "$LOCK"' EXIT
pgrep -f "deploy-cloudflare.sh" >/dev/null && { say "a deploy is already running"; exit 0; }
# The loop never deploys before a drill has proven the way back (rollback, then forward) once.
DRILLED="$HOME/.claude/state/mkan-ship-drilled"
[ "$MODE" = drill ] || [ -f "$DRILLED" ] || { say "no drill has passed yet — the loop does not deploy (bash scripts/crm/hermes/ship.sh --drill, in a session)"; exit 0; }
# On power, or — for a drill someone is watching — a battery above 60%.
if ! pmset -g batt | head -1 | grep -q "AC Power"; then
  PCT=$(pmset -g batt | grep -oE '[0-9]+%' | head -1 | tr -d %)
  [ "$MODE" = drill ] && [ "${PCT:-0}" -ge 60 ] || { say "on battery — waits for power"; exit 0; }
fi
FREE_GB=$(df -g / | awk 'NR==2{print $4}')
[ "${FREE_GB:-0}" -ge 9 ] || { say "only ${FREE_GB} GB free (needs 9)"; [ ! -f "$DATA/.ship-disk-told" ] && post "🚚 Auto-deploy waits: the Mac has ${FREE_GB} GB free, it needs 9. Free some disk (docker builder prune, ~/.cache)." && touch "$DATA/.ship-disk-told"; exit 0; }
rm -f "$DATA/.ship-disk-told"
docker info >/dev/null 2>&1 || { say "Docker is not running"; exit 0; }

# ── what would ship ───────────────────────────────────────────────────
git fetch -q origin main || { say "git fetch failed"; exit 0; }
TARGET=$(git rev-parse --short=7 origin/main)
LIVE=$(health_build)
LAST=${LIVE:-$(state sha)}
[ -n "$LAST" ] || { say "don't know what production serves (no health build, no state) — Abdout deploys once"; exit 0; }
if [ "$TARGET" = "$LAST" ] && [ "$MODE" != drill ]; then say "production already serves $TARGET"; exit 0; fi
git merge-base --is-ancestor "$LAST" "$TARGET" 2>/dev/null || { say "$LAST is not behind $TARGET — a manual deploy from elsewhere? leaving it"; exit 0; }
CHANGED=$(git diff --name-only "$LAST" "$TARGET")
if [ "$MODE" != drill ]; then
  printf '%s\n' "$CHANGED" | grep -qE '^(src/|public/)' || { say "$LAST..$TARGET changes nothing the Worker serves"; exit 0; }
  HELD=$(printf '%s\n' "$CHANGED" | grep -E '^(prisma/|cf/|wrangler\.jsonc$|Dockerfile|pnpm-lock\.yaml$|package\.json$|auth(\.config)?\.ts$|src/lib/auth|src/proxy\.ts$|next\.config|scripts/unattended\.ts$|scripts/deploy-cloudflare\.sh$|scripts/cf-secrets\.sh$|scripts/crm/hermes/(ship|sprint-runner|lane|detached)\.sh$|scripts/sprint/act\.ts$|src/lib/monetize/(actions|provenance)\.ts$)' | head -6 | tr '\n' ' ')
  if [ -n "$HELD" ]; then
    say "held: $LAST..$TARGET touches $HELD"
    [ -f "$DATA/.ship-held-$TARGET" ] || { post "🚚 Deploy held for Abdout: $LAST..$TARGET touches ${HELD}— schema, Worker, auth or the loop's own guards. Say \"deploy mkan\" in a session."; touch "$DATA/.ship-held-$TARGET"; }
    exit 0
  fi
  LAST_AT=$(pnpm exec wrangler deployments list 2>/dev/null | grep -E '^Created:' | tail -1 | awk '{print $2}')
  if [ -n "$LAST_AT" ]; then
    AGE_H=$(/usr/bin/python3 -c "import datetime,sys;t=datetime.datetime.fromisoformat('$LAST_AT'.replace('Z','+00:00'));print(int((datetime.datetime.now(datetime.timezone.utc)-t).total_seconds()//3600))")
    [ "$AGE_H" -ge "$SPACING_H" ] || { say "last deploy ${AGE_H} h ago (spacing ${SPACING_H} h)"; exit 0; }
  fi
  [ -n "$(find "$DATA/.ship-failed-$TARGET" -mmin -720 2>/dev/null)" ] && { say "$TARGET failed in the last 12 h — waits for a new commit"; exit 0; }
fi
if [ "$MODE" = dry ]; then say "would deploy $LAST → $TARGET ($(printf '%s\n' "$CHANGED" | wc -l | tr -d ' ') files)"; exit 0; fi

SLOG="$DATA/ship-$(date +%Y%m%d-%H%M)-$TARGET.log"
fail() {  # fail <step> — before the deploy: nothing changed in production
  say "$TARGET held at $1 (log $(basename "$SLOG"))"
  touch "$DATA/.ship-failed-$TARGET"
  post "🚚 Auto-deploy of $TARGET stopped at $1 — production still serves $LAST. Log: scripts/crm/.data/sprint/$(basename "$SLOG")"
  exit 0
}
say "deploying $LAST → $TARGET (log $(basename "$SLOG"))"

# ── build, check, smoke ────────────────────────────────────────────────
CF_SOURCE="$TARGET" CF_BUILD_DIR="$BUILD_DIR" bash scripts/deploy-cloudflare.sh "$ENV_FILE" build >>"$SLOG" 2>&1 || fail "the build"
grep -q "==> done (build)" "$SLOG" || fail "the build"
grep -qE "○ /api/listings/published .*5m" "$SLOG" || fail "the route table (/api/listings/published moved — a Neon timeout during prerender?)"
# The checks run on the exact build, with the database URL taken away: no test ever reaches production.
(
  cd "$BUILD_DIR" && mv .env .env.ship-hold 2>/dev/null
  DATABASE_URL=postgresql://ship:ship@127.0.0.1:9/ship DIRECT_URL=postgresql://ship:ship@127.0.0.1:9/ship pnpm exec tsc --noEmit &&
    DATABASE_URL=postgresql://ship:ship@127.0.0.1:9/ship DIRECT_URL=postgresql://ship:ship@127.0.0.1:9/ship pnpm exec vitest run --reporter=dot &&
    pnpm -s i18n:check
  rc=$?; mv .env.ship-hold .env 2>/dev/null; exit $rc
) >>"$SLOG" 2>&1 || fail "the checks (typecheck, tests or i18n)"
CF_BUILD_DIR="$BUILD_DIR" bash scripts/deploy-cloudflare.sh "$ENV_FILE" smoke >>"$SLOG" 2>&1 || fail "the smoke (the container never printed Ready)"

# ── deploy, verify, roll back ──────────────────────────────────────────
LAST_IMAGE=$(state image)
CF_BUILD_DIR="$BUILD_DIR" bash scripts/deploy-cloudflare.sh "$ENV_FILE" deploy >>"$SLOG" 2>&1
VERSION=$(grep -E "Current Version ID:" "$SLOG" | tail -1 | awk '{print $4}')
IMAGE=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E "^registry\.cloudflare\.com/.*/mkan-mkancontainer:${VERSION:0:8}$" | head -1)

verify() {  # verify <sha> → 0 when production serves it and the three pages answer
  local want=$1 b="" i
  for i in $(seq 1 48); do b=$(health_build); [ "$b" = "$want" ] && break; sleep 15; done
  [ "$b" = "$want" ] || { echo "health still reports '${b}', not $want" >>"$SLOG"; return 1; }
  for p in /en/find /en/monetize /api/monetize/live; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$SITE$p")
    echo "verify $p $code" >>"$SLOG"
    [ "$code" = 200 ] || return 1
  done
}

if [ -n "$VERSION" ] && verify "$TARGET"; then
  /usr/bin/python3 -c "import json,datetime;json.dump({'sha':'$TARGET','version':'$VERSION','image':'$IMAGE','at':datetime.datetime.now(datetime.timezone.utc).isoformat()},open('$STATE','w'))"
  rm -f "$DATA/.ship-failed-$TARGET"
  say "✓ $TARGET live (Worker ${VERSION:0:8})"
  if [ "$MODE" = drill ] && [ -n "$LAST_IMAGE" ]; then
    # The way back, proven: re-pin the previous image, check it serves, then forward again.
    say "drill: rolling back to $LAST_IMAGE"
    CF_BUILD_DIR="$BUILD_DIR" bash scripts/deploy-cloudflare.sh "$ENV_FILE" rollback "$LAST_IMAGE" >>"$SLOG" 2>&1
    for i in $(seq 1 48); do b=$(health_build); [ "$b" != "$TARGET" ] && break; sleep 15; done
    say "drill: after the rollback production reports build '${b:-none}' (the previous image) — rolling forward"
    CF_BUILD_DIR="$BUILD_DIR" bash scripts/deploy-cloudflare.sh "$ENV_FILE" rollback "$IMAGE" >>"$SLOG" 2>&1
    if verify "$TARGET"; then say "drill: ✓ forward again on $TARGET"; date -u +%FT%TZ > "$DRILLED"; else say "drill: ✗ forward again did not verify — see $SLOG"; fi
  fi
  post "🚀 mkan deployed by the loop: $LAST → $TARGET (Worker ${VERSION:0:8}). Checked: tests, smoke, health reports the new build, /en/find, /en/monetize, /api/monetize/live."
  exit 0
fi

# Production is not right: back to the last good image, no build needed.
touch "$DATA/.ship-failed-$TARGET"
if [ -n "$LAST_IMAGE" ]; then
  say "✗ $TARGET did not verify — rolling back to $LAST_IMAGE"
  CF_BUILD_DIR="$BUILD_DIR" bash scripts/deploy-cloudflare.sh "$ENV_FILE" rollback "$LAST_IMAGE" >>"$SLOG" 2>&1
  sleep 90
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$SITE/en/find")
  post "⚠️ mkan auto-deploy of $TARGET failed its checks and was rolled back to the last good image (/en/find now $code). Log: scripts/crm/.data/sprint/$(basename "$SLOG")"
else
  post "🆘 mkan auto-deploy of $TARGET failed its checks and there is no last good image on record to roll back to — Abdout, look now. Log: scripts/crm/.data/sprint/$(basename "$SLOG")"
fi
exit 0
