const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const ApplicationKit = require('../models/ApplicationKit');

function storePath() {
  const dir = path.join(env.agentHome, 'items');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'application-kits.json');
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
  try {
    fs.writeFileSync(storePath(), JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('applicationKitStore file write failed:', err.message);
  }
}

function fileGet(userId, jobId) {
  return readAll()[userId.toString()]?.[jobId] || null;
}

function fileSet(userId, jobId, kit) {
  const key = userId.toString();
  const all = readAll();
  if (!all[key]) all[key] = {};
  const prev = all[key][jobId] || {};
  all[key][jobId] = {
    ...prev,
    ...kit,
    jobId,
    useForApply: kit.useForApply !== undefined ? Boolean(kit.useForApply) : prev.useForApply !== false,
    updatedAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[key][jobId];
}

function fileListForUser(userId) {
  const rows = readAll()[userId.toString()] || {};
  return Object.values(rows)
    .filter((k) => k?.tailored)
    .sort((a, b) => new Date(b.generatedAt || b.updatedAt || 0) - new Date(a.generatedAt || a.updatedAt || 0));
}

function docToKit(doc) {
  if (!doc) return null;
  const data = doc.data && typeof doc.data === 'object' ? doc.data : {};
  return {
    ...data,
    jobId: doc.jobId || data.jobId,
    tailored: doc.tailored !== false && Boolean(data.tailored ?? doc.tailored),
  };
}

async function get(userId, jobId) {
  if (env.mongoUri) {
    const doc = await ApplicationKit.findOne({ userId, jobId }).lean();
    const kit = docToKit(doc);
    if (kit) return kit;
  }
  return fileGet(userId, jobId);
}

async function set(userId, jobId, kit) {
  const key = userId.toString();
  const prev = (await get(userId, jobId)) || {};
  const row = {
    ...prev,
    ...kit,
    jobId,
    useForApply: kit.useForApply !== undefined ? Boolean(kit.useForApply) : prev.useForApply !== false,
    updatedAt: new Date().toISOString(),
  };

  if (env.mongoUri) {
    await ApplicationKit.findOneAndUpdate(
      { userId, jobId },
      {
        userId,
        jobId,
        tailored: Boolean(row.tailored),
        data: row,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  return fileSet(key, jobId, row);
}

async function listForUser(userId) {
  if (env.mongoUri) {
    const docs = await ApplicationKit.find({ userId, tailored: true })
      .sort({ updatedAt: -1 })
      .lean();
    const kits = docs.map(docToKit).filter(Boolean);
    if (kits.length) return kits;
  }
  return fileListForUser(userId);
}

async function patchMeta(userId, jobId, meta) {
  const existing = await get(userId, jobId);
  if (!existing) return null;
  return set(userId, jobId, { ...existing, ...meta });
}

module.exports = { get, set, listForUser, patchMeta };
