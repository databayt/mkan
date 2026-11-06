#!/usr/bin/env bash
# Rotate mkan's session secret (AUTH_SECRET = NEXTAUTH_SECRET) in the Mac's Keychain — run by Abdout.
#
#   bash scripts/rotate-auth-secret.sh            # rotate; the next deploy (cf-secrets.sh) ships it
#
# Every session is signed with it: rotating ends every session (all users sign in again once), which
# is the point after the admin password left the shared "1234" (2026-11-06). The proxy decodes the
# cookie since 3bb7aac, so an old cookie is expired cleanly instead of looping /login ↔ dashboard.
#
# Two things used to fall back to NEXTAUTH_SECRET and must not change with it: the bus-ticket QR
# signatures (TICKET_QR_SECRET — tickets already issued keep verifying) and the analytics visitor
# salt (ANALYTICS_SALT_SECRET — visitor ids stay stable). Both are pinned to the OLD value first.
# The old value is kept as cf-mkan-AUTH_SECRET-prev-2026-11-06 for a rollback. A chat-link secret
# (MKAN_CHAT_LINK_SECRET, signs /find?c=…&s=… links in WhatsApp messages) is made if missing.
# No value is ever printed.
set -euo pipefail
kc() { security find-generic-password -s "$1" -w 2>/dev/null || true; }
put() { security add-generic-password -a "$USER" -s "$1" -l "$2" -U -w "$3"; }

OLD=$(kc cf-mkan-NEXTAUTH_SECRET)
[ ${#OLD} -ge 32 ] || { echo "cf-mkan-NEXTAUTH_SECRET is missing or short — nothing rotated"; exit 1; }
[ -n "$(kc cf-mkan-TICKET_QR_SECRET)" ] || put cf-mkan-TICKET_QR_SECRET "mkan ticket QR HMAC (= pre-11-06 NEXTAUTH_SECRET)" "$OLD"
[ -n "$(kc cf-mkan-ANALYTICS_SALT_SECRET)" ] || put cf-mkan-ANALYTICS_SALT_SECRET "mkan analytics salt (= pre-11-06 NEXTAUTH_SECRET)" "$OLD"
put cf-mkan-AUTH_SECRET-prev-2026-11-06 "mkan AUTH_SECRET before the 11-06 rotation (rollback only)" "$OLD"

NEW=$(openssl rand -base64 32)
[ "$NEW" != "$OLD" ] || { echo "random value repeated?"; exit 1; }
put cf-mkan-AUTH_SECRET "mkan AUTH_SECRET" "$NEW"
put cf-mkan-NEXTAUTH_SECRET "mkan NEXTAUTH_SECRET (= AUTH_SECRET)" "$NEW"
[ -n "$(kc cf-mkan-MKAN_CHAT_LINK_SECRET)" ] || put cf-mkan-MKAN_CHAT_LINK_SECRET "mkan /find chat-link HMAC" "$(openssl rand -base64 32)"
unset OLD NEW

for k in AUTH_SECRET NEXTAUTH_SECRET TICKET_QR_SECRET ANALYTICS_SALT_SECRET MKAN_CHAT_LINK_SECRET; do
  v=$(kc "cf-mkan-$k"); echo "  cf-mkan-$k: ${#v} chars"
done
echo "✓ rotated in the Keychain. It reaches production with the next deploy (scripts/cf-secrets.sh, then a container restart)."
