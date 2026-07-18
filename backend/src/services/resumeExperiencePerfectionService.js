const { parseResumeStructure } = require('./resumeStructureService');
const {
  splitExperienceContentIntoJobs,
  splitExperienceJobsNormalized,
  stripMisplacedEducationBlob,
  replaceExperienceSectionContent,
  isAccomplishmentLine,
  stripBulletPrefix,
  isFlatJobHeaderLine,
} = require('./resumeExperiencePreserveService');
const { RESUME_INTEGRITY_CONTRACT, TARGET_BULLETS_PER_JOB } = require('../config/tailorDefaults');

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

function resolveTargetBulletCount(originalCount) {
  if (!originalCount || originalCount < 1) return TARGET_BULLETS_PER_JOB;
  return Math.max(originalCount, Math.min(3, TARGET_BULLETS_PER_JOB));
}

function splitCompoundBullet(bullet) {
  const t = normalizeBullet(bullet);
  if (!t) return [];

  const parts = t
    .split(/\s*;\s+|\s+—\s+(?=[A-Z])|\s+–\s+(?=[A-Z])/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40);
  if (parts.length > 1) return parts;

  const andParts = t
    .split(/,\s+and\s+/i)
    .map((p, i) => (i === 0 ? p.trim() : `${p.trim().charAt(0).toUpperCase()}${p.trim().slice(1)}`))
    .filter((p) => p.length >= 40);
  if (andParts.length > 1) return andParts;

  return [t];
}

function decomposeListBullet(bullet) {
  const t = normalizeBullet(bullet);
  const incl = t.match(/^(.+?)\b(?:including|with|featuring|incorporating|such as|spanning)\s+(.+?)\.?$/i);
  if (!incl) return null;

  const lead = incl[1].trim().replace(/\s+,?\s*$/, '');
  const listRaw = incl[2].replace(/\.$/, '');
  const items = listRaw.split(/,\s*(?:and\s+)?/).map((s) => s.trim()).filter((s) => s.length > 8);
  if (items.length < 2 || items.length > 8) return null;

  const verb = lead.match(/^(\w+)/)?.[1] || 'Delivered';
  const leadCore = lead.replace(/^\w+\s+/, '').replace(/\s+from scratch$/i, '').trim();

  return items.map((item, idx) => {
    const itemClean = item.replace(/^and\s+/i, '');
    if (idx === 0) return `${lead}.`;
    return `${verb} ${itemClean} supporting ${leadCore}.`;
  });
}

function expandBulletsToTarget(bullets, targetCount) {
  let expanded = bullets.map(normalizeBullet).filter(Boolean);
  if (!targetCount || expanded.length >= targetCount) return expanded;

  let guard = 0;
  while (expanded.length < targetCount && guard < 40) {
    guard += 1;
    let grew = false;
    for (let i = 0; i < expanded.length && expanded.length < targetCount; i += 1) {
      const parts = splitCompoundBullet(expanded[i]);
      if (parts.length > 1) {
        expanded.splice(i, 1, ...parts);
        grew = true;
        break;
      }
      const derived = decomposeListBullet(expanded[i]);
      if (derived && derived.length > 1) {
        expanded.splice(i, 1, ...derived);
        grew = true;
        break;
      }
    }
    if (!grew) break;
  }

  let pass = 0;
  while (expanded.length < targetCount && pass < bullets.length * 6) {
    const source = bullets[pass % bullets.length];
    for (const part of splitCompoundBullet(source)) {
      if (expanded.length >= targetCount) break;
      if (!expanded.some((b) => bulletSimilarity(b, part) > 0.72)) expanded.push(part);
    }
    pass += 1;
  }

  return expanded;
}

