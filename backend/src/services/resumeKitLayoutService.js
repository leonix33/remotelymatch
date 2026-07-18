const { parseResumeStructure } = require('./resumeStructureService');
const {
  splitExperienceContentIntoJobs,
  splitExperienceJobsNormalized,
  replaceExperienceSectionContent,
  stripBulletPrefix,
  preserveExperienceFromOriginal,
} = require('./resumeExperiencePreserveService');
const {
  buildExperienceBlueprint,
  splitJobHeaderAndBullets,
  enforceExperienceIntegrity,
} = require('./resumeExperiencePerfectionService');

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
const YEAR = '\\d{4}';
const DATE_RANGE_RE = new RegExp(
  `\\b(${MONTH}\\s+${YEAR})\\s*(?:[–\\-—]\\s*|\\s+to\\s+|\\s+)((?:Present|Current|Now)|${MONTH}\\s+${YEAR}|${YEAR})\\b`,
  'i'
);

const SKILLS_CATEGORY_MARKERS = [
  'Azure Platform:',
  'AWS Platform:',
  'Databricks & Data Platforms:',
  'Generative AI & MLOps:',
  'Containers & Kubernetes:',
  'IaC & Automation:',
  'CI/CD & DevSecOps:',
  'Security & Compliance:',
  'Observability & Reliability:',
];

