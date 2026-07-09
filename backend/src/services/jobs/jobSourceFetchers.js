const vm = require('node:vm');
const { USER_AGENT } = require('../../constants/brand');
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
        'User-Agent': USER_AGENT,
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

async function fetchText(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), jobSourcesConfig.fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        ...(extraHeaders || {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPostJson(url, body, extraHeaders = {}) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
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
      headers: { 'User-Agent': USER_AGENT },
    });
    const rss = await res.text();
    return parseRssJobs(rss, 'We Work Remotely', 'weworkremotely');
  } catch {
    return [];
  }
}

async function fetchJobicy() {
  try {
    const data = await fetchJson('https://jobicy.com/api/v2/remote-jobs?count=100');
    return (data.jobs || []).map((item) =>
      rawJob({
        id: `jobicy-${item.id}`,
        title: item.jobTitle,
        company: item.companyName || 'Unknown',
        location: item.jobGeo || 'Remote',
        applyUrl: item.url,
        source: 'Jobicy',
        description: stripHtml(`${item.jobExcerpt || ''} ${item.jobDescription || ''}`),
        postedAt: item.pubDate || null,
        remoteType: 'remote',
        atsType: 'job-board',
      })
    );
  } catch {
    return [];
  }
}

async function fetchJungle(maxPages = jobSourcesConfig.junglePages) {
  const ALGOLIA_URL =
    'https://csekhvms53-dsn.algolia.net/1/indexes/wttj_jobs_production_en/query';
  const ALGOLIA_HEADERS = {
    'x-algolia-application-id': 'CSEKHVMS53',
    'x-algolia-api-key': '4bd8f6215d0cc52b26430765769e65a0',
    Referer: 'https://www.welcometothejungle.com/',
    Origin: 'https://www.welcometothejungle.com',
  };

  const seen = new Set();
  const jobs = [];

  try {
    for (let page = 0; page < maxPages; page++) {
      const data = await fetchPostJson(
        ALGOLIA_URL,
        {
          query: '',
          hitsPerPage: 100,
          page,
          filters: 'remote:fulltime OR remote:partial',
        },
        ALGOLIA_HEADERS
      );

      for (const hit of data.hits || []) {
        const org = hit.organization || {};
        const orgSlug = org.slug || '';
        const jobSlug = hit.slug || hit.reference || '';
        const applyUrl =
          orgSlug && jobSlug
            ? `https://www.welcometothejungle.com/en/companies/${orgSlug}/jobs/${jobSlug}`
            : '';
        const id = `jungle-${hit.reference || jobSlug}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const descParts = [
          hit.summary,
          Array.isArray(hit.profile) ? hit.profile.join('\n') : hit.profile,
          Array.isArray(hit.key_missions) ? hit.key_missions.join('\n') : hit.key_missions,
        ].filter(Boolean);

        jobs.push(
          rawJob({
            id,
            title: hit.name || '',
            company: org.name || 'Unknown',
            location: hit.offices?.[0]?.city || 'Remote',
            applyUrl,
            source: 'Welcome to the Jungle',
            description: stripHtml(descParts.join('\n\n')),
            postedAt: hit.published_at || null,
            remoteType: hit.remote === 'fulltime' || hit.remote === 'partial' ? 'remote' : 'hybrid',
            atsType: 'job-board',
          })
        );
      }

      if (!data.hits?.length || page + 1 >= (data.nbPages || 0)) break;
    }
  } catch {
    return jobs;
  }

  return jobs;
}

function parseRobertHalfEmbeddedJobs(html) {
  const marker = "initialResults = JSON.parse('";
  const start = html.indexOf(marker);
  if (start === -1) return [];

  const contentStart = start + marker.length;
  const contentEnd = html.indexOf("');", contentStart);
  if (contentEnd === -1) return [];

  const literal = html.slice(contentStart, contentEnd);
  const decoded = vm.runInNewContext(`'${literal}'`);
  const parsed = JSON.parse(decoded);
  return parsed.data?.jobs || [];
}

async function fetchRobertHalf(maxPages = jobSourcesConfig.roberthalfPages) {
  const BROWSER_HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const seen = new Set();
  const jobs = [];

  try {
    for (let page = 1; page <= maxPages; page++) {
      const html = await fetchText(
        `https://www.roberthalf.com/us/en/jobs?remote=yes&pagenumber=${page}`,
        BROWSER_HEADERS
      );
      const pageJobs = parseRobertHalfEmbeddedJobs(html);
      if (!pageJobs.length) break;

      for (const item of pageJobs) {
        if (String(item.remote || '').toLowerCase() !== 'yes') continue;
        const id = `roberthalf-${item.unique_job_number || item.jobtitle}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const location = [item.city, item.stateprovince, item.country].filter(Boolean).join(', ');
        const applyUrl = item.job_detail_url
          ? item.job_detail_url.startsWith('http')
            ? item.job_detail_url
            : `https://www.roberthalf.com${item.job_detail_url}`
          : '';

        jobs.push(
          rawJob({
            id,
            title: item.jobtitle || '',
            company: 'Robert Half',
            location: location || 'Remote',
            applyUrl,
            source: 'Robert Half',
            description: stripHtml(item.description || ''),
            postedAt: item.date_posted || null,
            remoteType: 'remote',
            salaryMin: item.payrate_min ? Number(item.payrate_min) : null,
            salaryMax: item.payrate_max ? Number(item.payrate_max) : null,
            atsType: 'job-board',
          })
        );
      }
    }
  } catch {
    return jobs;
  }

  return jobs;
}

