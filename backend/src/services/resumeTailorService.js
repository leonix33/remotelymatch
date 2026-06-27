const openaiService = require('./openaiService');
const env = require('../config/env');
const { contactHeader, contactSignature } = require('./applicantContactService');
const { HUMAN_WRITING_PROMPT, humanizeKit } = require('./humanizeWritingService');
const { prepareResumeTextForParsing } = require('./resumeRepairService');
const {
  parseResumeStructure,
  describeStructureForPrompt,
  reassembleResume,
  findMissingPreservedLines,
  injectMissingIntoSection,
  structureToSectionPayload,
} = require('./resumeStructureService');

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
const DEFAULT_SUPPLEMENT_PAGES = 3;

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
  const fromLength = Math.max(1, Math.ceil(words / 350));
  const requested = requestedPages || DEFAULT_SUPPLEMENT_PAGES;
  return clampPageCount(Math.max(requested, fromLength));
}

function extractMustPreserveFromResume(resumeText = '') {
  const lines = String(resumeText).split('\n');
  const preserved = [];
  const sectionStart =
    /^(certifications?|credentials|licenses?|education|training|clearances?|professional development)\b/i;
  const certLine =
    /\b(certified|certification|certificate|license|licensed|credential|AWS |Azure |GCP |CKA|CKAD|PMP|CISSP|CompTIA|Security\+|Terraform Associate|associate|professional)\b/i;

  let captureSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (captureSection) preserved.push('');
      continue;
    }
    if (sectionStart.test(trimmed)) {
      captureSection = true;
      preserved.push(trimmed);
      continue;
    }
    if (captureSection) {
      preserved.push(trimmed);
      if (/^(experience|work history|employment|skills|projects|summary)\b/i.test(trimmed)) {
        captureSection = false;
      }
      continue;
    }
    if (certLine.test(trimmed)) preserved.push(trimmed);
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

  return text.trim();
}

