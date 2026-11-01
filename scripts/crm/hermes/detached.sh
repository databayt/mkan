#!/usr/bin/env bash
# Start a command outside the Hermes gateway's process tree, and return at once.
#
# A gateway restart (an update, a config edit) kills every job it is running:
# on 2026-11-01 the 06:00 TikTok sweep died mid-mirror at 07:48 and the 09:00
# demand match at 09:09, both "killed the job's tool subprocess". A command
# started here is double-forked into its own session and reparented to launchd,
# so the gateway can come and go while it runs. It reports its own failures to
# #mkan (`pnpm -s crm:post-mkan`), since Hermes no longer reads its stdout.
#
#   detached.sh <command> [args…]
set -uo pipefail
[ "$#" -ge 1 ] || { echo "usage: detached.sh <command> [args…]" >&2; exit 2; }
/usr/bin/python3 - "$@" <<'PY'
import os, sys
if os.fork() > 0:
    sys.exit(0)
os.setsid()
if os.fork() > 0:
    os._exit(0)
null = os.open(os.devnull, os.O_RDWR)
for fd in (0, 1, 2):
    os.dup2(null, fd)
os.execvp(sys.argv[1], sys.argv[1:])
PY
