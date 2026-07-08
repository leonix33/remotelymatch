const env = require('./env');

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
  usajobsKeyword: process.env.USAJOBS_KEYWORD || 'remote',
  usajobsApiKey: process.env.USAJOBS_API_KEY || '',
  usajobsEmail: process.env.USAJOBS_USER_EMAIL || env.adminEmail || '',
  fetchTimeoutMs: Number(process.env.JOB_FETCH_TIMEOUT_MS) || 15000,
  junglePages: parseNumber(process.env.JOB_JUNGLE_PAGES, 5),
  roberthalfPages: parseNumber(process.env.JOB_ROBERTHALF_PAGES, 8),
  arbeitnowPages: parseNumber(process.env.JOB_ARBEITNOW_PAGES, 3),
  fourdayweekPages: parseNumber(process.env.JOB_FOURDAYWEEK_PAGES, 3),
  diceApiKey: process.env.DICE_API_KEY || '1YAt0R9wBg4WfsF9VB2778F5CHLAPMVW3WAZcKd8',
  diceSearchKeyword: process.env.DICE_SEARCH_KEYWORD || 'remote',
  indeedRssUrl: process.env.INDEED_RSS_URL || '',
  indeedSearchQuery: process.env.INDEED_SEARCH_QUERY || '',
  indeedSearchLocation: process.env.INDEED_SEARCH_LOCATION || 'remote',
  adzunaAppId: process.env.ADZUNA_APP_ID || '',
  adzunaAppKey: process.env.ADZUNA_APP_KEY || '',
  adzunaWhat: process.env.ADZUNA_WHAT || 'remote software engineer',
  adzunaWhere: process.env.ADZUNA_WHERE || 'United States',
  adzunaMaxDaysOld: process.env.ADZUNA_MAX_DAYS_OLD || '7',
  // Actionable sources only — direct company ATS + curated US remote boards
  allSources: [
    'remoteok',
    'remotive',
    'weworkremotely',
    'greenhouse',
    'lever',
    'ashby',
    'adzuna',
  ],
  jobMinSalaryUsd: parseNumber(process.env.JOB_MIN_SALARY_USD, 140000),
  jobMinCallbackScore: parseNumber(process.env.JOB_MIN_CALLBACK_SCORE, 25),
  // Opt-in lower-trust / international boards (not recommended)
  optionalSources: [
    'jobicy',
    'himalayas',
    'roberthalf',
    'workingnomads',
    'jobspresso',
    'dice',
    'indeed',
    'ycombinator',
    'workatastartup',
    'usajobs',
  ],
  internationalSources: ['jungle', 'arbeitnow', 'fourdayweek', 'landingjobs', 'devitjobs', 'aijobs'],
  get enabledSources() {
    const explicit = parseList(process.env.JOB_SOURCES_ENABLED, []);
    return explicit.length ? explicit : this.allSources;
  },
};
