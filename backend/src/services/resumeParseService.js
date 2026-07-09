const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { normalizeResumeLayout, preserveLineBreaksFromExtracted } = require('./resumeLayoutService');
const { repairResumeText, prepareResumeTextForParsing } = require('./resumeRepairService');

const GENERAL_MUST_CATALOG = [
  'project management',
  'project manager',
  'program management',
  'agile',
  'scrum',
  'kanban',
  'jira',
  'confluence',
  'stakeholder',
  'stakeholder management',
  'pmp',
  'lean',
  'six sigma',
  'microsoft office',
  'excel',
  'powerpoint',
  'word',
  'google sheets',
  'sales',
  'marketing',
  'digital marketing',
  'content marketing',
  'seo',
  'sem',
  'crm',
  'hubspot',
  'salesforce',
  'customer success',
  'account management',
  'business analysis',
  'business analyst',
  'data analysis',
  'financial analysis',
  'financial modeling',
  'accounting',
  'bookkeeping',
  'quickbooks',
  'human resources',
  'recruiting',
  'talent acquisition',
  'onboarding',
  'training',
  'public speaking',
  'presentation',
  'negotiation',
  'contract management',
  'vendor management',
  'cross-functional',
  'leadership',
  'team leadership',
  'operations',
  'supply chain',
  'logistics',
  'healthcare',
  'patient care',
  'clinical',
  'teaching',
  'curriculum',
  'instruction',
  'legal',
  'paralegal',
  'compliance',
  'writing',
  'editing',
  'copywriting',
  'graphic design',
  'figma',
  'adobe',
  'photoshop',
  'illustrator',
  'research',
  'reporting',
  'budgeting',
  'forecasting',
  'risk management',
  'quality assurance',
  'process improvement',
];

const GENERAL_NICE_CATALOG = [
  'notion',
  'asana',
  'trello',
  'monday.com',
  'slack',
  'zoom',
  'tableau',
  'power bi',
  'looker',
  'sap',
  'oracle',
  'workday',
  'zendesk',
  'intercom',
  'shopify',
  'e-commerce',
  'social media',
  'linkedin',
  'public relations',
  'event planning',
  'fundraising',
  'grant writing',
  'nonprofit',
  'real estate',
  'insurance',
  'banking',
  'retail',
  'hospitality',
  'construction',
  'manufacturing',
];

const MUST_HAVE_CATALOG = [
  'kubernetes',
  'k8s',
  'terraform',
  'aws',
  'azure',
  'gcp',
  'google cloud',
  'docker',
  'linux',
  'python',
  'go',
  'golang',
  'java',
  'ci/cd',
  'cicd',
  'jenkins',
  'github actions',
  'gitlab',
  'ansible',
  'puppet',
  'chef',
  'helm',
  'argocd',
  'argo cd',
  'devops',
  'sre',
  'site reliability',
  'platform engineer',
  'cloud engineer',
  'infrastructure',
  'networking',
  'bash',
  'shell',
  'sql',
  'postgresql',
  'mysql',
  'mongodb',
  'redis',
  'nginx',
  'apache',
  'istio',
  'service mesh',
  'vpc',
  'iam',
  'lambda',
  'ecs',
  'eks',
  'aks',
  'gke',
  'pulumi',
  'cloudformation',
  'bicep',
  'vault',
  'consul',
];

const NICE_TO_HAVE_CATALOG = [
  'databricks',
  'spark',
  'kafka',
  'prometheus',
  'grafana',
  'datadog',
  'new relic',
  'splunk',
  'elk',
  'elasticsearch',
  'opentelemetry',
  'observability',
  'mlops',
  'machine learning',
  'airflow',
  'dbt',
  'snowflake',
  'bigquery',
  'redis',
  'rabbitmq',
  'graphql',
  'typescript',
  'node.js',
  'nodejs',
  'react',
  'vue',
  'rust',
  'security',
  'soc2',
  'hipaa',
  'pci',
  'finops',
  'cost optimization',
];

const TITLE_HINTS = [
  'software engineer',
  'backend engineer',
  'frontend engineer',
  'full stack engineer',
  'data engineer',
  'data scientist',
  'product manager',
  'product designer',
  'project manager',
  'marketing manager',
  'content writer',
  'copywriter',
  'sales representative',
  'account executive',
  'customer success manager',
  'business analyst',
  'operations manager',
  'human resources',
  'recruiter',
  'financial analyst',
  'accountant',
  'graphic designer',
  'ux designer',
  'ui designer',
  'devops engineer',
  'site reliability engineer',
  'platform engineer',
  'cloud engineer',
  'infrastructure engineer',
  'systems engineer',
  'security engineer',
  'support specialist',
  'technical writer',
  'executive assistant',
  'virtual assistant',
];

