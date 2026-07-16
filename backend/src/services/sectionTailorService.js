const {
  RESUME_INTEGRITY_CONTRACT,
  TARGET_BULLETS_PER_JOB,
} = require('../config/tailorDefaults');
const { HUMAN_WRITING_PROMPT } = require('./humanizeWritingService');
const { analyzeJobPosting, formatJdAnalysisForPrompt } = require('./jobAnalysisService');
const {
  validateTailorResponse,
  formatValidationErrors,
} = require('./tailorResponseValidator');
const { getRedTerms } = require('./atsKeywordService');

const EDITABLE_SECTION_KEYS = new Set(['summary', 'experience', 'skills']);

function buildEditablePayload(structure) {
  return structure.sections
    .filter((s) => EDITABLE_SECTION_KEYS.has(s.key))
    .map((s) => ({
      key: s.key,
      heading: s.heading,
      content: s.content,
    }));
}

function buildKitSectionsFromTailorResponse(structure, tailorResponse) {
  return structure.sections.map((section) => {
    if (section.immutable) {
      return { heading: section.heading, content: section.content };
    }

    if (section.key === 'summary' && tailorResponse.summary) {
      return { heading: section.heading, content: tailorResponse.summary.trim() };
    }
    if (section.key === 'experience' && tailorResponse.experience) {
      return { heading: section.heading, content: tailorResponse.experience.trim() };
    }
    if (section.key === 'skills' && tailorResponse.skills) {
      return { heading: section.heading, content: tailorResponse.skills.trim() };
    }

    const fromSections = (tailorResponse.sections || []).find((s) => s.heading === section.heading);
    if (fromSections?.content) {
      return { heading: section.heading, content: fromSections.content.trim() };
    }

    return { heading: section.heading, content: section.content };
  });
}

function parseTailorJson(raw) {
  const cleaned = String(raw || '').replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}

function buildSystemPrompt({ job, pageTarget, jobCount, experienceBlueprint }) {
  return `You are an ATS resume optimizer. Rewrite ONLY the sections provided — never the full resume.

NON-NEGOTIABLE RULES:
- Do not invent employers, dates, titles, certifications, or metrics.
- Do not invent a different career path in the summary (keep the candidate's real platform/engineering identity).
- Never move EXPERIENCE below EDUCATION or CERTIFICATIONS — section order is fixed by the backend.
- Do not change employers or date ranges.
- Keep ALL ${jobCount} job(s) in experience — headers (title, dates, company) unchanged.
- Target ${TARGET_BULLETS_PER_JOB} accomplishment bullets per role (expand by decomposing real accomplishments when fewer exist).
- Increase ATS keyword match using ONLY keywords from the job analysis where truthful.
- Keep existing metrics and scope from the candidate's real work.
- Education and certifications are NOT in your payload — do not output them.

EDITABLE SECTIONS ONLY:
1. summary — 2-3 lines naming fit for ${job?.title || 'this role'}
2. experience — rewrite accomplishment bullets only; multi-line job blocks (title / dates / company / bullets)
3. skills — reorder and group to foreground JD-relevant skills; do not drop skills from the original

Return JSON only:
{
  "summary": "rewritten summary text",
  "experience": "full experience section content without the heading",
  "skills": "rewritten skills section content without the heading",
  "coverLetterParagraph": "4 sentences",
  "changes": [
    { "section": "summary|experience|skills", "reason": "brief explanation of what changed and why" }
  ]
}

${RESUME_INTEGRITY_CONTRACT}

${HUMAN_WRITING_PROMPT}

EXPERIENCE BLUEPRINT:
${experienceBlueprint.map((b) => `Job ${b.index}: ${b.title} at ${b.company} — EXACTLY ${b.bulletCount} bullets`).join('\n')}

Target length: ~${pageTarget} pages.`;
}

function buildUserPrompt({
  editablePayload,
  jdAnalysis,
  job,
  experienceBlueprint,
  tailorFocus,
  validationErrors,
  missingKeywords,
}) {
  const parts = [
    `TARGET ROLE: ${job?.title || 'Role'} at ${job?.company || 'Company'}`,
    '',
    'JOB ANALYSIS (use this — do not re-infer from scratch):',
    formatJdAnalysisForPrompt(jdAnalysis),
    '',
    'EDITABLE SECTIONS TO REWRITE (only these):',
    JSON.stringify(editablePayload, null, 2),
    '',
    'EXPERIENCE CONTRACT:',
    experienceBlueprint
      .map(
        (b) =>
          `Job ${b.index}: ${b.title || 'Role'} at ${b.company || 'employer'} — header unchanged, ${b.bulletCount} rewritten bullets`
      )
      .join('\n'),
  ];

  if (missingKeywords?.length) {
    parts.push('', `MISSING ATS KEYWORDS (weave truthfully once each): ${missingKeywords.join(', ')}`);
  }
  if (validationErrors) {
    parts.push('', 'FIX THESE VALIDATION ERRORS FROM PRIOR ATTEMPT:', validationErrors);
  }
  if (tailorFocus) {
    parts.push('', `CANDIDATE NOTES:\n${String(tailorFocus).slice(0, 1200)}`);
  }

  return parts.join('\n');
}

