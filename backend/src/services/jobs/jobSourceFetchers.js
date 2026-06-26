const jobSourcesConfig = require('../../config/jobSources');
const { stripHtml } = require('./jobNormalizer');

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), jobSourcesConfig.fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'RemoteMatch/1.0 (+https://remotelymatch.app)',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function rawJob(partial) {
  return { ...partial };
}

async function fetchRemoteOk() {
  const data = await fetchJson('https://remoteok.com/api');
  const jobs = [];
  for (const item of data) {
    if (!item || typeof item !== 'object' || !item.position) continue;
    const tags = (item.tags || []).join(' ');
    jobs.push(
      rawJob({
        id: `remoteok-${item.id}`,
        title: item.position,
        company: item.company || 'Unknown',
        location: item.location || 'Remote',
        applyUrl: item.url,
        source: 'RemoteOK',
        description: stripHtml(`${tags} ${item.description || ''}`),
        skills: item.tags || [],
        postedAt: item.date ? new Date(item.date).toISOString() : null,
        remoteType: 'remote',
        salaryMin: item.salary_min || null,
        salaryMax: item.salary_max || null,
        atsType: 'job-board',
      })
    );
  }
  return jobs;
}

async function fetchRemotive() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs');
  return (data.jobs || []).map((item) =>
    rawJob({
      id: `remotive-${item.id}`,
      title: item.title,
      company: item.company_name || 'Unknown',
      location: item.candidate_required_location || 'Remote',
      applyUrl: item.url,
      source: 'Remotive',
      description: stripHtml(item.description || ''),
      postedAt: item.publication_date || null,
      remoteType: 'remote',
      salaryMin: item.salary_min || null,
      salaryMax: item.salary_max || null,
      atsType: 'job-board',
    })
  );
}

async function fetchGreenhouseBoards(boards = jobSourcesConfig.greenhouseBoards) {
  const jobs = [];
  for (const board of boards) {
    try {
      const data = await fetchJson(
        `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`
      );
      for (const item of data.jobs || []) {
        jobs.push(
          rawJob({
            id: `greenhouse-${board}-${item.id}`,
            title: item.title,
            company: board.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            location: item.location?.name || 'Remote',
            applyUrl: item.absolute_url,
            source: `Greenhouse:${board}`,
            description: stripHtml(item.content || ''),
            postedAt: item.updated_at || item.created_at || null,
            atsType: 'greenhouse',
          })
        );
      }
    } catch {
      /* skip unavailable boards */
    }
  }
  return jobs;
}

async function fetchLeverCompanies(companies = jobSourcesConfig.leverCompanies) {
  const jobs = [];
  for (const company of companies) {
    try {
      const data = await fetchJson(`https://api.lever.co/v0/postings/${company}?mode=json`);
      for (const item of data) {
        jobs.push(
          rawJob({
            id: `lever-${company}-${item.id}`,
            title: item.text,
            company: item.categories?.team || company,
            location: item.categories?.location || 'Remote',
            applyUrl: item.hostedUrl || item.applyUrl,
            source: `Lever:${company}`,
            description: stripHtml(
              (item.lists || []).map((l) => `${l.text} ${(l.content || []).join(' ')}`).join(' ')
            ),
            postedAt: item.createdAt || null,
            atsType: 'lever',
          })
        );
      }
    } catch {
      /* skip */
    }
  }
  return jobs;
}

