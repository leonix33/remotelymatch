#!/usr/bin/env node
/**
 * Post-deploy refresh: re-save resume (sanitize/repair) and re-generate tailored kits.
 *
 * Usage:
 *   APP_URL=https://remotelymatch.app \
 *   ADMIN_EMAIL=you@example.com \
 *   ADMIN_PASSWORD=secret \
 *   node scripts/post-deploy-refresh.js
 *
 * Optional:
 *   MAX_KITS=10          — cap kit regeneration (default 10)
 *   RESUME_TEXT_FILE=path — override resume from file instead of profile
 */

const fs = require('fs');
const path = require('path');

// Load backend/.env when vars not set (never log secrets).
const envPath = path.join(__dirname, '../backend/.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const APP_URL = (process.env.APP_URL || 'https://remotelymatch.app').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || process.env.EMAIL || '';
const PASSWORD = process.env.ADMIN_PASSWORD || process.env.PASSWORD || '';
const MAX_KITS = Math.max(1, Math.min(50, Number(process.env.MAX_KITS) || 10));

async function api(method, route, token, body) {
  const res = await fetch(`${APP_URL}/api${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const err = new Error(data.message || `HTTP ${res.status} ${route}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function bulletSample(text = '', max = 120) {
  const line = String(text)
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('-') && l.length > 40);
  if (!line) return '(no bullets found)';
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (or EMAIL/PASSWORD) in the environment.');
    process.exit(1);
  }

  console.log(`→ ${APP_URL}`);
  const { accessToken } = await api('POST', '/auth/login', null, {
    email: EMAIL,
    password: PASSWORD,
  });
  console.log('✓ Signed in');

  const profile = await api('GET', '/profile/me', accessToken);
  let resumeText = String(profile.resumeText || '').trim();

  if (process.env.RESUME_TEXT_FILE) {
    resumeText = fs.readFileSync(path.resolve(process.env.RESUME_TEXT_FILE), 'utf8').trim();
    console.log(`✓ Loaded resume from ${process.env.RESUME_TEXT_FILE}`);
  }

  if (!resumeText || resumeText.length < 100) {
    console.error('No resume text on profile. Paste/upload resume in the app first, or set RESUME_TEXT_FILE.');
    process.exit(1);
  }

  const beforeLen = resumeText.length;
  await api('PATCH', '/profile/me', accessToken, { resumeText });
  const refreshed = await api('GET', '/profile/me', accessToken);
  const afterLen = String(refreshed.resumeText || '').length;
  console.log(`✓ Resume re-saved (${beforeLen} → ${afterLen} chars, sanitize pass applied)`);

  let kits = [];
  try {
    kits = await api('GET', '/applications/kits', accessToken);
  } catch {
    kits = [];
  }
  if (!Array.isArray(kits)) kits = [];

  let approvals = [];
  try {
    const pending = await api('GET', '/approvals?status=pending', accessToken);
    approvals = pending?.items || pending?.approvals || [];
  } catch {
    approvals = [];
  }

  const jobIds = [];
  const seen = new Set();
  for (const k of kits) {
    if (k?.jobId && !seen.has(k.jobId)) {
      seen.add(k.jobId);
      jobIds.push({ jobId: k.jobId, title: k.jobTitle, company: k.company, matchPct: k.estimatedMatchPct });
    }
  }
  for (const a of approvals) {
    if (a?.jobId && !seen.has(a.jobId)) {
      seen.add(a.jobId);
      jobIds.push({ jobId: a.jobId, title: a.title, company: a.company, matchPct: a.matchPct });
    }
  }

  jobIds.sort((a, b) => (b.matchPct ?? 0) - (a.matchPct ?? 0));
  const targets = jobIds.slice(0, MAX_KITS);

  if (!targets.length) {
    console.log('No kits or queued jobs found — nothing to re-tailor.');
    console.log('Open My Queue, queue jobs, then run this again.');
    return;
  }

  console.log(`→ Re-generating ${targets.length} tailored kit(s) (max ${MAX_KITS})…`);

  const profileOpts = refreshed.profile || refreshed;
  const supplementPages = profileOpts.defaultSupplementPages || 6;
  const tailorMode = profileOpts.defaultTailorMode || 'high_match';

  let ok = 0;
  let fail = 0;
  for (const job of targets) {
    const label = `${job.title || 'Role'} @ ${job.company || '?'}`;
    try {
      const kit = await api('POST', `/applications/kit/${encodeURIComponent(job.jobId)}/generate`, accessToken, {
        tailorResume: true,
        force: true,
        supplementPages,
        tailorMode,
        highMatchTarget: 100,
      });
      ok += 1;
      const sample = bulletSample(kit.tailoredResumeText || kit.fullSupplementText || '');
      const ats = kit.atsScore != null ? `ATS ${kit.atsScore}%` : 'ATS —';
      const fit = kit.jdMatchPct != null ? `fit ${kit.jdMatchPct}%` : '';
      console.log(`  ✓ ${label} · ${ats}${fit ? ` · ${fit}` : ''}`);
      console.log(`    ${sample}`);
    } catch (e) {
      fail += 1;
      console.log(`  ✗ ${label}: ${e.message}`);
    }
  }

  console.log('');
  console.log(`Done: ${ok} regenerated, ${fail} failed.`);
  console.log(`Preview: ${APP_URL} → Save done · open My Queue → tap Preview on any kit.`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
