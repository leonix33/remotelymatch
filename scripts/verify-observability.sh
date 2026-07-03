#!/usr/bin/env bash
# Verify production observability: health, MongoDB, and admin dashboard API.
#
# Usage:
#   ./scripts/verify-observability.sh
#
# With admin login (tests /api/admin/observability):
#   ADMIN_EMAIL='admin@example.com' \
#   ADMIN_PASSWORD='your-password' \
#   ./scripts/verify-observability.sh
#
# Optional:
#   APP_URL=https://remotelymatch.app

set -euo pipefail

APP_URL="${APP_URL:-https://remotelymatch.app}"
FAIL=0

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAIL=1; }
info() { echo "  · $1"; }

echo "=============================================="
echo " Observability verification — ${APP_URL}"
echo "=============================================="
echo ""

echo "1) Health check"
HEALTH=$(curl -sf "${APP_URL}/api/health" 2>/dev/null || echo '{}')
node -e "
const h = JSON.parse(process.argv[1]);
const ok = (label, cond) => console.log(cond ? 'PASS ' + label : 'FAIL ' + label);
ok('ok', h.ok === true);
ok('mongoConfigured', h.mongoConfigured === true);
ok('mongoConnected', h.mongoConnected === true);
ok('adminConfigured', h.adminConfigured === true);
if (h.secretsProvider) console.log('INFO secretsProvider=' + h.secretsProvider);
process.exit(
  h.ok && h.mongoConfigured && h.mongoConnected && h.adminConfigured ? 0 : 1
);
" "$HEALTH" && pass "Health checks passed" || fail "Health checks failed — MongoDB or admin not ready"

echo ""
echo "2) Observability API (unauthenticated → expect 401)"
OBS_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "${APP_URL}/api/admin/observability" || echo "000")
if [[ "$OBS_CODE" == "401" ]]; then
  pass "GET /api/admin/observability returns 401 without auth"
else
  fail "Expected 401, got HTTP ${OBS_CODE}"
fi

if [[ -n "${ADMIN_EMAIL:-}" && -n "${ADMIN_PASSWORD:-}" ]]; then
  echo ""
  echo "3) Admin login + dashboard"
  LOGIN_JSON=$(curl -sf -X POST "${APP_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$(node -e "console.log(JSON.stringify({email:process.argv[1],password:process.argv[2]}))" "$ADMIN_EMAIL" "$ADMIN_PASSWORD")" \
    2>/dev/null || echo '{}')

  TOKEN=$(node -e "
const j = JSON.parse(process.argv[1]);
if (!j.accessToken) process.exit(1);
console.log(j.accessToken);
" "$LOGIN_JSON" 2>/dev/null || true)

  if [[ -z "${TOKEN:-}" ]]; then
    fail "Admin login failed — check ADMIN_EMAIL / ADMIN_PASSWORD"
  else
    pass "Admin login succeeded"
    DASH=$(curl -sf "${APP_URL}/api/admin/observability?days=7&limit=10" \
      -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo '{}')

    node -e "
const d = JSON.parse(process.argv[1]);
const ok = (label, cond) => { if (!cond) { console.error('FAIL ' + label); process.exit(1); } console.log('PASS ' + label); };
ok('mongoRequired false', d.mongoRequired === false);
ok('summary present', d.summary && typeof d.summary.totalUsers === 'number');
ok('users array', Array.isArray(d.users));
ok('loginEvents array', Array.isArray(d.loginEvents));
ok('activityFeed array', Array.isArray(d.activityFeed));
console.log('INFO totalUsers=' + d.summary.totalUsers + ' loginsToday=' + d.summary.loginsToday);
" "$DASH" && pass "Observability dashboard API OK" || fail "Dashboard response invalid"
  fi
else
  echo ""
  echo "3) Admin dashboard — skipped"
  info "Set ADMIN_EMAIL + ADMIN_PASSWORD to test authenticated dashboard"
fi

echo ""
echo "4) Who tab UI"
WHO_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "${APP_URL}/monitor/who" || echo "000")
if [[ "$WHO_CODE" == "200" ]]; then
  pass "GET /monitor/who returns 200"
else
  fail "Who tab HTTP ${WHO_CODE}"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "All observability checks passed."
  echo "Open: ${APP_URL}/monitor/who (admin login required)"
  exit 0
fi

echo "Some checks failed. Fix MongoDB/admin config or wait for deploy to finish."
exit 1
