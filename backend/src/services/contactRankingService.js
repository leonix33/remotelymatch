const RECRUITER_ROLE_RE =
  /recruiter|talent acquisition|technical recruiter|hiring manager|people operations|human resources|\bhr\b|talent partner/i;
const GENERIC_EMAIL_RE =
  /^(jobs|hello|support|info|contact|all|contests|hr|careers|apply|admin|office|team|sales)@/i;
const JOB_BOARD_DOMAINS = new Set([
  'weworkremotely.com',
  'remoteok.com',
  'remotive.com',
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'dice.com',
  'monster.com',
  'flexjobs.com',
  'jobgether.com',
  'himalayas.app',
  'nodesk.co',
]);

function isGenericInbox(email = '') {
  return GENERIC_EMAIL_RE.test(String(email).trim().toLowerCase());
}

function scoreContact(contact = {}) {
  let score = 0;
  const email = String(contact.email || '').trim().toLowerCase();
  const role = String(contact.role || '');
  const source = String(contact.source || '');

  if (!email) score -= 100;
  if (contact.verified) score += 60;
  if (contact.confidence === 'high') score += 35;
  else if (contact.confidence === 'medium') score += 15;
  if (source === 'apollo.io') score += 20;
  if (source === 'hunter.io') score += 18;
  if (source === 'job_description') score += 25;
  if (RECRUITER_ROLE_RE.test(role)) score += 30;
  if (contact.name && contact.name.split(/\s+/).length >= 2) score += 10;
  if (isGenericInbox(email)) score -= 50;
  if (/(ceo|founder|chief executive)/i.test(role) && !RECRUITER_ROLE_RE.test(role)) score -= 15;
  if (email.includes('weworkremotely') || email.includes('remoteok')) score -= 40;

  return score;
}

function rankContacts(contacts = []) {
  const seen = new Set();
  const unique = [];
  for (const contact of contacts) {
    const key = (contact.email || contact.name || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({
      ...contact,
      trustScore: scoreContact(contact),
      recommended: false,
      genericInbox: isGenericInbox(contact.email),
    });
  }

  unique.sort((a, b) => b.trustScore - a.trustScore);
  let recommendedSlots = 0;
  for (const contact of unique) {
    if (!contact.email || contact.genericInbox) continue;
    if (contact.trustScore < 40) continue;
    contact.recommended = true;
    recommendedSlots += 1;
    if (recommendedSlots >= 5) break;
  }

  return unique;
}

function pickBestRecipient(contacts = []) {
  const ranked = rankContacts(contacts);
  const best =
    ranked.find((c) => c.recommended && c.email) ||
    ranked.find((c) => c.email && !c.genericInbox) ||
    ranked.find((c) => c.email) ||
    null;
  if (!best) return { email: '', name: '', source: 'linkedin_search', phone: '' };
  return {
    email: best.email,
    name: best.name || '',
    source: best.source || 'enrichment',
    phone: best.phone || '',
    trustScore: best.trustScore,
    verified: Boolean(best.verified),
  };
}

function resolveEnrichmentDomain(job = {}) {
  const recruiterContactService = require('./recruiterContactService');
  const urlDomain = recruiterContactService.domainFromUrl(job.url || job.applyUrl || job.jobUrl || '');
  if (urlDomain && !JOB_BOARD_DOMAINS.has(urlDomain)) {
    return urlDomain;
  }

  const company = String(job.company || '').trim().toLowerCase();
  const companyDomain = company.replace(/[^a-z0-9.]/g, '');
  if (companyDomain.includes('.') && companyDomain.length > 3) {
    return companyDomain;
  }

  const slug = company.replace(/[^a-z0-9]+/g, '');
  if (slug) return `${slug}.com`;
  return urlDomain || '';
}

module.exports = {
  rankContacts,
  pickBestRecipient,
  scoreContact,
  isGenericInbox,
  resolveEnrichmentDomain,
  JOB_BOARD_DOMAINS,
};
