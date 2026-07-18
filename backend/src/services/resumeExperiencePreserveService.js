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

const ACTION_VERB_RE =
  /\b(Architected|Built|Implemented|Designed|Led|Developed|Managed|Operated|Supported|Created|Established|Deployed|Migrated|Integrated|Improved|Automated|Configured|Enforced|Maintained|Coordinated|Delivered|Reduced|Optimized|Streamlined|Partnered|Authored|Conducted|Participated|Secured|Streamlined|Authored)\b/i;

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

function stripBulletPrefix(line) {
  return String(line || '').trim().replace(/^[-•*●▪]+\s+/, '');
}

function isFlatJobHeaderLine(line) {
  const t = stripBulletPrefix(line);
  if (!t) return false;
  const actionMatch = t.match(
    /\s+(Architected|Built|Implemented|Designed|Led|Developed|Managed|Operated|Supported|Created|Established|Deployed|Migrated|Integrated|Improved|Automated|Configured|Enforced|Maintained|Coordinated|Delivered|Reduced|Optimized|Streamlined|Partnered|Authored|Conducted|Participated|Secured|Streamlined|Authored)\b/i
  );
  if (actionMatch && actionMatch.index >= 15) return false;
  if (t.length > 220) return false;
  if (!DATE_RANGE_RE.test(t)) return false;
  return (
    JOB_ROLE_WORD.test(t) ||
    /\b(Health|Technology|Services|Global|Systems|Group|Mercy|Secours|Solutions|Software|LLC|Inc|Corp)\b/i.test(t)
  );
}

function isMetadataLine(line) {
  const t = stripBulletPrefix(line);
  if (!t) return false;
  if (isFlatJobHeaderLine(line)) return false;
  if (DATE_RANGE_RE.test(t) && JOB_ROLE_WORD.test(t)) return false;
  if (ACTION_VERB_RE.test(t)) return false;

  if (!/\|/.test(t)) {
    return (
      t.length <= 120 &&
      /\b(Health|Technology|Services|Global|Systems|Group|Mercy|Secours|Solutions|Software|LLC|Inc|Corp|University|TX|CA|NY)\b/i.test(t)
    );
  }

  const segments = t.split('|').map((s) => s.trim()).filter(Boolean);
  return segments.length >= 2 && segments.every((s) => s.length < 90);
}

function isAccomplishmentLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return false;
  if (isFlatJobHeaderLine(raw)) return false;
  const t = stripBulletPrefix(raw);
  if (DATE_RANGE_RE.test(t) && JOB_ROLE_WORD.test(t)) return false;
  if (isMetadataLine(raw)) return false;
  if (/^[-•*●▪]/.test(raw)) return true;
  if (t.length >= 48) return ACTION_VERB_RE.test(t);
  return false;
}

function isDateLine(line) {
  const t = stripBulletPrefix(line);
  if (isFlatJobHeaderLine(line)) return false;
  return t.length < 100 && DATE_RANGE_RE.test(t);
}

function isLikelyJobTitleLine(line) {
  const t = stripBulletPrefix(line);
  if (!t || t.length > 140) return false;
  if (isFlatJobHeaderLine(line)) return true;
  if (DATE_RANGE_RE.test(t)) return false;
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
      /\b(Inc|LLC|Corp|Health|Technology|Services|Global|Systems|Group|Mercy|Secours|Solutions)\b/i.test(
        stripBulletPrefix(line)
      ) &&
      !isDateLine(line) &&
      !isAccomplishmentLine(line)
    ) {
      return stripBulletPrefix(line).split(/\s*\|\s*/)[0].trim();
    }
  }

  return '';
}

function attachBulletsToHeaderOnlyChunks(chunkArrays) {
  const out = chunkArrays.map((chunk) => [...chunk]);

  for (let i = 0; i < out.length; i += 1) {
    if (out[i].some(isAccomplishmentLine)) continue;
    if (i + 1 >= out.length) continue;

    const donor = out[i + 1];
    const moved = [];
    const kept = [];
    let foundDonorHeader = false;

    for (const line of donor) {
      if (!foundDonorHeader && isFlatJobHeaderLine(line)) {
        foundDonorHeader = true;
        kept.push(line);
        continue;
      }
      if (!foundDonorHeader && isAccomplishmentLine(line)) {
        moved.push(line);
        continue;
      }
      kept.push(line);
    }

    if (moved.length) {
      out[i] = [...out[i], ...moved];
      out[i + 1] = kept;
    }
  }

  return out.filter((chunk) => chunk.length);
}

function splitExperienceJobsNormalized(content) {
  const { normalizeExperienceSectionContent } = require('./resumeSanitizeService');
  const normalized = normalizeExperienceSectionContent(content);
  let jobs = splitExperienceContentIntoJobs(normalized);
  jobs = rebalanceExperienceBulletDistribution(jobs);
  return jobs;
}

