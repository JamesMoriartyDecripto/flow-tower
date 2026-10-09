#!/usr/bin/env bash
# Deploys the Dev Squad orchestrator container to the VPS with docker compose.
set -euo pipefail

HOST="${SQUAD_HOST:-squad-01.example.com}"
TAG="$(git rev-parse --short HEAD)"

docker build -t "ghcr.io/example-org/dev-squad:$TAG" .
docker push "ghcr.io/example-org/dev-squad:$TAG"

scp deploy/docker-compose.yml "deploy@$HOST:/srv/dev-squad/docker-compose.yml"
ssh "deploy@$HOST" "cd /srv/dev-squad && SQUAD_TAG=$TAG docker compose pull && SQUAD_TAG=$TAG docker compose up -d"
ssh "deploy@$HOST" "docker compose -f /srv/dev-squad/docker-compose.yml ps"
