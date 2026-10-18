#!/usr/bin/env bash
# steps.sh <issue> <dir> <write-dirs> <title>: run the coder on each step file in order; the coder is models.coder of the
# repo's tools/squad/squad.json (CODER_MODEL overrides it); <write-dirs> is a comma-separated list, same as run.mjs --write,
# e.g. src,tests, and when empty it is the config's "write" list;
# after each, the project's check (config.mjs check, commands.check in squad.json) must pass, then one commit per step. Stops at the first red step.
# REPO (default: this checkout) is where the steps run; NODE (default: node) is the Node binary for every node call,
# since the Linux test server's system Node is 20 and Node 22 can live elsewhere; SQUAD_TRAILERS adds extra commit trailer lines.
set -u
R=${REPO:-$(git rev-parse --show-toplevel)}
NODE=${NODE:-node}
H=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
issue=$1; dir=$2; write=$3; title=$4
# Run outputs go to a temp folder: files dropped into the repo would make the "changed nothing" guard
# below see a dirty tree even when the coder did nothing.
OUT=$(mktemp -d "${TMPDIR:-/tmp}/squad-$issue-XXXXXX") || exit 1
echo "outputs in $OUT"
# The repo's own settings fill in what the caller left out. A bad config stops here, before any step runs:
# config.mjs prints the reason on stderr, which the terminal shows.
if [ -z "$write" ]; then
  write=$("$NODE" "$H/config.mjs" get write "$R") || { echo "RED: bad squad config"; exit 1; }
fi
# Default from the 2026-10-11 benchmark and the #126 field trial (skills/flow-tower-costs/reference.md), now the repo's models.coder; CODER_MODEL overrides it.
if [ -n "${CODER_MODEL:-}" ]; then
  CODER=$CODER_MODEL
else
  CODER=$("$NODE" "$H/config.mjs" get models.coder "$R") || { echo "RED: bad squad config"; exit 1; }
fi
# Write dirs are split on commas; the array is what git add and the coder get.
IFS=, read -ra writeDirs <<< "$write"
# nullglob: a dir with no step files runs nothing instead of looping over the literal pattern.
# The names are zero-padded, so glob order is the step order.
shopt -s nullglob
for f in "$dir"/*.md; do
  step=${f##*/}
  step=${step%.md}
  echo "=== #$issue step $step"
  # The commit base for the files check: the step's changes are everything since this commit.
  base=$(git -C "$R" rev-parse HEAD)
  # A coder run that fails (no key, HTTP error, step cap) must stop the chain: a green check on unchanged code is not a done step.
  "$NODE" "$H/run.mjs" --model "$CODER" --role coder --node specialists.coder --task "$f" --steps 70 --issue "$issue" --repo "$R" --write "$write" > "$OUT/coder-$step.out" 2>&1; rc=$?
  tail -c 700 "$OUT/coder-$step.out"
  if [ "$rc" -ne 0 ] || grep -q "^step cap reached" "$OUT/coder-$step.out"; then echo "RED after step $step: coder run failed (exit $rc)"; exit 1; fi
  # Known gaps are the text after the last [finish] line of the coder output. They are printed for the lead and never stop the chain.
  awk '/^\[finish\]/ { buf = ""; found = 1; next } found { buf = buf $0 "\n" } END { printf "%s", buf }' "$OUT/coder-$step.out" > "$OUT/finish-$step.txt"
  gaps=$("$NODE" "$H/files-check.mjs" --gaps "$OUT/finish-$step.txt")
  if [ -n "$gaps" ]; then echo "known gaps (step $step):"; echo "$gaps"; fi
  # The run's own total is on the "--- " line it prints last (#156): it goes into the commit as Squad-Cost, so the step's cost stays with its commit.
  # Take the last such line: the report printed before it can hold diff lines that start with "--- ".
  stepCost=$(grep '^--- ' "$OUT/coder-$step.out" | tail -1 | grep -o '\$[0-9.]*' | tail -1)
  if [ -z "$(git -C "$R" status --porcelain)" ]; then echo "RED after step $step: the coder changed nothing"; exit 1; fi
  # The check is the project's own (config.mjs check), so a repo with another check command runs the same script.
  if ! ("$NODE" "$H/config.mjs" check "$R" > "$OUT/check-$step.log" 2>&1); then
    echo "RED after step $step: see $OUT/check-$step.log"; grep -E "error TS|FAIL|✗|×" "$OUT/check-$step.log" | head -8; exit 1
  fi
  # The files check comes after the check: a step whose listed files are missing from its changes is RED even when its own tests pass (#176).
  fc=0
  "$NODE" "$H/files-check.mjs" "$f" "$base" "$R" || fc=$?
  if [ "$fc" -eq 1 ]; then echo "RED after step $step: files listed in the task were not touched"; exit 1; fi
  if [ "$fc" -ne 0 ]; then echo "RED after step $step: files check failed (exit $fc)"; exit 1; fi
  # Sign-off (DCO) is automatic: git commit -s. Trailers (session link, co-author) are session-specific: the caller passes them in SQUAD_TRAILERS, one per line.
  # git reads trailers only from the last paragraph, so Squad-Cost and the caller's lines share that one paragraph, with no blank line between them.
  trailerBlock=''
  [ -n "$stepCost" ] && trailerBlock="Squad-Cost: $stepCost"
  if [ -n "${SQUAD_TRAILERS:-}" ]; then
    if [ -n "$trailerBlock" ]; then trailerBlock+=$'\n'"$SQUAD_TRAILERS"; else trailerBlock=$SQUAD_TRAILERS; fi
  fi
  trailerPara=''
  [ -n "$trailerBlock" ] && trailerPara=$'\n\n'"$trailerBlock"
  (
    cd "$R" || exit 1
    # Probe files the coder left behind are removed before staging, so they never reach the commit.
    git ls-files --others --exclude-standard | grep -E "(^|/)(tmp[-_.]|zz[-_])|probe|scratch" | while read -r junk; do echo "removed coder probe file: $junk"; rm -f -- "$junk"; done
    # git add and git commit run without OPENROUTER_API_KEY: a project's pre-commit hook (husky, lint-staged) may run
    # the tests the coder wrote, and those must not see the key.
    env -u OPENROUTER_API_KEY git add -u
    for p in ${writeDirs[@]+"${writeDirs[@]}"}; do [ -e "$p" ] && env -u OPENROUTER_API_KEY git add -A -- "$p"; done
    git status --short | grep "^??" && echo "UNTRACKED LEFT (outside the write dirs, not committed)"
    env -u OPENROUTER_API_KEY git commit -s -q -m "$title, step $step (#$issue)

Coder: $CODER.${trailerPara}" && git log --oneline -1
  )
done
"$NODE" "$H/cost.mjs" "$issue" --repo "$R"
echo "ALL GREEN #$issue"
