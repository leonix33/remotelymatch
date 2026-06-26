const env = require('../config/env');
const profileService = require('../services/profileService');
const platformSettingsService = require('../services/platformSettingsService');

async function buildHealthBase() {
  const mongoose = require('mongoose');
  const email = env.adminEmail || '';
  const mongoConnected = mongoose.connection.readyState === 1;
  const adzunaConfigured = await platformSettingsService.isAdzunaConfigured();

  return {
    ok: true,
    appName: env.appName,
    appUrl: env.appUrl,
    environment: env.nodeEnv,
    deployTag: env.deployTag,
    adminConfigured: Boolean(email && env.adminPassword),
    adminEmailHint: email.includes('@') ? `${email.split('@')[0].slice(0, 3)}***@${email.split('@')[1]}` : 'unset',
    emailConfigured: Boolean(env.resendApiKey),
    emailFrom: env.emailFrom || null,
    emailProduction: Boolean(env.resendApiKey && env.emailFrom && !env.emailFrom.includes('resend.dev')),
    adzunaConfigured,
    mongoConfigured: Boolean(env.mongoUri),
    mongoConnected,
    openaiConfigured: Boolean(env.openaiApiKey),
    openaiModel: env.openaiModel,
    pushConfigured: Boolean(env.vapidPublicKey && env.vapidPrivateKey),
    customDomain: env.customDomain || null,
    clientOrigins: env.clientOrigins,
    time: new Date().toISOString(),
  };
}

async function status(req, res, next) {
  try {
    const base = await buildHealthBase();
    const profile = await profileService.getRaw(req.user.sub);
    const openai = profileService.openaiMeta(profile);
    const adzuna = await platformSettingsService.getAdzunaStatus();

    res.json({
      ...base,
      openaiConfigured: base.openaiConfigured || openai.openaiConnected,
      openaiConnected: openai.openaiConnected,
      openaiKeySource: openai.openaiKeySource,
      openaiKeyHint: openai.openaiKeyHint,
      adzunaConfigured: adzuna.configured,
      adzunaSource: adzuna.source,
      adzunaAppIdHint: adzuna.appIdHint,
      isAdmin: req.user?.role === 'admin',
    });
  } catch (err) {
    next(err);
  }
}

async function saveAdzuna(req, res, next) {
  try {
    const { appId, appKey, what, where } = req.body;
    const result = await platformSettingsService.setAdzunaCredentials({ appId, appKey, what, where });
    res.json({ message: 'Adzuna credentials saved', ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = { status, saveAdzuna, buildHealthBase };
