const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const env = require('../config/env');
const Job = require('../models/Job');
const Application = require('../models/Application');

function sqlitePath(name) {
  return path.join(env.agentHome, name);
}

function readJobsFromSqlite(limit = 5000) {
  const dbFile = sqlitePath('seen_jobs.db');
  if (!fs.existsSync(dbFile)) return [];
  const db = new Database(dbFile, { readonly: true });
  const rows = db
    .prepare(
      `SELECT job_id, title, company, location, url, source, tier, score, match_pct, first_seen
       FROM seen_jobs ORDER BY COALESCE(match_pct, 0) DESC, score DESC LIMIT ?`
    )
    .all(limit);
  db.close();
  return rows.map((row) => ({
    jobId: row.job_id,
    title: row.title,
    company: row.company,
    location: row.location,
    url: row.url,
    source: row.source,
    tier: row.tier,
    score: row.score || 0,
    matchPct: row.match_pct || 0,
    firstSeen: row.first_seen,
    atsType: detectAts(row.url),
    emailSection: sectionFromMatch(row.match_pct, row.tier),
  }));
}

function readApplicationsFromSqlite(limit = 5000) {
  const dbFile = sqlitePath('application_tracker.db');
  if (!fs.existsSync(dbFile)) return [];
  const db = new Database(dbFile, { readonly: true });
  const rows = db
    .prepare(
      `SELECT job_id, title, source, tier, job_url, apply_url, status, notes,
              filled_fields, attempts, last_attempted, submitted_at
       FROM applications ORDER BY last_attempted DESC LIMIT ?`
    )
    .all(limit);
  db.close();
  return rows.map((row) => ({
    jobId: row.job_id,
    title: row.title,
    source: row.source,
    tier: row.tier,
    jobUrl: row.job_url,
    applyUrl: row.apply_url,
    status: row.status,
    notes: row.notes,
    filledFields: row.filled_fields || 0,
    attempts: row.attempts || 0,
    lastAttempted: row.last_attempted,
    submittedAt: row.submitted_at,
  }));
}

function detectAts(url = '') {
  const lower = url.toLowerCase();
  if (lower.includes('greenhouse.io')) return 'greenhouse';
  if (lower.includes('lever.co')) return 'lever';
  if (lower.includes('ashbyhq.com')) return 'ashby';
  return 'unknown';
}

function sectionFromMatch(matchPct, tier) {
  const match = Number(matchPct) || 0;
  if (match >= 80 && ['DATABRICKS_PRIORITY', 'PRIMARY', 'SECONDARY'].includes(tier)) return 'apply_today';
  if (match >= 60 && tier !== 'MANUAL_REVIEW') return 'strong_review';
  return 'manual_browse';
}

async function syncJobsToMongo() {
  const jobs = readJobsFromSqlite();
  if (!jobs.length) return 0;
  for (const job of jobs) {
    await Job.findOneAndUpdate({ jobId: job.jobId }, job, { upsert: true, new: true });
  }
  return jobs.length;
}

async function syncApplicationsToMongo() {
  const apps = readApplicationsFromSqlite();
  if (!apps.length) return 0;
  for (const app of apps) {
    await Application.findOneAndUpdate({ jobId: app.jobId }, app, { upsert: true, new: true });
  }
  return apps.length;
}

function listJobsFromSqlite(filters = {}) {
  let jobs = readJobsFromSqlite(5000);
  if (filters.section && filters.section !== 'all') {
    jobs = jobs.filter((j) => j.emailSection === filters.section);
  }
  if (filters.minMatch) {
    jobs = jobs.filter((j) => j.matchPct >= Number(filters.minMatch));
  }
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    jobs = jobs.filter((j) =>
      [j.title, j.company, j.location, j.source].join(' ').toLowerCase().includes(needle)
    );
  }
  return jobs;
}

function runAgentScript() {
  return new Promise((resolve, reject) => {
    const script = path.join(env.agentHome, 'run_search_and_apply.sh');
    if (!fs.existsSync(script)) {
      return reject(new Error(`Agent script not found: ${script}`));
    }
    const child = spawn('/bin/bash', [script], {
      cwd: env.agentHome,
      env: { ...process.env, AGENT_HOME: env.agentHome },
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `Agent exited with code ${code}`));
    });
  });
}

module.exports = {
  readJobsFromSqlite,
  readApplicationsFromSqlite,
  syncJobsToMongo,
  syncApplicationsToMongo,
  listJobsFromSqlite,
  runAgentScript,
};