function normalize(text = '') {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesSkill(text, skill) {
  const hay = normalize(text);
  const needle = normalize(skill);
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  if (needle.includes('/') || needle.includes(' ')) return hay.includes(needle);
  const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(hay);
}

function uniqueSkills(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = normalize(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function scanCatalog(text, catalog) {
  return uniqueSkills(catalog.filter((skill) => includesSkill(text, skill)));
}

function extractSkillsFromText(text) {
  const mustHave = uniqueSkills([
    ...scanCatalog(text, MUST_HAVE_CATALOG),
    ...scanCatalog(text, GENERAL_MUST_CATALOG),
  ]);
  const niceToHave = uniqueSkills([
    ...scanCatalog(text, NICE_TO_HAVE_CATALOG),
    ...scanCatalog(text, GENERAL_NICE_CATALOG),
  ]).filter((skill) => !mustHave.some((m) => normalize(m) === normalize(skill)));
  return {
    mustHave,
    niceToHave,
    all: uniqueSkills([...mustHave, ...niceToHave]),
  };
}

function suggestTitles(text) {
  const normalized = normalize(text);
  return uniqueSkills(TITLE_HINTS.filter((title) => normalized.includes(title)));
}

function suggestHeadline(text, extractedSkills) {
  const top = (extractedSkills.mustHave.length ? extractedSkills.mustHave : extractedSkills.all).slice(0, 4);
  const titles = suggestTitles(text);
  const role =
    titles[0] ||
    (top.length ? 'Professional' : '');
  if (!top.length && !role) return '';
  const skillsLine = top.map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase())).join(' | ');
  return role ? `${role} | ${skillsLine}`.slice(0, 120) : skillsLine.slice(0, 120);
}

function computeResumeScore(profile) {
  const text = (profile?.resumeText || '').trim();
  const extracted = profile?.extractedSkills?.length
    ? profile.extractedSkills
    : extractSkillsFromText(text).all;

  let score = 0;
  const len = text.length;

  if (len > 0) score += 15;
  if (len >= 200) score += 15;
  if (len >= 500) score += 10;
  if (len >= 1200) score += 10;

  const mustCount = profile?.mustHaveSkills?.length || 0;
  const niceCount = profile?.niceToHaveSkills?.length || 0;
  if (mustCount >= 3) score += 15;
  if (mustCount >= 6) score += 5;
  if (niceCount >= 2) score += 5;

  if (profile?.headline?.trim()) score += 10;
  if (profile?.targetTitles?.length) score += 10;
  if (extracted.length >= 5) score += 10;
  if (extracted.length >= 10) score += 5;

  return Math.min(100, score);
}

function isUnreadableResumeText(text = '') {
  const trimmed = String(text).trim();
  if (!trimmed.length) return false;
  if (trimmed.length < 20) {
    if (trimmed.startsWith('PK') || /\[Content_Types\]|word\/document\.xml/i.test(trimmed)) return true;
    return false;
  }

  const sample = trimmed.slice(0, 4000);

  if (
    /\[Content_Types\]|word\/document\.xml|word\/_rels|word\/fontTable\.xml|word\/webSettings\.xml|_rels\/\.rels|theme\/theme/i.test(
      sample
    )
  ) {
    return true;
  }

  if (sample.startsWith('PK') || (sample.includes('PK') && sample.includes('.xml'))) {
    return true;
  }

  let controlChars = 0;
  const sampleLen = Math.min(sample.length, 800);
  for (let i = 0; i < sampleLen; i += 1) {
    const code = sample.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) controlChars += 1;
  }
  if (controlChars > 8) return true;

  const letters = (sample.match(/[A-Za-z]/g) || []).length;
  if (letters < sampleLen * 0.1) return true;

  const words = sample.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w));
  if (sample.length > 300 && words.length < 8) return true;

  return false;
}

