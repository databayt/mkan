#!/usr/bin/env bash
# Shared by the Hermes lane scripts (sourced, never run): who holds a lane's lock, and waiting
# for the internet before a run starts.
#
# Why (2026-11-02): the Mac sleeps with its lid closed. Hermes fires the ticks during its short
# maintenance wakes, when the network is mostly off, so every morning run on 11-02 failed
# (post 07:50, web 09:04, demand 09:54, stats 10:59) while the lid stayed shut until 12:28.
# And a lock judged by its age alone ("older than 3 h is a crash") would let a second run start
# beside one that sleep had merely paused.
#
#   lane_tick <lock> <scripts>  0: this tick took the lock — start the run. 1: a live run holds it.
#                               <scripts> is a pattern of every script that runs under this lock
#                               ('tiktok-(post|upload-retry)\.sh': the post and its retry share one).
#   lane_own <lock>             the run marks the lock as its own, records its start under $LANE_JOB
#                               (the engine's name, e.g. hermes:mkan-demand-match), and on exit frees
#                               the lock and records the outcome lane_end set — none set means the run
#                               died (fail). Hermes says "ok" the moment a detached run starts; this
#                               record is what kun's runs.sh and the supervisor read instead.
#   lane_end <status> [summary] ok | warn | fail | defer — recorded when the run exits.
#   lane_finish                 record now (before an exec that replaces this script).
#   wait_ready <minutes>        0 once the Mac is fully awake (not a dark wake with the lid shut) and
#                               online; 1 when the wall clock runs out. lane_not_ready says why not.
#
# The record and the gate come from kun's ~/.claude/scripts/lib/runs.sh when this Mac has it; without
# it the lanes still run (no record, and the gate is the old network-only wait).

if ! . "$HOME/.claude/scripts/lib/runs.sh" 2>/dev/null; then
  runs_record() { :; }
fi

# A run's command line carries its script's name and --run; a recycled PID carries neither.
lane_alive() { [ -n "${1:-}" ] && ps -p "$1" -o command= 2>/dev/null | grep -Eq -- "$2 --run"; }

lane_tick() {
  local lock=$1 script=$2 pid
  mkdir "$lock" 2>/dev/null && return 0
  pid=$(cat "$lock/pid" 2>/dev/null || true)
  # Its run is alive, perhaps paused by sleep or waiting for the network: never a second beside it.
  if lane_alive "$pid" "$script"; then return 1; fi
  if [ -z "$pid" ]; then
    # No PID: a run from before lane.sh (it never wrote one) may still be going…
    pgrep -f -- "$script --run" >/dev/null 2>&1 && return 1
    # …or the tick has just made the lock and its run is starting (it writes within a second).
    [ -z "$(find "$lock" -maxdepth 0 -mmin +2 2>/dev/null)" ] && return 1
  fi
  # Nobody behind it — a crash, a kill, a reboot: the lock is this tick's now.
  rm -rf "$lock" && mkdir "$lock"
}

lane_own() {
  echo "$$" >"$1/pid"
  LANE_LOCK=$1
  LANE_STARTED=$(date +%s)
  # mkan's own run records (crm/notify.ts recordRun) land under the same engine job, as steps.
  export RUNS_JOB="${LANE_JOB:-}"
  [ -n "${LANE_JOB:-}" ] && runs_record "$LANE_JOB" start "" 0 "" "$$"
  trap 'lane_finish; rm -rf "$LANE_LOCK"' EXIT
}

lane_end() { LANE_STATUS=$1; LANE_SUMMARY=${2:-}; }

lane_finish() {
  [ -n "${LANE_JOB:-}" ] && [ -z "${LANE_DONE:-}" ] || return 0
  LANE_DONE=1
  local wake slept=""
  # Paused by sleep mid-run: the supervisor does not count such a run as a real attempt.
  wake=$(sysctl -n kern.waketime 2>/dev/null | sed -n 's/^{ sec = \([0-9]*\),.*/\1/p')
  [ -n "$wake" ] && [ -n "${LANE_STARTED:-}" ] && [ "$wake" -gt "$LANE_STARTED" ] && slept=slept
  if [ -z "${LANE_STATUS:-}" ]; then
    LANE_STATUS=fail
    LANE_SUMMARY="the run ended without an outcome"
  fi
  runs_record "$LANE_JOB" "$LANE_STATUS" "${LANE_SUMMARY:-}" 0 "" "" "$slept"
}

wait_ready() {
  if type runs_ready >/dev/null 2>&1; then
    RUNS_READY_POLL="${LANE_ONLINE_POLL:-60}" runs_ready "$@"
    return
  fi
  local deadline=$(($(date +%s) + $1 * 60))
  while :; do
    /usr/bin/curl -s -o /dev/null --max-time 10 "${LANE_ONLINE_URL:-https://www.cloudflare.com/cdn-cgi/trace}" && return 0
    [ "$(date +%s)" -ge "$deadline" ] && return 1
    sleep "${LANE_ONLINE_POLL:-60}"
  done
}
# The name before 11-02's gate; copies installed earlier still call it.
wait_online() { wait_ready "$@"; }

lane_not_ready() {
  if type runs_not_ready >/dev/null 2>&1; then runs_not_ready "$@"; else echo "offline"; fi
}
