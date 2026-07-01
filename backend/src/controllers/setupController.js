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
    gmailSmtpConfigured: emailDiagnostics.gmailSmtpConfigured,
    emailPrimaryProvider: emailDiagnostics.emailPrimaryProvider,
    emailProviders: emailDiagnostics.emailProviders,
    teamEmail: emailDiagnostics.teamEmail,
    adzunaConfigured,
    mongoConfigured: Boolean(env.mongoUri),
    mongoConnected,
    openaiConfigured: Boolean(env.openaiApiKey),
    openaiModel: env.openaiModel,
    hunterConfigured: Boolean(env.hunterApiKey),
    apolloConfigured: Boolean(env.apolloApiKey),
    pushConfigured: Boolean(env.vapidPublicKey && env.vapidPrivateKey),
    customDomain: env.customDomain || null,
    clientOrigins: env.clientOrigins,
    time: new Date().toISOString(),
  };
}

async function status(req, res, next) {
  try {
    const base = await buildHealthBase();
    const emailDiagnostics = await emailService.getEmailDiagnostics();
    const profile = await profileService.getRaw(req.user.sub);
    const openai = profileService.openaiMeta(profile);
    const adzuna = await platformSettingsService.getAdzunaStatus();

    res.json({
      ...base,
      ...emailDiagnostics,
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
    const delivery = result.deliveryStatus;
    const provider = result.provider || 'email';
    let message = `Sent via ${provider} to ${result.to}. Check inbox, Spam, and Promotions.`;
    if (provider === 'gmail') {
      message = `Sent via Gmail SMTP to ${result.to}. Usually arrives within a minute — check Spam if needed.`;
    } else if (delivery?.status === 'sent_via_gmail') {
      message = `Sent via Gmail SMTP to ${result.to}. ${delivery.note || 'Check inbox and Spam.'}`;
    } else if (delivery?.status === 'delivered') {
      message = `Resend reports Delivered to ${result.to}. If you do not see it, check Spam, Promotions, and All Mail.`;
    } else if (delivery?.status === 'bounced' || delivery?.status === 'complained') {
      message = `Resend reports ${delivery.status} for ${result.to}. The provider rejected or blocked this message.`;
    } else if (delivery?.status === 'sent') {
      message = `Resend accepted and sent to ${result.to}. Delivery can take a few minutes — check Spam and Promotions.`;
    }
    res.json({
      message,
      deliveryNote:
        'All transactional mail (invites, password resets, apply summaries) uses Gmail SMTP first when configured, then Resend.',
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { status, saveAdzuna, testEmail, buildHealthBase };