async function fetchArbeitnow(maxPages = jobSourcesConfig.arbeitnowPages) {
  const seen = new Set();
  const jobs = [];

  try {
    for (let page = 1; page <= maxPages; page++) {
      const data = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      const pageJobs = (data.data || []).filter((item) => item.remote);
      if (!pageJobs.length) break;

      for (const item of pageJobs) {
        const id = `arbeitnow-${item.slug}`;
        if (seen.has(id)) continue;
        seen.add(id);

        jobs.push(
          rawJob({
            id,
            title: item.title,
            company: item.company_name || 'Unknown',
            location: item.location || 'Remote',
            applyUrl: item.url,
            source: 'Arbeitnow',
            description: stripHtml(item.description || ''),
            postedAt: item.created_at ? new Date(item.created_at * 1000).toISOString() : null,
            remoteType: 'remote',
            skills: item.tags || [],
            atsType: 'job-board',
          })
        );
      }
    }
  } catch {
    return jobs;
  }

  return jobs;
}

async function fetchJobspresso() {
  try {
    const rss = await fetchText('https://jobspresso.co/jobs/feed/');
    return parseRssJobs(rss, 'Jobspresso', 'jobspresso');
  } catch {
    return [];
  }
}

async function fetchFourDayWeek(maxPages = jobSourcesConfig.fourdayweekPages) {
  const seen = new Set();
  const jobs = [];

  try {
    for (let page = 1; page <= maxPages; page++) {
      const data = await fetchJson(
        `https://4dayweek.io/api/v2/jobs?work_arrangement=remote&limit=100&page=${page}`
      );

      for (const item of data.data || []) {
        const id = `fourdayweek-${item.id || item.slug}`;
        if (seen.has(id)) continue;
        seen.add(id);

        jobs.push(
          rawJob({
            id,
            title: item.title || item.role,
            company: item.company?.name || 'Unknown',
            location: item.locations?.map((l) => l.country).filter(Boolean).join(', ') || 'Remote',
            applyUrl: item.url,
            source: '4 Day Week',
            description: stripHtml(item.description || ''),
            postedAt: item.published_at || null,
            remoteType: 'remote',
            salaryMin: item.salary_min ? item.salary_min / 100 : null,
            salaryMax: item.salary_max ? item.salary_max / 100 : null,
            atsType: 'job-board',
          })
        );
      }

      if (!data.has_more) break;
    }
  } catch {
    return jobs;
  }

  return jobs;
}

