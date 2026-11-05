#!/usr/bin/env bash
# The sprint runner — /monetize's prompts in full auto (Abdout, 2026-11-04). Every hour it takes the
# next pending prompt of the week's sprint (then the month's), runs it in a headless Claude Code
# session on this Mac, unattended, and the session reports itself done (`pnpm sprint:done`). The page
# shows the prompt running, done, or "needs you".
#
# The line it never crosses: anything that reaches a real person outside Databayt (brokers, tenants,
# hosts, the public TikTok page), money, or the WhatsApp pairing. MKAN_UNATTENDED=1 makes those
# scripts refuse (scripts/unattended.ts), the session is told the same, and a few commands are denied
# outright. Such a prompt ends "blocked" with the one thing Abdout has to do — the runner never waits.
#
# Install (any hour; ticks only start a run when none is going and the Mac is awake):
#   install -S -m 755 scripts/crm/hermes/sprint-runner.sh ~/.hermes/scripts/mkan-sprint-runner.sh   # never cp: a run reads it
#   hermes cron create "20 * * * *" --name mkan-sprint-runner --script mkan-sprint-runner.sh --no-agent
# Each tick first runs `pnpm sprint:cycle` (close · unblock · measure · plan · top up), so the queue
# never runs dry: a new sprint is planned when the old one ends, new prompts come from the live to-do
# list, and a "needs you" prompt resumes by itself once its unblockWhen condition holds.
# Dry run (cycle --dry, claims nothing, runs nothing):
#   SPRINT_RUNNER_DRY=1 bash scripts/crm/hermes/sprint-runner.sh --run
set -uo pipefail
REPO="${MKAN_REPO:-/Users/abdout/mkan}"
LOGDIR="$REPO/scripts/crm/.data/sprint"
LOCK="$LOGDIR/.runner.lock"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unset SLACK_HOME_CHANNEL
mkdir -p "$LOGDIR"
. "$REPO/scripts/crm/hermes/lane.sh"
LANE_JOB=hermes:mkan-sprint-runner

if [ "${1:-}" != "--run" ]; then
  lane_tick "$LOCK" 'sprint-runner\.sh' || exit 0
  if ! /bin/bash "$REPO/scripts/crm/hermes/detached.sh" /bin/bash "$0" --run; then
    rm -rf "$LOCK"
    echo "⚠️ sprint runner could not start detached from the gateway"
  fi
  exit 0
fi

DRY="${SPRINT_RUNNER_DRY:-}"
[ -n "$DRY" ] || lane_own "$LOCK"
cd "$REPO" || exit 0
wait_ready 30 || { lane_end defer "$(lane_not_ready)"; exit 0; }
export PRISMA_QUIET=1
RUNLOG="$LOGDIR/runner.log"
echo "── $(date '+%Y-%m-%d %H:%M:%S') sprint runner ${DRY:+(dry)} ──" >>"$RUNLOG"

