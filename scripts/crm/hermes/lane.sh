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
#   lane_own <lock>             the run marks the lock as its own and frees it when it ends.
#   wait_online <minutes>       0 once the Mac reaches the internet; 1 if the wall clock runs out.

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
  # shellcheck disable=SC2064 # the path is fixed now, on purpose
  trap "rm -rf '$1'" EXIT
}

wait_online() {
  local deadline=$(($(date +%s) + $1 * 60))
  while :; do
    /usr/bin/curl -s -o /dev/null --max-time 10 "${LANE_ONLINE_URL:-https://www.cloudflare.com/cdn-cgi/trace}" && return 0
    [ "$(date +%s)" -ge "$deadline" ] && return 1
    sleep "${LANE_ONLINE_POLL:-60}"
  done
}