async function callSectionTailor({
  userId,
  system,
  user,
  maxTokens = 4500,
}) {
  const env = require('../config/env');
  const llmService = require('./llmService');
  const result = await llmService.createJsonCompletion({
    userId,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.38,
    max_tokens: maxTokens,
    prefer: env.tailorLlmPrefer || 'claude',
  });
  const parsed = parseTailorJson(result.content || '{}');
  parsed.llmProvider = result.provider;
  parsed.llmModel = result.model;
  return parsed;
}

/**
 * Section-only tailor: JD analysis first, then rewrite summary + experience + skills only.
 * Validator-driven second pass when the first response fails structural checks.
 */
async function generateSectionTailoredContent({
  userId,
  client,
  structure,
  experienceBlueprint,
  jobDescription,
  job,
  profile,
  tailorFocus = '',
  pageTarget = 4,
  jobCount = 0,
}) {
  const jdAnalysis = analyzeJobPosting(jobDescription, job);
  const editablePayload = buildEditablePayload(structure);
  const system = buildSystemPrompt({ job, pageTarget, jobCount, experienceBlueprint });

  const firstUser = buildUserPrompt({
    editablePayload,
    jdAnalysis,
    job,
    experienceBlueprint,
    tailorFocus,
  });

  let tailorResponse = await callSectionTailor({ userId, system, user: firstUser });
  let validation = validateTailorResponse(tailorResponse, { structure, experienceBlueprint });

  if (!validation.valid) {
    const secondUser = buildUserPrompt({
      editablePayload,
      jdAnalysis,
      job,
      experienceBlueprint,
      tailorFocus,
      validationErrors: formatValidationErrors(validation),
    });
    tailorResponse = await callSectionTailor({ userId, system, user: secondUser });
    validation = validateTailorResponse(tailorResponse, { structure, experienceBlueprint });
  }

  const sections = buildKitSectionsFromTailorResponse(structure, tailorResponse);

  return {
    sections,
    coverLetterParagraph: tailorResponse.coverLetterParagraph || '',
    tailorChanges: Array.isArray(tailorResponse.changes) ? tailorResponse.changes : [],
    jdAnalysis,
    validation,
    missingKeywords: jdAnalysis.atsKeywords?.slice(0, 12) || [],
    estimatedMatchPct: null,
    llmProvider: tailorResponse.llmProvider || null,
  };
}

/**
 * ATS validator pass: score output and run a keyword-focused second pass if needed.
 */
async function refineSectionTailoredContent({
  userId,
  client,
  structure,
  experienceBlueprint,
  jobDescription,
  job,
  profile,
  kit,
  tailorFocus = '',
  pageTarget = 4,
  jobCount = 0,
}) {
  const { scoreAtsKeywords } = require('./atsKeywordService');
  const ats = scoreAtsKeywords({
    tailoredText: kit.tailoredResumeText,
    jobDescription,
    job,
  });

  const redTerms = getRedTerms(ats, 10);
  const uncovered = kit.uncoveredRequirements || [];
  if (!redTerms.length && !uncovered.length) return kit;

  const jdAnalysis = kit.jdAnalysis || analyzeJobPosting(jobDescription, job);
  const editablePayload = buildEditablePayload(structure).map((s) => {
    const current = kit.sections?.find((row) => row.heading === s.heading);
    return current ? { ...s, content: current.content } : s;
  });

  const system = buildSystemPrompt({ job, pageTarget, jobCount, experienceBlueprint });
  const user = buildUserPrompt({
    editablePayload,
    jdAnalysis,
    job,
    experienceBlueprint,
    tailorFocus,
    missingKeywords: [...new Set([...redTerms, ...uncovered.slice(0, 5)])],
  });

  const tailorResponse = await callSectionTailor({ userId, system, user });
  const sections = buildKitSectionsFromTailorResponse(structure, tailorResponse);

  return {
    ...kit,
    sections,
    coverLetterParagraph: tailorResponse.coverLetterParagraph || kit.coverLetterParagraph,
    tailorChanges: [
      ...(kit.tailorChanges || []),
      ...(Array.isArray(tailorResponse.changes) ? tailorResponse.changes : []),
    ],
    atsRefinePass: true,
  };
}

module.exports = {
  EDITABLE_SECTION_KEYS,
  buildEditablePayload,
  buildKitSectionsFromTailorResponse,
  generateSectionTailoredContent,
  refineSectionTailoredContent,
};