async function fetchAshbyOrgs(orgs = jobSourcesConfig.ashbyOrgs) {
  const jobs = [];
  for (const org of orgs) {
    try {
      const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${org}`);
      for (const item of data.jobs || []) {
        jobs.push(
          rawJob({
            id: `ashby-${org}-${item.id}`,
            title: item.title,
            company: item.companyName || org,
            location: item.location || 'Remote',
            applyUrl: item.jobUrl,
            source: `Ashby:${org}`,
            description: stripHtml(item.descriptionPlain || item.descriptionHtml || ''),
            postedAt: item.publishedAt || null,
            atsType: 'ashby',
          })
        );
      }
    } catch {
      /* skip */
    }
  }
  return jobs;
}

async function fetchWellfound() {
  // Wellfound blocks server-side access (DataDome); queue jobs via the Chrome extension.
  return [];
}

async function fetchDice() {
  const { diceApiKey, diceSearchKeyword } = jobSourcesConfig;
  if (!diceApiKey) return [];

  const params = new URLSearchParams({
    q: diceSearchKeyword,
    page: '1',
    pageSize: '50',
    'filters.workplaceTypes': 'Remote',
    includeRemote: 'true',
  });

  try {
    const data = await fetchJson(
      `https://job-search-api.svc.dhigroupinc.com/v1/dice/jobs/search?${params}`,
      {
        headers: {
          Accept: 'application/json, text/plain, */*',
          Origin: 'https://www.dice.com',
          Referer: 'https://www.dice.com/',
          'x-api-key': diceApiKey,
        },
      }
    );
    return (data.data || []).map((item) => {
      const jobLocation = item.jobLocation || {};
      return rawJob({
        id: `dice-${item.id || item.jobId}`,
        title: item.title,
        company: item.companyName || item.company || 'Unknown',
        location: jobLocation.displayName || 'Remote',
        applyUrl: item.detailsPageUrl || item.jobUrl,
        source: 'Dice',
        description: stripHtml(item.summary || ''),
        postedAt: item.postedDate || null,
        remoteType: 'remote',
        atsType: 'dice',
      });
    });
  } catch {
    return [];
  }
}

async function fetchWorkAtAStartup() {
  try {
    const data = await fetchJson('https://www.workatastartup.com/api/jobs');
    const listings = Array.isArray(data) ? data : data.jobs || [];
    return listings.slice(0, 100).map((item) =>
      rawJob({
        id: `yc-${item.id}`,
        title: item.title || item.role,
        company: item.company_name || item.startup?.name || 'YC Startup',
        location: item.location || 'Remote',
        applyUrl: item.url || `https://www.workatastartup.com/jobs/${item.id}`,
        source: 'YC Work at a Startup',
        description: stripHtml(item.description || ''),
        postedAt: item.created_at || null,
        atsType: 'workatastartup',
      })
    );
  } catch {
    return [];
  }
}

async function fetchUsajobs() {
  const { usajobsApiKey, usajobsEmail, usajobsKeyword } = jobSourcesConfig;
  if (!usajobsApiKey || !usajobsEmail) return [];

  const params = new URLSearchParams({
    Keyword: usajobsKeyword,
    LocationName: 'United States',
    Page: '1',
    ResultsPerPage: '50',
  });

  const data = await fetchJson(`https://data.usajobs.gov/api/search?${params}`, {
    headers: {
      'User-Agent': usajobsEmail,
      'Authorization-Key': usajobsApiKey,
      Host: 'data.usajobs.gov',
    },
  });

  return (data.SearchResult?.SearchResultItems || []).map((wrap) => {
    const item = wrap.MatchedObjectDescriptor || {};
    const ids = item.PositionID || item.MatchedObjectId;
    return rawJob({
      id: `usajobs-${ids}`,
      title: item.PositionTitle,
      company: item.OrganizationName || 'US Federal',
      location: (item.PositionLocationDisplay || 'United States').slice(0, 120),
      applyUrl: item.PositionURI,
      source: 'USAJobs',
      description: stripHtml(
        `${item.QualificationSummary || ''} ${item.UserArea?.Details?.MajorDuties || ''}`
      ),
      postedAt: item.PublicationStartDate || null,
      remoteType: /remote|telework/i.test(item.PositionOfferingType || '') ? 'remote' : 'onsite',
      atsType: 'usajobs',
    });
  });
}

async function fetchHimalayas() {
  try {
    const data = await fetchJson('https://himalayas.app/jobs/api?limit=200');
    return (data.jobs || []).map((item) => {
      const restrictions = (item.locationRestrictions || []).join(', ');
      const categories = (item.categories || []).join(' ');
      return rawJob({
        id: `himalayas-${item.id || item.slug}`,
        title: item.title,
        company: item.companyName || 'Unknown',
        location: restrictions || 'Remote',
        applyUrl: item.url,
        source: 'Himalayas',
        description: stripHtml(`${categories} ${item.description || ''}`),
        atsType: 'job-board',
      });
    });
  } catch {
    return [];
  }
}

