#!/usr/bin/env bash
# Builds the studio orchestrator image and rolls it out to the GKE cluster.
set -euo pipefail

PROJECT="forge-studio"
REGION="europe-west4"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/forge/studio-orchestrator:$(git rev-parse --short HEAD)"

docker build -t "$IMAGE" -f deploy/Dockerfile .
docker push "$IMAGE"

gcloud container clusters get-credentials forge-prod --region "$REGION" --project "$PROJECT"
kubectl -n forge set image deployment/studio-orchestrator orchestrator="$IMAGE"
kubectl -n forge rollout status deployment/studio-orchestrator --timeout=5m
