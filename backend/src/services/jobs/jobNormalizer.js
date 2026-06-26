function stripHtml(text = '') {
  return String(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferRemoteType(location = '', description = '') {
  const blob = `${location} ${description}`.toLowerCase();
  if (/worldwide|anywhere|global/.test(blob)) return 'worldwide';
  if (/hybrid/.test(blob)) return 'hybrid';
  if (/remote|distributed|work from home|wfh/.test(blob)) return 'remote';
  if (/on-?site|in[- ]office/.test(blob)) return 'onsite';
  return 'unknown';
}

function parseSalaryNumbers(text = '') {
  const matches = String(text).match(/\$?\s?(\d{2,3}(?:,\d{3})+|\d{2,3})(?:k)?/gi) || [];
  const values = matches
    .map((m) => {
      const raw = m.replace(/[$,\s]/g, '').toLowerCase();
      const num = Number(raw.replace(/k$/, ''));
      if (!num) return 0;
      return raw.endsWith('k') ? num * 1000 : num;
    })
    .filter((n) => n >= 30000 && n <= 500000);
  if (!values.length) return { salaryMin: null, salaryMax: null };
  values.sort((a, b) => a - b);
  return { salaryMin: values[0], salaryMax: values[values.length - 1] };
}

function extractSkills(text = '') {
  const catalog = [
    'kubernetes', 'k8s', 'terraform', 'aws', 'azure', 'gcp', 'docker', 'python', 'go', 'golang',
    'java', 'react', 'node', 'typescript', 'javascript', 'linux', 'devops', 'sre', 'platform',
    'databricks', 'spark', 'kafka', 'ci/cd', 'cicd', 'observability', 'prometheus', 'grafana',
    'marketing', 'seo', 'sales', 'crm', 'hubspot', 'salesforce', 'design', 'figma', 'ux', 'ui',
    'product', 'analytics', 'sql', 'excel', 'finance', 'accounting', 'writing', 'content',
    'customer success', 'support', 'project management', 'agile', 'scrum', 'hr', 'recruiting',
  ];
  const hay = text.toLowerCase();
  return catalog.filter((skill) => hay.includes(skill));
}

function detectAtsFromUrl(url = '') {
  const lower = url.toLowerCase();
  if (lower.includes('greenhouse.io')) return 'greenhouse';
  if (lower.includes('lever.co')) return 'lever';
  if (lower.includes('ashbyhq.com')) return 'ashby';
  if (lower.includes('usajobs.gov')) return 'usajobs';
  if (lower.includes('wellfound.com') || lower.includes('angel.co')) return 'wellfound';
  if (lower.includes('workatastartup.com')) return 'workatastartup';
  return 'unknown';
}

/**
 * Normalize a raw job record into the canonical ingestion schema.
 */
function normalizeJob(raw) {
  const description = stripHtml(raw.description || '');
  const location = raw.location || 'Remote';
  const applyUrl = raw.applyUrl || raw.url || '';
  const salary = parseSalaryNumbers(`${raw.salaryText || ''} ${description}`);
  const skills = raw.skills?.length ? raw.skills : extractSkills(`${raw.title} ${description}`);
  const postedAt = raw.postedAt ? new Date(raw.postedAt) : raw.firstSeen ? new Date(raw.firstSeen) : null;
  const remoteType = raw.remoteType || inferRemoteType(location, description);

  const id = raw.id || raw.jobId;
  const source = raw.source || 'unknown';

  return {
    id,
    jobId: id,
    title: (raw.title || '').trim(),
    company: (raw.company || 'Unknown').trim(),
    location,
    remoteType,
    salaryMin: raw.salaryMin ?? salary.salaryMin,
    salaryMax: raw.salaryMax ?? salary.salaryMax,
    skills,
    description,
    applyUrl,
    url: applyUrl,
    source,
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt.toISOString() : null,
    atsType: raw.atsType || detectAtsFromUrl(applyUrl),
    tier: raw.tier || 'SECONDARY',
    score: raw.score || 0,
    matchPct: raw.matchPct || 0,
    firstSeen: postedAt || new Date(),
  };
}

module.exports = {
  normalizeJob,
  stripHtml,
  inferRemoteType,
  extractSkills,
  detectAtsFromUrl,
};
