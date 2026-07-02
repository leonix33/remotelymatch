const profileService = require('./profileService');
const applicantContactService = require('./applicantContactService');
const jobDescriptionService = require('./jobDescriptionService');
const applicationKitStore = require('./applicationKitStore');
const recruiterContactService = require('./recruiterContactService');
const contactEnrichmentService = require('./contactEnrichmentService');
const followUpKitStore = require('./followUpKitStore');
const jobService = require('./jobService');
const { pickBestRecipient } = require('./contactRankingService');

function firstName(name = '') {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

function pickRecipient(contacts = {}) {
  const pool = [
    ...(contacts.recommendedContacts || []),
    ...(contacts.verifiedContacts || []),
    ...(contacts.emails || []),
  ];
  return pickBestRecipient(pool);
}

function buildEmailDraft({ contact, job, kit, recipient, daysSinceApply = 5 }) {
  const name = contact.name || 'Candidate';
  const role = job.title || 'the role';
  const company = job.company || 'your company';
  const greeting = recipient.name ? `Hi ${firstName(recipient.name)},` : 'Hi,';
  const skills = (kit?.skillsToHighlight || kit?.mustHaveSkills || []).slice(0, 3).join(', ');
  const keywords = (kit?.missingKeywords || kit?.keywordsAddressed || []).slice(0, 5).join(', ');
  const atsNote =
    kit?.atsScore != null ? `My tailored resume is aligned to your posting (ATS ${Math.round(kit.atsScore)}% match).` : '';

  const subject = `Following up — ${role} at ${company}`;
  const body = [
    greeting,
    '',
    `I applied for the ${role} position at ${company} about ${daysSinceApply} days ago and wanted to follow up personally.`,
    skills
      ? `My background in ${skills} lines up closely with what you're hiring for.`
      : `I'm very interested in this role and believe my experience is a strong fit.`,
    keywords
      ? `I've attached a JD-tailored resume and cover letter highlighting ${keywords} from your posting.`
      : atsNote || `I've attached a tailored resume and cover letter for this role.`,
    '',
    `I'd welcome a brief conversation if you're still reviewing candidates.`,
    '',
    'Best regards,',
    name,
    contact.email || '',
    contact.phone ? contact.phone : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { subject, body, to: recipient.email || '' };
}

function buildLinkedInDraft({ contact, job, kit }) {
  const role = job.title || 'the role';
  const company = job.company || 'your team';
  const skill = (kit?.skillsToHighlight || [])[0] || 'platform engineering';
  return `Hi — I recently applied for the ${role} role at ${company}. I have hands-on ${skill} experience and would love to connect if you're involved in hiring for this team. Thanks, ${firstName(contact.name)}`;
}

function buildCallScript({ contact, job, recipient, daysSinceApply = 5 }) {
  const company = job.company || 'the company';
  const role = job.title || 'the role';
  const phone = contact.phone || '[your phone — add in Profile]';
  const lines = [
    `CALL SCRIPT — ${company} · ${role}`,
    '',
    `Your number: ${phone}`,
    recipient.name ? `Ask for: ${recipient.name}` : 'Ask for: recruiting or hiring manager for this role',
    recipient.email ? `Email on file: ${recipient.email}` : '',
    '',
    'Opening:',
    `"Hi, my name is ${contact.name || '___'}. I applied for the ${role} position about ${daysSinceApply} days ago and wanted to confirm my application was received and see if there's a good time for a brief intro call."`,
    '',
    'If voicemail:',
    `"Hi, this is ${firstName(contact.name)} following up on my application for ${role} at ${company}. I'd love to connect — you can reach me at ${phone}. Thank you."`,
    '',
    'Close:',
    '"Thanks for your time — I\'m very interested in the role and happy to send any additional context by email."',
  ];
  return lines.filter(Boolean).join('\n');
}

async function resolveJob(userId, jobId, jobHint = null) {
  if (jobHint?.jobId) return jobHint;
  const fromFeed = jobService.readJobsFromSqlite(5000).find((j) => j.jobId === jobId);
  if (fromFeed) return fromFeed;
  const kit = await applicationKitStore.get(userId, jobId);
  if (kit?.jobTitle) {
    return {
      jobId,
      title: kit.jobTitle,
      company: kit.company,
      url: kit.jobUrl,
    };
  }
  return { jobId, title: 'Role', company: 'Company', url: '' };
}

async function generateFollowUpKit(userId, jobId, options = {}) {
  const job = await resolveJob(userId, jobId, options.job);
  const profile = await profileService.getOrCreate(userId);
  const contact = await applicantContactService.resolveApplicantContact(userId, profile, options.authEmail);
  const jobDescription = await jobDescriptionService.resolveJobDescription(job);
  const kit = options.kit || (await applicationKitStore.get(userId, jobId));
  const contacts = await contactEnrichmentService.enrichContacts({
    userId,
    job,
    jobDescription,
    baseContacts: recruiterContactService.discoverContacts({ job, jobDescription }),
  });
  const recipient = pickRecipient(contacts);
  const daysSinceApply = options.daysSinceApply ?? 5;

  const emailDraft = buildEmailDraft({ contact, job, kit, recipient, daysSinceApply });
  const linkedInMessage = buildLinkedInDraft({ contact, job, kit });
  const callScript = buildCallScript({ contact, job, recipient, daysSinceApply });

  const payload = {
    jobId: job.jobId || jobId,
    title: job.title,
    company: job.company,
    jobUrl: job.url || job.applyUrl || job.jobUrl || '',
    atsMatchPct: kit?.estimatedMatchPct ?? null,
    tailorMode: kit?.tailorMode || profile.defaultTailorMode || 'high_match',
    highMatchTarget: kit?.highMatchTarget || profile.highMatchTarget || 95,
    keywordsAddressed: (kit?.missingKeywords || []).slice(0, 12),
    companyPhone: contacts.companyPhone || null,
    recipient,
    contacts: {
      ...contacts,
      recommendedContacts: contacts.recommendedContacts || [],
      otherContacts: contacts.otherContacts || [],
    },
    emailSubject: emailDraft.subject,
    emailBody: emailDraft.body,
    emailTo: emailDraft.to,
    linkedInMessage,
    callScript,
    applicantPhone: contact.phone || profile.contactPhone || '',
    applicantEmail: contact.email || '',
    applicantName: contact.name || '',
    generatedAt: new Date().toISOString(),
  };

  return followUpKitStore.set(userId, jobId, payload);
}

async function generateForJobs(userId, jobs = [], options = {}) {
  const kits = [];
  for (const job of jobs) {
    if (!job?.jobId) continue;
    try {
      kits.push(await generateFollowUpKit(userId, job.jobId, { ...options, job }));
    } catch (err) {
      console.warn(`Follow-up kit failed for ${job.jobId}:`, err.message);
    }
  }
  return kits;
}

async function getOrGenerate(userId, jobId, options = {}) {
  const existing = followUpKitStore.get(userId, jobId);
  if (existing && !options.force) return existing;
  return generateFollowUpKit(userId, jobId, options);
}

module.exports = {
  generateFollowUpKit,
  generateForJobs,
  getOrGenerate,
  buildEmailDraft,
  buildCallScript,
  buildLinkedInDraft,
};