# The cycle first: close expired sprints, resume prompts whose condition holds, measure lessons, plan a
# new sprint when none is active (one planner session a day at most — a dated marker in $LOGDIR), top
# up the queue from the live to-do list. Its last line is JSON; CYCLE_SAID is the card's one line.
CYCLE_JSON=$(pnpm -s sprint:cycle ${DRY:+--dry} 2>>"$RUNLOG" | tee -a "$RUNLOG" | tail -1)
CYCLE_SAID=$(printf '%s' "$CYCLE_JSON" | /usr/bin/python3 -c '
import json, sys
c = json.load(sys.stdin)["cycle"]
parts = []
for key, word in (("closed", "closed"), ("planned", "planned"), ("unblocked", "unblocked"), ("retried", "retried"), ("toppedUp", "topped up"), ("measured", "measured")):
    if c.get(key): parts.append(word + " " + "; ".join(c[key])[:160])
print(" · ".join(parts))
' 2>/dev/null)
NEEDS_YOU=$(printf '%s' "$CYCLE_JSON" | /usr/bin/python3 -c 'import json,sys; print(len(json.load(sys.stdin)["cycle"].get("needsYou", [])))' 2>/dev/null)
[ -n "$CYCLE_JSON" ] || echo "  ⚠️ sprint:cycle printed nothing — claiming anyway" >>"$RUNLOG"
post_cycle() {
  # A card only when the cycle changed something: an hourly "nothing happened" is noise.
  [ -n "$CYCLE_SAID" ] || return 0
  printf '🔁 Sprint cycle — %s%s\nmkan.sd/en/monetize\n' "$CYCLE_SAID" "${NEEDS_YOU:+ · needs you: $NEEDS_YOU}" | pnpm -s crm:post-mkan >/dev/null 2>&1
}

if [ -n "$DRY" ]; then
  echo "cycle: ${CYCLE_SAID:-nothing to do}${NEEDS_YOU:+ · needs you: $NEEDS_YOU}"
  CLAIM=$(pnpm -s sprint:next 2>>"$RUNLOG")
  echo "$CLAIM"
  echo "(dry run: nothing claimed, no session started)"
  exit 0
fi

CLAIM=$(pnpm -s sprint:claim 2>>"$RUNLOG" | tail -1)
field() { printf '%s' "$CLAIM" | /usr/bin/python3 -c "import json,sys; d=json.load(sys.stdin); v=d.get('$1'); print('' if v is None else v)" 2>/dev/null; }
if [ -z "$CLAIM" ]; then
  post_cycle
  lane_end fail "sprint:claim printed nothing (database?)"
  exit 0
fi
if [ "$(field empty)" = "True" ]; then post_cycle; lane_end ok "no pending prompt${CYCLE_SAID:+ (cycle: $CYCLE_SAID)}"; exit 0; fi
if [ "$(field busy)" = "True" ]; then post_cycle; lane_end ok "a prompt is already running"; exit 0; fi

ID=$(field id)
KIND=$(field kind)
TASK=$(field task)
TASK_ID=$(field taskId)
TEXT=$(field text)
METRIC=$(field metric)
BASELINE=$(field baseline)
LAST_RESULT=$(field lastResult)
[ -n "$ID" ] || { post_cycle; lane_end fail "could not read the claimed prompt: $CLAIM"; exit 0; }
TASKDONE=""
[ -n "$TASK_ID" ] && TASKDONE=" --task-done"
# The numbers now and what earlier runs learned, so this run builds on them instead of repeating them.
BRIEF=$(pnpm exec tsx scripts/sprint.ts brief "$ID" 2>>"$RUNLOG" | grep -v 'injected env')
METRICLINE="This prompt moves: ${METRIC:-(no metric named — pick the one key number it should move and name it)}${BASELINE:+ (baseline at claim: $BASELINE)}."
RETRYLINE=""
[ -n "$LAST_RESULT" ] && RETRYLINE="This is a retry. The last run reported: ${LAST_RESULT}"
METRICARG="${METRIC:-<key>}"
SESSION_LOG="$LOGDIR/run-$(date +%Y%m%d-%H%M)-$ID.log"

# read -d '' (not \$(cat <<EOF)): macOS bash 3.2 misparses a heredoc with parentheses inside \$(…).
IFS= read -r -d '' PROMPT <<EOF || true
You are the Mkan sprint runner, working unattended on Abdout's Mac. No human is watching this
session and nobody can answer a question, so never ask one: decide, act, and report.

Do the prompt below end to end in ~/mkan, following that repo's CLAUDE.md and the global rules:
work on main, commit with explicit pathspecs (never git add -A), push with pull --rebase, never
reset or overwrite other sessions' uncommitted work, never force-push. Deploy with the deploy skill
when the prompt's change needs to be live, and verify it.

Lines you never cross in this run:
- Never contact a real person outside Databayt — brokers, tenants, hosts, the public TikTok page —
  by WhatsApp, SMS, email or a post; never turn broker sends on; never book a viewing or a deal;
  never move or record money; never re-pair WhatsApp. Those commands refuse in this run (exit 3).
- Never delete data, branches or files you did not create; no destructive migrations; no secret
  rotation.
When the prompt needs one of those, or needs Abdout's answer or approval, do all the preparation
you can (the analysis, the drafts, the exact command for him), then stop and report it blocked.

${BRIEF}

${METRICLINE}
${RETRYLINE}

Finish with exactly one of these, as your last command. --metric names the key number this prompt
moves; --lesson is one sentence on what moved it or why it did not (the loop measures it 24 h later
and the next sprint is planned from these lessons). When blocked, --unblock-when is the condition on
a key number that turns true once Abdout has done his step (e.g. "brokerSends == gated",
"viewingsBooked > 0", "revenueEntry exists"); the loop then resumes this prompt by itself.
  pnpm sprint:done ${ID} --result="<under 200 chars: what changed>"${TASKDONE} --metric=${METRICARG} --lesson="<one sentence>"
  pnpm sprint:done ${ID} --blocked --result="<under 200 chars: exactly what Abdout must do or decide>" --metric=${METRICARG} --lesson="<one sentence>" --unblock-when="<condition>"

Prompt (${KIND} sprint${TASK:+, task: ${TASK}}):
${TEXT}
EOF

echo "  prompt $ID (${KIND}${TASK:+ · ${TASK}}) → $SESSION_LOG" >>"$RUNLOG"
# 70 minutes at most (macOS has no timeout(1)): the session runs in its own process group and the
# whole group is stopped at the limit; a run cut short is released as blocked below.
MKAN_UNATTENDED=1 KUN_JOB="$LANE_JOB" /usr/bin/perl -e '
  my $t = shift; my $pid = fork;
  if (!$pid) { setpgrp(0, 0); exec @ARGV or exit 127 }
  $SIG{ALRM} = sub { kill "TERM", -$pid; sleep 5; kill "KILL", -$pid; exit 124 };
  alarm $t; waitpid($pid, 0); exit($? >> 8);
' 4200 \
  "$HOME/.claude/bin/kun-claude.sh" -p "$PROMPT" \
  --dangerously-skip-permissions \
  --max-turns 120 \
  --disallowedTools "Bash(pnpm wa:brokers gated:*)" "Bash(pnpm -s wa:brokers gated:*)" "Bash(pnpm wa:pair:*)" "Bash(pnpm wa:outbox:*)" \
    "Bash(pnpm deal:book:*)" "Bash(pnpm crm:outreach:*)" "Bash(pnpm crm:cadence:*)" "Bash(pnpm tt:upload:*)" "Bash(pnpm tt:ask:*)" \
    "Bash(git push --force:*)" "Bash(git push -f:*)" "Bash(git reset --hard:*)" "Bash(prisma migrate reset:*)" \
  >"$SESSION_LOG" 2>&1
RC=$?
echo "  exit $RC" >>"$RUNLOG"

if [ "$RC" = "75" ]; then
  # The engine's daily cap for this job is spent: give the prompt back for tomorrow.
  pnpm -s sprint:release "$ID" --pending --result="Waiting: today's runner cap is spent." >>"$RUNLOG" 2>&1
  post_cycle
  lane_end ok "daily cap reached — prompt $ID back to pending"
  exit 0
fi

# The session reports itself; a session that ended without reporting (cut off, crashed) is released
# as blocked so the next tick moves on and Abdout sees it.
pnpm -s sprint:release "$ID" --result="The unattended run ended without reporting (exit $RC) — see $(basename "$SESSION_LOG")." >>"$RUNLOG" 2>&1
STATE=$(pnpm -s sprint:show 2>/dev/null | grep -F "$ID" | awk '{print $2}' | head -1)
RESULT=$(tail -c 600 "$SESSION_LOG" | tr '\n' ' ' | cut -c1-280)
{
  echo "🤖 Sprint runner — prompt ${KIND:-?}${TASK:+ · ${TASK}}: *${STATE:-unknown}*${METRIC:+ (moves ${METRIC})}"
  echo "${RESULT}"
  [ -n "$CYCLE_SAID" ] && echo "🔁 cycle: ${CYCLE_SAID}"
  [ -n "$NEEDS_YOU" ] && [ "$NEEDS_YOU" != "0" ] && echo "✋ needs you: ${NEEDS_YOU} (resumes by itself once done)"
  echo "mkan.sd/en/monetize · log: scripts/crm/.data/sprint/$(basename "$SESSION_LOG")"
} | pnpm -s crm:post-mkan >/dev/null 2>&1
case "$STATE" in
  processed|skipped) lane_end ok "prompt $ID $STATE" ;;
  blocked) lane_end warn "prompt $ID needs Abdout" ;;
  *) lane_end warn "prompt $ID ended as ${STATE:-unknown}" ;;
esac
exit 0