async function extractTextFromBuffer(buffer, filename = '') {
  const name = filename.toLowerCase();
  if (name.endsWith('.pdf')) {
    const data = await pdf(buffer);
    const preserved = preserveLineBreaksFromExtracted(data.text || '');
    return normalizeResumeLayout(preserved);
  }
  if (name.endsWith('.docx')) {
    try {
      const { value } = await mammoth.extractRawText({ buffer });
      const preserved = preserveLineBreaksFromExtracted(value || '');
      return normalizeResumeLayout(preserved);
    } catch (err) {
      const error = new Error('Could not read this Word file. Try saving as PDF or paste your resume text.');
      error.status = 400;
      throw error;
    }
  }
  if (name.endsWith('.doc')) {
    const err = new Error('Legacy .doc files are not supported. Save as .docx or PDF and upload again.');
    err.status = 400;
    throw err;
  }
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.text')) {
    return normalizeResumeLayout(buffer.toString('utf8').trim());
  }

  const asText = buffer.toString('utf8').trim();
  if (isUnreadableResumeText(asText)) {
    const err = new Error(
      'Unsupported file type. Upload PDF, .docx, .txt, or .md — or paste your resume text below.'
    );
    err.status = 400;
    throw err;
  }
  return normalizeResumeLayout(asText);
}

