#!/usr/bin/env bash
# DEPRECATED: nightly batch readability report over finished lessons.
# Replaced by the PreToolUse reading-level gate (src/hooks/reading-level.ts), which stops
# dense text at write time instead of reporting it the next morning. Remove after course 12.
set -euo pipefail

RUN_DIR="${1:?usage: readability.sh runs/<course-slug>}"
MAX_GRADE="${MAX_GRADE:-10}"
REPORT="${RUN_DIR}/readability-report.tsv"

printf "file\tgrade\twords_per_sentence\tstatus\n" > "$REPORT"
fail=0

for f in "$RUN_DIR"/lessons/*.md; do
  # Same scoring as the hook, so old and new reports stay comparable during the migration.
  read -r grade wps < <(npx --no-install tsx -e "
    import { readFileSync } from 'node:fs';
    import { readability } from './src/hooks/reading-level.ts';
    const r = readability(readFileSync('$f', 'utf8'));
    console.log(r.grade, r.wordsPerSentence);
  ")
  status="ok"
  if awk -v g="$grade" -v m="$MAX_GRADE" 'BEGIN { exit !(g > m + 1) }'; then
    status="too_dense"
    fail=$((fail + 1))
  fi
  printf "%s\t%s\t%s\t%s\n" "$(basename "$f")" "$grade" "$wps" "$status" >> "$REPORT"
done

echo "readability: $(($(wc -l < "$REPORT") - 1)) lessons, $fail above grade $((MAX_GRADE + 1)). Report: $REPORT"
[ "$fail" -eq 0 ]
