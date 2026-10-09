#!/usr/bin/env bash
# Deterministic gates of the Release Auditor tower. Run from the repository root:
#   bash examples/release-auditor/scripts/gates.sh
# Every gate reports to the tower while it runs (open flow-tower on examples/ to watch it live).
# Summary goes to reports/gates.log; raw tool output to test-results/audit/ (git-ignored).
set -uo pipefail

LOG=examples/release-auditor/reports/gates.log
RAW=test-results/audit
mkdir -p "$RAW" "$(dirname "$LOG")"
echo "# gates.sh on $(git rev-parse --short HEAD) ($(date -u +%Y-%m-%dT%H:%MZ))" > "$LOG"

emit() { # emit <kind> <node> <message> [status]
  node bin/flow-tower.js emit --kind "$1" --tower "Release Auditor" --node "gates.$2" -m "$3" ${4:+--status "$4"} >/dev/null 2>&1 || true
}

failed=0
gate() { # gate <node> <label> <command...>
  local node=$1 label=$2 start status
  shift 2
  start=$(date +%s)
  emit tool.start "$node" "$label"
  if "$@" > "$RAW/$node.txt" 2>&1; then status=ok; else status=error; failed=$((failed + 1)); fi
  echo "$status  $label  ($(( $(date +%s) - start ))s)" | tee -a "$LOG"
  emit tool.end "$node" "$label: $status" "$status"
}

emit tool.start run "gates.sh"
gate typecheck "tsc --noEmit" npx tsc --noEmit
gate unit "vitest" npx vitest run
# validate exits 1 only on errors; this gate also fails on warnings.
examples_clean() {
  node bin/flow-tower.js validate examples --json | node -e '
    const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const bad = r.towers.flatMap((t) => t.issues.filter((i) => i.level !== "info").map((i) => `${t.id} ${i.path}: ${i.message}`));
    console.log(bad.join("\n") || "clean"); process.exit(bad.length ? 1 : 0);'
}
gate examples "validate examples (0 errors, 0 warnings)" examples_clean
gate semgrep "semgrep p/javascript p/typescript p/react p/nodejs p/secrets" \
  uvx semgrep scan --metrics off --error --quiet \
    --config p/javascript --config p/typescript --config p/react --config p/nodejs --config p/secrets \
    --exclude node_modules --exclude test-results --json --output "$RAW/semgrep.json" .
gate deps "npm audit (high and critical)" npm audit --audit-level=high
gate secrets "gitleaks over the whole git history" \
  gitleaks git --redact --no-banner --exit-code 1 --log-opts="--all" --report-path "$RAW/gitleaks.json" .

echo "$failed gate(s) failed" | tee -a "$LOG"
emit tool.end run "$failed gate(s) failed" "$([ "$failed" = 0 ] && echo ok || echo error)"
exit "$failed"