function buildExperienceBlueprint(originalJobs) {
  return originalJobs.map((job, index) => {
    const { header, bullets } = splitJobHeaderAndBullets(job.text);
    const targetCount = resolveTargetBulletCount(bullets.length);
    const expanded = expandBulletsToTarget(bullets, targetCount);
    return {
      index: index + 1,
      title: job.title || '',
      company: job.company || '',
      header,
      bulletCount: targetCount,
      originalBulletCount: bullets.length,
      originalBullets: expanded,
      needsAiExpansion: expanded.length < targetCount,
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
      const { pickTailoredBullet } = require('./resumeBlueprintService');
      bullets[bestIdx] = pickTailoredBullet(tailoredBullet, bullets[bestIdx], originalBullets);
    } else if (bullets.length < targetCount) {
      const { pickTailoredBullet } = require('./resumeBlueprintService');
      const extra = pickTailoredBullet(tailoredBullet, originalBullets[0] || '', originalBullets);
      if (extra) bullets.push(extra);
    }
  }

  while (bullets.length > targetCount) bullets.pop();
  if (bullets.length < targetCount) {
    const expanded = expandBulletsToTarget(bullets, targetCount);
    bullets.length = 0;
    bullets.push(...expanded);
  }
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

  const originalJobs = splitExperienceJobsNormalized(expSection.content);
  if (!originalJobs.length) return tailoredText;

  const blueprint = buildExperienceBlueprint(originalJobs);
  const tailoredJobs = splitExperienceContentIntoJobs(extractExperienceContent(tailoredText, structure));
  const rebuilt = [];

  for (let i = 0; i < blueprint.length; i += 1) {
    const matchedBlock =
      matchTailoredBlockForBlueprint(blueprint[i], tailoredJobs) || tailoredJobs[i]?.text || '';
    const mergedBlock = rebuildJobFromBlueprint(blueprint[i], matchedBlock);
    const { formatJobBlockFromBlueprint } = require('./resumeKitLayoutService');
    const { bullets } = splitJobHeaderAndBullets(mergedBlock);
    rebuilt.push(formatJobBlockFromBlueprint(blueprint[i], bullets));
  }

  let text = replaceExperienceSectionContent(tailoredText, structure, rebuilt.join('\n\n').trim());
  text = stripMisplacedEducationBlob(text, structure);
  return text.trim();
}

function experienceNeedsPerfection(originalResume, tailoredText) {
  const structure = parseResumeStructure(originalResume);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  if (!expSection?.content) return false;

  const originalJobs = splitExperienceJobsNormalized(expSection.content);
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
  userId,
  originalResume,
  tailoredText,
  jobDescription,
  job = {},
  profile = {},
}) {
  if (!tailoredText) return tailoredText;
  const llmService = require('./llmService');
  const live = await llmService.isLive(userId || profile?.userId);
  if (!live && !client) return tailoredText;

  const structure = parseResumeStructure(originalResume);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  if (!expSection?.content) return tailoredText;

  const originalJobs = splitExperienceJobsNormalized(expSection.content);
  const blueprint = buildExperienceBlueprint(originalJobs);
  if (!blueprint.length) return tailoredText;

  const currentExperience = extractExperienceContent(tailoredText, structure);
  const { buildJdMatchBrief } = require('./atsKeywordService');
  const jdBrief = buildJdMatchBrief(jobDescription, job);

  const system = `You are a resume perfection specialist. Rewrite ONLY experience accomplishment bullets so they match the target job description.

NON-NEGOTIABLE RULES:
1. Return EXACTLY ${blueprint.length} job(s) in the same order as the blueprint.
2. Each job must have EXACTLY the blueprint bulletCount for that job — same count as the candidate's original resume for that role. Rewrite wording only; do not add or remove bullets.
3. Do NOT return job headers, titles, companies, or dates — bullets array only.
4. Rewrite bullet wording to mirror job description requirements and keywords using the candidate's real accomplishments only.
5. Keep the same facts, scope, and metrics from originalBullets — substitute phrasing and keywords to match the posting.
6. Never invent employers, dates, titles, certifications, sales quotas, revenue metrics, or false claims.
7. Do not rewrite platform engineering work as sales/account executive accomplishments unless the resume already contains that function.
8. Every bullet: one complete sentence, 180-320 characters, starts with a strong action verb, includes relevant JD keywords naturally.

${RESUME_INTEGRITY_CONTRACT}

Return JSON only — one entry per blueprint job, same order, bullets only (no headers):
{
  "jobs": [
    { "bullets": ["rewritten bullet 1", "rewritten bullet 2"] }
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
    const env = require('../config/env');
    const llmService = require('./llmService');
    const result = await llmService.createJsonCompletion({
      userId: profile?.userId || null,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.35,
      max_tokens: Math.min(5000, 900 + blueprint.reduce((n, j) => n + j.bulletCount, 0) * 120),
      prefer: env.tailorLlmPrefer || 'claude',
    });

    const jobs = parsePerfectionJson(result.content || '');
    if (!jobs.length) return enforceExperienceIntegrity(originalResume, tailoredText);

    const { rebuildExperienceFromBulletOutput } = require('./resumeBlueprintService');
    const merged = rebuildExperienceFromBulletOutput(originalResume, jobs);
    if (merged) {
      return replaceExperienceSectionContent(tailoredText, structure, merged);
    }

    const rebuilt = [];
    for (let i = 0; i < blueprint.length; i += 1) {
      const perfect = jobs[i] || {};
      const bullets = Array.isArray(perfect.bullets) ? perfect.bullets : [];
      const block = rebuildJobFromBlueprint(
        blueprint[i],
        `${blueprint[i].header}\n${bullets.map((b) => formatBullet(b)).join('\n')}`
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
  expandBulletsToTarget,
  resolveTargetBulletCount,
  enforceExperienceIntegrity,
  experienceNeedsPerfection,
  perfectExperienceBullets,
  isAccomplishmentLine: isAccomplishmentLineLocal,
};
