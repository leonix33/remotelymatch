const { parseResumeStructure } = require('./resumeStructureService');

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
const YEAR = '\\d{4}';
const DATE_RANGE_RE = new RegExp(
  `\\b(${MONTH}\\s+${YEAR})\\s*(?:[–\\-—]\\s*|\\s+to\\s+|\\s+)((?:Present|Current|Now)|${MONTH}\\s+${YEAR}|${YEAR})\\b`,
  'i'
);

const JOB_ROLE_WORD =
  /\b(Engineer|Developer|Architect|Manager|Analyst|Consultant|Specialist|Administrator|Coordinator|Technician|Director|Supervisor|Associate|Intern|SRE|DevOps|Platform|Scientist|Technologist|Teacher|Professor|Instructor|Educator|Nurse|Designer|Therapist|Attorney|Accountant|Representative|Executive|Lead|Chef|Officer|Agent|Clerk|Assistant|Secretary|Planner|Estimator|Producer|Editor|Writer|Superintendent|Principal|Counselor|Therapist|Pharmacist|Electrician|Mechanic|Operator|Driver|Sales|Marketing|Recruiter|Trainer|Coach|Tutor|Librarian|Paralegal|Auditor|Broker|Trader|Banker|Inspector|Surveyor|Foreman|Supervisor)\b/i;

const MISPLACED_EDUCATION_BLOB_RE =
  /\b(certification portfolio|enterprise cloud platforms|Databricks SME|extensive certification|on-premises to cloud migration)\b/i;

const DEGREE_LINE_RE =
  /\b(bachelor|master|b\.?s\.?|m\.?s\.?|ph\.?d|degree|university|college|gpa|expected\s+\w+\s+\d{4})\b/i;

function cleanEducationSectionContent(content) {
  if (!content) return '';
  return content
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (MISPLACED_EDUCATION_BLOB_RE.test(t)) return false;
      if (
        t.length > 100 &&
        !DEGREE_LINE_RE.test(t) &&
        /\b(certification|expertise|platforms|Databricks|DevSecOps|Kubernetes|Generative AI)\b/i.test(t)
      ) {
        return false;
      }
      return true;
    })
    .join('\n')
    .trim();
}

