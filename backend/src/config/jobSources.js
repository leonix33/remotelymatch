const env = require('./env');

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  greenhouseBoards: parseList(process.env.JOB_GREENHOUSE_BOARDS, [
    'anthropic',
    'datadog',
    'cloudflare',
    'gitlab',
    'mongodb',
    'elastic',
    'databricks',
    'coinbase',
    'fastly',
    'reddit',
    'grafanalabs',
    'pinterest',
    'okta',
    'pagerduty',
    'newrelic',
    'twilio',
  ]),
  leverCompanies: parseList(process.env.JOB_LEVER_BOARDS, ['palantir', 'spotify']),
  ashbyOrgs: parseList(process.env.JOB_ASHBY_BOARDS, [
    'snowflake',
    'openai',
    'notion',
    'ramp',
    'linear',
    'deel',
    'supabase',
    'cognition',
  ]),
  usajobsKeyword: process.env.USAJOBS_KEYWORD || 'devops OR cloud OR kubernetes',
  usajobsApiKey: process.env.USAJOBS_API_KEY || '',
  usajobsEmail: process.env.USAJOBS_USER_EMAIL || env.adminEmail || '',
  fetchTimeoutMs: Number(process.env.JOB_FETCH_TIMEOUT_MS) || 15000,
  diceApiKey: process.env.DICE_API_KEY || '1YAt0R9wBg4WfsF9VB2778F5CHLAPMVW3WAZcKd8',
  diceSearchKeyword: process.env.DICE_SEARCH_KEYWORD || 'devops remote',
  indeedRssUrl: process.env.INDEED_RSS_URL || '',
  indeedSearchQuery: process.env.INDEED_SEARCH_QUERY || '',
  indeedSearchLocation: process.env.INDEED_SEARCH_LOCATION || 'remote',
  adzunaAppId: process.env.ADZUNA_APP_ID || '',
  adzunaAppKey: process.env.ADZUNA_APP_KEY || '',
  adzunaWhat: process.env.ADZUNA_WHAT || 'devops engineer',
  adzunaWhere: process.env.ADZUNA_WHERE || 'remote',
  adzunaMaxDaysOld: process.env.ADZUNA_MAX_DAYS_OLD || '7',
  enabledSources: parseList(process.env.JOB_SOURCES_ENABLED, [
    'remoteok',
    'remotive',
    'himalayas',
    'weworkremotely',
    'greenhouse',
    'lever',
    'ashby',
    'wellfound',
    'dice',
    'adzuna',
    'indeed',
    'workingnomads',
    'devitjobs',
    'aijobs',
    'ycombinator',
    'workatastartup',
    'usajobs',
  ]),
};
