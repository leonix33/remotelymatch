const openaiService = require('./openaiService');
const env = require('../config/env');
const { resolveTailorOptions, TAILOR_MODE, DEFAULT_SUPPLEMENT_PAGES, RESUME_INTEGRITY_CONTRACT, TARGET_BULLETS_PER_JOB } = require('../config/tailorDefaults');
const { contactHeader, contactSignature } = require('./applicantContactService');
const { HUMAN_WRITING_PROMPT, humanizeKit } = require('./humanizeWritingService');
const { prepareResumeTextForParsing } = require('./resumeRepairService');
const { polishTailoredResumeText, stripJdEcho } = require('./resumePolishService');
const {
  parseResumeStructure,
  describeStructureForPrompt,
  reassembleResume,
  findMissingPreservedLines,
  injectMissingIntoSection,
  structureToSectionPayload,
} = require('./resumeStructureService');
const { splitExperienceContentIntoJobs } = require('./resumeExperiencePreserveService');

const TECH_KEYWORDS = [
  'kubernetes', 'k8s', 'terraform', 'ansible', 'aws', 'azure', 'gcp', 'docker',
  'ci/cd', 'jenkins', 'github actions', 'gitlab', 'argocd', 'helm', 'prometheus',
  'grafana', 'datadog', 'splunk', 'elk', 'python', 'golang', 'linux', 'bash',
  'sre', 'devops', 'platform engineering', 'observability', 'incident response',
  'databricks', 'snowflake', 'kafka', 'redis', 'postgres', 'mongodb', 'vault',
  'istio', 'service mesh', 'lambda', 'ecs', 'eks', 'aks', 'gke', 'pulumi',
  'cloudformation', 'security', 'soc2', 'hipaa', 'pci', 'on-call', 'sla', 'slo',
];

const MIN_SUPPLEMENT_PAGES = 1;
const MAX_SUPPLEMENT_PAGES = 6;

function clampPageCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_SUPPLEMENT_PAGES;
  return Math.min(MAX_SUPPLEMENT_PAGES, Math.max(MIN_SUPPLEMENT_PAGES, Math.round(v)));
}


async function getClient(userId) {
  return openaiService.getClient(userId);
}

function normalize(text = '') {
  return String(text).toLowerCase();
}

function inferMissingKeywords(profile, jobDescription) {
  const blob = normalize(`${jobDescription} ${profile?.targetTitles?.join(' ') || ''}`);
  const resumeBlob = normalize(profile?.resumeText || '');
  const profileSkills = [
    ...(profile?.mustHaveSkills || []),
    ...(profile?.niceToHaveSkills || []),
    ...(profile?.extractedSkills || []),
  ].map(normalize);

  const missing = [];
  for (const keyword of TECH_KEYWORDS) {
    if (!blob.includes(keyword)) continue;
    const inResume = resumeBlob.includes(keyword) || profileSkills.some((s) => s.includes(keyword));
    if (!inResume) missing.push(keyword);
  }
  return missing.slice(0, 20);
}

function extractJdRequirements(jobDescription) {
  const lines = String(jobDescription || '')
    .split(/[\n•·\-]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 12 && l.length < 220);
  return lines.slice(0, 25);
}

function inferResumePageTarget(resumeText, requestedPages) {
  const words = String(resumeText || '')
    .split(/\s+/)
    .filter(Boolean).length;
  const structure = parseResumeStructure(resumeText || '');
  const exp = structure.sections.find((s) => s.key === 'experience');
  const { splitExperienceContentIntoJobs } = require('./resumeExperiencePreserveService');
  const jobCount = splitExperienceContentIntoJobs(exp?.content || '').length;
  const fromLength = Math.max(1, Math.ceil(words / 320));
  const fromJobs = Math.max(1, Math.ceil(jobCount / 1.5));
  const fromBullets = Math.max(1, Math.ceil((jobCount * TARGET_BULLETS_PER_JOB) / 7));
  const computed = Math.max(fromLength, fromJobs, fromBullets, DEFAULT_SUPPLEMENT_PAGES);

  if (requestedPages != null && Number.isFinite(Number(requestedPages))) {
    return clampPageCount(Number(requestedPages));
  }
  return clampPageCount(Math.min(computed, 6));
}

