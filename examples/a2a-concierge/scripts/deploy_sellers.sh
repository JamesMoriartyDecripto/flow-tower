#!/usr/bin/env bash
# Deploy both A2A seller agents to Cloud Run (as in the codelab), then point each
# agent card at its public URL with HOST_OVERRIDE.
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:?set GOOGLE_CLOUD_PROJECT}"
REGION="us-central1"

for agent in burger pizza; do
  gcloud run deploy "${agent}-agent" \
    --source "remote_seller_agents/${agent}_agent" \
    --port=8080 \
    --allow-unauthenticated \
    --min 1 \
    --region "${REGION}" \
    --project "${PROJECT}" \
    --update-env-vars GOOGLE_CLOUD_LOCATION="${REGION}",GOOGLE_CLOUD_PROJECT="${PROJECT}"

  url=$(gcloud run services describe "${agent}-agent" --region "${REGION}" --format='value(status.url)')
  gcloud run services update "${agent}-agent" --region "${REGION}" --update-env-vars HOST_OVERRIDE="${url}"
  echo "${agent}: ${url}/.well-known/agent.json"
done

# --allow-unauthenticated is the codelab default and "not recommended for production":
# put the services behind IAM (roles/run.invoker for the Agent Engine service account).
