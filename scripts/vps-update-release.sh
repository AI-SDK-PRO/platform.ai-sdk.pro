#!/usr/bin/env bash
# One-shot VPS update for platform.ai-sdk.pro monorepo (Nov 2026 unified release).
# Run as root or a user in the docker group, ON THE VPS after SSH.
set -euo pipefail

ROOT="${ROOT:-/opt/ai-sdk-pro}"
CURRENT="${CURRENT:-$ROOT/current}"
CONFIG_ENV="${CONFIG_ENV:-$ROOT/config/app.env}"
CADDYFILE="${CADDYFILE:-$ROOT/config/Caddyfile}"
COMPOSE="${COMPOSE:-$ROOT/infra/production/docker-compose.yml}"
REPO_URL="${REPO_URL:-https://github.com/z-ey3eiei/platform.ai-sdk.pro.git}"
BRANCH="${BRANCH:-main}"

log() { printf '[vps-update] %s\n' "$*"; }
die() { printf '[vps-update] ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker not installed"
docker compose version >/dev/null 2>&1 || die "docker compose plugin not installed"
[[ -f "$CONFIG_ENV" ]] || die "missing $CONFIG_ENV — fill from .env.example first"
[[ -f "$CADDYFILE" ]] || die "missing $CADDYFILE"

if [[ ! -d "$CURRENT/.git" ]]; then
  log "Cloning into $CURRENT"
  mkdir -p "$(dirname "$CURRENT")"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$CURRENT"
else
  log "Pulling $BRANCH in $CURRENT"
  git -C "$CURRENT" fetch origin "$BRANCH"
  git -C "$CURRENT" checkout "$BRANCH"
  git -C "$CURRENT" pull --ff-only origin "$BRANCH"
fi

SHORT_SHA="$(git -C "$CURRENT" rev-parse --short HEAD)"
export APP_IMAGE="ai-sdk-pro-web:${SHORT_SHA}"
log "Building image $APP_IMAGE"

cd "$CURRENT"
docker build -f Dockerfile -t "$APP_IMAGE" .

log "Compose config check"
APP_IMAGE="$APP_IMAGE" docker compose -f "$COMPOSE" config >/dev/null

log "Starting stack"
APP_IMAGE="$APP_IMAGE" docker compose -f "$COMPOSE" up -d --remove-orphans

log "Waiting for app health (up to 90s)"
for i in $(seq 1 45); do
  if docker compose -f "$COMPOSE" ps app 2>/dev/null | grep -qi healthy; then
    break
  fi
  sleep 2
done

log "Optional Neon migrations (needs NEON_DATABASE_URL in app container env_file)"
if grep -q '^NEON_DATABASE_URL=.\+' "$CONFIG_ENV" 2>/dev/null; then
  docker compose -f "$COMPOSE" exec -T app \
    node --import tsx apps/web/scripts/migrate-platform.ts 2>/dev/null \
    || log "migrate skipped or already applied (check logs if first deploy)"
fi

PASS=0
check_url() {
  local url=$1
  if curl -sf --max-time 20 "$url" >/dev/null; then
    log "OK $url"
    PASS=$((PASS + 1))
  else
    log "FAIL $url"
  fi
}

check_url "https://platform.ai-sdk.pro/api/health"
check_url "https://ai-sdk.pro/api/health"
check_url "https://platform.ai-sdk.pro/api/ready"
check_url "https://platform.ai-sdk.pro/api/platform/status"
check_url "https://platform.ai-sdk.pro/templates"
check_url "https://platform.ai-sdk.pro/workspace/about"
check_url "https://platform.ai-sdk.pro/api/templates/registry"

log "--- smoke summary: $PASS checks passed ---"
docker compose -f "$COMPOSE" ps

if [[ "$PASS" -lt 2 ]]; then
  die "Health checks failed — inspect: docker compose -f $COMPOSE logs --tail=80 app"
fi

log "Release ${SHORT_SHA} is up. Image tag: $APP_IMAGE"