#!/usr/bin/env bash
# i18n anti-pattern audit. Counts the things the dictionary system should own
# but that currently live inline in JSX/TS:
#   1. Inline language ternaries:  lang === 'ar' ? "..." : "..."
#   2. Hardcoded English JSX text inside [lang]/* routes
#   3. Locale-naive Date/Number formatters (toLocaleDateString without args)
#
# Exits 0 if every count is at-or-below the budget, 1 otherwise. Wire as
# `pnpm i18n:check` and lefthook pre-commit so the budget can only shrink.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

BUDGET_TERNARY="${I18N_BUDGET_TERNARY:-0}"
BUDGET_RAW_DATE="${I18N_BUDGET_RAW_DATE:-0}"
# Number-only `toLocaleString()` is only a real i18n bug for displayed numbers
# (Arabic-Indic digits etc.). Most call-sites today are price formatting where
# the surrounding currency literal is already locale-correct. Track but don't
# block by default — set I18N_BUDGET_RAW_NUMBER=0 once the cleanup lands.
BUDGET_RAW_NUMBER="${I18N_BUDGET_RAW_NUMBER:-100}"
# Hardcoded English JSX is harder to grep cleanly (false positives on icon
# names, prop values). Track as informational unless a budget is set.
BUDGET_HARDCODED="${I18N_BUDGET_HARDCODED:--1}"

count_lang_ternary() {
  grep -rEn "lang\s*===?\s*['\"]ar['\"]\s*\?" \
    src/app src/components --include="*.tsx" --include="*.ts" 2>/dev/null \
    | grep -v "i18n-anti-pattern-check" \
    | wc -l \
    | tr -d ' '
}

count_raw_date() {
  grep -rEn "toLocaleDateString\(\s*\)|toLocaleDateString\(\s*undefined\s*\)" \
    src/app src/components src/lib --include="*.tsx" --include="*.ts" 2>/dev/null \
    | wc -l \
    | tr -d ' '
}

count_raw_number() {
  grep -rEn "\.toLocaleString\(\s*\)" \
    src/app src/components src/lib --include="*.tsx" --include="*.ts" 2>/dev/null \
    | wc -l \
    | tr -d ' '
}

count_hardcoded() {
  # Heuristic: capital-letter words inside JSX text, excluding common
  # technical noise (className, generateMetadata, dict.*, t(...), etc.).
  grep -rEn ">\s*[A-Z][a-z]+ [A-Z]?[a-z]" \
    src/app/\[lang\] --include="*.tsx" 2>/dev/null \
    | grep -vE "(import|from|className|//|/\*|>\\\$\\{|dict\\.|\\bt\\()" \
    | wc -l \
    | tr -d ' '
}

ternary=$(count_lang_ternary)
raw_date=$(count_raw_date)
raw_number=$(count_raw_number)
hardcoded=$(count_hardcoded)

fail=0
echo "i18n anti-pattern audit"
printf "  inline lang ternaries        : %4s  (budget %s)\n" "$ternary"    "$BUDGET_TERNARY"
printf "  raw toLocaleDateString calls : %4s  (budget %s)\n" "$raw_date"   "$BUDGET_RAW_DATE"
printf "  raw .toLocaleString() calls  : %4s  (budget %s)\n" "$raw_number" "$BUDGET_RAW_NUMBER"
printf "  hardcoded English JSX        : %4s  (budget %s)\n" "$hardcoded"  "$BUDGET_HARDCODED"

if [ "$ternary" -gt "$BUDGET_TERNARY" ]; then fail=1; fi
if [ "$raw_date" -gt "$BUDGET_RAW_DATE" ]; then fail=1; fi
if [ "$raw_number" -gt "$BUDGET_RAW_NUMBER" ]; then fail=1; fi
if [ "$BUDGET_HARDCODED" -ge 0 ] && [ "$hardcoded" -gt "$BUDGET_HARDCODED" ]; then fail=1; fi

if [ "$fail" -eq 0 ]; then
  echo "  PASS"
else
  echo "  FAIL — counts above their budgets"
fi
exit "$fail"
