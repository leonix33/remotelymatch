#!/usr/bin/env bash
# Smoke-test Hunter.io + Apollo API keys (loads backend/.env if present).
#
# Usage:
#   ./scripts/test-recruiter-keys.sh
#   HUNTER_API_KEY='...' APOLLO_API_KEY='...' ./scripts/test-recruiter-keys.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/backend/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(HUNTER_API_KEY|APOLLO_API_KEY)=' "$ENV_FILE" | sed 's/^/export /')
  set +a
fi

node <<'NODE'
const hunterKey = process.env.HUNTER_API_KEY || '';
const apolloKey = process.env.APOLLO_API_KEY || '';

async function testHunter() {
  if (!hunterKey) {
    console.log('Hunter: SKIP (no HUNTER_API_KEY)');
    return;
  }
  const url = `https://api.hunter.io/v2/domain-search?domain=stripe.com&api_key=${encodeURIComponent(hunterKey)}&limit=1`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log('Hunter: FAIL', body.errors?.[0]?.details || body.error || res.status);
    return;
  }
  const count = body.data?.emails?.length || 0;
  console.log(`Hunter: OK (${count} email(s) for stripe.com test)`);
}

async function testApollo() {
  if (!apolloKey) {
    console.log('Apollo: SKIP (no APOLLO_API_KEY)');
    return;
  }
  const res = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Accept: 'application/json',
      'X-Api-Key': apolloKey,
    },
    body: JSON.stringify({
      q_organization_name: 'Stripe',
      q_organization_domains_list: ['stripe.com'],
      person_titles: ['recruiter'],
      include_similar_titles: true,
      page: 1,
      per_page: 1,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log('Apollo: FAIL', body.error || body.message || res.status);
    return;
  }
  const count = body.people?.length || 0;
  console.log(`Apollo: OK (${count} person(s) for Stripe recruiter test)`);
}

(async () => {
  await testHunter();
  await testApollo();
})();
NODE
