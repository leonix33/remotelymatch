const openaiService = require('./openaiService');
const env = require('../config/env');
const { contactHeader, contactSignature } = require('./applicantContactService');
const { HUMAN_WRITING_PROMPT, humanizeKit } = require('./humanizeWritingService');

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

function buildTailoredResumeDemo(profile, job, jobDescription, contact = {}, options = {}) {
  const original = String(profile?.resumeText || '').trim();
  const pageTarget = inferResumePageTarget(original, options.supplementPages);
  const highMatch = options.tailorMode === 'high_match';
  const skills = (profile?.mustHaveSkills || []).slice(0, 12).join(', ') || 'cloud and platform engineering';
  const reqs = extractJdRequirements(jobDescription).slice(0, 6);
  const preserved = extractMustPreserveFromResume(original);
  const name = contact.name || profile?.displayName || profile?.applicantName || 'Candidate';
  const header = contactHeader(contact) || `${name}\n${contact.email || ''}`;

  const summaryLines = [
    header,
    '',
    'SUMMARY',
    `${job?.title || 'Engineer'} with hands-on ${skills} experience. ${reqs.length ? `Background aligns with ${job?.company || 'this role'}'s focus on ${reqs[0].slice(0, 80)}.` : ''}`.trim(),
  ];

  let body = original;
  if (!/^(summary|profile|objective)\b/im.test(original)) {
    body = `${summaryLines.join('\n')}\n\n${original}`;
  } else {
    body = `${header}\n\n${original}`;
  }

  const missingCerts = preserved.filter((line) => !body.toLowerCase().includes(line.toLowerCase()));
  if (missingCerts.length) {
    body = `${body}\n\nCERTIFICATIONS\n${missingCerts.join('\n')}`;
  }

  if (highMatch && reqs.length) {
    const summaryMatch = body.match(/\n(SUMMARY|PROFILE|OBJECTIVE)\b/i);
    if (summaryMatch) {
      const insertAt = summaryMatch.index + summaryMatch[0].length;
      const extra = ` ${reqs[0].slice(0, 120).replace(/^[-•]\s*/, '')}.`;
      body = `${body.slice(0, insertAt)}${extra}${body.slice(insertAt)}`;
    }
  }

  const tailoredResumeText = body.trim();
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
  const pageTarget = inferResumePageTarget(profile?.resumeText, options.supplementPages ?? kit.supplementPagesTarget);
  let tailoredResumeText = kit.tailoredResumeText || kit.fullSupplementText || '';
  let supplementPages = kit.supplementPages || [];

  if (!tailoredResumeText && supplementPages.length) {
    tailoredResumeText = supplementPages.map((p) => p.content).join('\n\n');
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

  return humanizeKit({
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
    missingKeywords: kit.missingKeywords?.length ? kit.missingKeywords : missingKeywords,
    contactEmail: contact.email || kit.contactEmail || '',
    contactName: contact.name || kit.contactName || profile?.displayName || '',
    jobDescriptionLength: jobDescription.length,
    atsTips: [],
    guardrails: kit.guardrails || 'Tailored resume preserves all credentials and original section structure.',
  });
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

OUTPUT: A complete tailored resume (not a separate addendum) plus a short cover letter paragraph.

STRICT RULES:
1. Keep the SAME section order, header style, and formatting as the candidate's original resume (e.g. ALL CAPS section headers, bullet style, spacing).
2. Include EVERY job, employer, date, education entry, certification, license, and credential from the original — NEVER remove or omit credentials or certificates.
3. ${jdAlignmentNote}
4. Do not invent employers, dates, certifications, degrees, or metrics.
5. Target length: match the original resume (${pageTarget} pages when printed). Do not truncate to 2 pages if the original is longer.
6. Write in the candidate's voice — plain, professional, human. No emojis. No AI/meta language.
7. FORBIDDEN in resume text: "addendum", "supplement", "JD mapping", "ATS glossary", "keyword alignment", "AI", "generated", match percentages, or template section titles.
8. Cover letter: 3-5 sentences, plain sign-off with name and email: ${contact.email || '[email]'}.

${HUMAN_WRITING_PROMPT}

Return JSON only:
{
  "tailoredResumeText": "complete resume as plain text, same structure as original",
  "coverLetterParagraph": "short cover letter body",
  "missingKeywords": ["internal only — jd terms addressed"],
  "estimatedMatchPct": number
}`;

  const user = `CANDIDATE CONTACT:
${contactBlock || `${contact.name || 'Candidate'}\n${contact.email || ''}`}

ORIGINAL RESUME (preserve all sections, certs, education — tailor wording only):
${(profile?.resumeText || profile?.bio || 'No resume').slice(0, 12000)}

MUST PRESERVE VERBATIM (certifications/credentials/education lines — do not drop):
${preservedCredentials.length ? preservedCredentials.join('\n') : 'Extract all cert/credential/education lines from resume above'}

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
  MIN_SUPPLEMENT_PAGES,
  MAX_SUPPLEMENT_PAGES,
  DEFAULT_SUPPLEMENT_PAGES,
};
