function guessCompany() {
  const host = location.hostname.replace(/^www\./, '');
  const parts = host.split('.');
  if (parts.length >= 2) return parts[parts.length - 2];
  return host;
}

function scrapeApplicantCount(root = document) {
  const scope = root?.querySelector ? root : document;
  const text = scope.innerText || scope.textContent || '';

  const over = text.match(/over\s+(\d[\d,]*)\s+applicants?/i);
  if (over) {
    const count = Number(over[1].replace(/,/g, ''));
    return { applicantCount: count, applicantCountLabel: `Over ${count} applicants`, applicantCountCapped: true };
  }

  const among = text.match(/among the first\s+(\d[\d,]*)\s+applicants?/i);
  if (among) {
    const count = Number(among[1].replace(/,/g, ''));
    return { applicantCount: count, applicantCountLabel: `First ${count} applicants`, applicantCountCapped: false };
  }

  const plain = text.match(/(\d[\d,]*)\s+applicants?/i);
  if (plain) {
    const count = Number(plain[1].replace(/,/g, ''));
    return { applicantCount: count, applicantCountLabel: `${count} applicants`, applicantCountCapped: false };
  }

  return null;
}

function attachApplicantFields(job, root) {
  const parsed = scrapeApplicantCount(root);
  return parsed ? { ...job, ...parsed } : job;
}

function scrapeLinkedIn() {
  const title =
    document.querySelector('.job-details-jobs-unified-top-card__job-title h1')?.innerText?.trim() ||
    document.querySelector('.jobs-unified-top-card__job-title')?.innerText?.trim() ||
    document.querySelector('.top-card-layout__title')?.innerText?.trim() ||
    document.querySelector('h1')?.innerText?.trim();
  const company =
    document.querySelector('.job-details-jobs-unified-top-card__company-name a')?.innerText?.trim() ||
    document.querySelector('.jobs-unified-top-card__company-name a')?.innerText?.trim() ||
    document.querySelector('.topcard__org-name-link')?.innerText?.trim() ||
    document.querySelector('[data-test-company-name]')?.innerText?.trim();
  return attachApplicantFields(
    { url: location.href, title: title || document.title, company: company || guessCompany(), source: 'linkedin' },
    document
  );
}

function scrapeIndeed() {
  const title =
    document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')?.innerText?.trim() ||
    document.querySelector('.jobsearch-JobInfoHeader-title')?.innerText?.trim() ||
    document.querySelector('h1')?.innerText?.trim() ||
    document.title;
  const company =
    document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText?.trim() ||
    document.querySelector('[data-company-name]')?.innerText?.trim() ||
    document.querySelector('.jobsearch-InlineCompanyRating a')?.innerText?.trim() ||
    document.querySelector('.jobsearch-CompanyInfoWithoutHeaderImage a')?.innerText?.trim() ||
    guessCompany();
  return attachApplicantFields({ url: location.href, title, company, source: 'indeed' }, document);
}

function scrapeWellfound() {
  const title =
    document.querySelector('[data-test="JobDetail"] h1')?.innerText?.trim() ||
    document.querySelector('h1')?.innerText?.trim() ||
    document.title;
  const company =
    document.querySelector('[data-test="StartupLink"]')?.innerText?.trim() ||
    document.querySelector('a[href*="/company/"]')?.innerText?.trim() ||
    document.querySelector('[class*="startup"]')?.innerText?.trim() ||
    guessCompany();
  return { url: location.href, title, company, source: 'wellfound' };
}

function scrapeGeneric() {
  const title =
    document.querySelector('h1')?.innerText?.trim() ||
    document.querySelector('[data-automation-id="jobPostingHeader"]')?.innerText?.trim() ||
    document.title;
  const company =
    document.querySelector('[data-company]')?.getAttribute('data-company') ||
    document.querySelector('.company, .employer, [class*="company"]')?.innerText?.trim() ||
    guessCompany();
  return { url: location.href, title, company };
}

function isLinkedInSearchPage() {
  return (
    location.hostname.includes('linkedin.com') &&
    (location.pathname.includes('/jobs/search') ||
      location.pathname.includes('/jobs/collections') ||
      location.pathname.startsWith('/jobs/') && document.querySelector('.jobs-search-results-list, .scaffold-layout__list'))
  );
}

function normalizeJobUrl(href) {
  if (!href) return '';
  try {
    const u = new URL(href, location.origin);
    return `${u.origin}${u.pathname.split('?')[0]}`;
  } catch {
    return href;
  }
}

