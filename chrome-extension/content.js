function guessCompany() {
  const host = location.hostname.replace(/^www\./, '');
  const parts = host.split('.');
  if (parts.length >= 2) return parts[parts.length - 2];
  return host;
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
  return { url: location.href, title: title || document.title, company: company || guessCompany(), source: 'linkedin' };
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
  return { url: location.href, title, company, source: 'indeed' };
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
  return true;
});