function extractMustPreserveFromResume(resumeText = '') {
  const structure = parseResumeStructure(resumeText);
  const { cleanEducationSectionContent } = require('./resumeExperiencePreserveService');
  const preserved = [];

  for (const section of structure.sections) {
    if (!['education', 'certifications', 'credentials', 'licenses', 'training', 'clearances'].includes(section.key)) {
      continue;
    }
    if (section.heading) preserved.push(section.heading);
    const content =
      section.key === 'education' ? cleanEducationSectionContent(section.content) : section.content;
    for (const line of String(content || '').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) preserved.push(trimmed);
    }
  }

  const certLine =
    /\b(certified|certification|certificate|license|licensed|credential|AWS |Azure |GCP |CKA|CKAD|PMP|CISSP|CompTIA|Security\+|Terraform Associate|associate|professional)\b/i;
  for (const line of String(resumeText).split('\n')) {
    const trimmed = line.trim();
    if (trimmed && certLine.test(trimmed) && !preserved.includes(trimmed)) {
      preserved.push(trimmed);
    }
  }

  return [...new Set(preserved.filter(Boolean))];
}

function splitResumeIntoPages(resumeText, pageTarget) {
  const text = String(resumeText || '').trim();
  if (!text) return [];

  const sections = text.split(/\n(?=[A-Z][A-Z\s/&-]{2,}\n|[A-Z][A-Z\s/&-]{2,}$)/);
  if (sections.length <= 1 || pageTarget <= 1) {
    return [{ page: 1, title: 'Resume', content: text }];
  }

  const pages = [];
  let chunk = '';
  const targetChars = Math.ceil(text.length / pageTarget);

  for (const section of sections) {
    const block = section.trim();
    if (!block) continue;
    if ((chunk + '\n\n' + block).length > targetChars && chunk) {
      pages.push(chunk.trim());
      chunk = block;
    } else {
      chunk = chunk ? `${chunk}\n\n${block}` : block;
    }
  }
  if (chunk.trim()) pages.push(chunk.trim());

  if (pages.length > pageTarget) {
    const head = pages.slice(0, Math.max(1, pageTarget - 1));
    const tail = pages.slice(Math.max(1, pageTarget - 1)).join('\n\n').trim();
    if (tail) head.push(tail);
    return head.map((content, i) => ({
      page: i + 1,
      title: 'Resume',
      content,
    }));
  }

  return pages.slice(0, pageTarget).map((content, i) => ({
    page: i + 1,
    title: 'Resume',
    content,
  }));
}