async function fetchWeWorkRemotely() {
  try {
    const res = await fetch('https://weworkremotely.com/remote-jobs.rss', {
      headers: { 'User-Agent': 'RemoteMatch/1.0 (+https://remotelymatch.app)' },
    });
    const rss = await res.text();
    return parseRssJobs(rss, 'We Work Remotely', 'weworkremotely');
  } catch {
    return [];
  }
}

async function fetchWorkingNomads() {
  try {
    const data = await fetchJson('https://www.workingnomads.co/api/exposed_jobs/');
    if (!Array.isArray(data)) return [];
    return data.map((item) =>
      rawJob({
        id: `workingnomads-${item.url}`,
        title: item.title,
        company: item.company_name || 'Unknown',
        location: item.location || 'Remote',
        applyUrl: item.url,
        source: 'Working Nomads',
        description: stripHtml(`${item.category_name || ''} ${(item.tags || []).join(' ')}`),
        atsType: 'job-board',
      })
    );
  } catch {
    return [];
  }
}

async function fetchIndeed() {
  const { indeedRssUrl, indeedSearchQuery, indeedSearchLocation } = jobSourcesConfig;
  let feedUrl = indeedRssUrl;
  if (!feedUrl && indeedSearchQuery) {
    feedUrl = `https://www.indeed.com/jobs?q=${encodeURIComponent(indeedSearchQuery)}&l=${encodeURIComponent(indeedSearchLocation)}&format=rss`;
  }
  if (!feedUrl) return [];

  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RemoteMatch/1.0)' },
    });
    if (!res.ok) return [];
    const rss = await res.text();
    return parseRssJobs(rss, 'Indeed', 'indeed');
  } catch {
    return [];
  }
}

async function fetchAdzuna() {
  const platformSettingsService = require('../platformSettingsService');
  const { adzunaAppId, adzunaAppKey, adzunaWhat, adzunaWhere, adzunaMaxDaysOld } =
    await platformSettingsService.getAdzunaCredentials();
  if (!adzunaAppId || !adzunaAppKey) return [];

  const params = new URLSearchParams({
    app_id: adzunaAppId,
    app_key: adzunaAppKey,
    what: adzunaWhat,
    where: adzunaWhere,
    results_per_page: '50',
    sort_by: 'date',
    max_days_old: adzunaMaxDaysOld,
    'content-type': 'application/json',
  });

  try {
    const data = await fetchJson(`https://api.adzuna.com/v1/api/jobs/us/search/1?${params}`);
    return (data.results || []).map((item) =>
      rawJob({
        id: `adzuna-${item.id}`,
        title: item.title,
        company: item.company?.display_name || 'Unknown',
        location: item.location?.display_name || 'United States',
        applyUrl: item.redirect_url,
        source: 'Adzuna',
        description: stripHtml(item.description || ''),
        postedAt: item.created || null,
        atsType: 'adzuna',
      })
    );
  } catch {
    return [];
  }
}

function parseRssJobs(rssText, source, idPrefix) {
  const jobs = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(rssText))) {
    const block = match[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/))?.[1] || '';
    const link = (block.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const description = stripHtml(
      (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
        block.match(/<description>([\s\S]*?)<\/description>/))?.[1] || ''
    );
    if (!title || !link) continue;
    jobs.push(
      rawJob({
        id: `${idPrefix}-${link}`,
        title,
        company: title.split(':')[0]?.trim() || 'See posting',
        location: 'Remote',
        applyUrl: link,
        source,
        description,
        atsType: 'job-board',
      })
    );
  }
  return jobs;
}

