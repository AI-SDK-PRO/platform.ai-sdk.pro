#!/usr/bin/env bash
# For Cursor Cloud Agent ONLY when VPS_SSH_* or SSH_* env vars are injected.
# Never log secret values.
set -euo pipefail

HOST="${VPS_SSH_HOST:-${SSH_HOST:-}}"
USER="${VPS_SSH_USER:-${SSH_USER:-deploy}}"
KEY="${VPS_SSH_PRIVATE_KEY:-${SSH_KEY:-}}"
PORT="${VPS_SSH_PORT:-22}"

if [[ -z "$HOST" || -z "$USER" || -z "$KEY" ]]; then
  echo "secrets_missing: set VPS_SSH_HOST, VPS_SSH_USER, VPS_SSH_PRIVATE_KEY in Cloud Agent Environment, then restart agent." >&2
  exit 2
fi

KEY_FILE="$(mktemp)"
trap 'rm -f "$KEY_FILE"' EXIT
umask 077
printf '%s\n' "$KEY" >"$KEY_FILE"

SSH_OPTS=(
  -i "$KEY_FILE"
  -p "$PORT"
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=25
)

echo "Probing SSH to ${USER}@${HOST}:${PORT}..."
ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" 'set -e; free -h; docker ps --format "{{.Names}}" | head -10'

REMOTE='set -e
cd /opt/ai-sdk-pro/current 2>/dev/null || cd /opt/ai-sdk-pro
git pull origin main
BUILD_MODE=pull ./scripts/vps-update-release.sh'

ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" "bash -s" <<<"$REMOTE"
echo "Remote deploy command finished."