function finalizeTailoredResume(originalResume, structure, kit) {
  let text = '';

  if (Array.isArray(kit.sections) && kit.sections.length) {
    text = reassembleResume(structure, kit.sections);
  } else {
    text = kit.tailoredResumeText || kit.fullSupplementText || '';
  }

  if (!text) return text;

  const { restoreImmutableSections } = require('./resumeSectionSanitizeService');
  text = restoreImmutableSections(originalResume, text);

  const headerBlock = structure.headerLines.join('\n').trim();
  if (headerBlock && !text.includes(structure.headerLines[0]?.trim())) {
    text = `${headerBlock}\n\n${text.replace(new RegExp(`^${structure.headerLines[0]?.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'), '').trim()}`.trim();
  }

  for (const section of structure.sections) {
    if (!section.immutable || !section.content) continue;
    const heading = section.heading;
    if (!heading) continue;
    const sectionInOutput = new RegExp(`${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text);
    if (!sectionInOutput && section.content) {
      text = `${text.trim()}\n\n${heading}\n${section.content}`;
    } else if (sectionInOutput) {
      const originalLines = section.content.split('\n').filter((l) => l.trim().length > 8);
      const missing = findMissingPreservedLines(originalLines, text);
      if (missing.length) {
        const re = new RegExp(`(${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n)`, 'i');
        if (re.test(text)) {
          text = text.replace(re, `$1${missing.join('\n')}\n`);
        }
      }
    }
  }

  const preserved = extractMustPreserveFromResume(originalResume);
  const stillMissing = findMissingPreservedLines(preserved, text);
  if (stillMissing.length) {
    text = injectMissingIntoSection(text, structure, stillMissing);
  }

  const { preserveExperienceFromOriginal } = require('./resumeExperiencePreserveService');
  text = preserveExperienceFromOriginal(originalResume, text);

  const { normalizeTailoredResumeLayout } = require('./resumeKitLayoutService');
  text = normalizeTailoredResumeLayout(originalResume, text);

  const { sanitizeTailoredResume } = require('./resumeSectionSanitizeService');
  const sanitized = sanitizeTailoredResume(originalResume, text, kit);
  text = sanitized.tailoredResumeText;
  if (sanitized.coverLetterParagraph && kit) {
    kit.coverLetterParagraph = sanitized.coverLetterParagraph;
  }

  return text.trim();
}

function buildTailoredResumeDemo(profile, job, jobDescription, contact = {}, options = {}) {
  const original = String(profile?.resumeText || '').trim();
  const structure = parseResumeStructure(original);
  const pageTarget = inferResumePageTarget(original, options.supplementPages);
  const skills = (profile?.mustHaveSkills || []).slice(0, 12).join(', ') || 'cloud and platform engineering';
  const name = contact.name || profile?.displayName || profile?.applicantName || 'Candidate';
  const header = contactHeader(contact) || structure.headerLines.join('\n') || `${name}\n${contact.email || ''}`;

  const sectionOutputs = structure.sections.map((section) => {
    if (section.immutable) {
      return { heading: section.heading, content: section.content };
    }

    if (section.key === 'summary') {
      const summaryBody =
        section.content ||
        `${job?.title || 'Engineer'} with hands-on ${skills} experience.`;
      return { heading: section.heading, content: stripJdEcho(summaryBody) };
    }

    return { heading: section.heading, content: section.content };
  });

  let tailoredResumeText = finalizeTailoredResume(original, structure, {
    sections: sectionOutputs,
    tailoredResumeText: reassembleResume(structure, sectionOutputs),
  });

  if (!structure.sections.length) {
    tailoredResumeText = original;
    if (!/^(summary|profile|objective)\b/im.test(original)) {
      tailoredResumeText = `${header}\n\nSUMMARY\n${job?.title || 'Engineer'} with ${skills} experience.\n\n${original}`;
    } else {
      tailoredResumeText = `${header}\n\n${original}`;
    }
  } else if (header && !tailoredResumeText.startsWith(structure.headerLines[0]?.trim())) {
    const withoutDupHeader = tailoredResumeText.replace(/^[^\n]+\n[^\n]+\n?/, '').trim();
    tailoredResumeText = `${header}\n\n${withoutDupHeader}`.trim();
  }
  const supplementPages = splitResumeIntoPages(tailoredResumeText, pageTarget);
  const signature = contactSignature(contact);

  const coverLetterParagraph = [
    `Hi,`,
    '',
    `I'm applying for the ${job?.title || 'role'} at ${job?.company || 'your company'}.`,
    `I've led ${skills.split(',')[0] || 'platform'} work in production — happy to share specifics.`,
    '',
    `Thanks,`,
    signature || name,
  ]
    .filter(Boolean)
    .join('\n');

  return { tailoredResumeText, supplementPages, coverLetterParagraph, pageTarget };
}

function buildDemoSupplementPages(profile, job, jobDescription, missingKeywords, contact = {}, options = {}) {
  const built = buildTailoredResumeDemo(profile, job, jobDescription, contact, options);
  return built.supplementPages;
}

function buildDemoKit(profile, job, jobDescription, contact = {}, options = {}) {
  const pageTarget = inferResumePageTarget(profile?.resumeText, options.supplementPages);
  const tailorMode = options.tailorMode === 'high_match' ? 'high_match' : 'balanced';
  const missingKeywords = inferMissingKeywords(profile, jobDescription);
  const structure = parseResumeStructure(profile?.resumeText || '');
  const { tailoredResumeText, supplementPages, coverLetterParagraph } = buildTailoredResumeDemo(
    profile,
    job,
    jobDescription,
    contact,
    { ...options, supplementPages: pageTarget, tailorMode }
  );
  const fullSupplementText = tailoredResumeText;

  const kit = humanizeKit({
    mode: 'full_resume',
    tailored: true,
    demo: true,
    tailorMode,
    supplementPagesTarget: pageTarget,
    highMatchTarget: options.highMatchTarget || 100,
    estimatedMatchPct: Math.min(
      95,
      (job?.personalMatchPct ?? job?.matchPct ?? 70) + (tailorMode === 'high_match' ? 12 : 5)
    ),
    pageCount: supplementPages.length,
    supplementPages,
    tailoredResumeText,
    fullSupplementText,
    missingKeywords,
    skillsToHighlight: (profile?.mustHaveSkills || []).slice(0, 12),
    resumeAddendum: tailoredResumeText,
    coverLetterParagraph,
    contactEmail: contact.email || '',
    contactName: contact.name || profile?.displayName || '',
    resumeStructure: {
      sectionOrder: structure.sectionOrder,
      headingStyle: structure.headingStyle,
      sectionHeadings: structure.sections.map((s) => s.heading).filter(Boolean),
    },
    atsTips: [],
    guardrails: 'Full tailored resume — all credentials preserved, original formatting style.',
    jobDescriptionLength: jobDescription.length,
  });

  return applyAtsMetadata(finalizeNormalizedKit(kit, pageTarget, jobDescription), jobDescription, job);
}

function applyAtsMetadata(kit, jobDescription, job = {}) {
  if (!kit?.tailoredResumeText || !jobDescription) return kit;
  const {
    scoreAtsKeywords,
    buildRecruiterTips,
    scoreJdRequirementCoverage,
    isRecruiterReady,
  } = require('./atsKeywordService');
  const ats = scoreAtsKeywords({
    tailoredText: kit.tailoredResumeText,
    jobDescription,
    job,
  });
  const jdCoverage = scoreJdRequirementCoverage(kit.tailoredResumeText, jobDescription, job);
  const recruiterReady = isRecruiterReady(ats, jdCoverage);
  const blendedMatch = Math.min(
    100,
    Math.round(ats.score * 0.55 + jdCoverage.jdMatchPct * 0.45)
  );

  return {
    ...kit,
    atsScore: ats.score,
    atsReady: ats.readyToSubmit,
    recruiterReady,
    estimatedMatchPct: blendedMatch,
    jdMatchPct: jdCoverage.jdMatchPct,
    jdRequirementsCovered: jdCoverage.jdRequirementsCovered,
    jdRequirementsTotal: jdCoverage.jdRequirementsTotal,
    uncoveredRequirements: jdCoverage.uncoveredRequirements,
    atsBreakdown: ats.breakdown?.slice(0, 20),
    atsGreen: ats.green,
    atsYellow: ats.yellow,
    atsRed: ats.red,
    atsTips: buildRecruiterTips(ats, jdCoverage),
  };
}

async function refineKitForInterview({
  client,
  kit,
  profile,
  structure,
  jobDescription,
  job,
  redTerms,
  uncoveredRequirements,
  tailorFocus,
  pageTarget,
  atsScore,
  jdMatchPct,
}) {
  if (!client || (!redTerms?.length && !uncoveredRequirements?.length)) return kit;

  const sectionSource =
    kit.resumeSections?.length
      ? kit.resumeSections
      : structure.sections.map((s) => ({ heading: s.heading, content: s.content }));

  const uncoveredBlock = uncoveredRequirements?.length
    ? `\nUNCOVERED POSTING REQUIREMENTS (reflect in summary or bullets — truthfully, once each):\n${uncoveredRequirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  const system = `You perfect a tailored resume for this specific job: pass ATS filters, mirror posting requirements, and earn recruiter callbacks.

RULES:
1. ONLY edit summary/profile and experience bullets — never change employers, titles, dates, education, or certifications.
2. Keep EXACTLY the same number of jobs. Target ${TARGET_BULLETS_PER_JOB} accomplishment bullets per role (expand by decomposing real accomplishments when the original has fewer).
3. Job headers must NOT use bullet prefixes (-, •, *). Headers on their own lines; accomplishment bullets only under the correct employer.
4. Rewrite each bullet to align with the job description — substitute keywords/phrasing, keep the candidate's real facts. Never delete bullets.
5. Address missing ATS terms naturally (max once each): ${(redTerms || []).join(', ') || 'none'}
6. Mirror uncovered posting requirements with real experience from the original resume — never invent.
7. Summary: 3 lines naming the target role and top qualifications from the posting.
8. Cover letter: 4 sentences — ${job?.title || 'role'} at ${job?.company || 'company'}, fit, proof point, close.
9. Return JSON only: { "sections": [...], "coverLetterParagraph": "..." }

${RESUME_INTEGRITY_CONTRACT}`;

  const user = `TARGET: ${job?.title || 'Role'} at ${job?.company || 'Company'}
ATS score: ${atsScore}% · Job requirement fit: ${jdMatchPct ?? '—'}%
${uncoveredBlock}

CURRENT SECTIONS:
${JSON.stringify(sectionSource, null, 2)}

ORIGINAL RESUME (truth source):
${(profile?.resumeText || '').slice(0, 9000)}

JOB DESCRIPTION:
${jobDescription.slice(0, 7000)}

MISSING ATS TERMS: ${(redTerms || []).join(', ') || 'none'}${tailorFocus ? `\nCandidate notes: ${String(tailorFocus).slice(0, 1200)}` : ''}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.38,
    max_tokens: Math.min(2200, 500 + pageTarget * 320),
    response_format: { type: 'json_object' },
  }).catch((err) => {
    const wrapped = new Error(err.message || 'OpenAI request failed during polish');
    wrapped.status = err.status || 502;
    throw wrapped;
  });

  const raw = response.choices[0]?.message?.content?.trim() || '';
  try {
    const refined = parseKitJson(raw);
    if (!refined.sections?.length) return kit;
    refined.tailoredResumeText = finalizeTailoredResume(profile?.resumeText, structure, refined);
    refined.coverLetterParagraph = refined.coverLetterParagraph || kit.coverLetterParagraph;
    refined.resumeSections = refined.sections;
    return refined;
  } catch {
    return kit;
  }
}

async function perfectKitForJob({
  client,
  kit,
  profile,
  job,
  jobDescription,
  contact,
  options,
  missingKeywords,
  tailorFocus,
}) {
  const structure = parseResumeStructure(profile?.resumeText || '');
  let result = applyAtsMetadata(kit, jobDescription, job);
  const threshold = options.highMatchTarget || 100;
  const maxPasses = options.maxPasses || 6;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const needsAts = !result.atsReady || (result.atsScore ?? 0) < threshold;
    const needsJd = (result.jdMatchPct ?? 100) < 80 && (result.jdRequirementsTotal ?? 0) > 0;
    if (!needsAts && !needsJd) break;
    if (!client) break;

    const { getRedTerms } = require('./atsKeywordService');
    const redTerms = getRedTerms(result, 8);
    const uncovered = result.uncoveredRequirements || [];
    if (!redTerms.length && !uncovered.length) break;

    const prevScore = result.atsScore ?? 0;
    const prevJd = result.jdMatchPct ?? 0;

    const refined = await refineKitForInterview({
      client,
      kit: result,
      profile,
      structure,
      jobDescription,
      job,
      redTerms,
      uncoveredRequirements: uncovered.slice(0, 5),
      tailorFocus,
      pageTarget: options.supplementPages,
      atsScore: result.atsScore,
      jdMatchPct: result.jdMatchPct,
    });

    if (!refined.sections?.length && !refined.tailoredResumeText) break;

    const renormalized = normalizeKit(refined, profile, job, jobDescription, missingKeywords, contact, options);
    const next = applyAtsMetadata(renormalized, jobDescription, job);

    if ((next.atsScore ?? 0) <= prevScore && (next.jdMatchPct ?? 0) <= prevJd && (next.atsScore ?? 0) >= 90) {
      break;
    }

    if ((next.atsScore ?? 0) <= prevScore && (next.jdMatchPct ?? 0) <= prevJd && pass >= 2) {
      break;
    }

    result = { ...next, atsOptimized: true, perfectionPasses: pass + 1 };
  }

  return result;
}