function rebalanceExperienceBulletDistribution(jobs) {
  if (jobs.length < 2) return jobs;

  const parsed = jobs.map((job) => splitJobHeaderAndBulletsFromBlock(job.text));
  const allBullets = parsed.flatMap((entry) => entry.bullets);
  if (allBullets.length < 4) return jobs;

  const emptyJobs = parsed.some((entry) => entry.bullets.length === 0);
  const lastHasMany = parsed[parsed.length - 1].bullets.length >= Math.max(4, allBullets.length - 2);
  if (!emptyJobs && !lastHasMany) return jobs;

  const buckets = parsed.map(() => []);
  const leftovers = [];

  for (const bullet of allBullets) {
    if (/\b(databricks|pyspark|delta lake|fabric|azure data factory|openai|genai|adls)\b/i.test(bullet)) {
      buckets[0].push(bullet);
    } else if (jobs.length > 1 && /\b(kubernetes|devsecops|sast|dast|helm)\b/i.test(bullet)) {
      buckets[1].push(bullet);
    } else if (/\b(aws|cloudformation|multi-account|ec2|vpc|lambda|migration)\b/i.test(bullet)) {
      buckets[buckets.length - 1].push(bullet);
    } else {
      leftovers.push(bullet);
    }
  }

  for (const bullet of leftovers) {
    const target = buckets.findIndex((bucket) => bucket.length < 2);
    if (target >= 0) buckets[target].push(bullet);
    else buckets[0].push(bullet);
  }

  const { buildExperienceBlueprint } = require('./resumeExperiencePerfectionService');
  const { formatJobBlockFromBlueprint } = require('./resumeKitLayoutService');
  const blueprint = buildExperienceBlueprint(jobs);

  return jobs.map((job, idx) => {
    const chosen = buckets[idx].length ? buckets[idx] : parsed[idx].bullets;
    const text = formatJobBlockFromBlueprint(blueprint[idx], chosen);
    return {
      text,
      title: job.title || blueprint[idx].title,
      company: job.company || blueprint[idx].company,
    };
  });
}

function splitJobHeaderAndBulletsFromBlock(block) {
  const lines = String(block || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const header = [];
  const bullets = [];

  for (const line of lines) {
    if (isFlatJobHeaderLine(line) || (!isAccomplishmentLine(line) && DATE_RANGE_RE.test(stripBulletPrefix(line)))) {
      header.push(stripBulletPrefix(line));
    } else if (isAccomplishmentLine(line)) {
      bullets.push(stripBulletPrefix(line));
    } else {
      header.push(stripBulletPrefix(line));
    }
  }

  return { header: header.join('\n'), bullets };
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
    const currentHasJobHeader = current.some((l) => isFlatJobHeaderLine(l) || isLikelyJobTitleLine(l));
    const currentHasBullets = current.some((l) => isAccomplishmentLine(l));
    const startsJob =
      (isFlatJobHeaderLine(line) && current.length > 0) ||
      (isLikelyJobTitleLine(line) && isDateLine(next) && current.length > 0 && currentHasJobHeader) ||
      (isLikelyJobTitleLine(line) && isDateLine(next) && current.length === 0);

    if (startsJob && current.length > 0) {
      flush();
    }

    current.push(line);
  }
  flush();

  const balanced = attachBulletsToHeaderOnlyChunks(chunks);

  return balanced
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
    .filter((l) => isAccomplishmentLine(l));
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

  const { extractSectionContentByHeading } = require('./resumeOrderGuardService');
  const headings = structure.sections.map((s) => s.heading).filter(Boolean);
  const headingRe = new RegExp(`(${escapeRegExp(heading)}\\s*\\n)`, 'i');
  const match = text.match(headingRe);
  if (!match) return `${text.trim()}\n\n${heading}\n${newExperienceContent}`;

  const startIdx = match.index + match[0].length;
  let endIdx = text.length;
  for (const other of headings) {
    if (!other || other === heading) continue;
    const re = new RegExp(`${escapeRegExp(other)}\\s*\\n`, 'i');
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
  splitExperienceJobsNormalized,
  rebalanceExperienceBulletDistribution,
  preserveExperienceFromOriginal,
  stripMisplacedEducationBlob,
  cleanEducationSectionContent,
  jobAppearsInResume,
  rebuildExperienceSection,
  mergeMissingBulletsIntoBlock,
  replaceExperienceSectionContent,
  isFlatJobHeaderLine,
  isAccomplishmentLine,
  stripBulletPrefix,
  splitJobHeaderAndBulletsFromBlock,
};