const ACTION_VERB_RE =
  /\b(Architected|Built|Implemented|Designed|Led|Developed|Managed|Operated|Supported|Created|Established|Deployed|Migrated|Integrated|Improved|Automated|Configured|Enforced|Maintained|Coordinated|Delivered|Reduced|Optimized|Streamlined|Partnered|Authored|Conducted|Participated)\b/i;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCompanyKey(company) {
  return String(company || '')
    .split(/\s*\|\s*/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchTailoredBlockForBlueprint(blueprintEntry, tailoredJobs) {
  const companyKey = normalizeCompanyKey(blueprintEntry.company);
  if (companyKey) {
    const byCompany = tailoredJobs.find((job) => normalizeCompanyKey(job.company) === companyKey);
    if (byCompany) return byCompany.text;
  }
  const titleKey = String(blueprintEntry.title || '').toLowerCase().trim();
  if (titleKey) {
    const byTitle = tailoredJobs.find((job) => String(job.title || '').toLowerCase().trim() === titleKey);
    if (byTitle) return byTitle.text;
  }
  return '';
}

function extractSectionContent(text, structure, sectionKey) {
  const section = structure.sections.find((s) => s.key === sectionKey);
  if (!section?.heading) return '';

  const headingRe = new RegExp(`${escapeRegExp(section.heading)}\\s*\\n`, 'i');
  const match = String(text || '').match(headingRe);
  if (!match) return '';

  const start = match.index + match[0].length;
  let end = text.length;
  for (const other of structure.sections) {
    if (!other.heading || other.key === sectionKey) continue;
    const re = new RegExp(`\\n${escapeRegExp(other.heading)}\\s*\\n`, 'i');
    const sectionMatch = text.slice(start).match(re);
    if (sectionMatch?.index != null) {
      const absolute = start + sectionMatch.index;
      if (absolute < end) end = absolute;
    }
  }
  return text.slice(start, end).trim();
}

function replaceSectionContent(text, structure, sectionKey, newContent) {
  const section = structure.sections.find((s) => s.key === sectionKey);
  if (!section?.heading || !newContent) return text;

  const headingRe = new RegExp(`(${escapeRegExp(section.heading)}\\s*\\n)`, 'i');
  const match = text.match(headingRe);
  if (!match) return `${text.trim()}\n\n${section.heading}\n${newContent}`;

  const startIdx = match.index + match[0].length;
  let endIdx = text.length;
  for (const other of structure.sections) {
    if (!other.heading || other.key === sectionKey) continue;
    const re = new RegExp(`\\n${escapeRegExp(other.heading)}\\s*\\n`, 'i');
    const sectionMatch = text.slice(startIdx).match(re);
    if (sectionMatch?.index != null) {
      const absolute = startIdx + sectionMatch.index;
      if (absolute < endIdx) endIdx = absolute;
    }
  }

  return `${text.slice(0, startIdx)}${newContent}${text.slice(endIdx)}`.trim();
}

function isRoleTagline(line) {
  const t = stripBulletPrefix(line);
  if (!/\|/.test(t) || t.length > 240) return false;
  if (ACTION_VERB_RE.test(t)) return false;
  const segments = t.split('|').map((s) => s.trim()).filter(Boolean);
  return segments.length >= 2 && segments.every((s) => s.length < 60);
}

function normalizeBullet(line) {
  return String(line || '').trim().replace(/^[-•*●▪]+\s+/, '');
}

function formatBullet(line) {
  const t = normalizeBullet(line);
  return t ? `- ${t}` : '';
}

function normalizeDateRange(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/\b(Feb|Jan|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\d{4})\b/gi, '$1 $2')
    .replace(/\b(\w{3})\s*(\d{4})\s*(Present|Current)\b/gi, '$1 $2 – Present')
    .replace(/\s*-\s*Present/gi, ' – Present')
    .replace(/\s*-\s*/g, ' – ');
}

function parseFlatJobHeaderLine(line) {
  const t = stripBulletPrefix(line);
  const dateMatch = t.match(DATE_RANGE_RE);
  if (!dateMatch) return { title: t, dates: '', company: '' };

  const dateStart = dateMatch.index;
  const title = t.slice(0, dateStart).trim();
  const afterDate = t.slice(dateStart + dateMatch[0].length).trim();
  const parts = afterDate.split('|').map((p) => p.trim()).filter(Boolean);
  const company = parts[0] || '';
  const location = parts.slice(1).join(' | ');
  return {
    title,
    dates: normalizeDateRange(dateMatch[0]),
    company: location ? `${company} | ${location}` : company,
  };
}

function formatJobBlockFromBlueprint(blueprintEntry, bullets) {
  const cleanedBullets = bullets
    .filter((b) => b && !isRoleTagline(b))
    .map((b) => formatBullet(b))
    .filter(Boolean);

  const title = String(blueprintEntry.title || '').trim();
  const company = String(blueprintEntry.company || '').trim();
  const headerText = String(blueprintEntry.header || '').trim();
  const headerLines = headerText.split('\n').map((l) => l.trim()).filter(Boolean);

  const dateLine =
    headerLines.find((l) => DATE_RANGE_RE.test(l)) ||
    (headerLines.length === 1 && DATE_RANGE_RE.test(headerLines[0]) ? headerLines[0] : '');

  const hasTitle = headerLines.some((l) => title && l.toLowerCase() === title.toLowerCase());
  const hasCompany =
    company &&
    headerLines.some((l) => normalizeCompanyKey(l) === normalizeCompanyKey(company));

  if (dateLine && title && !hasTitle) {
    const lines = [title, dateLine];
    if (company && !hasCompany) lines.push(company);
    return [...lines, ...cleanedBullets].filter(Boolean).join('\n');
  }

  if (headerLines.length >= 2) {
    return [...headerLines, ...cleanedBullets].join('\n');
  }

  const flatLine = headerLines[0] || '';
  if (DATE_RANGE_RE.test(flatLine)) {
    const parsed = parseFlatJobHeaderLine(flatLine);
    const resolvedTitle = parsed.title || title;
    const resolvedCompany = parsed.company || company;
    return [resolvedTitle, parsed.dates || flatLine, resolvedCompany, ...cleanedBullets]
      .filter(Boolean)
      .join('\n');
  }

  if (title || company) {
    return [title, company, ...cleanedBullets].filter(Boolean).join('\n');
  }

  return [headerText, ...cleanedBullets].filter(Boolean).join('\n');
}

function mergeBulletsForJob(blueprintEntry, tailoredBlock) {
  const tailored = splitJobHeaderAndBullets(tailoredBlock || '');
  const targetCount = blueprintEntry.bulletCount || blueprintEntry.originalBullets?.length || 0;
  const bullets = [];

  for (let i = 0; i < targetCount; i += 1) {
    if (tailored.bullets[i]) bullets.push(tailored.bullets[i]);
    else if (blueprintEntry.originalBullets?.[i]) bullets.push(blueprintEntry.originalBullets[i]);
  }

  return bullets;
}

function normalizeExperienceLayout(originalResume, tailoredText) {
  const structure = parseResumeStructure(originalResume);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  if (!expSection?.content) return tailoredText;

  const originalJobs = splitExperienceJobsNormalized(expSection.content);
  if (!originalJobs.length) return tailoredText;

  const blueprint = buildExperienceBlueprint(originalJobs);
  const tailoredJobs = splitExperienceContentIntoJobs(
    extractSectionContent(tailoredText, structure, 'experience')
  );

  const blocks = blueprint.map((bp) => {
    const matched = matchTailoredBlockForBlueprint(bp, tailoredJobs);
    const bullets = mergeBulletsForJob(bp, matched);
    return formatJobBlockFromBlueprint(bp, bullets);
  });

  return replaceExperienceSectionContent(tailoredText, structure, blocks.join('\n\n').trim());
}

function formatSkillsSectionContent(content) {
  if (!content?.trim()) return content;

  let out = content.trim();
  for (const marker of SKILLS_CATEGORY_MARKERS) {
    const re = new RegExp(`([^\\n.]{4,}?)\\s+(${escapeRegExp(marker)})`, 'g');
    out = out.replace(re, '$1\n\n$2');
  }
  const extraMarkers = [
    'Generative AI & MLOps:',
    'Containers & Kubernetes:',
    'IaC & Automation:',
    'CI/CD & DevSecOps:',
    'Security & Compliance:',
    'Observability & Reliability:',
  ];
  for (const marker of extraMarkers) {
    if (SKILLS_CATEGORY_MARKERS.includes(marker)) continue;
    const re = new RegExp(`([^\\n.]{4,}?)\\s+(${escapeRegExp(marker)})`, 'g');
    out = out.replace(re, '$1\n\n$2');
  }
  out = out.replace(/Microsoft Fabric\s+(AWS Platform:)/g, 'Microsoft Fabric\n\n$1');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function formatSkillsInResume(text, originalResume) {
  const structure = parseResumeStructure(originalResume);
  const skillsSection = structure.sections.find((s) => s.key === 'skills');
  if (!skillsSection?.heading) return text;

  const current = extractSectionContent(text, structure, 'skills');
  if (!current) return text;

  const formatted = formatSkillsSectionContent(current);
  return replaceSectionContent(text, structure, 'skills', formatted);
}

function formatEducationInResume(text, originalResume) {
  const structure = parseResumeStructure(originalResume);
  const eduSection = structure.sections.find((s) => s.key === 'education');
  if (!eduSection?.heading) return text;

  const originalLines = String(eduSection.content || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const current = extractSectionContent(text, structure, 'education');
  if (!current) return text;

  const degreeLines = originalLines.filter((l) => /\b(bachelor|master|b\.?s\.?|m\.?s\.?|degree|university|college)\b/i.test(l));
  if (!degreeLines.length) return text;

  const missing = degreeLines.filter((line) => !current.toLowerCase().includes(line.toLowerCase().slice(0, 24)));
  const merged = missing.length ? `${current}\n${missing.join('\n')}` : current;

  const neat = merged
    .replace(/Bachelor of Science\s*\n\s*Mathematics/gi, 'Bachelor of Science Mathematics')
    .replace(/(In Progress)\s*Bachelor/gi, '$1\nBachelor')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return replaceSectionContent(text, structure, 'education', neat);
}

function cleanHeaderArtifacts(text) {
  return String(text || '')
    .replace(/\|\s*\|\s*\|/g, ' | ')
    .replace(/\|\s*\|/g, ' | ')
    .replace(/[ \t]+\|$/gm, '')
    .replace(/\|\s*$/gm, '')
    .replace(/[ \t]{2,}/g, ' ');
}

function applyFinalResumeFormatting(originalResume, tailoredText) {
  if (!(originalResume || '').trim() || !(tailoredText || '').trim()) return tailoredText;

  let text = tailoredText;
  text = normalizeExperienceLayout(originalResume, text);
  text = formatSkillsInResume(text, originalResume);
  text = formatEducationInResume(text, originalResume);
  text = cleanHeaderArtifacts(text);
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeTailoredResumeLayout(originalResume, tailoredText) {
  if (!(originalResume || '').trim() || !(tailoredText || '').trim()) return tailoredText;

  const { parseResumeStructure } = require('./resumeStructureService');
  const {
    guardTailoredSummary,
    rebuildResumeInOriginalOrder,
    ensureSectionSpacing,
    fixGluedSectionHeadings,
  } = require('./resumeOrderGuardService');

  let text = rebuildResumeInOriginalOrder(originalResume, tailoredText);
  text = guardTailoredSummary(originalResume, text);
  text = preserveExperienceFromOriginal(originalResume, text);
  text = enforceExperienceIntegrity(originalResume, text);
  text = normalizeExperienceLayout(originalResume, text);
  text = formatSkillsInResume(text, originalResume);
  text = formatEducationInResume(text, originalResume);
  text = cleanHeaderArtifacts(text);
  text = ensureSectionSpacing(text, parseResumeStructure(originalResume));
  text = fixGluedSectionHeadings(text, parseResumeStructure(originalResume));
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = {
  normalizeTailoredResumeLayout,
  applyFinalResumeFormatting,
  normalizeExperienceLayout,
  formatSkillsSectionContent,
  formatJobBlockFromBlueprint,
  mergeBulletsForJob,
  isRoleTagline,
};