function parseKitJson(raw) {
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}

function normalizeKit(kit, profile, job, jobDescription, missingKeywords, contact = {}, options = {}) {
  const original = String(profile?.resumeText || '').trim();
  const structure = parseResumeStructure(original);
  const pageTarget = inferResumePageTarget(profile?.resumeText, options.supplementPages ?? kit.supplementPagesTarget);

  let tailoredResumeText = finalizeTailoredResume(original, structure, kit);
  let supplementPages = kit.supplementPages || [];

  if (!tailoredResumeText && supplementPages.length) {
    tailoredResumeText = supplementPages.map((p) => p.content).join('\n\n');
  }

  if (tailoredResumeText) {
    tailoredResumeText = finalizeTailoredResume(original, structure, {
      ...kit,
      tailoredResumeText,
    });
  }

  if (!tailoredResumeText || supplementPages.length < pageTarget) {
    const demo = buildTailoredResumeDemo(profile, job, jobDescription, contact, {
      ...options,
      supplementPages: pageTarget,
    });
    if (!tailoredResumeText) tailoredResumeText = demo.tailoredResumeText;
    if (supplementPages.length < pageTarget) supplementPages = demo.supplementPages;
  } else if (supplementPages.length > pageTarget) {
    supplementPages = splitResumeIntoPages(tailoredResumeText, pageTarget);
  } else if (supplementPages.length === 1 && pageTarget > 1) {
    supplementPages = splitResumeIntoPages(tailoredResumeText, pageTarget);
  }

  const tailorMode = TAILOR_MODE;
  const baseMatch = job?.personalMatchPct ?? job?.matchPct ?? 70;
  const estimatedMatchPct = Math.min(
    98,
    kit.estimatedMatchPct ??
      baseMatch + Math.max(8, (resolveTailorOptions().highMatchTarget || 100) - baseMatch)
  );

  return finalizeNormalizedKit(
    humanizeKit({
      ...kit,
      mode: 'full_resume',
      tailored: true,
      tailorMode,
      supplementPagesTarget: pageTarget,
      highMatchTarget: options.highMatchTarget || kit.highMatchTarget || 100,
      estimatedMatchPct,
      pageCount: supplementPages.length,
      supplementPages,
      tailoredResumeText,
      fullSupplementText: tailoredResumeText,
      resumeAddendum: tailoredResumeText,
      resumeStructure: {
        sectionOrder: structure.sectionOrder,
        headingStyle: structure.headingStyle,
        sectionHeadings: structure.sections.map((s) => s.heading).filter(Boolean),
      },
      missingKeywords: kit.missingKeywords?.length ? kit.missingKeywords : missingKeywords,
      contactEmail: contact.email || kit.contactEmail || '',
      contactName: contact.name || kit.contactName || profile?.displayName || '',
      jobDescriptionLength: jobDescription.length,
      resumeSections: kit.sections?.length ? kit.sections : kit.resumeSections,
      guardrails: kit.guardrails || 'Tailored resume preserves all credentials and original section structure.',
    }),
    pageTarget,
    jobDescription
  );
}

