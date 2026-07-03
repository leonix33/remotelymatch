#!/usr/bin/env node
/**
 * Local preflight — run before pushing to production.
 * Usage:
 *   npm run dev          (in another terminal, leave open)
 *   npm run local:check
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, 'backend/.env');
const APP_URL = process.env.APP_URL || 'http://localhost:5100';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function ok(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, hint = '') {
  console.log(`  ✗ ${label}${hint ? ` — ${hint}` : ''}`);
  return false;
}

async function fetchStatus(url) {
  try {
    const res = await fetch(url);
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function main() {
  let pass = true;
  console.log('Local preflight\n');

  const pkgPath = path.join(ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.log('  ✗ Wrong folder — cd to the remotelymatch app:');
    console.log('      cd /Users/user/job-event-agent/remotelymatch');
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.name !== 'remotelymatch') {
    console.log('  ✗ This is not the remotelymatch app folder.');
    console.log('      cd /Users/user/job-event-agent/remotelymatch');
    process.exit(1);
  }

  // Mongo
  try {
    execSync('docker ps --filter name=remotelymatch-mongo --format "{{.Status}}"', {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const status = execSync('docker ps --filter name=remotelymatch-mongo --format "{{.Status}}"', {
      encoding: 'utf8',
    }).trim();
    if (status.includes('Up')) ok(`MongoDB (${status.split('(')[0].trim()})`);
    else {
      pass = fail('MongoDB not running', 'run: npm run mongo:up');
    }
  } catch {
    pass = fail('Docker / MongoDB', 'run: npm run mongo:up');
  }

  const env = loadEnv();
  const email = env.ADMIN_EMAIL || 'admin@example.com';
  const password = env.ADMIN_PASSWORD || '';

  const health = await fetchStatus(`${APP_URL}/api/health`);
  if (health.ok) {
    ok(`Backend ${APP_URL}/api/health`);
  } else {
    pass = fail('Backend not running', 'run: npm run dev (keep Terminal open — do not close)');
  }

  const fe = await fetchStatus(FRONTEND_URL);
  if (fe.ok) {
    ok(`Frontend ${FRONTEND_URL}`);
  } else {
    pass = fail('Frontend not running', 'run: npm run dev');
  }

  if (health.ok && password) {
    try {
      const res = await fetch(`${APP_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.accessToken) ok(`Login as ${email}`);
      else pass = fail('Login failed', data.message || 'check ADMIN_EMAIL/PASSWORD in backend/.env');
    } catch (e) {
      pass = fail('Login request failed', e.message);
    }
  }

  if (env.OPENAI_API_KEY) {
    ok('OpenAI key set — full tailoring works locally');
  } else {
    console.log('  ○ OpenAI key not set — tailoring uses demo mode (layout still testable)');
    console.log('    Add OPENAI_API_KEY to backend/.env for real kit generation');
  }

  console.log('');
  if (pass) {
    console.log('Ready to test locally:');
    console.log(`  → ${FRONTEND_URL}`);
    console.log(`  → Login: ${email} / (ADMIN_PASSWORD in backend/.env)`);
    console.log('');
    console.log('Before pushing: npm run preflight');
  } else {
    console.log('Fix the items above, then re-run: npm run local:check');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
