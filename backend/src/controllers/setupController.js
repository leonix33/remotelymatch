const env = require('../config/env');
const profileService = require('../services/profileService');
const platformSettingsService = require('../services/platformSettingsService');
const emailService = require('../services/emailService');

async function buildHealthBase() {
  const mongoose = require('mongoose');
  const email = env.adminEmail || '';
  const mongoConnected = mongoose.connection.readyState === 1;
  const adzunaConfigured = await platformSettingsService.isAdzunaConfigured();
  const emailDiagnostics = await emailService.getEmailDiagnostics();

  return {
    ok: true,
    appName: env.appName,
    appUrl: env.appUrl,
    environment: env.nodeEnv,
    deployTag: env.deployTag,
    adminConfigured: Boolean(email && env.adminPassword),
    adminEmailHint: email.includes('@') ? `${email.split('@')[0].slice(0, 3)}***@${email.split('@')[1]}` : 'unset',
    emailConfigured: emailDiagnostics.emailConfigured,
    emailFrom: emailDiagnostics.emailFrom,
    emailProduction: emailDiagnostics.emailProduction,
    emailSandbox: emailDiagnostics.emailSandbox,
    emailDomain: emailDiagnostics.emailDomain,
    emailDomainStatus: emailDiagnostics.emailDomainStatus,
    emailDeliveryReady: emailDiagnostics.emailDeliveryReady,
    emailDomainError: emailDiagnostics.emailDomainError,
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

async function testEmail(req, res, next) {
  try {
    const to = String(req.body?.to || env.adminEmail || '').trim();
    const result = await emailService.sendTestEmail(to);
    if (!result.sent) {
      return res.status(result.diagnostics?.emailConfigured ? 503 : 400).json({
        message: result.reason || 'Test email failed',
        ...result,
      });
    }
    res.json({
      message: `Handed off to Resend for ${result.to}. Check inbox, Junk, and Spam — iCloud and Yahoo often delay new senders by 5–15 minutes.`,
      deliveryNote:
        'Accepted by Resend does not guarantee inbox delivery. Open resend.com/emails to see Delivered, Bounced, or Complained.',
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { status, saveAdzuna, testEmail, buildHealthBase };
