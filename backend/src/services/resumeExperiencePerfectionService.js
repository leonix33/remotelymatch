const { parseResumeStructure } = require('./resumeStructureService');
const {
  splitExperienceContentIntoJobs,
  stripMisplacedEducationBlob,
  replaceExperienceSectionContent,
  isAccomplishmentLine,
  stripBulletPrefix,
  isFlatJobHeaderLine,
} = require('./resumeExperiencePreserveService');
const { RESUME_INTEGRITY_CONTRACT } = require('../config/tailorDefaults');

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
const YEAR = '\\d{4}';
const DATE_RANGE_RE = new RegExp(
  `\\b(${MONTH}\\s+${YEAR})\\s*(?:[–\\-—]\\s*|\\s+to\\s+|\\s+)((?:Present|Current|Now)|${MONTH}\\s+${YEAR}|${YEAR})\\b`,
  'i'
);

function isAccomplishmentLineLocal(line) {
  return isAccomplishmentLine(line);
}

function splitJobHeaderAndBullets(block) {
  const lines = String(block || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const header = [];
  const bullets = [];

  for (const line of lines) {
    if (isFlatJobHeaderLine(line) || (!isAccomplishmentLineLocal(line) && DATE_RANGE_RE.test(stripBulletPrefix(line)))) {
      header.push(stripBulletPrefix(line));
    } else if (isAccomplishmentLineLocal(line)) {
      bullets.push(normalizeBullet(line));
    } else {
      header.push(stripBulletPrefix(line));
    }
  }

  return { header: header.join('\n'), bullets };
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

function normalizeBullet(line) {
  const t = String(line || '').trim();
  if (!t) return '';
  return t.replace(/^[-•*]\s*/, '').trim();
}

function formatBullet(line) {
  const t = normalizeBullet(line);
  return t ? `- ${t}` : '';
}

function buildExperienceBlueprint(originalJobs) {
  return originalJobs.map((job, index) => {
    const { header, bullets } = splitJobHeaderAndBullets(job.text);
    return {
      index: index + 1,
      title: job.title || '',
      company: job.company || '',
      header,
      bulletCount: bullets.length,
      originalBullets: bullets,
    };
  });
}

function extractExperienceContent(tailoredText, structure) {
  const exp = structure.sections.find((s) => s.key === 'experience');
  if (!exp?.heading) return '';

  const headingRe = new RegExp(`${exp.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`, 'i');
  const match = String(tailoredText || '').match(headingRe);
  if (!match) return '';

  const start = match.index + match[0].length;
  let end = tailoredText.length;
  for (const section of structure.sections) {
    if (!section.heading || section.key === 'experience') continue;
    const re = new RegExp(`\\n${section.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`, 'i');
    const sectionMatch = tailoredText.slice(start).match(re);
    if (sectionMatch?.index != null) {
      const absolute = start + sectionMatch.index;
      if (absolute < end) end = absolute;
    }
  }
  return tailoredText.slice(start, end).trim();
}

function bulletSimilarity(a, b) {
  const normalize = (text) =>
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const wa = new Set(normalize(a).split(' ').filter((w) => w.length > 3));
  const wb = new Set(normalize(b).split(' ').filter((w) => w.length > 3));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / Math.max(wa.size, wb.size);
}

function rebuildJobFromBlueprint(blueprintEntry, tailoredBlock) {
  const tailored = splitJobHeaderAndBullets(tailoredBlock || '');
  const header = blueprintEntry.header || tailored.header;
  const originalBullets = [...(blueprintEntry.originalBullets || [])];
  const targetCount = blueprintEntry.bulletCount || originalBullets.length || 0;
  const bullets = [...originalBullets];

  for (const tailoredBullet of tailored.bullets) {
    let bestIdx = -1;
    let bestSim = 0;
    for (let i = 0; i < bullets.length; i += 1) {
      const sim = bulletSimilarity(bullets[i], tailoredBullet);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestSim >= 0.2) {
      bullets[bestIdx] = tailoredBullet;
    } else if (bullets.length < targetCount) {
      bullets.push(tailoredBullet);
    }
  }

  while (bullets.length > targetCount) bullets.pop();
  while (bullets.length < targetCount && originalBullets[bullets.length]) {
    bullets.push(originalBullets[bullets.length]);
  }

  const lines = [header, ...bullets.map((b) => formatBullet(b)).filter(Boolean)].filter(Boolean);
  return lines.join('\n');
}

function enforceExperienceIntegrity(originalResume, tailoredText) {
  const structure = parseResumeStructure(originalResume);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  if (!expSection?.content) return tailoredText;

  const originalJobs = splitExperienceContentIntoJobs(expSection.content);
  if (!originalJobs.length) return tailoredText;

  const blueprint = buildExperienceBlueprint(originalJobs);
  const tailoredJobs = splitExperienceContentIntoJobs(extractExperienceContent(tailoredText, structure));
  const rebuilt = [];

  for (let i = 0; i < blueprint.length; i += 1) {
    const matchedBlock = matchTailoredBlockForBlueprint(blueprint[i], tailoredJobs);
    rebuilt.push(rebuildJobFromBlueprint(blueprint[i], matchedBlock));
  }

  let text = replaceExperienceSectionContent(tailoredText, structure, rebuilt.join('\n\n').trim());
  text = stripMisplacedEducationBlob(text, structure);
  return text.trim();
}

function experienceNeedsPerfection(originalResume, tailoredText) {
  const structure = parseResumeStructure(originalResume);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  if (!expSection?.content) return false;

  const originalJobs = splitExperienceContentIntoJobs(expSection.content);
  const blueprint = buildExperienceBlueprint(originalJobs);
  const tailoredJobs = splitExperienceContentIntoJobs(extractExperienceContent(tailoredText, structure));

  if (tailoredJobs.length !== blueprint.length) return true;

  for (let i = 0; i < blueprint.length; i += 1) {
    const tailored = splitJobHeaderAndBullets(tailoredJobs[i]?.text || '');
    if (tailored.bullets.length < blueprint[i].bulletCount) return true;
  }

  return false;
}

function parsePerfectionJson(raw) {
  const cleaned = String(raw || '').replace(/```json\n?|\n?```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed.jobs)) return parsed.jobs;
  if (Array.isArray(parsed.experience)) return parsed.experience;
  return [];
}

async function perfectExperienceBullets({
  client,
  originalResume,
  tailoredText,
  jobDescription,
  job = {},
  profile = {},
}) {
  if (!client || !tailoredText) return tailoredText;

  const structure = parseResumeStructure(originalResume);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  if (!expSection?.content) return tailoredText;

  const originalJobs = splitExperienceContentIntoJobs(expSection.content);
  const blueprint = buildExperienceBlueprint(originalJobs);
  if (!blueprint.length) return tailoredText;

  const currentExperience = extractExperienceContent(tailoredText, structure);
  const { buildJdMatchBrief } = require('./atsKeywordService');
  const jdBrief = buildJdMatchBrief(jobDescription, job);

  const system = `You are a resume perfection specialist. Rewrite ONLY experience accomplishment bullets so they match the target job description.

NON-NEGOTIABLE RULES:
1. Return EXACTLY ${blueprint.length} job(s) — same employers, titles, and dates as the blueprint headers (copy headers verbatim).
2. Each job must have EXACTLY the bulletCount from the blueprint — no more, no fewer.
3. Job headers must NOT start with bullet characters (-, •, *). Put headers on their own lines; bullets only for accomplishments.
4. Rewrite bullet wording to mirror job description requirements and keywords using the candidate's real accomplishments only.
5. Keep the same facts, scope, and metrics from originalBullets — substitute phrasing and keywords to match the posting.
6. Never invent employers, dates, titles, certifications, or false metrics.
7. Every bullet: one complete sentence, 180-320 characters, starts with a strong action verb, includes relevant JD keywords naturally.

${RESUME_INTEGRITY_CONTRACT}

Return JSON only:
{
  "jobs": [
    { "header": "exact header from blueprint", "bullets": ["rewritten bullet 1", "rewritten bullet 2"] }
  ]
}`;

  const user = `TARGET ROLE: ${job?.title || 'Role'} at ${job?.company || 'Company'}

TOP POSTING REQUIREMENTS:
${jdBrief.requirements.length ? jdBrief.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'See job description.'}

CRITICAL KEYWORDS: ${jdBrief.criticalTerms.slice(0, 20).join(', ')}

JOB DESCRIPTION:
${String(jobDescription || '').slice(0, 7500)}

EXPERIENCE BLUEPRINT (match job count and bulletCount exactly):
${JSON.stringify(blueprint, null, 2)}

CURRENT EXPERIENCE SECTION:
${currentExperience}

ORIGINAL RESUME TRUTH SOURCE:
${String(profile?.resumeText || originalResume || '').slice(0, 6000)}`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.35,
      max_tokens: Math.min(5000, 900 + blueprint.reduce((n, j) => n + j.bulletCount, 0) * 120),
      response_format: { type: 'json_object' },
    });

    const jobs = parsePerfectionJson(response.choices[0]?.message?.content?.trim() || '');
    if (!jobs.length) return enforceExperienceIntegrity(originalResume, tailoredText);

    const rebuilt = [];
    for (let i = 0; i < blueprint.length; i += 1) {
      const perfect = jobs[i] || {};
      const header = perfect.header || blueprint[i].header;
      const bullets = Array.isArray(perfect.bullets) ? perfect.bullets : [];
      const block = rebuildJobFromBlueprint(
        { ...blueprint[i], header },
        `${header}\n${bullets.map((b) => formatBullet(b)).join('\n')}`
      );
      rebuilt.push(block);
    }

    return replaceExperienceSectionContent(
      tailoredText,
      structure,
      rebuilt.join('\n\n').trim()
    );
  } catch {
    return enforceExperienceIntegrity(originalResume, tailoredText);
  }
}

module.exports = {
  splitJobHeaderAndBullets,
  buildExperienceBlueprint,
  enforceExperienceIntegrity,
  experienceNeedsPerfection,
  perfectExperienceBullets,
  isAccomplishmentLine: isAccomplishmentLineLocal,
};
