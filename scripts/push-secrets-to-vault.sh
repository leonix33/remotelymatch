#!/usr/bin/env bash
# Push app secrets from environment variables into HashiCorp Vault KV v2.
#
# Usage (from a machine with vault CLI or curl):
#   export VAULT_ADDR='https://vault.example.com'
#   export VAULT_TOKEN='hvs....'
#   export MONGODB_URI='mongodb+srv://...'
#   export OPENAI_API_KEY='sk-...'
#   # ... other keys ...
#   ./scripts/push-secrets-to-vault.sh
#
# Or load from backend/.env:
#   set -a && source backend/.env && set +a && ./scripts/push-secrets-to-vault.sh

set -euo pipefail

VAULT_MOUNT="${VAULT_MOUNT:-secret}"
VAULT_SECRET_PATH="${VAULT_SECRET_PATH:-remotelymatch}"

KEYS=(
  MONGODB_URI
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  ADMIN_EMAIL
  ADMIN_PASSWORD
  OPENAI_API_KEY
  OPENAI_MODEL
  RESEND_API_KEY
  GMAIL_SMTP_USER
  GMAIL_SMTP_PASS
  HUNTER_API_KEY
  APOLLO_API_KEY
  ADZUNA_APP_ID
  ADZUNA_APP_KEY
  VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY
  VAPID_SUBJECT
)

if [[ -z "${VAULT_ADDR:-}" || -z "${VAULT_TOKEN:-}" ]]; then
  echo "Error: VAULT_ADDR and VAULT_TOKEN are required"
  exit 1
fi

ADDR="${VAULT_ADDR%/}"
PAYLOAD=$(node -e "
const keys = process.argv.slice(1);
const data = {};
for (const key of keys) {
  const value = String(process.env[key] || '').trim();
  if (value) data[key] = value;
}
if (!Object.keys(data).length) {
  console.error('No secret values found in environment. Export keys or source backend/.env');
  process.exit(1);
}
console.log(JSON.stringify({ data }));
" "${KEYS[@]}")

echo "Writing ${#KEYS[@]} possible keys to ${VAULT_MOUNT}/data/${VAULT_SECRET_PATH}..."

HTTP_CODE=$(curl -sS -o /tmp/vault-push-response.json -w "%{http_code}" \
  -X POST \
  -H "X-Vault-Token: ${VAULT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "${ADDR}/v1/${VAULT_MOUNT}/data/${VAULT_SECRET_PATH}")

if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "204" ]]; then
  echo "Vault write failed (HTTP $HTTP_CODE):"
  cat /tmp/vault-push-response.json
  exit 1
fi

echo "Secrets stored in Vault at ${VAULT_SECRET_PATH}"
node -e "
const keys = process.argv.slice(1);
const stored = keys.filter((k) => String(process.env[k] || '').trim());
console.log('  Keys written:', stored.length ? stored.join(', ') : '(none — check env)');
" "${KEYS[@]}"
