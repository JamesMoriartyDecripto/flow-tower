#!/usr/bin/env bash
# Creates the isolated worktree for one issue, the same way src/pipeline.ts does.
set -euo pipefail

ISSUE="${1:?usage: new-worktree.sh <issue-number> <slug>}"
SLUG="${2:?usage: new-worktree.sh <issue-number> <slug>}"
BASE="/tmp/dev-squad/worktrees"
BRANCH="squad/$ISSUE-$SLUG"

git fetch origin main --quiet
mkdir -p "$BASE"
git worktree add -B "$BRANCH" "$BASE/$ISSUE" origin/main
echo "worktree=$BASE/$ISSUE branch=$BRANCH"