function finalizeNormalizedKit(kit, pageTarget, jobDescription = '') {
  if (!kit?.tailoredResumeText) return kit;
  let tailoredResumeText = prepareResumeTextForParsing(kit.tailoredResumeText);
  tailoredResumeText = polishTailoredResumeText(tailoredResumeText, jobDescription);
  const supplementPages = splitResumeIntoPages(tailoredResumeText, pageTarget);
  const enriched = {
    ...kit,
    tailoredResumeText,
    fullSupplementText: tailoredResumeText,
    resumeAddendum: tailoredResumeText,
    supplementPages,
    pageCount: supplementPages.length,
    supplementPagesTarget: pageTarget,
  };
  enriched.formatted = formatKitAsText(enriched);
  return enriched;
}

function repairKitAgainstProfile(originalResume, kit, jobDescription = '') {
  if (!kit?.tailored || !(originalResume || '').trim()) return kit;

  const structure = parseResumeStructure(originalResume);
  const raw =
    kit.tailoredResumeText ||
    kit.fullSupplementText ||
    (Array.isArray(kit.supplementPages) ? kit.supplementPages.map((p) => p.content).join('\n\n') : '') ||
    '';

  if (!raw.trim()) return kit;

  const repairedText = finalizeTailoredResume(originalResume, structure, {
    ...kit,
    tailoredResumeText: raw,
  });
  const pageTarget = clampPageCount(kit.supplementPagesTarget || kit.pageCount || DEFAULT_SUPPLEMENT_PAGES);
  return finalizeNormalizedKit({ ...kit, tailoredResumeText: repairedText }, pageTarget, jobDescription);
}

