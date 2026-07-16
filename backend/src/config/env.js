const dotenv = require('dotenv');
const { DISPLAY_NAME, LEGACY_RENDER_URL, CANONICAL_DOMAIN, TEAM_MAILBOX } = require('../constants/brand');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const trim = (v) => (typeof v === 'string' ? v.trim() : v);

function resolveTeamEmail(domain = '') {
  const explicit = trim(process.env.TEAM_EMAIL) || '';
  if (explicit) return explicit.toLowerCase();
  const d = trim(domain) || CANONICAL_DOMAIN;
  return d ? `team@${d}` : TEAM_MAILBOX;
}

function resolveEmailFrom() {
  const explicit = trim(process.env.EMAIL_FROM) || '';
  const domain = trim(process.env.CUSTOM_DOMAIN) || CANONICAL_DOMAIN;
  const appName = trim(process.env.APP_NAME) || DISPLAY_NAME;
  const sandbox = `${appName} <onboarding@resend.dev>`;
  const teamFrom = `${appName} <${resolveTeamEmail(domain)}>`;

  if (explicit && !explicit.includes('resend.dev')) {
    return explicit;
  }

  const isProd = (process.env.NODE_ENV || 'development') === 'production';
  if (isProd && domain && (!explicit || explicit.includes('resend.dev'))) {
    return teamFrom;
  }

  return explicit || sandbox;
}

function parseOrigins() {
  const raw = trim(process.env.CLIENT_ORIGIN) || '';
  const appUrl = trim(process.env.APP_URL) || '';
  const origins = new Set();
  for (const part of raw.split(',')) {
    const o = part.trim();
    if (o) origins.add(o);
  }
  if (appUrl) origins.add(appUrl);
  origins.add('http://localhost:5173');
  origins.add(LEGACY_RENDER_URL);
  origins.add('https://remotelymatch.app');
  origins.add('https://www.remotelymatch.app');
  return [...origins];
}

module.exports = {
  port: Number(process.env.PORT) || 5100,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: trim(process.env.MONGODB_URI) || '',
  jwtAccessSecret: trim(process.env.JWT_ACCESS_SECRET) || 'dev-access-secret-change-me',
  jwtRefreshSecret: trim(process.env.JWT_REFRESH_SECRET) || 'dev-refresh-secret-change-me',
  adminEmail: trim(process.env.ADMIN_EMAIL) || 'admin@example.com',
  adminPassword: trim(process.env.ADMIN_PASSWORD) || 'ChangeThisPassword123',
  openaiApiKey: trim(process.env.OPENAI_API_KEY) || '',
  openaiModel: trim(process.env.OPENAI_MODEL) || 'gpt-4o-mini',
  clientOrigin: trim(process.env.CLIENT_ORIGIN) || 'http://localhost:5173',
  clientOrigins: parseOrigins(),
  appUrl: trim(process.env.APP_URL) || trim(process.env.CLIENT_ORIGIN) || 'https://remotelymatch.app',
  customDomain: trim(process.env.CUSTOM_DOMAIN) || CANONICAL_DOMAIN,
  teamEmail: resolveTeamEmail(trim(process.env.CUSTOM_DOMAIN) || CANONICAL_DOMAIN),
  agentHome: process.env.AGENT_HOME || require('path').resolve(__dirname, '../../../..'),
  appName: trim(process.env.APP_NAME) || DISPLAY_NAME,
  deployTag: 'sync-v14',
  resendApiKey: trim(process.env.RESEND_API_KEY) || '',
  gmailSmtpUser: trim(process.env.GMAIL_SMTP_USER) || '',
  gmailSmtpPass: trim(process.env.GMAIL_SMTP_PASS) || '',
  hunterApiKey: trim(process.env.HUNTER_API_KEY) || '',
  apolloApiKey: trim(process.env.APOLLO_API_KEY) || '',
  emailFrom: resolveEmailFrom(),
  vapidPublicKey: trim(process.env.VAPID_PUBLIC_KEY) || '',
  vapidPrivateKey: trim(process.env.VAPID_PRIVATE_KEY) || '',
  vapidSubject: trim(process.env.VAPID_SUBJECT) || 'mailto:leonix23@gmail.com',
  openJobMarket: process.env.OPEN_JOB_MARKET !== '0',
  usRemoteJobsOnly: process.env.US_REMOTE_JOBS_ONLY !== '0',
  jobMinSalaryUsd: Number(process.env.JOB_MIN_SALARY_USD) || 140000,
  jobMinCallbackScore: Number(process.env.JOB_MIN_CALLBACK_SCORE) || 25,
  qualityFirstMode: process.env.QUALITY_FIRST_MODE !== '0',
  jobMaxAgeDays: Number(process.env.JOB_MAX_AGE_DAYS) || 30,
  jobAggregatorRequiresAts: process.env.JOB_AGGREGATOR_REQUIRES_ATS !== '0',
  jobRequireDomainMatch: process.env.JOB_REQUIRE_DOMAIN_MATCH !== '0',
  jobMaxApplicants: Number(process.env.JOB_MAX_APPLICANTS) || 75,
  jobMaxSameCompanyRoles: Number(process.env.JOB_MAX_SAME_COMPANY_ROLES) || 5,
  jobDropLowYieldSources: process.env.JOB_DROP_LOW_YIELD_SOURCES === '1',
  tailorGenerateMaxPasses: Math.min(3, Math.max(1, Number(process.env.TAILOR_GENERATE_MAX_PASSES) || 2)),
  tailorPolishMaxPasses: Math.min(8, Math.max(1, Number(process.env.TAILOR_POLISH_MAX_PASSES) || 6)),
};
