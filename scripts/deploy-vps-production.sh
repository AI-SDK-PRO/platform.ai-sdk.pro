#!/usr/bin/env bash
# Run ON THE VPS (after SSH from your machine). Does not need secrets in the agent.
set -euo pipefail

RELEASE_DIR="${RELEASE_DIR:-/opt/ai-sdk-pro}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/production/docker-compose.yml}"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/z-ey3eiei/platform-ai-sdk-pro-web}"
TAG="${1:-main}"

if [[ ! -f "$RELEASE_DIR/config/app.env" ]]; then
  echo "Missing $RELEASE_DIR/config/app.env — copy from .env.example first." >&2
  exit 1
fi

if [[ "$TAG" == sha-* ]]; then
  export APP_IMAGE="${IMAGE_REPO}:${TAG}"
else
  export APP_IMAGE="${IMAGE_REPO}:coolify-staging"
fi

cd "$RELEASE_DIR"
docker compose -f "$COMPOSE_FILE" pull app 2>/dev/null || docker compose -f "$COMPOSE_FILE" up -d --build

docker compose -f "$COMPOSE_FILE" up -d

echo "Containers:"
docker compose -f "$COMPOSE_FILE" ps

for url in "https://platform.ai-sdk.pro/api/health" "https://ai-sdk.pro/api/health"; do
  if curl -sf --max-time 15 "$url"; then
    echo "OK $url"
    exit 0
  fi
done
echo "Started — check HTTPS manually." >&2
exit 0