function enrichKitForDisplay(kit, originalResume = '') {
  if (!kit?.tailored) return kit;

  if ((originalResume || '').trim()) {
    return repairKitAgainstProfile(originalResume, kit);
  }

  const raw =
    kit.tailoredResumeText ||
    kit.fullSupplementText ||
    (Array.isArray(kit.supplementPages) ? kit.supplementPages.map((p) => p.content).join('\n\n') : '') ||
    '';
  if (!raw.trim()) return kit;
  const pageTarget = clampPageCount(kit.supplementPagesTarget || kit.pageCount || DEFAULT_SUPPLEMENT_PAGES);
  return finalizeNormalizedKit({ ...kit, tailoredResumeText: raw }, pageTarget);
}

async function polishExistingKit({
  userId,
  profile,
  job,
  jobDescription,
  contact = {},
  kit,
  tailorFocus = '',
  highMatchTarget = 100,
  maxPasses = 8,
  tailorMode = 'high_match',
}) {
  if (!kit?.tailored && !kit?.tailoredResumeText) return kit;
  const client = userId ? await getClient(userId) : null;
  if (!client) return kit;

  const canonical = resolveTailorOptions();
  const pageTarget = inferResumePageTarget(profile?.resumeText, kit.supplementPagesTarget || kit.pageCount);
  const options = {
    supplementPages: pageTarget,
    tailorMode: canonical.tailorMode,
    highMatchTarget: canonical.highMatchTarget,
    maxPasses: maxPasses || canonical.polishMaxPasses,
  };
  const missingKeywords = kit.missingKeywords || inferMissingKeywords(profile, jobDescription);
  const fullJd = String(jobDescription || '').slice(0, 14000);
  const working = applyAtsMetadata(enrichKitForDisplay(kit), fullJd, job);

  return perfectKitForJob({
    client,
    kit: working,
    profile,
    job,
    jobDescription: fullJd,
    contact,
    options,
    missingKeywords,
    tailorFocus,
  });
}

async function perfectExperienceForKit({ userId, profile, job, jobDescription, kit }) {
  if (!kit?.tailoredResumeText || !profile?.resumeText) return kit;

  const client = userId ? await getClient(userId) : null;
  const structure = parseResumeStructure(profile.resumeText);
  const {
    perfectExperienceBullets,
    enforceExperienceIntegrity,
  } = require('./resumeExperiencePerfectionService');

  let text = enforceExperienceIntegrity(profile.resumeText, kit.tailoredResumeText);

  if (client) {
    text = await perfectExperienceBullets({
      client,
      originalResume: profile.resumeText,
      tailoredText: text,
      jobDescription,
      job,
      profile,
    });
  }

  text = finalizeTailoredResume(profile.resumeText, structure, { tailoredResumeText: text });
  const pageTarget = clampPageCount(kit.supplementPagesTarget || kit.pageCount || DEFAULT_SUPPLEMENT_PAGES);
  const enriched = finalizeNormalizedKit(
    { ...kit, tailoredResumeText: text },
    pageTarget,
    jobDescription
  );
  return applyAtsMetadata(enriched, jobDescription, job);
}

