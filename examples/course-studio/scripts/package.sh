#!/usr/bin/env bash
# CI packaging job (GitHub Actions: .github/workflows/package.yml calls this).
# Deterministic: same run directory in, same zip and sha256 out. No model calls.
# Helpers build-site.ts / package-course.ts and the XSDs in schemas/ are omitted from this example.
set -euo pipefail

RUN_DIR="${1:?usage: package.sh runs/<course-slug> [scorm2004-4th|cmi5]}"
STANDARD="${2:-scorm2004-4th}"
SLUG="$(basename "$RUN_DIR")"
OUT="$RUN_DIR/package"

echo "::group::Build launch pages"
npx --no-install tsx scripts/build-site.ts "$RUN_DIR" "$OUT/site"
echo "::endgroup::"

echo "::group::Accessibility gate (same checks as the PreToolUse hook)"
echo '{"tool_name":"mcp__studio__scorm_package","tool_input":{}}' \
  | FORGE_RUN="$SLUG" npx --no-install tsx src/hooks/cli.ts a11y-gate \
  | tee "$OUT/a11y-gate.json"
if grep -q '"permissionDecision":"deny"' "$OUT/a11y-gate.json"; then
  echo "::error::accessibility gate denied packaging"; exit 1
fi
echo "::endgroup::"

echo "::group::Package ($STANDARD)"
npx --no-install tsx scripts/package-course.ts "$RUN_DIR" "$STANDARD"
ZIP="$OUT/${SLUG}-${STANDARD}.zip"
sha256sum "$ZIP" | tee "$ZIP.sha256"
echo "::endgroup::"

echo "::group::Validate manifest"
if [ "$STANDARD" = "cmi5" ]; then
  unzip -p "$ZIP" cmi5.xml | xmllint --noout --schema schemas/cmi5/CourseStructure.xsd -
else
  unzip -p "$ZIP" imsmanifest.xml | xmllint --noout --schema schemas/scorm2004-4th/imscp_v1p1.xsd -
fi
echo "::endgroup::"

SIZE_MB=$(( $(stat -c%s "$ZIP") / 1048576 ))
[ "$SIZE_MB" -le 500 ] || { echo "::error::package is ${SIZE_MB} MB (max 500)"; exit 1; }
echo "package ok: $ZIP (${SIZE_MB} MB)"
