#!/usr/bin/env bash
# Scales the GPU spot fleet that hosts playtest bots, runs the QA matrix, scales back to zero.
set -euo pipefail

BUILD_ID="${1:?usage: playtest-fleet.sh <build-id> [instances]}"
INSTANCES="${2:-8}"
ASG="forge-playtest-spot"
REGION="eu-central-1"

aws autoscaling set-desired-capacity --region "$REGION" \
  --auto-scaling-group-name "$ASG" --desired-capacity "$INSTANCES"

aws ssm send-command --region "$REGION" \
  --targets "Key=tag:aws:autoscaling:groupName,Values=$ASG" \
  --document-name AWS-RunShellScript \
  --parameters "commands=['/opt/forge/run-bots.sh $BUILD_ID']" \
  --comment "playtest $BUILD_ID"

echo "Fleet running $INSTANCES bots on $BUILD_ID; telemetry -> s3://forge-telemetry/$BUILD_ID/"
trap 'aws autoscaling set-desired-capacity --region "$REGION" --auto-scaling-group-name "$ASG" --desired-capacity 0' EXIT