async function generateAdditiveKit({
  userId,
  profile,
  job,
  jobDescription,
  contact = {},
  tailorFocus = '',
  supplementPages = DEFAULT_SUPPLEMENT_PAGES,
  tailorMode = TAILOR_MODE,
  highMatchTarget = 100,
}) {
  const canonical = resolveTailorOptions();
  const pageTarget = inferResumePageTarget(profile?.resumeText, canonical.supplementPages);
  const effectiveMode = canonical.tailorMode;
  const options = {
    supplementPages: pageTarget,
    tailorMode: effectiveMode,
    highMatchTarget: canonical.highMatchTarget,
    maxRefinePasses: canonical.generateMaxPasses,
  };
  const missingKeywords = inferMissingKeywords(profile, jobDescription);
  const preservedCredentials = extractMustPreserveFromResume(profile?.resumeText);
  const structure = parseResumeStructure(profile?.resumeText || '');
  const structureGuide = describeStructureForPrompt(structure);
  const sectionPayload = structureToSectionPayload(structure);
  const client = userId ? await getClient(userId) : null;
  const fullJd = jobDescription.slice(0, 9000);
  const { buildJdMatchBrief } = require('./atsKeywordService');
  const jdBrief = buildJdMatchBrief(fullJd, job);

  if (!client) {
    return buildDemoKit(profile, job, fullJd, contact, options);
  }

  const contactBlock = contactHeader(contact);
  const expSection = structure.sections.find((s) => s.key === 'experience');
  const jdAlignmentNote =
    'Target this exact role: mirror posting requirements and critical keywords truthfully — each term once, scannable bullets, recruiter-first readability.';

  const originalJobs = splitExperienceContentIntoJobs(expSection?.content || '');
  const jobCount = originalJobs.length;
  const jobEmployers = originalJobs.map((j) => j.company || j.title).filter(Boolean).join('; ');
  const { buildExperienceBlueprint } = require('./resumeExperiencePerfectionService');
  const experienceBlueprint = buildExperienceBlueprint(originalJobs);

  const system = `You are an expert resume writer tailoring a resume for ONE job application. Goal: pass ATS, match the posting, get recruiter callbacks — without losing resume integrity.

OUTPUT: Structured tailored resume (same sections as original) + cover letter.

JOB-TARGET RULES:
1. Summary must name "${job?.title || 'this role'}" fit and reflect top posting requirements.
2. Experience bullets must prove qualifications from the posting using the candidate's real work only.
3. Each critical keyword/requirement appears at most once — varied wording, no stuffing.
4. Experience: keep ALL ${jobCount || 'original'} employer role(s) — titles, dates, companies unchanged (${jobEmployers || 'every employer from original'}).
5. For EACH job, output EXACTLY ${TARGET_BULLETS_PER_JOB} accomplishment bullets (or more if the original already has more). If the original has fewer, decompose scope/technologies/outcomes from the same real work — never invent employers or metrics.
6. Rewrite bullet wording to match the job description — never delete roles.
7. Substitute phrasing and keywords in each bullet so prior jobs read relevant to the target role while staying truthful.
8. Every bullet: one complete sentence (180-320 chars), action verb, scope, technology, outcome where possible.

STRUCTURE RULES:
1. EXACT section headings from original, same order.
2. Header block unchanged — name, taglines, contact on separate lines (no stray pipe characters).
3. Education, certifications, credentials: COPY VERBATIM — degree lines only under EDUCATION; never paste summary or certification paragraphs into EDUCATION.
4. Experience headers (title, dates, company) copy exactly from original; rewrite accomplishment bullets only.
5. Bullet style (${structure.headingStyle}) and ~${pageTarget} pages.
6. ${jdAlignmentNote}
7. Never invent employers, dates, certs, or metrics.
8. FORBIDDEN: addendum, supplement, JD mapping, match percentages, emojis.

COVER LETTER: 4 sentences for ${job?.title} at ${job?.company} — hook, fit to posting, one proof point, close.

${RESUME_INTEGRITY_CONTRACT}

${HUMAN_WRITING_PROMPT}

Return JSON only:
{
  "sections": [{ "heading": "...", "content": "..." }],
  "coverLetterParagraph": "...",
  "missingKeywords": ["terms addressed"],
  "estimatedMatchPct": number
}`;

  const user = `CANDIDATE CONTACT:
${contactBlock || `${contact.name || 'Candidate'}\n${contact.email || ''}`}

${structureGuide}

ORIGINAL RESUME SECTIONS (use these headings exactly):
${JSON.stringify(sectionPayload, null, 2)}

FULL ORIGINAL RESUME:
${(profile?.resumeText || profile?.bio || 'No resume').slice(0, 8000)}

MUST PRESERVE VERBATIM (never drop these lines):
${preservedCredentials.length ? preservedCredentials.join('\n') : 'All certification, education, and credential lines from the resume above'}

ORIGINAL EMPLOYERS (${jobCount} role(s) — include every one in EXPERIENCE output):
${jobCount ? originalJobs.map((j, i) => `${i + 1}. ${j.title || 'Role'} — ${j.company || 'employer from original'}`).join('\n') : 'All roles from FULL ORIGINAL RESUME'}

EXPERIENCE PERFECTION CONTRACT (mandatory — same job count, ~${TARGET_BULLETS_PER_JOB} bullets per role):
${experienceBlueprint.length ? experienceBlueprint.map((b) => `Job ${b.index}: ${b.title || 'Role'} at ${b.company || 'employer'} — header unchanged, EXACTLY ${b.bulletCount} rewritten bullets aligned to the posting${b.needsAiExpansion ? ' (expand from original accomplishments — same facts only)' : ''}`).join('\n') : `Keep every job; target ${TARGET_BULLETS_PER_JOB} bullets per role.`}

TARGET ROLE: ${job?.title} at ${job?.company}
TAILOR MODE: ${effectiveMode} (ATS + job-requirement alignment)
TARGET LENGTH: ~${pageTarget} printed pages

TOP POSTING REQUIREMENTS (address each truthfully in summary or experience):
${jdBrief.requirements.length ? jdBrief.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'See job description below.'}

CRITICAL KEYWORDS: ${jdBrief.criticalTerms.slice(0, 18).join(', ')}

JOB DESCRIPTION:
${fullJd}${tailorFocus ? `\n\nNOTES FROM CANDIDATE:\n${String(tailorFocus).slice(0, 1500)}` : ''}`;

  const maxTokens = Math.min(6000, 1200 + pageTarget * 450 + Math.max(0, jobCount) * 220);

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.42,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  }).catch((err) => {
    const wrapped = new Error(err?.message || 'OpenAI request failed');
    wrapped.status = err?.status || 502;
    throw wrapped;
  });

  const raw = response.choices[0]?.message?.content?.trim() || '';
  try {
    const kit = parseKitJson(raw);
    if (kit.sections?.length) {
      kit.tailoredResumeText = finalizeTailoredResume(profile?.resumeText, structure, kit);
    } else if (kit.tailoredResumeText) {
      kit.tailoredResumeText = finalizeTailoredResume(profile?.resumeText, structure, kit);
    }
    if (kit.tailoredResumeText) {
      kit.supplementPages = splitResumeIntoPages(kit.tailoredResumeText, pageTarget);
      kit.fullSupplementText = kit.tailoredResumeText;
      kit.resumeAddendum = kit.tailoredResumeText;
    }
    const normalized = normalizeKit(kit, profile, job, fullJd, missingKeywords, contact, options);
    const scored = applyAtsMetadata(normalized, fullJd, job);
    const maxRefinePasses =
      options.maxRefinePasses != null
        ? Math.max(0, Number(options.maxRefinePasses) || 0)
        : canonical.generateMaxPasses;
    if (maxRefinePasses <= 0) return scored;
    return perfectKitForJob({
      client,
      kit: scored,
      profile,
      job,
      jobDescription: fullJd,
      contact,
      options: { ...options, maxPasses: maxRefinePasses },
      missingKeywords,
      tailorFocus,
    });
  } catch {
    const demo = buildDemoKit(profile, job, fullJd, contact, options);
    demo.parseError = true;
    return demo;
  }
}

