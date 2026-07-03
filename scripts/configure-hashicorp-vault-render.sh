#!/usr/bin/env bash
# Enable HashiCorp Vault as the secrets provider on Render production.
#
# Prerequisites:
#   1. Running Vault server (self-hosted, HCP, or local dev)
#   2. KV v2 secrets engine enabled at mount "secret" (default)
#   3. App secrets stored at secret/data/remotelymatch (see push-secrets-to-vault.sh)
#
# Usage:
#   VAULT_ADDR='https://vault.example.com' \
#   VAULT_TOKEN='hvs....' \
#   RENDER_API_KEY='rnd_...' \
#   ./scripts/configure-hashicorp-vault-render.sh
#
# Optional:
#   VAULT_MOUNT=secret
#   VAULT_SECRET_PATH=remotelymatch
#   RENDER_SERVICE_NAME=remotematch

set -euo pipefail

RENDER_SERVICE_NAME="${RENDER_SERVICE_NAME:-remotematch}"
VAULT_MOUNT="${VAULT_MOUNT:-secret}"
VAULT_SECRET_PATH="${VAULT_SECRET_PATH:-remotelymatch}"

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

if [[ -z "${VAULT_ADDR:-}" || -z "${VAULT_TOKEN:-}" ]]; then
  echo "Error: VAULT_ADDR and VAULT_TOKEN are required"
  echo ""
  echo "Example:"
  echo "  VAULT_ADDR='https://vault.example.com' \\"
  echo "  VAULT_TOKEN='hvs....' \\"
  echo "  RENDER_API_KEY='rnd_...' \\"
  echo "  ./scripts/configure-hashicorp-vault-render.sh"
  exit 1
fi

SERVICE_ID=$(curl -sf -H "Authorization: Bearer ${RENDER_API_KEY}" \
  "https://api.render.com/v1/services?limit=50" | node -e "
const data = JSON.parse(require('fs').readFileSync(0,'utf8'));
const svc = (Array.isArray(data) ? data : []).find((s) => s.service?.name === process.argv[1]);
if (!svc) process.exit(1);
console.log(svc.service.id);
" "$RENDER_SERVICE_NAME")

echo "Configuring HashiCorp Vault on Render service ${RENDER_SERVICE_NAME} (${SERVICE_ID})..."

upsert_render_env "$SERVICE_ID" "SECRETS_PROVIDER" "hashicorp-vault"
upsert_render_env "$SERVICE_ID" "VAULT_ADDR" "${VAULT_ADDR%/}"
upsert_render_env "$SERVICE_ID" "VAULT_TOKEN" "$VAULT_TOKEN"
upsert_render_env "$SERVICE_ID" "VAULT_MOUNT" "$VAULT_MOUNT"
upsert_render_env "$SERVICE_ID" "VAULT_SECRET_PATH" "$VAULT_SECRET_PATH"

curl -sf -X POST \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://api.render.com/v1/services/${SERVICE_ID}/deploys" > /dev/null || true

echo ""
echo "Vault env vars set on Render:"
echo "  SECRETS_PROVIDER=hashicorp-vault"
echo "  VAULT_ADDR=${VAULT_ADDR%/}"
echo "  VAULT_MOUNT=$VAULT_MOUNT"
echo "  VAULT_SECRET_PATH=$VAULT_SECRET_PATH"
echo ""
echo "Next: populate Vault with ./scripts/push-secrets-to-vault.sh"
echo "Deploy triggered. Check /api/health → secretsProvider after ~2 minutes."
