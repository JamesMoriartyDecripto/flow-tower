#!/usr/bin/env bash
# Local reproduction of the CI packaging step (same flags as .github/workflows/package.yml).
set -euo pipefail

UE_ROOT="${UE_ROOT:-/opt/UnrealEngine-5.6}"
UPROJECT="${UPROJECT:-$PWD/Emberwake/Emberwake.uproject}"
CONFIG="${1:-Shipping}"
OUT="${2:-$PWD/dist/win64-$CONFIG}"

"$UE_ROOT/Engine/Build/BatchFiles/RunUAT.sh" BuildCookRun \
  -project="$UPROJECT" -platform=Win64 -clientconfig="$CONFIG" \
  -build -cook -stage -pak -iostore -compressed -prereqs \
  -archive -archivedirectory="$OUT" \
  -nocompileeditor -unattended -utf8output 2>&1 | tee logs/ci-package-local.log

du -sh "$OUT"
