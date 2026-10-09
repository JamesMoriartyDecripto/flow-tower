#!/usr/bin/env bash
# SCORM Cloud conformance smoke test. Imports the package into the sandbox, then checks the
# registration reports completion, success and a scaled score after the pilot launch.
# Needs SCORM_CLOUD_APP_ID and SCORM_CLOUD_SECRET in the CI environment.
set -euo pipefail

ZIP="${1:?usage: smoke-test.sh <package.zip> <course-id>}"
COURSE_ID="${2:?course id}"
API="https://cloud.scorm.com/api/v2"
AUTH="${SCORM_CLOUD_APP_ID}:${SCORM_CLOUD_SECRET}"

job=$(curl -sf -u "$AUTH" -F "file=@${ZIP}" \
  "$API/courses/importJobs/upload?courseId=${COURSE_ID}&mayCreateNewVersion=true" | jq -r .result)
echo "import job $job"

for _ in $(seq 1 60); do
  status=$(curl -sf -u "$AUTH" "$API/courses/importJobs/$job" | jq -r .status)
  [ "$status" = "COMPLETE" ] && break
  [ "$status" = "ERROR" ] && { echo "::error::import failed"; exit 1; }
  sleep 5
done
[ "$status" = "COMPLETE" ] || { echo "::error::import timed out"; exit 1; }

REG="${COURSE_ID}-smoke-$(date +%s)"
curl -sf -u "$AUTH" -H 'Content-Type: application/json' -X POST "$API/registrations" \
  -d "{\"courseId\":\"$COURSE_ID\",\"registrationId\":\"$REG\",\"learner\":{\"id\":\"forge-smoke\",\"firstName\":\"Smoke\",\"lastName\":\"Test\"}}"

# The headless runner completes lesson 1 and passes the module 1 quiz (Playwright; omitted from this example).
npx --no-install tsx scripts/run-smoke-learner.ts "$REG"

progress=$(curl -sf -u "$AUTH" "$API/registrations/$REG?includeRuntime=false")
echo "$progress" | jq '{registrationCompletion, registrationSuccess, score}'

[ "$(echo "$progress" | jq -r .registrationCompletion)" != "UNKNOWN" ] || { echo "::error::completion not reported"; exit 1; }
[ "$(echo "$progress" | jq -r .registrationSuccess)" != "UNKNOWN" ] || { echo "::error::success not reported"; exit 1; }
[ "$(echo "$progress" | jq -r '.score.scaled // empty')" != "" ] || { echo "::error::score not reported"; exit 1; }
echo "smoke test passed for $REG"