function normalizeForMatch(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function lineAppearsInResume(line, resumeText) {
  const needle = normalizeForMatch(line);
  if (!needle || needle.length < 4) return true;
  const hay = normalizeForMatch(resumeText);
  if (hay.includes(needle)) return true;
  const tokens = needle.split(' ').filter((t) => t.length > 3);
  if (tokens.length < 2) return hay.includes(needle);
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits / tokens.length >= 0.85;
}

function isDateLine(line) {
  const t = String(line || '').trim();
  return t.length < 100 && DATE_RANGE_RE.test(t);
}

function isLikelyJobTitleLine(line) {
  const t = String(line || '').trim();
  if (!t || t.length > 140 || DATE_RANGE_RE.test(t) || /^[-•*]/.test(t)) return false;
  return JOB_ROLE_WORD.test(t);
}

function extractTitleFromJobBlock(block) {
  const lines = String(block || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return '';
  const dateIdx = lines.findIndex((l) => isDateLine(l));
  if (dateIdx > 0) return lines.slice(0, dateIdx).join(' ').trim();
  const flat = lines[0];
  const dateMatch = flat.match(DATE_RANGE_RE);
  if (dateMatch?.index > 0) return flat.slice(0, dateMatch.index).trim();
  return flat;
}

function extractCompanyFromJobBlock(block) {
  const lines = String(block || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const dateIdx = lines.findIndex((l) => isDateLine(l));
  if (dateIdx >= 0) {
    for (let i = dateIdx + 1; i < Math.min(dateIdx + 4, lines.length); i += 1) {
      const candidate = lines[i];
      if (!candidate || /^[-•*]/.test(candidate)) continue;
      if (isDateLine(candidate) || isLikelyJobTitleLine(candidate)) break;
      const company = candidate.split(/\s*\|\s*/)[0].trim();
      if (company.length >= 3 && company.length < 100) return company;
    }
  }

  const flat = lines[0] || '';
  const dateMatch = flat.match(DATE_RANGE_RE);
  if (dateMatch?.index != null) {
    const after = flat.slice(dateMatch.index + dateMatch[0].length).trim().replace(/\|.*$/, '').trim();
    if (after.length >= 3) return after;
  }

  for (const line of lines) {
    if (
      /\b(Inc|LLC|Corp|Health|Technology|Services|Global|Systems|Group|Mercy|Secours)\b/i.test(line) &&
      !isDateLine(line) &&
      !/^[-•*]/.test(line)
    ) {
      return line.split(/\s*\|\s*/)[0].trim();
    }
  }

  return '';
}

function splitExperienceContentIntoJobs(content) {
  const lines = String(content || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const chunks = [];
  let current = [];

  const flush = () => {
    if (current.length) chunks.push([...current]);
    current = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] || '';
    const currentHasDate = current.some((l) => DATE_RANGE_RE.test(l));
    const startsJob =
      (isLikelyJobTitleLine(line) && isDateLine(next)) ||
      (DATE_RANGE_RE.test(line) &&
        JOB_ROLE_WORD.test(line) &&
        line.length < 200 &&
        current.length > 0 &&
        currentHasDate);

    if (startsJob) {
      flush();
    }

    current.push(line);
  }
  flush();

  return chunks
    .map((chunkLines) => {
      const text = chunkLines.join('\n');
      return {
        text,
        title: extractTitleFromJobBlock(text),
        company: extractCompanyFromJobBlock(text),
      };
    })
    .filter((job) => job.text.length > 24);
}

function jobAppearsInResume(job, resumeText) {
  if (job.company && job.company.length > 4 && lineAppearsInResume(job.company, resumeText)) {
    return true;
  }
  if (job.title && job.company) {
    const marker = `${job.title} ${job.company}`;
    if (lineAppearsInResume(marker, resumeText)) return true;
  }
  if (job.text.length > 40 && lineAppearsInResume(job.text.slice(0, Math.min(80, job.text.length)), resumeText)) {
    return true;
  }
  return false;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function injectMissingExperienceJobs(tailoredText, structure, missingJobs) {
  if (!missingJobs.length) return tailoredText;

  const expSection = structure.sections.find((s) => s.key === 'experience');
  const heading = expSection?.heading || 'PROFESSIONAL EXPERIENCE';
  const block = missingJobs.map((j) => j.text).join('\n\n');
  const text = String(tailoredText || '').trim();
  if (!text) return `${heading}\n${block}`;

  const headingRe = new RegExp(`^${escapeRegExp(heading)}$`, 'im');
  if (!headingRe.test(text)) {
    return `${text}\n\n${heading}\n${block}`;
  }

  let insertAt = text.length;
  for (const section of structure.sections) {
    if (!section.heading || section.key === 'experience') continue;
    const re = new RegExp(`\\n${escapeRegExp(section.heading)}\\s*\\n`, 'i');
    const match = text.match(re);
    if (match?.index != null && match.index < insertAt) insertAt = match.index;
  }

  const before = text.slice(0, insertAt).trimEnd();
  const after = text.slice(insertAt).trim();
  return `${before}\n\n${block}${after ? `\n\n${after}` : ''}`.trim();
}

function stripMisplacedEducationBlob(text, structure) {
  const edu = structure.sections.find((s) => s.key === 'education');
  if (!edu?.heading) return text;

  const headingRe = new RegExp(`(${escapeRegExp(edu.heading)}\\n)`, 'i');
  if (!headingRe.test(text)) return text;

  const nextSection = structure.sections.find((s) => s.key !== 'education' && s.heading);
  const endRe = nextSection?.heading
    ? new RegExp(`\\n${escapeRegExp(nextSection.heading)}\\s*\\n`, 'i')
    : null;

  const startMatch = text.match(headingRe);
  const startIdx = startMatch.index + startMatch[0].length;
  const endMatch = endRe ? text.slice(startIdx).match(endRe) : null;
  const endIdx = endMatch ? startIdx + endMatch.index : text.length;

  const eduBody = text.slice(startIdx, endIdx);
  const cleanedLines = eduBody
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      return !(MISPLACED_EDUCATION_BLOB_RE.test(t) && t.length > 160);
    });

  return `${text.slice(0, startIdx)}${cleanedLines.join('\n')}${text.slice(endIdx)}`;
}

function extractAccomplishmentLines(block) {
  return String(block || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (!l || isDateLine(l) || isLikelyJobTitleLine(l)) return false;
      if (/^[-•*]/.test(l)) return true;
      if (DATE_RANGE_RE.test(l)) return false;
      return l.length >= 48;
    });
}

function normalizeCompanyKey(company) {
  return normalizeForMatch(String(company || '').split(/\s*\|\s*/)[0]);
}

function findCompanyIndex(text, company) {
  const raw = String(text || '');
  const needle = String(company || '').split(/\s*\|\s*/)[0].trim();
  if (!needle || needle.length < 3) return -1;
  const idx = raw.toLowerCase().indexOf(needle.toLowerCase());
  if (idx >= 0) return idx;
  const tokens = needle.toLowerCase().split(' ').filter((t) => t.length > 3);
  for (const token of tokens) {
    const tIdx = raw.toLowerCase().indexOf(token);
    if (tIdx >= 0) return tIdx;
  }
  return -1;
}

function findJobBlockStart(text, job) {
  const candidates = [job.title, job.company].filter(Boolean);
  let best = -1;
  for (const candidate of candidates) {
    const idx = findCompanyIndex(text, candidate);
    if (idx >= 0 && (best < 0 || idx < best)) best = idx;
  }
  return best;
}

function extractTailoredJobBlock(tailoredText, job, allJobs, jobIndex) {
  const start = findJobBlockStart(tailoredText, job);
  if (start < 0) return null;

  let end = tailoredText.length;
  for (let i = 0; i < allJobs.length; i += 1) {
    if (i === jobIndex) continue;
    const otherIdx = findCompanyIndex(tailoredText.slice(start + 1), allJobs[i].company);
    if (otherIdx >= 0) {
      const absolute = start + 1 + otherIdx;
      if (absolute > start && absolute < end) end = absolute;
    }
  }

  const expSectionEnd = findExperienceSectionEnd(tailoredText);
  if (expSectionEnd > start && expSectionEnd < end) end = expSectionEnd;

  return tailoredText.slice(start, end).trim();
}

function findExperienceSectionEnd(text) {
  const sectionBreak =
    /\n(?:EDUCATION|CERTIFICATIONS?|CREDENTIALS|SKILLS|PROJECTS|SUMMARY|PROFESSIONAL SUMMARY|TECHNICAL SKILLS)\s*\n/i;
  const match = String(text || '').match(sectionBreak);
  return match?.index != null ? match.index : text.length;
}

function mergeMissingBulletsIntoBlock(tailoredBlock, originalJob) {
  const originalBullets = extractAccomplishmentLines(originalJob.text);
  if (!originalBullets.length) return tailoredBlock;

  const missing = originalBullets.filter((bullet) => !lineAppearsInResume(bullet, tailoredBlock));
  if (!missing.length) return tailoredBlock;

  const formatted = missing.map((bullet) => (bullet.startsWith('-') ? bullet : `- ${bullet}`));
  return `${tailoredBlock.trim()}\n${formatted.join('\n')}`.trim();
}

function rebuildExperienceSection(originalJobs, tailoredText) {
  const rebuilt = [];

  for (let i = 0; i < originalJobs.length; i += 1) {
    const job = originalJobs[i];
    if (!jobAppearsInResume(job, tailoredText)) {
      rebuilt.push(job.text);
      continue;
    }

    const tailoredBlock = extractTailoredJobBlock(tailoredText, job, originalJobs, i);
    if (!tailoredBlock) {
      rebuilt.push(job.text);
      continue;
    }

    rebuilt.push(mergeMissingBulletsIntoBlock(tailoredBlock, job));
  }

  return rebuilt.join('\n\n').trim();
}

function replaceExperienceSectionContent(text, structure, newExperienceContent) {
  const expSection = structure.sections.find((s) => s.key === 'experience');
  const heading = expSection?.heading || 'PROFESSIONAL EXPERIENCE';
  if (!heading || !newExperienceContent) return text;

  const headingRe = new RegExp(`(${escapeRegExp(heading)}\\s*\\n)`, 'i');
  const match = text.match(headingRe);
  if (!match) return `${text.trim()}\n\n${heading}\n${newExperienceContent}`;

  const startIdx = match.index + match[0].length;
  let endIdx = text.length;
  for (const section of structure.sections) {
    if (!section.heading || section.key === 'experience') continue;
    const re = new RegExp(`\\n${escapeRegExp(section.heading)}\\s*\\n`, 'i');
    const sectionMatch = text.slice(startIdx).match(re);
    if (sectionMatch?.index != null) {
      const absolute = startIdx + sectionMatch.index;
      if (absolute < endIdx) endIdx = absolute;
    }
  }

  return `${text.slice(0, startIdx)}${newExperienceContent}${text.slice(endIdx)}`.trim();
}

function preserveExperienceFromOriginal(originalResume, tailoredText) {
  const structure = parseResumeStructure(originalResume);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  if (!expSection?.content) return tailoredText;

  const originalJobs = splitExperienceContentIntoJobs(expSection.content);
  if (!originalJobs.length) return tailoredText;

  let text = tailoredText;
  const rebuiltExperience = rebuildExperienceSection(originalJobs, text);
  text = replaceExperienceSectionContent(text, structure, rebuiltExperience);

  const missing = originalJobs.filter((job) => !jobAppearsInResume(job, text));
  if (missing.length) {
    text = injectMissingExperienceJobs(text, structure, missing);
  }

  text = stripMisplacedEducationBlob(text, structure);
  return text.trim();
}

module.exports = {
  splitExperienceContentIntoJobs,
  preserveExperienceFromOriginal,
  stripMisplacedEducationBlob,
  cleanEducationSectionContent,
  jobAppearsInResume,
  rebuildExperienceSection,
  mergeMissingBulletsIntoBlock,
  replaceExperienceSectionContent,
};
