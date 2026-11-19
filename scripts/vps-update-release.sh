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
# BUILD_MODE: auto | build | pull | skip
#   auto  — build only if MemAvailable >= 2200 MiB (typical 4 GiB VPS)
#   pull  — use GHCR image (saves RAM; needs docker login ghcr.io once)
#   build — force local docker build (can OOM on 4 GiB without swap)
#   skip  — keep existing APP_IMAGE tag
BUILD_MODE="${BUILD_MODE:-auto}"
GHCR_IMAGE="${GHCR_IMAGE:-ghcr.io/z-ey3eiei/platform-ai-sdk-pro-web}"
GHCR_TAG="${GHCR_TAG:-coolify-staging}"

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
LOCAL_TAG="ai-sdk-pro-web:${SHORT_SHA}"
export APP_IMAGE="$LOCAL_TAG"

avail_mib=0
if [[ -r /proc/meminfo ]]; then
  avail_mib=$(( $(awk '/MemAvailable:/ {print $2}' /proc/meminfo) / 1024 ))
fi

mode="$BUILD_MODE"
if [[ "$mode" == auto ]]; then
  if [[ "$avail_mib" -ge 2200 ]]; then
    mode=build
  else
    mode=pull
    log "MemAvailable=${avail_mib} MiB < 2200 — using pull mode (set BUILD_MODE=build to override)"
  fi
fi

case "$mode" in
  build)
    log "Building image $APP_IMAGE (needs ~3–6 GiB peak RAM — add swap if OOM)"
    cd "$CURRENT"
    DOCKER_BUILDKIT=1 docker build -f Dockerfile -t "$APP_IMAGE" .
    ;;
  pull)
    export APP_IMAGE="${GHCR_IMAGE}:${GHCR_TAG}"
    log "Pulling $APP_IMAGE (low-RAM path)"
    docker pull "$APP_IMAGE" || die "pull failed — run: echo \$GHCR_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin"
    docker tag "$APP_IMAGE" "$LOCAL_TAG" 2>/dev/null || true
    ;;
  skip)
    log "BUILD_MODE=skip — using APP_IMAGE=${APP_IMAGE:?set APP_IMAGE}"
    ;;
  *)
    die "unknown BUILD_MODE=$BUILD_MODE"
    ;;
esac

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

log "Neon migrations (host needs node_modules from npm ci — run once after first clone)"
if grep -q '^NEON_DATABASE_URL=.\+' "$CONFIG_ENV" 2>/dev/null && [[ -d "$CURRENT/node_modules" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_ENV"
  set +a
  (cd "$CURRENT" && npm run platform:migrate --workspace=apps/web) \
    || log "migration may already be applied — see output above"
else
  log "skip migrate (no NEON_DATABASE_URL or no node_modules — run: cd $CURRENT && npm ci && npm run platform:migrate --workspace=apps/web)"
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