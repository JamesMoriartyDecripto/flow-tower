#!/usr/bin/env bash
# Regenerates the typed client both lanes share. Run by the backend lead after every
# contract change and in CI (fails the build if the committed client is stale).
set -euo pipefail

# Custom endpoints: OpenAPI 3.1 -> TypeScript types consumed by openapi-fetch.
npx openapi-typescript api/openapi.yaml -o packages/api-client/src/schema.d.ts

# CMS content: Payload collections -> payload-types.ts (used by RSC pages via the Local API).
npm run --workspace apps/web payload generate:types

if [[ "${CI:-}" == "true" ]] && ! git diff --quiet -- packages/api-client apps/web/src/payload-types.ts; then
  echo "typed client is stale: run scripts/gen-api-client.sh and commit" >&2
  exit 1
fi
