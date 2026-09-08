#!/usr/bin/env bash
# Push the container's SECRETS to the Worker from a production dotenv
# (`vercel env pull <file> --environment=production --scope databayt`).
# Only secret-classified names (see cf/env-split.mjs) are uploaded; the rest is
# baked into the image by scripts/deploy-cloudflare.sh. Values never touch the
# terminal or git. Secrets reach the container at its next start.
#
#   scripts/cf-secrets.sh <dotenv-file>
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=${1:?dotenv file}
OUT=$(mktemp -t cf-secrets.XXXXXX.json); trap 'rm -f "$OUT"' EXIT
node cf/env-split.mjs "$SRC" secrets > "$OUT"
# KEYCHAIN OVERRIDES — the pulled Vercel env carries values that are wrong or
# dead (mkan production shipped NEXTAUTH_SECRET="secret", and the Resend key was
# revoked). Anything stored in the macOS Keychain as cf-<worker>-<VAR> wins, so
# re-running this from a stale dotenv cannot regress a fixed secret.
for VAR in NEXTAUTH_SECRET AUTH_SECRET RESEND_API_KEY; do
  V=$(security find-generic-password -s "cf-mkan-$VAR" -w 2>/dev/null || true)
  [[ -n "$V" ]] && OUT="$OUT" VAR="$VAR" V="$V" node -e '
    const fs=require("fs");const p=process.env.OUT;const o=JSON.parse(fs.readFileSync(p,"utf8"));
    o[process.env.VAR]=process.env.V;fs.writeFileSync(p,JSON.stringify(o));
    console.error("    override from Keychain: "+process.env.VAR);'
done
echo "==> $(node -e 'console.log(Object.keys(require(process.argv[1])).length)' "$OUT") secrets → Worker (names: $(node cf/env-split.mjs "$SRC" names | awk '$1=="secret"{print $2}' | tr '\n' ' '))"
pnpm exec wrangler secret bulk "$OUT"
