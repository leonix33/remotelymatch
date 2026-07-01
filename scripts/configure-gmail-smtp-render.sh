#!/usr/bin/env bash
# Configure Gmail SMTP on Render for reliable apply-summary & invite delivery.
#
# Why Gmail SMTP?
#   Resend works but iCloud/Yahoo often land in Junk. Gmail Workspace SMTP
#   (team@remotelymatch.app) delivers better to personal inboxes.
#
# Prerequisites:
#   1. Google Workspace mailbox: team@remotelymatch.app
#   2. App Password: https://myaccount.google.com/apppasswords
#      (2-Step Verification must be ON)
#
# Usage (Render dashboard — recommended):
#   Render → remotematch → Environment → Add:
#     GMAIL_SMTP_USER = team@remotelymatch.app
#     GMAIL_SMTP_PASS = xxxx xxxx xxxx xxxx   (16-char app password, no spaces)
#     EMAIL_FROM      = remotelymatch <team@remotelymatch.app>
#   Then Manual Deploy → Deploy latest commit
#
# Usage (Render API — optional):
#   GMAIL_SMTP_USER='team@remotelymatch.app' \
#   GMAIL_SMTP_PASS='yourapppassword' \
#   RENDER_API_KEY='rnd_...' \
#   ./scripts/configure-gmail-smtp-render.sh
#
# Upgrade to Starter (eliminates 30–60s cold starts):
#   Render → remotematch → Settings → Instance type → Starter ($7/mo)
#   Or: plan: starter in render.yaml (requires paid Render account)

set -euo pipefail

RENDER_SERVICE_NAME="${RENDER_SERVICE_NAME:-remotematch}"
GMAIL_SMTP_USER="${GMAIL_SMTP_USER:-team@remotelymatch.app}"
EMAIL_FROM="${EMAIL_FROM:-remotelymatch <team@remotelymatch.app>}"
TEST_TO="${TEST_TO:-leonix23@gmail.com}"
APP_URL="${APP_URL:-https://remotelymatch.app}"

echo "=== remotelymatch — Gmail SMTP + Render setup ==="
echo ""
echo "1. RENDER STARTER (recommended)"
echo "   Dashboard → $RENDER_SERVICE_NAME → Settings → Instance type → Starter"
echo "   Removes cold starts (~30–60s) after idle."
echo ""
echo "2. GMAIL APP PASSWORD"
echo "   https://myaccount.google.com/apppasswords"
echo "   Create app: Mail → Other → remotelymatch"
echo "   Copy the 16-character password (remove spaces when pasting)."
echo ""

if [[ -z "${GMAIL_SMTP_PASS:-}" ]]; then
  echo "Paste Gmail App Password for $GMAIL_SMTP_USER (input hidden):"
  read -rs GMAIL_SMTP_PASS
  echo ""
fi

if [[ -z "$GMAIL_SMTP_PASS" ]]; then
  echo "Error: GMAIL_SMTP_PASS is required"
  exit 1
fi

# Strip spaces from app password
GMAIL_SMTP_PASS="${GMAIL_SMTP_PASS// /}"

if [[ -n "${RENDER_API_KEY:-}" ]]; then
  echo "Updating Render env vars via API..."
  SERVICE_ID=$(curl -sS -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services?limit=50" | node -e "
const data = JSON.parse(require('fs').readFileSync(0,'utf8'));
const svc = (Array.isArray(data) ? data : []).find((s) => s.service?.name === process.argv[1]);
if (!svc) process.exit(1);
console.log(svc.service.id);
" "$RENDER_SERVICE_NAME" 2>/dev/null || true)

  if [[ -z "${SERVICE_ID:-}" ]]; then
    echo "Could not find Render service '$RENDER_SERVICE_NAME'. Set vars manually in dashboard."
  else
    set_render_var() {
      local key="$1"
      local value="$2"
      curl -sS -X PUT "https://api.render.com/v1/services/${SERVICE_ID}/env-vars/${key}" \
        -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"value\":$(node -e "console.log(JSON.stringify(process.argv[1]))" "$value")}" > /dev/null
      echo "  ✓ $key"
    }
    set_render_var GMAIL_SMTP_USER "$GMAIL_SMTP_USER"
    set_render_var GMAIL_SMTP_PASS "$GMAIL_SMTP_PASS"
    set_render_var EMAIL_FROM "$EMAIL_FROM"

    curl -sS -X POST "https://api.render.com/v1/services/${SERVICE_ID}/deploys" \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{}' > /dev/null
    echo "Redeploy triggered."
  fi
else
  echo "3. RENDER ENV VARS (dashboard)"
  echo "   GMAIL_SMTP_USER = $GMAIL_SMTP_USER"
  echo "   GMAIL_SMTP_PASS = (your app password)"
  echo "   EMAIL_FROM      = $EMAIL_FROM"
  echo "   Then Manual Deploy."
fi

echo ""
echo "4. VERIFY AFTER DEPLOY (~2 min)"
echo "   curl -s $APP_URL/api/health | node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('gmailSmtp:', j.emailDiagnostics?.gmailSmtpConfigured);console.log('emailReady:', j.emailDeliveryReady);})\""
echo ""
echo "5. SEND TEST EMAIL (logged in as admin)"
echo "   Profile → Users → Send test email → $TEST_TO"
echo ""
echo "6. APPLY SUMMARY EMAILS"
echo "   Profile → Email & follow-ups:"
echo "   - Personal email: $TEST_TO (auto-filled from login if empty)"
echo "   - Enable: Email me when I apply"
echo "   Apply to 1 job → check inbox for traction summary."