function formatKitAsText(kit) {
  const resume = kit.tailoredResumeText || kit.fullSupplementText || '';
  if (resume) {
    const lines = [resume, ''];
    if (kit.coverLetterParagraph) {
      lines.push('---', '', kit.coverLetterParagraph);
    }
    return lines.join('\n').trim();
  }

  const lines = [];
  if (kit.supplementPages?.length) {
    for (const page of kit.supplementPages) {
      lines.push(page.content, '');
    }
  }
  if (kit.coverLetterParagraph) {
    lines.push(kit.coverLetterParagraph);
  }
  return lines.join('\n').trim();
}

module.exports = {
  generateAdditiveKit,
  buildDemoKit,
  inferMissingKeywords,
  extractMustPreserveFromResume,
  inferResumePageTarget,
  formatKitAsText,
  clampPageCount,
  finalizeTailoredResume,
  enrichKitForDisplay,
  repairKitAgainstProfile,
  finalizeNormalizedKit,
  applyAtsMetadata,
  perfectExperienceForKit,
  perfectKitForJob,
  polishExistingKit,
  TECH_KEYWORDS,
  extractJdRequirements,
  MIN_SUPPLEMENT_PAGES,
  MAX_SUPPLEMENT_PAGES,
  DEFAULT_SUPPLEMENT_PAGES,
};
