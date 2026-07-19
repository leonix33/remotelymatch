/**
 * Blueprint-driven resume tailoring — the canonical pipeline.
 * AI may only rewrite experience accomplishment bullets; all structure is assembled here.
 */
const { parseResumeStructure } = require('./resumeStructureService');
const {
  splitExperienceJobsNormalized,
  preserveExperienceFromOriginal,
  replaceExperienceSectionContent,
} = require('./resumeExperiencePreserveService');
const {
  buildExperienceBlueprint,
  enforceExperienceIntegrity,
  perfectExperienceBullets,
} = require('./resumeExperiencePerfectionService');
const { restoreImmutableSections, fixCoverLetterDuplicateApply } = require('./resumeSectionSanitizeService');
const { RESUME_INTEGRITY_CONTRACT } = require('../config/tailorDefaults');

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSectionBody(text, structure, sectionKey) {
  const section = structure.sections.find((s) => s.key === sectionKey);
  if (!section?.heading) return { start: -1, end: -1 };

  const headingRe = new RegExp(`(${escapeRegExp(section.heading)}\\s*\\n)`, 'i');
  const match = String(text || '').match(headingRe);
  if (!match) return { start: -1, end: -1 };

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
  return { start, end };
}

function restoreEditableSectionFromOriginal(originalResume, tailoredText, sectionKey) {
  const originalStructure = parseResumeStructure(originalResume);
  const tailoredStructure = parseResumeStructure(tailoredText);
  const section = originalStructure.sections.find((s) => s.key === sectionKey);
  if (!section?.heading || !section.content) return tailoredText;

  const slice = extractSectionBody(tailoredText, tailoredStructure, sectionKey);
  if (slice.start < 0) return tailoredText;
  return `${tailoredText.slice(0, slice.start)}${section.content}${tailoredText.slice(slice.end)}`;
}

function stripLeadingHeader(text, structure) {
  const name = structure.headerLines[0]?.trim();
  if (!name || !String(text || '').trim().startsWith(name)) return String(text || '').trim();

  for (const section of structure.sections) {
    if (!section.heading) continue;
    const re = new RegExp(`\\n${escapeRegExp(section.heading)}\\s*\\n`, 'i');
    const match = String(text).match(re);
    if (match?.index != null) {
      return String(text).slice(match.index + 1).trim();
    }
  }

  const parts = String(text).split(/\n\n+/);
  return parts.length > 1 ? parts.slice(1).join('\n\n').trim() : text;
}

function restoreContactHeader(originalResume, text) {
  const structure = parseResumeStructure(originalResume);
  const headerBlock = structure.headerLines
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!headerBlock) return text;

  const body = stripLeadingHeader(text, structure);
  return `${headerBlock}\n\n${body}`.trim();
}

function normalizeBulletText(line) {
  return String(line || '')
    .trim()
    .replace(/^[-•*●▪]+\s*/, '');
}

const FABRICATION_PATTERNS = [
  /\bexceeded sales quotas\b/i,
  /\bachieved quota targets\b/i,
  /\brecurring revenue pipeline\b/i,
  /\btrusted advisor\b/i,
  /\bterritory plan\b/i,
  /\bdiscovery calls\b/i,
  /\btailored demos\b/i,
  /\baccount executive\b/i,
  /\bcross-functional relationships with infrastructure,, and operations\b/i,
];

function isFabricatedBullet(bullet, originalBullets) {
  const text = normalizeBulletText(bullet);
  if (!text) return false;
  const hay = originalBullets.map(normalizeBulletText).join(' ').toLowerCase();
  return FABRICATION_PATTERNS.some((pattern) => pattern.test(text) && !pattern.test(hay));
}

function pickTailoredBullet(fromAi, seed, originalBullets) {
  const ai = normalizeBulletText(fromAi);
  const fallback = normalizeBulletText(seed);
  if (ai.length < 15) return fallback;
  const { isRoleTagline } = require('./resumeKitLayoutService');
  if (isRoleTagline(ai)) return fallback;
  if (isFabricatedBullet(ai, originalBullets)) return fallback;
  return ai;
}

function rebuildExperienceFromBulletOutput(originalResume, jobsOutput = []) {
  const structure = parseResumeStructure(originalResume);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  if (!expSection?.content) return null;

  const originalJobs = splitExperienceJobsNormalized(expSection.content);
  const blueprint = buildExperienceBlueprint(originalJobs);
  const { formatJobBlockFromBlueprint } = require('./resumeKitLayoutService');

  const blocks = blueprint.map((bp, idx) => {
    const aiBullets = Array.isArray(jobsOutput[idx]?.bullets) ? jobsOutput[idx].bullets : [];
    const bullets = [];
    for (let j = 0; j < bp.bulletCount; j += 1) {
      const fromAi = aiBullets[j];
      const seed = bp.originalBullets[j] || bp.originalBullets[0] || '';
      bullets.push(pickTailoredBullet(fromAi, seed, bp.originalBullets));
    }
    return formatJobBlockFromBlueprint(bp, bullets);
  });

  return blocks.join('\n\n').trim();
}

function replaceExperienceFromBlueprint(originalResume, text, jobsOutput) {
  const structure = parseResumeStructure(originalResume);
  const merged = rebuildExperienceFromBulletOutput(originalResume, jobsOutput);
  if (!merged) return text;
  return replaceExperienceSectionContent(text, structure, merged);
}

