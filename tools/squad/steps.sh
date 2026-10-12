#!/bin/zsh
# steps.sh <issue> <dir> <write-dirs> <title>: run the coder (Haiku by default, CODER_MODEL overrides) on each step file in order;
# <write-dirs> is a comma-separated list, same as run.mjs --write, e.g. src,tests;
# after each, npm run check must pass, then one commit per step. Stops at the first red step.
# REPO (default: this checkout) is where the steps run; SQUAD_TRAILERS adds extra commit trailer lines.
R=${REPO:-$(git rev-parse --show-toplevel)}
H=${0:a:h}
issue=$1; dir=$2; write=$3; title=$4
# Run outputs go to a temp folder: files dropped into the repo would make the "changed nothing" guard
# below see a dirty tree even when the coder did nothing.
OUT=$(mktemp -d "${TMPDIR:-/tmp}/squad-$issue-XXXXXX") || exit 1
echo "outputs in $OUT"
for f in $dir/*.md(n); do
  step=${f:t:r}
  echo "=== #$issue step $step"
  # A coder run that fails (no key, HTTP error, step cap) must stop the chain: a green check on unchanged code is not a done step.
  # Default from the 2026-10-11 benchmark and the #126 field trial (skills/flow-tower-costs/reference.md); CODER_MODEL overrides it.
  CODER=${CODER_MODEL:-anthropic/claude-haiku-5.5}
  node $H/run.mjs --model $CODER --role coder --node specialists.coder --task $f --steps 70 --issue $issue --repo $R --write $write > $OUT/coder-$step.out 2>&1; rc=$?
  tail -c 700 $OUT/coder-$step.out
  if [ $rc -ne 0 ] || grep -q "^step cap reached" $OUT/coder-$step.out; then echo "RED after step $step: coder run failed (exit $rc)"; exit 1; fi
  # The run's own total is on the "--- " line it prints last (#156): it goes into the commit as Squad-Cost, so the step's cost stays with its commit.
  # Take the last such line: the report printed before it can hold diff lines that start with "--- ".
  stepCost=$(grep '^--- ' $OUT/coder-$step.out | tail -1 | grep -o '\$[0-9.]*' | tail -1)
  if [ -z "$(cd $R && git status --porcelain)" ]; then echo "RED after step $step: the coder changed nothing"; exit 1; fi
  if ! (cd $R && npm run check > $OUT/check-$step.log 2>&1); then
    echo "RED after step $step: see $OUT/check-$step.log"; grep -E "error TS|FAIL|✗|×" $OUT/check-$step.log | head -8; exit 1
  fi
  # Sign-off (DCO) is automatic: git commit -s. Trailers (session link, co-author) are session-specific: the caller passes them in SQUAD_TRAILERS, one per line.
  # git reads trailers only from the last paragraph, so Squad-Cost and the caller's lines share that one paragraph, with no blank line between them.
  trailerBlock=''
  [ -n "$stepCost" ] && trailerBlock="Squad-Cost: $stepCost"
  if [ -n "$SQUAD_TRAILERS" ]; then
    if [ -n "$trailerBlock" ]; then trailerBlock+=$'\n'"$SQUAD_TRAILERS"; else trailerBlock=$SQUAD_TRAILERS; fi
  fi
  trailerPara=''
  [ -n "$trailerBlock" ] && trailerPara=$'\n\n'"$trailerBlock"
  (cd $R && git ls-files --others --exclude-standard | grep -E "(^|/)(tmp[-_.]|zz[-_])|probe|scratch" | while read -r junk; do echo "removed coder probe file: $junk"; rm -f -- "$junk"; done; git add -u; for p in ${(s:,:)write}; do [ -e $p ] && git add -A -- $p; done; git status --short | grep "^??" && echo "UNTRACKED LEFT (outside the write dirs, not committed)"; git commit -s -q -m "$title, step $step (#$issue)

Coder: $CODER.${trailerPara}" && git log --oneline -1)
done
node $H/cost.mjs $issue
echo "ALL GREEN #$issue"
