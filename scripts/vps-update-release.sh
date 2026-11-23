#!/usr/bin/env bash
# One-shot VPS update for platform.ai-sdk.pro monorepo (Nov 2026 unified release).
# Run as root or a user in the docker group, ON THE VPS after SSH.
set -euo pipefail

ROOT="${ROOT:-/opt/ai-sdk-pro}"
CURRENT="${CURRENT:-$ROOT/current}"
CONFIG_ENV="${CONFIG_ENV:-$ROOT/config/app.env}"
CADDYFILE="${CADDYFILE:-$ROOT/config/Caddyfile}"
COMPOSE="${COMPOSE:-$CURRENT/infra/production/docker-compose.yml}"
REPO_URL="${REPO_URL:-https://github.com/AI-SDK-PRO/platform.ai-sdk.pro.git}"
BRANCH="${BRANCH:-main}"
# BUILD_MODE: auto | build | pull | skip
#   auto  — build only if MemAvailable >= 2200 MiB (typical 4 GiB VPS)
#   pull  — use GHCR image (saves RAM; needs docker login ghcr.io once)
#   build — force local docker build (can OOM on 4 GiB without swap)
#   skip  — keep existing APP_IMAGE tag
BUILD_MODE="${BUILD_MODE:-auto}"
GHCR_IMAGE="${GHCR_IMAGE:-ghcr.io/ai-sdk-pro/platform-ai-sdk-pro-web}"
GHCR_TAG="${GHCR_TAG:-main}"

log() { printf '[vps-update] %s\n' "$*"; }
die() { printf '[vps-update] ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker not installed"
docker compose version >/dev/null 2>&1 || die "docker compose plugin not installed"
[[ -f "$CONFIG_ENV" ]] || die "missing $CONFIG_ENV — fill from .env.example first"

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

if [[ ! -f "$CADDYFILE" && -f "$CURRENT/infra/Caddyfile" ]]; then
  mkdir -p "$(dirname "$CADDYFILE")"
  cp "$CURRENT/infra/Caddyfile" "$CADDYFILE"
  log "Copied default Caddyfile to $CADDYFILE"
fi
[[ -f "$CADDYFILE" ]] || die "missing $CADDYFILE"
if [[ ! -f "$COMPOSE" && -f "$ROOT/infra/production/docker-compose.yml" ]]; then
  COMPOSE="$ROOT/infra/production/docker-compose.yml"
fi
[[ -f "$COMPOSE" ]] || die "missing compose file at $COMPOSE"

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

log "Supabase migrations (host needs node_modules from pnpm install, or run from a builder machine)"
if grep -q '^SUPABASE_DB_URL=.\+' "$CONFIG_ENV" 2>/dev/null && [[ -d "$CURRENT/node_modules" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_ENV"
  set +a
  (cd "$CURRENT" && npm run platform:migrate --workspace=apps/web) \
    || log "migration may already be applied — see output above"
else
  log "skip migrate (no SUPABASE_DB_URL or no node_modules — run: cd $CURRENT && corepack pnpm install --no-frozen-lockfile && npm run platform:migrate --workspace=apps/web)"
fi

PASS=0
FAIL=0
check_url() {
  local url=$1
  if curl -sf --max-time 20 "$url" >/dev/null; then
    log "OK $url"
    PASS=$((PASS + 1))
  else
    log "FAIL $url"
    FAIL=$((FAIL + 1))
  fi
}

check_url "https://platform.ai-sdk.pro/api/health"
check_url "https://ai-sdk.pro/api/health"
check_url "https://platform.ai-sdk.pro/api/ready"
check_url "https://platform.ai-sdk.pro/api/platform/status"
check_url "https://platform.ai-sdk.pro/login"
check_url "https://platform.ai-sdk.pro/signup"
check_url "https://platform.ai-sdk.pro/templates"
check_url "https://platform.ai-sdk.pro/api/templates/registry"

status_json="$(curl -sf --max-time 20 https://platform.ai-sdk.pro/api/platform/status || true)"
if printf '%s' "$status_json" | grep -q '"configured":true'; then
  log "OK platform status configured=true"
  PASS=$((PASS + 1))
else
  log "FAIL platform status not configured: $status_json"
  FAIL=$((FAIL + 1))
fi

login_html="$(curl -sf --max-time 20 https://platform.ai-sdk.pro/login || true)"
if [[ -n "$login_html" ]] && ! printf '%s' "$login_html" | grep -q 'role="alert"'; then
  log "OK /login clean initial render without alert banner"
  PASS=$((PASS + 1))
else
  log "FAIL /login rendered an initial alert or empty body"
  FAIL=$((FAIL + 1))
fi

unauth_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://platform.ai-sdk.pro/api/repositories || true)"
if [[ "$unauth_code" == "401" ]]; then
  log "OK /api/repositories fail-closed (HTTP 401)"
  PASS=$((PASS + 1))
else
  log "FAIL /api/repositories expected 401, got $unauth_code"
  FAIL=$((FAIL + 1))
fi

cross_origin_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{}' https://platform.ai-sdk.pro/api/auth/sign-in/email || true)"
if [[ "$cross_origin_code" == "403" ]]; then
  log "OK cross-site origin rejected (HTTP 403)"
  PASS=$((PASS + 1))
else
  log "FAIL cross-site origin expected 403, got $cross_origin_code"
  FAIL=$((FAIL + 1))
fi

log "--- smoke summary: $PASS passed, $FAIL failed ---"
docker compose -f "$COMPOSE" ps

if [[ "$PASS" -lt 4 || "$FAIL" -gt 0 ]]; then
  die "Public VPS verification failed ($FAIL failures) — inspect: docker compose -f $COMPOSE logs --tail=80 app caddy"
fi

log "Release ${SHORT_SHA} is up. Image tag: $APP_IMAGE"