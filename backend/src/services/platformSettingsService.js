const env = require('../config/env');
const jobSources = require('../config/jobSources');
const PlatformSettings = require('../models/PlatformSettings');
const { encryptApiKey, decryptApiKey } = require('./openaiKeyCrypto');

const CACHE_MS = 30_000;
let cache = { at: 0, row: null };

async function loadRow() {
  if (!env.mongoUri) return null;
  if (cache.row && Date.now() - cache.at < CACHE_MS) return cache.row;
  const row = await PlatformSettings.findOne({ singleton: 'default' }).select('+adzunaAppKeyEncrypted').lean();
  cache = { at: Date.now(), row };
  return row;
}

function invalidateCache() {
  cache = { at: 0, row: null };
}

async function getAdzunaCredentials() {
  const row = await loadRow();
  const appId = (row?.adzunaAppId || jobSources.adzunaAppId || '').trim();
  const storedKey = row?.adzunaAppKeyEncrypted ? decryptApiKey(row.adzunaAppKeyEncrypted) : '';
  const appKey = (storedKey || jobSources.adzunaAppKey || '').trim();
  const what = (row?.adzunaWhat || jobSources.adzunaWhat || 'remote').trim();
  const where = (row?.adzunaWhere || jobSources.adzunaWhere || 'remote').trim();
  const maxDaysOld = jobSources.adzunaMaxDaysOld || '7';
  return { adzunaAppId: appId, adzunaAppKey: appKey, adzunaWhat: what, adzunaWhere: where, adzunaMaxDaysOld: maxDaysOld };
}

async function isAdzunaConfigured() {
  const { adzunaAppId, adzunaAppKey } = await getAdzunaCredentials();
  return Boolean(adzunaAppId && adzunaAppKey);
}

async function getAdzunaStatus() {
  const row = await loadRow();
  const configured = await isAdzunaConfigured();
  return {
    configured,
    source: row?.adzunaAppId ? 'database' : jobSources.adzunaAppId ? 'environment' : null,
    appIdHint: row?.adzunaAppId ? `${row.adzunaAppId.slice(0, 4)}…` : jobSources.adzunaAppId ? `${jobSources.adzunaAppId.slice(0, 4)}…` : null,
  };
}

async function setAdzunaCredentials({ appId, appKey, what, where }) {
  if (!env.mongoUri) throw new Error('MongoDB is required to save platform settings');
  const id = String(appId || '').trim();
  const key = String(appKey || '').trim();
  if (!id || !key) throw new Error('Adzuna App ID and App Key are required');

  const update = {
    singleton: 'default',
    adzunaAppId: id,
    adzunaAppKeyEncrypted: encryptApiKey(key),
    updatedAt: new Date(),
  };
  if (what) update.adzunaWhat = String(what).trim();
  if (where) update.adzunaWhere = String(where).trim();

  await PlatformSettings.findOneAndUpdate({ singleton: 'default' }, update, { upsert: true, new: true });
  invalidateCache();
  return getAdzunaStatus();
}

module.exports = {
  getAdzunaCredentials,
  isAdzunaConfigured,
  getAdzunaStatus,
  setAdzunaCredentials,
  invalidateCache,
};