function buildTailoredResumeDemo(profile, job, jobDescription, contact = {}, options = {}) {
  const original = String(profile?.resumeText || '').trim();
  const structure = parseResumeStructure(original);
  const pageTarget = inferResumePageTarget(original, options.supplementPages);
  const highMatch = options.tailorMode === 'high_match';
  const skills = (profile?.mustHaveSkills || []).slice(0, 12).join(', ') || 'cloud and platform engineering';
  const reqs = extractJdRequirements(jobDescription).slice(0, 6);
  const name = contact.name || profile?.displayName || profile?.applicantName || 'Candidate';
  const header = contactHeader(contact) || structure.headerLines.join('\n') || `${name}\n${contact.email || ''}`;

  const sectionOutputs = structure.sections.map((section) => {
    if (section.immutable) {
      return { heading: section.heading, content: section.content };
    }

    if (section.key === 'summary') {
      const summaryBody =
        section.content ||
        `${job?.title || 'Engineer'} with hands-on ${skills} experience.${reqs.length ? ` Background aligns with ${job?.company || 'this role'}'s focus on ${reqs[0].slice(0, 80)}.` : ''}`;
      let content = summaryBody;
      if (highMatch && reqs.length) {
        content = `${content} ${reqs[0].slice(0, 100).replace(/^[-•]\s*/, '')}.`.trim();
      }
      return { heading: section.heading, content };
    }

    if (section.key === 'experience' && highMatch && reqs.length && section.content) {
      const lines = section.content.split('\n');
      const bulletIdx = lines.findIndex((l) => /^[-•*●]\s/.test(l.trim()));
      if (bulletIdx >= 0) {
        lines[bulletIdx] = `${lines[bulletIdx].trimEnd()} — ${reqs[0].slice(0, 80).replace(/^[-•]\s*/, '')}`;
      }
      return { heading: section.heading, content: lines.join('\n') };
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
    `I've spent the last several years on ${skills} in production environments.`,
    reqs[0] ? `Your posting mentions ${reqs[0].slice(0, 100)} — that's work I've done in prior roles.` : '',
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
    highMatchTarget: options.highMatchTarget || 90,
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

  return kit;
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

  const tailorMode = options.tailorMode === 'high_match' ? 'high_match' : kit.tailorMode || 'balanced';
  const baseMatch = job?.personalMatchPct ?? job?.matchPct ?? 70;
  const estimatedMatchPct = Math.min(
    98,
    kit.estimatedMatchPct ??
      baseMatch + (tailorMode === 'high_match' ? Math.max(8, (options.highMatchTarget || 90) - baseMatch) : 4)
  );

  return finalizeNormalizedKit(
    humanizeKit({
      ...kit,
      mode: 'full_resume',
      tailored: true,
      tailorMode,
      supplementPagesTarget: pageTarget,
      highMatchTarget: options.highMatchTarget || kit.highMatchTarget || 90,
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
      atsTips: [],
      guardrails: kit.guardrails || 'Tailored resume preserves all credentials and original section structure.',
    }),
    pageTarget
  );
}

function finalizeNormalizedKit(kit, pageTarget) {
  if (!kit?.tailoredResumeText) return kit;
  const tailoredResumeText = prepareResumeTextForParsing(kit.tailoredResumeText);
  const supplementPages = splitResumeIntoPages(tailoredResumeText, pageTarget);
  return {
    ...kit,
    tailoredResumeText,
    fullSupplementText: tailoredResumeText,
    resumeAddendum: tailoredResumeText,
    supplementPages,
    pageCount: supplementPages.length,
  };
}

async function generateAdditiveKit({
  userId,
  profile,
  job,
  jobDescription,
  contact = {},
  tailorFocus = '',
  supplementPages = DEFAULT_SUPPLEMENT_PAGES,
  tailorMode = 'balanced',
  highMatchTarget = 90,
}) {
  const pageTarget = inferResumePageTarget(profile?.resumeText, supplementPages);
  const options = { supplementPages: pageTarget, tailorMode, highMatchTarget };
  const missingKeywords = inferMissingKeywords(profile, jobDescription);
  const preservedCredentials = extractMustPreserveFromResume(profile?.resumeText);
  const structure = parseResumeStructure(profile?.resumeText || '');
  const structureGuide = describeStructureForPrompt(structure);
  const sectionPayload = structureToSectionPayload(structure);
  const client = userId ? await getClient(userId) : null;
  const fullJd = jobDescription.slice(0, 14000);

  if (!client) {
    return buildDemoKit(profile, job, fullJd, contact, options);
  }

  const contactBlock = contactHeader(contact);
  const jdAlignmentNote =
    tailorMode === 'high_match'
      ? 'Weave exact JD terms into experience bullets where the candidate has truthful experience. Do not add meta "JD mapping" sections.'
      : 'Naturally align experience bullets to the job description without sounding templated.';

  const system = `You are an expert resume writer helping a candidate tailor their resume for one job application.

OUTPUT: Return a structured tailored resume that mirrors the candidate's original layout section-by-section, plus a short cover letter.

STRUCTURE RULES (highest priority):
1. Use the EXACT section headings from the original resume, in the SAME order.
2. Copy the header block exactly — name, each pipe-separated title/tagline line on its own row, email/phone/links. Never merge header lines into one paragraph.
3. Education, certifications, credentials, licenses, and training sections: COPY VERBATIM — no rewording.
4. Experience: keep every employer name, job title, and date line exactly as written; only rewrite bullet/description lines to align with the job.
5. Summary/profile: tailor wording to the role; keep similar length and tone.
6. Do not add, remove, or rename sections. Do not merge sections.
7. Match bullet style (•, -, *) and heading style (${structure.headingStyle}) from the original.
8. Target length: ~${pageTarget} printed pages — do not truncate if the original is longer.
9. ${jdAlignmentNote}
10. Do not invent employers, dates, certifications, degrees, or metrics.
11. Plain professional English — no emojis, no AI/meta language.
12. FORBIDDEN: "addendum", "supplement", "JD mapping", "ATS glossary", match percentages.
13. Keep section content on separate lines — job titles, dates, and bullets must not collapse into one paragraph.

${HUMAN_WRITING_PROMPT}

Return JSON only:
{
  "sections": [
    { "heading": "EXACT heading from original", "content": "section body text" }
  ],
  "coverLetterParagraph": "short cover letter body",
  "missingKeywords": ["internal jd terms addressed"],
  "estimatedMatchPct": number
}`;

  const user = `CANDIDATE CONTACT:
${contactBlock || `${contact.name || 'Candidate'}\n${contact.email || ''}`}

${structureGuide}

ORIGINAL RESUME SECTIONS (use these headings exactly):
${JSON.stringify(sectionPayload, null, 2)}

FULL ORIGINAL RESUME:
${(profile?.resumeText || profile?.bio || 'No resume').slice(0, 12000)}

MUST PRESERVE VERBATIM (never drop these lines):
${preservedCredentials.length ? preservedCredentials.join('\n') : 'All certification, education, and credential lines from the resume above'}

TARGET ROLE: ${job?.title} at ${job?.company}
TAILOR MODE: ${tailorMode}
TARGET LENGTH: ~${pageTarget} printed pages

JOB DESCRIPTION:
${fullJd}${tailorFocus ? `\n\nNOTES FROM CANDIDATE:\n${String(tailorFocus).slice(0, 1500)}` : ''}`;

  const maxTokens = Math.min(8000, 1200 + pageTarget * 900);

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: tailorMode === 'high_match' ? 0.48 : 0.52,
    max_tokens: maxTokens,
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
    return normalizeKit(kit, profile, job, fullJd, missingKeywords, contact, options);
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
  MIN_SUPPLEMENT_PAGES,
  MAX_SUPPLEMENT_PAGES,
  DEFAULT_SUPPLEMENT_PAGES,
};
