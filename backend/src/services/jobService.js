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
  const hasCompany = db
    .prepare("SELECT 1 FROM pragma_table_info('applications') WHERE name = 'company'")
    .get();
  const companySelect = hasCompany ? 'company' : "'' AS company";
  const rows = db
    .prepare(
      `SELECT job_id, title, ${companySelect}, source, tier, job_url, apply_url, status, notes,
              filled_fields, attempts, last_attempted, submitted_at
       FROM applications ORDER BY last_attempted DESC LIMIT ?`
    )
    .all(limit);
  db.close();

  const jobsById = new Map(readJobsFromSqlite(limit).map((job) => [job.jobId, job]));
  return rows.map((row) => {
    const seen = jobsById.get(row.job_id);
    return {
      jobId: row.job_id,
      title: row.title,
      company: row.company || seen?.company || 'Unknown',
      source: row.source || seen?.source || 'Unknown',
      tier: row.tier,
      jobUrl: row.job_url,
      applyUrl: row.apply_url,
      status: row.status,
      notes: row.notes,
      filledFields: row.filled_fields || 0,
      attempts: row.attempts || 0,
      lastAttempted: row.last_attempted,
      submittedAt: row.submitted_at,
    };
  });
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

function jobToApplyItem(job) {
  return {
    id: job.jobId,
    title: job.title,
    company: job.company,
    location: job.location || 'Remote',
    url: job.url,
    source: job.source,
    score: job.score || 50,
    tier: job.tier || 'SECONDARY',
    match_pct: job.personalMatchPct || job.matchPct || 0,
    ats_type: job.atsType || detectAts(job.url),
    email_section: job.emailSection || 'strong_review',
  };
}

function writeApprovedItemsFile(jobs) {
  const itemsDir = path.join(env.agentHome, 'items');
  if (!fs.existsSync(itemsDir)) fs.mkdirSync(itemsDir, { recursive: true });
  const ts = Date.now();
  const file = path.join(itemsDir, `approved-${ts}.json`);
  const items = jobs.map(jobToApplyItem);
  fs.writeFileSync(file, JSON.stringify(items, null, 2));
  fs.writeFileSync(
    path.join(env.agentHome, 'approved_jobs.json'),
    JSON.stringify({ jobIds: jobs.map((j) => j.jobId), itemsFile: file, createdAt: new Date().toISOString() }, null, 2)
  );
  return file;
}

function runApprovedAutoApply(itemsFile) {
  return new Promise((resolve, reject) => {
    const script = path.join(env.agentHome, 'apply_approved.sh');
    const autoApplyPy = path.join(env.agentHome, 'auto_apply.py');
    let cmd;
    let args;

    if (fs.existsSync(script)) {
      cmd = '/bin/bash';
      args = [script, itemsFile];
    } else if (fs.existsSync(autoApplyPy)) {
      cmd = 'python3';
      args = [
        autoApplyPy,
        '--headless',
        '--items-file',
        itemsFile,
        '--tiers',
        'DATABRICKS_PRIORITY,PRIMARY,SECONDARY',
      ];
    } else {
      return reject(
        new Error(
          'Python agent not on this server. Approved jobs saved to approved_jobs.json — run apply from your Mac with AGENT_HOME set.'
        )
      );
    }

    const child = spawn(cmd, args, {
      cwd: env.agentHome,
      env: { ...process.env, AGENT_HOME: env.agentHome },
    });
    let output = '';
    child.stdout.on('data', (c) => { output += c.toString(); });
    child.stderr.on('data', (c) => { output += c.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `Apply exited with code ${code}`));
    });
  });
}

function runAgentScript({ autoApply = false } = {}) {
  return new Promise((resolve, reject) => {
    const script = path.join(env.agentHome, 'run_search_and_apply.sh');
    if (!fs.existsSync(script)) {
      return reject(new Error(`Agent script not found: ${script}`));
    }
    const child = spawn('/bin/bash', [script], {
      cwd: env.agentHome,
      env: { ...process.env, AGENT_HOME: env.agentHome, AUTO_APPLY: autoApply ? '1' : '0' },
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
  writeApprovedItemsFile,
  runApprovedAutoApply,
  jobToApplyItem,
};
