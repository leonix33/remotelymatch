const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const trim = (v) => (typeof v === 'string' ? v.trim() : v);

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
  origins.add('https://remotematch.onrender.com');
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
  appUrl: trim(process.env.APP_URL) || trim(process.env.CLIENT_ORIGIN) || 'https://remotematch.onrender.com',
  customDomain: trim(process.env.CUSTOM_DOMAIN) || '',
  agentHome: process.env.AGENT_HOME || require('path').resolve(__dirname, '../../../..'),
  appName: trim(process.env.APP_NAME) || 'RemoteMatch',
  deployTag: 'sync-v4',
  resendApiKey: trim(process.env.RESEND_API_KEY) || '',
  emailFrom: trim(process.env.EMAIL_FROM) || 'RemoteMatch <onboarding@resend.dev>',
  vapidPublicKey: trim(process.env.VAPID_PUBLIC_KEY) || '',
  vapidPrivateKey: trim(process.env.VAPID_PRIVATE_KEY) || '',
  vapidSubject: trim(process.env.VAPID_SUBJECT) || 'mailto:leonix23@gmail.com',
  openJobMarket: process.env.OPEN_JOB_MARKET !== '0',
};
