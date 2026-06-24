const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const DEFAULT = {
  displayName: '',
  headline: '',
  bio: '',
  linkedin: '',
  github: '',
  portfolio: '',
  targetTitles: [],
  mustHaveSkills: [],
  niceToHaveSkills: [],
  targetCompanies: [],
  resumeText: '',
  minMatchScore: 60,
  onboardingComplete: false,
  extractedSkills: [],
  resumeFileName: '',
  savedJobs: [],
  linkedinSavedSearches: [],
};

function storePath() {
  const dir = path.join(env.agentHome, 'items');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'user-profiles.json');
}

function readAll() {
  const p = storePath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2));
}

function get(userId) {
  return { ...DEFAULT, userId: userId.toString(), ...readAll()[userId.toString()] };
}

function save(userId, data) {
  const key = userId.toString();
  const all = readAll();
  all[key] = { ...all[key], ...data, userId: key, updatedAt: new Date().toISOString() };
  writeAll(all);
  return all[key];
}

module.exports = { get, save };
