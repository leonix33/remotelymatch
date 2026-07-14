const { parseResumeStructure } = require('./resumeStructureService');
const { splitExperienceContentIntoJobs, replaceExperienceSectionContent } = require('./resumeExperiencePreserveService');
const { isAccomplishmentLine } = require('./resumeExperiencePerfectionService');

const EXPERIENCE_BULLET_RE =
  /\b(architected|deployed|built|implemented|managed|led|designed|integrated|developed|automated|migrated|kubernetes|terraform|databricks|pyspark|azure|aws|ci\/cd|devsecops|etl|pipeline)\b/i;

const DEGREE_LINE_RE =
  /\b(bachelor|master|b\.?s\.?|m\.?s\.?|ph\.?d|degree|university|college|gpa|expected\s+\w+\s+\d{4})\b/i;

function decodeHtmlEntities(text = '') {
  return String(text || '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CERT_LINE_RE =
  /\b(certified|certification|certificate|credential|associate|professional|expert|fundamentals|CKA|CKAD|Terraform|Security\+|Network\+|Cloud\+|AWS |Azure |GCP |Databricks)\b/i;

function isCertificationLine(line) {
  const t = String(line || '').trim();
  if (!t) return false;
  if (/^(certifications?|credentials|licenses?)\b/i.test(t)) return false;
  return CERT_LINE_RE.test(t) && !/^[-•*]/.test(t);
}

function isMisplacedExperienceLine(line) {
  const t = String(line || '').trim();
  if (!t || DEGREE_LINE_RE.test(t) || isCertificationLine(t)) return false;
  if (!isAccomplishmentLine(t) && !EXPERIENCE_BULLET_RE.test(t)) return false;
  return (
    EXPERIENCE_BULLET_RE.test(t) ||
    /\b(architected|deployed|built|implemented|designed|integrated)\b/i.test(t)
  );
}

function extractSectionBody(text, structure, sectionKey) {
  const section = structure.sections.find((s) => s.key === sectionKey);
  if (!section?.heading) return { body: '', start: -1, end: -1 };

  const headingRe = new RegExp(`(${escapeRegExp(section.heading)}\\s*\\n)`, 'i');
  const match = String(text || '').match(headingRe);
  if (!match) return { body: '', start: -1, end: -1 };

  const start = match.index + match[0].length;
  let end = text.length;
  for (const next of structure.sections) {
    if (!next.heading || next.key === sectionKey) continue;
    const re = new RegExp(`\\n${escapeRegExp(next.heading)}\\s*\\n`, 'i');
    const nextMatch = text.slice(start).match(re);
    if (nextMatch?.index != null) {
      const absolute = start + nextMatch.index;
      if (absolute < end) end = absolute;
    }
  }
  return { body: text.slice(start, end), start, end };
}

function restoreImmutableSections(originalResume, tailoredText) {
  const originalStructure = parseResumeStructure(originalResume);
  const tailoredStructure = parseResumeStructure(tailoredText);
  let text = decodeHtmlEntities(tailoredText);

  for (const section of originalStructure.sections) {
    if (!section.immutable || !section.heading || !section.content) continue;

    let sourceContent = section.content;
    if (section.key === 'education') {
      const { cleanEducationSectionContent } = require('./resumeExperiencePreserveService');
      sourceContent = cleanEducationSectionContent(sourceContent);
    }

    const slice = extractSectionBody(text, tailoredStructure, section.key);
    if (slice.start < 0) {
      text = `${text.trim()}\n\n${section.heading}\n${sourceContent}`;
      continue;
    }
    text = `${text.slice(0, slice.start)}${sourceContent}${text.slice(slice.end)}`;
  }

  return text.trim();
}

function relocateMisplacedExperienceBullets(originalResume, tailoredText) {
  const structure = parseResumeStructure(tailoredText);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  if (!expSection?.heading) return tailoredText;

  const misplaced = [];
  let text = tailoredText;

  for (const key of ['education', 'certifications', 'credentials']) {
    const slice = extractSectionBody(text, structure, key);
    if (slice.start < 0 || !slice.body) continue;

    const kept = [];
    for (const line of slice.body.split('\n')) {
      const t = line.trim();
      if (!t) {
        kept.push(line);
        continue;
      }
      if (isMisplacedExperienceLine(t)) {
        misplaced.push(t.startsWith('-') ? t : `- ${t}`);
      } else {
        kept.push(line);
      }
    }

    text = `${text.slice(0, slice.start)}${kept.join('\n').trim()}${text.slice(slice.end)}`;
  }

  if (!misplaced.length) return text;

  const expSlice = extractSectionBody(text, parseResumeStructure(text), 'experience');
  if (expSlice.start < 0) return text;

  const mergedExp = `${expSlice.body.trim()}\n${misplaced.join('\n')}`.trim();
  return `${text.slice(0, expSlice.start)}${mergedExp}${text.slice(expSlice.end)}`;
}

function fixCoverLetterDuplicateApply(coverLetter = '') {
  return String(coverLetter)
    .replace(/\bI'm applying for apply for\b/gi, "I'm applying for")
    .replace(/\bI am applying for apply for\b/gi, 'I am applying for')
    .trim();
}

function restoreSectionFromOriginal(originalResume, tailoredText, sectionKey) {
  const originalStructure = parseResumeStructure(originalResume);
  const tailoredStructure = parseResumeStructure(tailoredText);
  const section = originalStructure.sections.find((s) => s.key === sectionKey);
  if (!section?.heading || !section.content) return tailoredText;

  const slice = extractSectionBody(tailoredText, tailoredStructure, sectionKey);
  if (slice.start < 0) return tailoredText;
  return `${tailoredText.slice(0, slice.start)}${section.content}${tailoredText.slice(slice.end)}`;
}

function sanitizeTailoredResume(originalResume, tailoredText, kit = {}) {
  let text = decodeHtmlEntities(tailoredText);
  text = restoreImmutableSections(originalResume, text);
  text = relocateMisplacedExperienceBullets(originalResume, text);

  const structure = parseResumeStructure(originalResume);
  const { preserveExperienceFromOriginal } = require('./resumeExperiencePreserveService');
  text = preserveExperienceFromOriginal(originalResume, text);

  const { enforceExperienceIntegrity } = require('./resumeExperiencePerfectionService');
  text = enforceExperienceIntegrity(originalResume, text);

  const coverLetter = fixCoverLetterDuplicateApply(kit.coverLetterParagraph || '');
  return { tailoredResumeText: text.trim(), coverLetterParagraph: coverLetter };
}

module.exports = {
  decodeHtmlEntities,
  restoreImmutableSections,
  relocateMisplacedExperienceBullets,
  sanitizeTailoredResume,
  fixCoverLetterDuplicateApply,
};