function companyFromLandingUrl(url = '') {
  const match = url.match(/\/at\/([^/]+)/i);
  if (match) return match[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return 'Unknown';
}

async function fetchLandingJobs() {
  try {
    const data = await fetchJson('https://landing.jobs/api/v1/jobs?remote=true');
    if (!Array.isArray(data)) return [];
    return data.map((item) =>
      rawJob({
        id: `landingjobs-${item.id}`,
        title: item.title,
        company: companyFromLandingUrl(item.url),
        location: 'Remote',
        applyUrl: item.url,
        source: 'Landing.jobs',
        description: stripHtml(
          [item.role_description, item.main_requirements, item.nice_to_have, item.perks]
            .filter(Boolean)
            .join('\n\n')
        ),
        postedAt: item.published_at || item.created_at || null,
        remoteType: 'remote',
        skills: item.tags || [],
        atsType: 'job-board',
      })
    );
  } catch {
    return [];
  }
}

async function fetchWorkingNomads() {
  try {
    const data = await fetchJson('https://www.workingnomads.com/api/exposed_jobs/');
    if (!Array.isArray(data)) return [];
    return data.map((item) =>
      rawJob({
        id: `workingnomads-${item.url}`,
        title: item.title,
        company: item.company_name || 'Unknown',
        location: item.location || 'Remote',
        applyUrl: item.url,
        source: 'Working Nomads',
        description: stripHtml(
          `${item.category_name || ''} ${Array.isArray(item.tags) ? item.tags.join(' ') : item.tags || ''} ${item.description || ''}`
        ),
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
      headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${USER_AGENT})` },
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
    const pubDateRaw =
      (block.match(/<pubDate>(.*?)<\/pubDate>/) ||
        block.match(/<dc:date>(.*?)<\/dc:date>/) ||
        block.match(/<updated>(.*?)<\/updated>/))?.[1] || '';
    const postedAt =
      pubDateRaw && !Number.isNaN(new Date(pubDateRaw).getTime())
        ? new Date(pubDateRaw).toISOString()
        : null;
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
        postedAt,
        atsType: 'job-board',
      })
    );
  }
  return jobs;
}

async function fetchDevItJobs() {
  const jobs = [];
  // US feed only — UK feed (devitjobs.uk) excluded; opt-in via JOB_SOURCES_ENABLED=devitjobs if needed
  for (const [feedUrl, source] of [['https://devitjobs.com/job_feed.xml', 'DevITJobs']]) {
    try {
      const res = await fetch(feedUrl, {
        headers: { 'User-Agent': USER_AGENT },
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
      headers: { 'User-Agent': USER_AGENT },
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
  jobicy: fetchJobicy,
  himalayas: fetchHimalayas,
  weworkremotely: fetchWeWorkRemotely,
  greenhouse: fetchGreenhouseBoards,
  lever: fetchLeverCompanies,
  ashby: fetchAshbyOrgs,
  jungle: fetchJungle,
  roberthalf: fetchRobertHalf,
  arbeitnow: fetchArbeitnow,
  jobspresso: fetchJobspresso,
  fourdayweek: fetchFourDayWeek,
  landingjobs: fetchLandingJobs,
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
  fetchText,
  fetchPostJson,
  SOURCE_FETCHERS,
  fetchRemoteOk,
  fetchRemotive,
  fetchJobicy,
  fetchGreenhouseBoards,
  fetchLeverCompanies,
  fetchAshbyOrgs,
  fetchJungle,
  fetchRobertHalf,
  fetchArbeitnow,
  fetchJobspresso,
  fetchFourDayWeek,
  fetchLandingJobs,
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