async function fetchDevItJobs() {
  const jobs = [];
  for (const [feedUrl, source] of [
    ['https://devitjobs.com/job_feed.xml', 'DevITJobs'],
    ['https://devitjobs.uk/job_feed.xml', 'DevITJobs UK'],
  ]) {
    try {
      const res = await fetch(feedUrl, {
        headers: { 'User-Agent': 'RemoteMatch/1.0 (+https://remotelymatch.app)' },
      });
      const xml = await res.text();
      const jobRegex = /<job>([\s\S]*?)<\/job>/gi;
      let match;
      while ((match = jobRegex.exec(xml))) {
        const block = match[1];
        const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim() || '';
        const company = (block.match(/<name>([\s\S]*?)<\/name>/) || [])[1]?.trim() || 'Unknown';
        const link =
          (block.match(/<apply_url>([\s\S]*?)<\/apply_url>/) || block.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() ||
          '';
        const id = (block.match(/<id>([\s\S]*?)<\/id>/) || [])[1]?.trim() || link;
        if (!title || !link) continue;
        jobs.push(
          rawJob({
            id: `devitjobs-${id}`,
            title,
            company,
            location: 'Remote',
            applyUrl: link,
            source,
            description: stripHtml((block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || ''),
            atsType: 'job-board',
          })
        );
      }
    } catch {
      /* skip feed */
    }
  }
  return jobs;
}

async function fetchAijobs() {
  try {
    const res = await fetch('https://aijobs.net/jobs/search?remote=1', {
      headers: { 'User-Agent': 'RemoteMatch/1.0 (+https://remotelymatch.app)' },
    });
    const html = await res.text();
    const links = new Set();
    for (const m of html.matchAll(/href="(https:\/\/aijobs\.net\/job\/[^"]+)"/g)) links.add(m[1]);
    for (const m of html.matchAll(/href="(\/job\/[^"]+)"/g)) links.add(`https://aijobs.net${m[1]}`);
    return [...links].slice(0, 120).map((link) => {
      const slug = link.replace(/\/$/, '').split('/job/')[1] || '';
      const slugBody = slug.replace(/-\d+$/, '');
      return rawJob({
        id: `aijobs-${slug}`,
        title: slugBody.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'AI/ML Role',
        company: 'See posting',
        location: 'Remote',
        applyUrl: link,
        source: 'AIJobs.net',
        description: 'AI and machine learning job listing from aijobs.net.',
        atsType: 'job-board',
      });
    });
  } catch {
    return [];
  }
}

async function fetchYCombinatorJobs() {
  try {
    const storyIds = await fetchJson('https://hacker-news.firebaseio.com/v0/jobstories.json');
    if (!Array.isArray(storyIds)) return [];
    const jobs = [];
    for (const storyId of storyIds.slice(0, 40)) {
      try {
        const item = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${storyId}.json`);
        if (!item?.title || !item?.url) continue;
        const company = item.title.split(/ is hiring/i)[0].trim();
        jobs.push(
          rawJob({
            id: `yc-hn-${storyId}`,
            title: item.title,
            company: company || 'YC Startup',
            location: 'Remote',
            applyUrl: item.url,
            source: 'Y Combinator Jobs',
            description: stripHtml(item.text || item.title),
            atsType: 'job-board',
          })
        );
      } catch {
        /* skip story */
      }
    }
    return jobs;
  } catch {
    return [];
  }
}

const SOURCE_FETCHERS = {
  remoteok: fetchRemoteOk,
  remotive: fetchRemotive,
  himalayas: fetchHimalayas,
  weworkremotely: fetchWeWorkRemotely,
  greenhouse: fetchGreenhouseBoards,
  lever: fetchLeverCompanies,
  ashby: fetchAshbyOrgs,
  wellfound: fetchWellfound,
  dice: fetchDice,
  indeed: fetchIndeed,
  adzuna: fetchAdzuna,
  workingnomads: fetchWorkingNomads,
  devitjobs: fetchDevItJobs,
  aijobs: fetchAijobs,
  ycombinator: fetchYCombinatorJobs,
  workatastartup: fetchWorkAtAStartup,
  usajobs: fetchUsajobs,
};

module.exports = {
  fetchJson,
  SOURCE_FETCHERS,
  fetchRemoteOk,
  fetchRemotive,
  fetchGreenhouseBoards,
  fetchLeverCompanies,
  fetchAshbyOrgs,
  fetchWellfound,
  fetchDice,
  fetchIndeed,
  fetchAdzuna,
  fetchHimalayas,
  fetchWeWorkRemotely,
  fetchWorkingNomads,
  fetchDevItJobs,
  fetchAijobs,
  fetchYCombinatorJobs,
  fetchWorkAtAStartup,
  fetchUsajobs,
};
