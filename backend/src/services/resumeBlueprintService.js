/**
 * Blueprint-driven resume tailoring — the canonical pipeline.
 * AI may only rewrite experience accomplishment bullets; all structure is assembled here.
 */
const { parseResumeStructure } = require('./resumeStructureService');
const { splitExperienceContentIntoJobs, preserveExperienceFromOriginal } = require('./resumeExperiencePreserveService');
const {
  buildExperienceBlueprint,
  enforceExperienceIntegrity,
  perfectExperienceBullets,
} = require('./resumeExperiencePerfectionService');
const { restoreImmutableSections, fixCoverLetterDuplicateApply } = require('./resumeSectionSanitizeService');
const { normalizeTailoredResumeLayout } = require('./resumeKitLayoutService');
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

function buildResumeBlueprint(originalResume) {
  const structure = parseResumeStructure(originalResume);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  const jobs = splitExperienceContentIntoJobs(expSection?.content || '');

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
  let text = String(tailoredText || originalResume || '').trim();
  if (!text) return text;

  text = restoreImmutableSections(originalResume, text);
  text = restoreEditableSectionFromOriginal(originalResume, text, 'summary');
  text = restoreEditableSectionFromOriginal(originalResume, text, 'skills');
  text = preserveExperienceFromOriginal(originalResume, text);
  text = enforceExperienceIntegrity(originalResume, text);
  text = normalizeTailoredResumeLayout(originalResume, text);

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
Use only facts from the resume. No fluff (excited, passionate, leverage). Return JSON: { "coverLetterParagraph": "..." }`;

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
};