function scrapeLinkedInSearchJobs() {
  const selectors = [
    'li.jobs-search-results__list-item',
    'li.scaffold-layout__list-item',
    '[data-occludable-job-id]',
  ];
  const nodes = new Set();
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((n) => nodes.add(n));
  }

  const jobs = [];
  for (const card of nodes) {
    const jobKey =
      card.getAttribute('data-occludable-job-id') ||
      card.querySelector('[data-job-id]')?.getAttribute('data-job-id') ||
      card.querySelector('[data-entity-urn]')?.getAttribute('data-entity-urn');
    const linkEl =
      card.querySelector('a[href*="/jobs/view/"]') ||
      card.querySelector('.job-card-container__link') ||
      card.querySelector('a.base-card__full-link');
    const url = normalizeJobUrl(linkEl?.href);
    const title =
      card.querySelector('.job-card-list__title, .job-card-container__link, .base-search-card__title')?.innerText?.trim() ||
      linkEl?.innerText?.trim();
    const company =
      card.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .base-search-card__subtitle')?.innerText?.trim();
    if (!url && !jobKey) continue;
    jobs.push(
      attachApplicantFields(
        {
          jobKey: jobKey || url,
          url: url || (jobKey ? `https://www.linkedin.com/jobs/view/${jobKey}` : ''),
          title: title || 'LinkedIn role',
          company: company || 'Unknown',
        },
        card
      )
    );
  }
  return jobs;
}

const SEEN_KEY = 'linkedinSeenJobKeys';
let watchEnabled = true;
let scanTimer = null;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

async function loadWatchSetting() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['linkedinWatchEnabled'], (data) => {
      watchEnabled = data.linkedinWatchEnabled !== false;
      resolve(watchEnabled);
    });
  });
}

async function scanLinkedInSearch() {
  if (!isLinkedInSearchPage() || !watchEnabled) return;

  const jobs = scrapeLinkedInSearchJobs();
  if (!jobs.length) return;

  const { linkedinSeenJobKeys = {} } = await storageGet([SEEN_KEY]);
  const searchKey = location.pathname + location.search;
  const seenForSearch = new Set(linkedinSeenJobKeys[searchKey] || []);
  const newJobs = [];

  for (const job of jobs) {
    const key = job.jobKey || job.url;
    if (!key || seenForSearch.has(key)) continue;
    seenForSearch.add(key);
    newJobs.push(job);
  }

  linkedinSeenJobKeys[searchKey] = [...seenForSearch].slice(-500);
  await storageSet({ [SEEN_KEY]: linkedinSeenJobKeys });

  if (!newJobs.length) return;

  chrome.runtime.sendMessage({ type: 'INGEST_LINKEDIN_JOBS', jobs: newJobs }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.ok && response.data?.ingested > 0) {
      showToast(`${response.data.ingested} new job(s) queued — check remotelymatch on your phone`);
    }
  });
}

function scheduleScan() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(scanLinkedInSearch, 2500);
}

function showToast(text) {
  const id = 'remotelymatch-toast';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:2147483647;max-width:320px;padding:12px 16px;' +
      'background:#0f172a;color:#5eead4;border:1px solid #14b8a6;border-radius:12px;font:13px system-ui;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.4)';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 5000);
}

function startLinkedInWatcher() {
  if (!location.hostname.includes('linkedin.com')) return;
  loadWatchSetting().then(() => {
    if (!isLinkedInSearchPage()) return;
    scheduleScan();
    const observer = new MutationObserver(scheduleScan);
    const list = document.querySelector('.jobs-search-results-list, .scaffold-layout__list, main');
    if (list) observer.observe(list, { childList: true, subtree: true });
    setInterval(scheduleScan, 45000);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'scrape') {
    const host = location.hostname;
    const onLinkedIn = host.includes('linkedin.com');
    const onWellfound = host.includes('wellfound.com') || host.includes('angel.co');
    const onIndeed = host.includes('indeed.com');
    sendResponse(
      onLinkedIn
        ? scrapeLinkedIn()
        : onWellfound
          ? scrapeWellfound()
          : onIndeed
            ? scrapeIndeed()
            : scrapeGeneric()
    );
  }
  if (msg.type === 'WATCH_SETTING_CHANGED') {
    loadWatchSetting().then(() => sendResponse({ watchEnabled }));
    return true;
  }
  return true;
});

startLinkedInWatcher();
