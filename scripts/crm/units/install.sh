#!/usr/bin/env bash
set -euo pipefail
# Install the CRM ↔ mkan.sd sync timer on this machine. Idempotent.
#
# Run this ONLY on the machine hosting Twenty: the REST API the sync reads is
# bound to localhost there, and `pnpm crm:sync` needs the mkan checkout with its
# .env (DATABASE_URL + TWENTY_API_KEY) beside it.
#
#   bash scripts/crm/units/install.sh          # install + enable + start
#   bash scripts/crm/units/install.sh --status # what is it doing
#   bash scripts/crm/units/install.sh --remove

UNIT_DIR="$HOME/.config/systemd/user"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" = "--status" ]; then
  systemctl --user list-timers --all --no-pager | grep -E 'mkan-crm-sync|NEXT' || echo "not installed"
  echo
  journalctl --user -u mkan-crm-sync.service -n 40 --no-pager 2>/dev/null || true
  exit 0
fi

if [ "${1:-}" = "--remove" ]; then
  systemctl --user disable --now mkan-crm-sync.timer 2>/dev/null || true
  rm -f "$UNIT_DIR/mkan-crm-sync.timer" "$UNIT_DIR/mkan-crm-sync.service"
  systemctl --user daemon-reload
  echo "==> removed"
  exit 0
fi

# The units run `pnpm`, which must be on PATH for a *non-login* systemd session.
if ! command -v pnpm >/dev/null 2>&1; then
  echo "!! pnpm is not on PATH — the unit will fail the same way." >&2
  echo "   Install it, or edit ExecStart to an absolute path." >&2
  exit 1
fi

mkdir -p "$UNIT_DIR"
install -m 644 "$SRC/mkan-crm-sync.service" "$UNIT_DIR/"
install -m 644 "$SRC/mkan-crm-sync.timer" "$UNIT_DIR/"
systemctl --user daemon-reload
systemctl --user enable --now mkan-crm-sync.timer

# User units die with the last session unless linger is on. On a machine whose
# job is to keep running unattended, that silently defeats the whole timer.
if ! loginctl show-user "$USER" 2>/dev/null | grep -q 'Linger=yes'; then
  echo
  echo "!! Linger is OFF — this timer will not run unless you are logged in."
  echo "   Fix with:  sudo loginctl enable-linger $USER"
fi

echo
systemctl --user list-timers --all --no-pager | grep -E 'mkan-crm-sync|NEXT' || true
