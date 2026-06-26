#!/usr/bin/env bash
# Set OpenAI + Adzuna keys on Render production.
#
# Usage:
#   OPENAI_API_KEY='sk-...' ADZUNA_APP_ID='...' ADZUNA_APP_KEY='...' RENDER_API_KEY='rnd_...' ./scripts/configure-production-keys.sh

set -euo pipefail

RENDER_SERVICE_NAME="${RENDER_SERVICE_NAME:-remotematch}"

upsert_render_env() {
  local service_id="$1"
  local key="$2"
  local value="$3"
  curl -sf -X PUT \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"value\":$(node -e "console.log(JSON.stringify(process.argv[1]))" "$value")}" \
    "https://api.render.com/v1/services/${service_id}/env-vars/${key}" > /dev/null
}

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo "Error: RENDER_API_KEY is required (Render → Account Settings → API Keys)"
  exit 1
fi

if [[ -z "${OPENAI_API_KEY:-}" && -z "${ADZUNA_APP_ID:-}" ]]; then
  echo "Set at least one of: OPENAI_API_KEY, ADZUNA_APP_ID + ADZUNA_APP_KEY"
  exit 1
fi

SERVICE_ID=$(curl -sf -H "Authorization: Bearer ${RENDER_API_KEY}" \
  "https://api.render.com/v1/services?limit=50" | node -e "
const data = JSON.parse(require('fs').readFileSync(0,'utf8'));
const svc = (Array.isArray(data) ? data : []).find((s) => s.service?.name === process.argv[1]);
if (!svc) process.exit(1);
console.log(svc.service.id);
" "$RENDER_SERVICE_NAME")

echo "Updating Render service ${RENDER_SERVICE_NAME} (${SERVICE_ID})..."

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  upsert_render_env "$SERVICE_ID" "OPENAI_API_KEY" "$OPENAI_API_KEY"
  echo "  OPENAI_API_KEY set"
fi

if [[ -n "${ADZUNA_APP_ID:-}" ]]; then
  upsert_render_env "$SERVICE_ID" "ADZUNA_APP_ID" "$ADZUNA_APP_ID"
  echo "  ADZUNA_APP_ID set"
fi

if [[ -n "${ADZUNA_APP_KEY:-}" ]]; then
  upsert_render_env "$SERVICE_ID" "ADZUNA_APP_KEY" "$ADZUNA_APP_KEY"
  echo "  ADZUNA_APP_KEY set"
fi

if [[ -n "${ADZUNA_WHAT:-}" ]]; then
  upsert_render_env "$SERVICE_ID" "ADZUNA_WHAT" "$ADZUNA_WHAT"
fi

curl -sf -X POST \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://api.render.com/v1/services/${SERVICE_ID}/deploys" > /dev/null || true

echo "Deploy triggered. Check https://remotelymatch.app/api/health in ~2 minutes."
