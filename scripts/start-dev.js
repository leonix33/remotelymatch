#!/usr/bin/env node
/**
 * Start backend first, wait for /api/health, then frontend.
 * Avoids Vite ECONNREFUSED proxy errors when the API is still booting.
 */
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HEALTH_URL = process.env.DEV_HEALTH_URL || 'http://localhost:5100/api/health';

function runDev(name, cwd) {
  const child = spawn('npm', ['run', 'dev'], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  child.on('error', (err) => {
    console.error(`[${name}] failed to start:`, err.message);
    process.exit(1);
  });
  return child;
}

async function waitForBackend(maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return true;
    } catch {
      /* backend still starting */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const backend = runDev('backend', path.join(ROOT, 'backend'));
let frontend = null;

function shutdown() {
  if (frontend) frontend.kill('SIGTERM');
  backend.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

waitForBackend().then((ok) => {
  if (!ok) {
    console.warn('\n⚠ Backend health check timed out — starting frontend anyway\n');
  } else {
    console.log('\n✓ Backend ready at', HEALTH_URL, '— starting frontend\n');
  }
  frontend = runDev('frontend', path.join(ROOT, 'frontend'));
  frontend.on('exit', (code) => {
    if (code && code !== 0) {
      backend.kill('SIGTERM');
      process.exit(code);
    }
  });
});

backend.on('exit', (code) => {
  if (code && code !== 0) {
    if (frontend) frontend.kill('SIGTERM');
    process.exit(code);
  }
});