function buildResumeBlueprint(originalResume) {
  const structure = parseResumeStructure(originalResume);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  const jobs = splitExperienceJobsNormalized(expSection?.content || '');

  return {
    structure,
    headerLines: structure.headerLines,
    experienceJobs: buildExperienceBlueprint(jobs),
    jobCount: jobs.length,
  };
}

/**
 * Single deterministic assembly pass — no AI section rewrites.
 */
function assembleBlueprintResume(originalResume, tailoredText, kit = {}) {
  const { coerceResumeText } = require('./resumeRepairService');
  const resumeText = coerceResumeText(originalResume);
  let text = coerceResumeText(tailoredText || resumeText).trim();
  if (!text) return { tailoredResumeText: '', coverLetterParagraph: fixCoverLetterDuplicateApply(kit.coverLetterParagraph || '') };

  const structure = parseResumeStructure(resumeText);
  const { unglueSectionHeadings } = require('./resumeOrderGuardService');
  text = unglueSectionHeadings(text, structure);

  text = restoreContactHeader(resumeText, text);
  text = restoreImmutableSections(resumeText, text);
  text = restoreEditableSectionFromOriginal(resumeText, text, 'summary');
  text = restoreEditableSectionFromOriginal(resumeText, text, 'skills');
  text = enforceExperienceIntegrity(resumeText, text);
  const { applyFinalResumeFormatting } = require('./resumeKitLayoutService');
  text = applyFinalResumeFormatting(resumeText, text);

  const coverLetter = fixCoverLetterDuplicateApply(kit.coverLetterParagraph || '');
  return { tailoredResumeText: text.trim(), coverLetterParagraph: coverLetter };
}

async function tailorExperienceBullets({ userId, profile, job, jobDescription, baseText, tailorFocus = '' }) {
  const original = String(profile?.resumeText || '').trim();
  const llmService = require('./llmService');
  if (!(await llmService.isLive(userId))) {
    return enforceExperienceIntegrity(original, baseText || original);
  }

  const tailored = await perfectExperienceBullets({
    userId,
    originalResume: original,
    tailoredText: baseText || original,
    jobDescription,
    job,
    profile: { ...profile, userId, tailorFocus },
  });

  return assembleBlueprintResume(original, tailored).tailoredResumeText;
}

async function generateCoverLetter({ userId, profile, job, jobDescription, contact, resumeText = '' }) {
  const llmService = require('./llmService');
  if (!(await llmService.isLive(userId))) {
    const name = contact?.name || profile?.displayName || 'Candidate';
    return fixCoverLetterDuplicateApply(
      `I'm applying for the ${job?.title || 'role'} at ${job?.company || 'your company'}. ` +
        `My background aligns with the posting — happy to discuss fit. Thanks, ${name}`
    );
  }

  const env = require('../config/env');
  const system = `Write a 4-sentence cover letter paragraph for a job application.
The letter must be written FOR the specific role title in the user message — match that role's function (sales, engineering, etc.), not a generic platform engineer pitch.
Use only facts from the resume that support THIS role. No fluff (excited, passionate, leverage). Return JSON: { "coverLetterParagraph": "..." }`;

  const user = `Role: ${job?.title || 'Role'} at ${job?.company || 'Company'}
Candidate: ${contact?.name || profile?.displayName || 'Candidate'}

JOB DESCRIPTION (excerpt):
${String(jobDescription || '').slice(0, 3500)}

RESUME (excerpt):
${String(resumeText || profile?.resumeText || '').slice(0, 2500)}`;

  try {
    const result = await llmService.createJsonCompletion({
      userId,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
      max_tokens: 400,
      prefer: env.tailorLlmPrefer || 'claude',
    });
    const parsed = JSON.parse(String(result.content || '{}').replace(/```json\n?|\n?```/g, '').trim());
    return fixCoverLetterDuplicateApply(parsed.coverLetterParagraph || '');
  } catch {
    const name = contact?.name || profile?.displayName || 'Candidate';
    return fixCoverLetterDuplicateApply(
      `I'm applying for the ${job?.title || 'role'} at ${job?.company || 'your company'}. ` +
        `My experience matches your requirements. Thanks, ${name}`
    );
  }
}

async function tailorResumeFromBlueprint({ userId, profile, job, jobDescription, tailorFocus = '' }) {
  const original = String(profile?.resumeText || '').trim();
  if (!original) {
    const err = new Error('Upload your resume in Profile before tailoring.');
    err.status = 400;
    throw err;
  }

  buildResumeBlueprint(original);

  let tailoredResumeText = await tailorExperienceBullets({
    userId,
    profile,
    job,
    jobDescription,
    baseText: original,
    tailorFocus,
  });

  return { tailoredResumeText, pipeline: 'blueprint-v1' };
}

module.exports = {
  RESUME_INTEGRITY_CONTRACT,
  buildResumeBlueprint,
  assembleBlueprintResume,
  tailorExperienceBullets,
  tailorResumeFromBlueprint,
  generateCoverLetter,
  restoreEditableSectionFromOriginal,
  restoreContactHeader,
  rebuildExperienceFromBulletOutput,
  replaceExperienceFromBlueprint,
  pickTailoredBullet,
  isFabricatedBullet,
};