function mergeSkillLists(existing, incoming) {
  const lines = String(existing || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const merged = uniqueSkills([...lines, ...incoming]);
  return merged.join('\n');
}

const DEFAULT_ONBOARDING_TITLES = [
  'devops engineer',
  'site reliability engineer',
  'platform engineer',
  'cloud engineer',
];

const DEFAULT_ONBOARDING_SKILLS = [
  'kubernetes',
  'terraform',
  'aws',
  'azure',
  'docker',
  'linux',
  'python',
  'ci/cd',
];

function isDefaultOnboardingCriteria(profile = {}) {
  const titles = (profile.targetTitles || []).map(normalize);
  const skills = (profile.mustHaveSkills || []).map(normalize);
  const titleSet = new Set(titles);
  const skillSet = new Set(skills);
  const defaultTitleHits = DEFAULT_ONBOARDING_TITLES.filter((t) => titleSet.has(t)).length;
  const defaultSkillHits = DEFAULT_ONBOARDING_SKILLS.filter((s) => skillSet.has(s)).length;
  return (
    (titles.length > 0 && defaultTitleHits >= Math.min(3, titles.length)) ||
    (skills.length > 0 && defaultSkillHits >= Math.min(5, skills.length))
  );
}

function criteriaFromResumeText(text = '') {
  const extracted = extractSkillsFromText(text);
  const suggestedTitles = suggestTitles(text);
  return {
    targetTitles: suggestedTitles.length ? suggestedTitles : [],
    mustHaveSkills: extracted.mustHave,
    niceToHaveSkills: extracted.niceToHave,
    extractedSkills: extracted.all,
  };
}

function profileResumeAlignment(profile = {}) {
  const resumeBlob = normalize(profile.resumeText || '');
  if (!resumeBlob || resumeBlob.length < 50) {
    return { aligned: true, overlap: 1, reason: null, mustHits: 0, titleHits: 0 };
  }

  const mustSkills = (profile.mustHaveSkills || []).map(normalize).filter(Boolean);
  const targetTitles = (profile.targetTitles || []).map(normalize).filter(Boolean);
  const resumeSkills = (
    profile.extractedSkills?.length
      ? profile.extractedSkills
      : extractSkillsFromText(resumeBlob).all
  ).map(normalize);

  const mustHits = mustSkills.filter((skill) => resumeBlob.includes(skill)).length;
  const titleHits = targetTitles.filter((title) => {
    if (resumeBlob.includes(title)) return true;
    const words = title.split(/\s+/).filter((w) => w.length > 3);
    return words.length > 0 && words.some((w) => resumeBlob.includes(w));
  }).length;

  const usesDefaults = isDefaultOnboardingCriteria(profile);
  const mustOverlap = mustSkills.length ? mustHits / mustSkills.length : 1;
  const titleOverlap = targetTitles.length ? titleHits / targetTitles.length : 1;
  const resumeSkillHits = resumeSkills.filter((skill) =>
    mustSkills.some((must) => must === skill || resumeBlob.includes(must))
  ).length;

  const aligned =
    mustHits >= 2 || mustOverlap >= 0.35 || (titleHits >= 1 && mustHits >= 1) || resumeSkillHits >= 3;

  let reason = null;
  if (!aligned) {
    if (usesDefaults && mustHits < 2) {
      reason =
        'Your profile still has default DevOps search settings that do not match your resume. Re-upload your resume or update target roles and skills in Profile.';
    } else if (mustHits === 0 && titleHits === 0) {
      reason =
        'Your resume does not match your target roles and skills. Update Profile to match your resume, or upload a resume that fits this job search.';
    } else {
      reason =
        'Your resume only partially matches your search criteria. Lower your match threshold or align your target roles and skills with your resume.';
    }
  }

  return {
    aligned,
    overlap: Math.max(mustOverlap, titleOverlap),
    mustHits,
    titleHits,
    usesDefaults,
    reason,
  };
}

function shouldReplaceCriteriaFromResume(profile = {}, parsed = {}) {
  if (!parsed.resumeText || parsed.resumeText.length < 50) return false;
  const alignment = profileResumeAlignment({
    ...profile,
    resumeText: parsed.resumeText,
    extractedSkills: parsed.extractedSkills?.all || [],
  });
  return !alignment.aligned || isDefaultOnboardingCriteria(profile);
}

async function parseResumeFile(buffer, filename = 'resume.pdf') {
  const resumeText = await extractTextFromBuffer(buffer, filename);
  return buildParseResult(resumeText);
}

function buildParseResult(resumeText) {
  if (!resumeText || resumeText.length < 20 || isUnreadableResumeText(resumeText)) {
    const err = new Error(
      'Could not extract readable text from this file. Upload PDF or .docx, or paste your resume text.'
    );
    err.status = 400;
    throw err;
  }

  const extractedSkills = extractSkillsFromText(resumeText);
  const suggestedTitles = suggestTitles(resumeText);
  const suggestedHeadline = suggestHeadline(resumeText, extractedSkills);
  const extractedContact = extractContactFromResume(resumeText);

  return {
    resumeText,
    extractedSkills,
    suggestedTitles,
    suggestedHeadline,
    extractedContact,
    wordCount: resumeText.split(/\s+/).filter(Boolean).length,
    charCount: resumeText.length,
  };
}

/** Pull name, email, phone, and links from resume header for profile auto-fill */
function extractContactFromResume(resumeText = '') {
  const text = String(resumeText || '');
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  const phoneMatch = text.match(
    /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}(?:\s*(?:ext|x)\.?\s*\d+)?/i
  );
  const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w%-]+/i);
  const githubMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i);
  const portfolioMatch = text.match(
    /https?:\/\/(?!(?:www\.)?linkedin\.com|(?:www\.)?github\.com)[\w.-]+\.[a-z]{2,}(?:\/[^\s)]*)?/i
  );

  let applicantName = '';
  for (const line of lines.slice(0, 6)) {
    if (line.length > 70 || line.length < 3) continue;
    if (/@|https?:\/\/|linkedin\.com|github\.com|\(\d{3}\)|\d{3}[-.\s]\d{3}/i.test(line)) continue;
    if (/^(resume|curriculum vitae|cv)$/i.test(line)) continue;
    if (/^[A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){0,4}$/.test(line)) {
      applicantName = line;
      break;
    }
  }

  const normalizeUrl = (url) => {
    if (!url) return '';
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  };

  return {
    applicantName,
    displayName: applicantName,
    digestEmail: emailMatch?.[0]?.toLowerCase() || '',
    contactPhone: phoneMatch?.[0] || '',
    linkedin: normalizeUrl(linkedinMatch?.[0] || ''),
    github: normalizeUrl(githubMatch?.[0] || ''),
    portfolio: portfolioMatch?.[0] || '',
  };
}

function parseResumeFromText(resumeText) {
  const cleaned = prepareResumeTextForParsing(resumeText);
  return buildParseResult(cleaned);
}

function enrichProfileResponse(profile) {
  const raw = profile.resumeText || '';
  const unreadable = raw.trim() ? isUnreadableResumeText(raw) : false;
  const resumeText = unreadable ? '' : prepareResumeTextForParsing(raw);
  const extractedSkills = unreadable
    ? []
    : profile.extractedSkills?.length > 0
      ? profile.extractedSkills
      : extractSkillsFromText(resumeText).all;

  const enriched = {
    ...profile,
    resumeText,
    extractedSkills,
    resumeScore: unreadable ? 0 : computeResumeScore({ ...profile, resumeText, extractedSkills }),
    resumeUnreadable: unreadable,
  };
  return enriched;
}

module.exports = {
  extractSkillsFromText,
  computeResumeScore,
  parseResumeFile,
  parseResumeFromText,
  enrichProfileResponse,
  mergeSkillLists,
  criteriaFromResumeText,
  profileResumeAlignment,
  shouldReplaceCriteriaFromResume,
  isDefaultOnboardingCriteria,
  isUnreadableResumeText,
  extractContactFromResume,
};
