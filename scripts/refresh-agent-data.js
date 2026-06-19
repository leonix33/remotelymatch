#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const agentHome = process.env.AGENT_HOME || '/Users/user/job-event-agent';
const targetDir = path.join(__dirname, '../agent-data');

const files = ['seen_jobs.db', 'application_tracker.db'];

fs.mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  const source = path.join(agentHome, file);
  const dest = path.join(targetDir, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing source file: ${source}`);
  }
  fs.copyFileSync(source, dest);
  console.log(`Copied ${source} -> ${dest}`);
}

console.log('Agent data snapshot refreshed.');
