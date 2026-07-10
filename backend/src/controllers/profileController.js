const { z } = require('zod');
const profileService = require('../services/profileService');
const openaiService = require('../services/openaiService');
const applicantContactService = require('../services/applicantContactService');
const {
  parseResumeFile,
  parseResumeFromText,
  mergeSkillLists,
  extractSkillsFromText,
  criteriaFromResumeText,
  shouldReplaceCriteriaFromResume,
  isUnreadableResumeText,
} = require('../services/resumeParseService');
const { prepareResumeTextForParsing } = require('../services/resumeRepairService');

const updateSchema = z.object({
  displayName: z.string().min(2).optional(),
  applicantName: z.string().min(2).optional().or(z.literal('')),
  headline: z.string().optional(),
  bio: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
  portfolio: z.string().optional(),
  targetTitles: z.array(z.string()).optional(),
  mustHaveSkills: z.array(z.string()).optional(),
  niceToHaveSkills: z.array(z.string()).optional(),
  targetCompanies: z.array(z.string()).optional(),
  resumeText: z.string().optional(),
  minMatchScore: z.number().min(0).max(100).optional(),
  onboardingComplete: z.boolean().optional(),
  extractedSkills: z.array(z.string()).optional(),
  resumeFileName: z.string().optional(),
  tailorResumeOnApply: z.boolean().optional(),
  autoApplyEnabled: z.boolean().optional(),
  defaultApplyResumeMode: z.enum(['base', 'tailored']).optional(),
  digestEmail: z.string().email().optional().or(z.literal('')),
  notificationEmail: z.string().email().optional().or(z.literal('')),
  emailDigestEnabled: z.boolean().optional(),
  applySummaryEmailsEnabled: z.boolean().optional(),
  followUpRemindersEnabled: z.boolean().optional(),
  contactPhone: z.string().optional(),
  defaultSupplementPages: z.number().min(1).max(6).optional(),
  defaultTailorMode: z.enum(['balanced', 'high_match']).optional(),
  defaultQuickApplyCount: z.number().min(1).max(15).optional(),
  minCallbackScore: z.number().min(0).max(95).optional(),
  qualityFirstMode: z.boolean().optional(),
  highMatchTarget: z.number().min(95).max(100).optional(),
  savedJobs: z
    .array(
      z.object({
        jobId: z.string(),
        title: z.string().optional(),
        company: z.string().optional(),
        url: z.string().optional(),
        matchPct: z.number().optional(),
        savedAt: z.union([z.string(), z.date()]).optional(),
      })
    )
    .optional(),
  linkedinSavedSearches: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string().min(1),
        url: z.string().min(8),
        createdAt: z.union([z.string(), z.date()]).optional(),
      })
    )
    .optional(),
  jobBoardSelections: z.record(z.boolean()).optional(),
});

const parseResumeSchema = z
  .object({
    fileBase64: z.string().min(1).optional(),
    resumeText: z.string().min(20).optional(),
    filename: z.string().min(1).max(255),
    applyToProfile: z.boolean().optional(),
    mergeSkills: z.boolean().optional(),
  })
  .refine((body) => Boolean(body.fileBase64 || body.resumeText), {
    message: 'Provide a resume file or extracted resume text',
  });

function parseListField(value) {
  if (Array.isArray(value)) return value.map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

async function getMe(req, res, next) {
  try {
    const raw = await profileService.getRaw(req.user.sub);
    const patch = {};
    if (raw?.resumeText && isUnreadableResumeText(raw.resumeText)) {
      patch.resumeText = '';
      patch.resumeFileName = '';
      patch.extractedSkills = [];
    }
    const accountEmail = await applicantContactService.resolveAuthEmail(req.user.sub, req.user.email);
    if (!raw?.digestEmail?.trim() && accountEmail && !applicantContactService.isMailboxOnlyEmail(accountEmail)) {
      patch.digestEmail = accountEmail;
    }
    if (Object.keys(patch).length) {
      await profileService.update(req.user.sub, patch);
    }
    const profile = await profileService.getOrCreate(req.user.sub);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const body = updateSchema.parse(req.body);
    const payload = { ...body };
    if (body.targetTitles) payload.targetTitles = parseListField(body.targetTitles);
    if (body.mustHaveSkills) payload.mustHaveSkills = parseListField(body.mustHaveSkills);
    if (body.niceToHaveSkills) payload.niceToHaveSkills = parseListField(body.niceToHaveSkills);
    if (body.targetCompanies) payload.targetCompanies = parseListField(body.targetCompanies);
    if (body.resumeText && isUnreadableResumeText(body.resumeText)) {
      return res.status(400).json({
        message:
          'Resume text looks like a raw file upload, not readable text. Upload PDF or .docx, or paste plain text.',
      });
    }
    if (body.resumeText) {
      payload.resumeText = prepareResumeTextForParsing(body.resumeText);
    }
    if (payload.resumeText && !body.extractedSkills) {
      payload.extractedSkills = extractSkillsFromText(payload.resumeText).all;
      payload.resumeParsedAt = new Date();
      const existing = await profileService.getOrCreate(req.user.sub);
      const parsed = { resumeText: payload.resumeText, extractedSkills: { all: payload.extractedSkills } };
      if (shouldReplaceCriteriaFromResume(existing, parsed)) {
        const derived = criteriaFromResumeText(payload.resumeText);
        if (derived.targetTitles.length) payload.targetTitles = derived.targetTitles;
        if (derived.mustHaveSkills.length) payload.mustHaveSkills = derived.mustHaveSkills;
        if (derived.niceToHaveSkills.length) payload.niceToHaveSkills = derived.niceToHaveSkills;
      }
    }
    const profile = await profileService.update(req.user.sub, payload);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

async function parseResume(req, res, next) {
  try {
    const body = parseResumeSchema.parse(req.body);
    let parsed;
    if (body.resumeText) {
      parsed = parseResumeFromText(body.resumeText);
    } else {
      const buffer = Buffer.from(body.fileBase64, 'base64');
      if (buffer.length > 8 * 1024 * 1024) {
        return res.status(400).json({ message: 'Resume file must be under 8 MB' });
      }
      parsed = await parseResumeFile(buffer, body.filename);
    }

    let profile = await profileService.getOrCreate(req.user.sub);

    if (body.applyToProfile) {
      const patch = {
        resumeText: parsed.resumeText,
        extractedSkills: parsed.extractedSkills.all,
        resumeFileName: body.filename,
        resumeParsedAt: new Date(),
      };

      const replaceCriteria = shouldReplaceCriteriaFromResume(profile, parsed) || !body.mergeSkills;
      if (replaceCriteria) {
        const derived = criteriaFromResumeText(parsed.resumeText);
        if (derived.targetTitles.length) patch.targetTitles = derived.targetTitles;
        if (derived.mustHaveSkills.length) patch.mustHaveSkills = derived.mustHaveSkills;
        if (derived.niceToHaveSkills.length) patch.niceToHaveSkills = derived.niceToHaveSkills;
      } else if (body.mergeSkills) {
        patch.mustHaveSkills = parseListField(
          mergeSkillLists((profile.mustHaveSkills || []).join('\n'), parsed.extractedSkills.mustHave)
        );
        patch.niceToHaveSkills = parseListField(
          mergeSkillLists((profile.niceToHaveSkills || []).join('\n'), parsed.extractedSkills.niceToHave)
        );
      }

      if (!profile.headline?.trim() && parsed.suggestedHeadline) {
        patch.headline = parsed.suggestedHeadline;
      }

      if (!(patch.targetTitles || profile.targetTitles || []).length && parsed.suggestedTitles.length) {
        patch.targetTitles = parsed.suggestedTitles;
      }

      const contact = parsed.extractedContact || {};
      if (!profile.applicantName?.trim() && contact.applicantName) {
        patch.applicantName = contact.applicantName;
      }
      if (!profile.displayName?.trim() && (contact.displayName || contact.applicantName)) {
        patch.displayName = contact.displayName || contact.applicantName;
      }
      if (!profile.digestEmail?.trim() && contact.digestEmail) {
        patch.digestEmail = contact.digestEmail;
      }
      if (!profile.contactPhone?.trim() && contact.contactPhone) {
        patch.contactPhone = contact.contactPhone;
      }
      if (!profile.linkedin?.trim() && contact.linkedin) {
        patch.linkedin = contact.linkedin;
      }
      if (!profile.github?.trim() && contact.github) {
        patch.github = contact.github;
      }
      if (!profile.portfolio?.trim() && contact.portfolio) {
        patch.portfolio = contact.portfolio;
      }

      if (!patch.digestEmail?.trim() && !profile.digestEmail?.trim()) {
        const accountEmail = await applicantContactService.resolveAuthEmail(req.user.sub, req.user.email);
        if (accountEmail && !applicantContactService.isMailboxOnlyEmail(accountEmail)) {
          patch.digestEmail = accountEmail;
        }
      }

      const isFirstSetup = !profile.onboardingComplete;
      if (isFirstSetup && parsed.resumeText?.length >= 50) {
        patch.tailorResumeOnApply = true;
        patch.defaultApplyResumeMode = 'tailored';
        patch.defaultTailorMode = 'high_match';
        patch.defaultQuickApplyCount = profile.defaultQuickApplyCount || 3;
        if (!profile.minMatchScore) patch.minMatchScore = 40;
      }

      profile = await profileService.update(req.user.sub, patch);
    }

    res.json({
      ...parsed,
      resumeScore: profile.resumeScore,
      profile: body.applyToProfile ? profile : undefined,
    });
  } catch (err) {
    if (!err.status) err.status = 400;
    next(err);
  }
}

const openAiKeySchema = z.object({
  apiKey: z.string().min(20).max(200),
});

async function saveOpenAiKey(req, res, next) {
  try {
    const { apiKey } = openAiKeySchema.parse(req.body);
    const trimmed = apiKey.trim();
    if (!openaiService.isValidKeyFormat(trimmed)) {
      return res.status(400).json({ message: 'Invalid OpenAI API key format. Keys start with sk-' });
    }
    const profile = await profileService.setOpenAiKey(req.user.sub, trimmed);
    const test = await openaiService.testConnection(req.user.sub);
    res.json({
      message: 'OpenAI connected',
      profile,
      test,
    });
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      return res.status(400).json({ message: 'API key rejected by OpenAI. Check your key at platform.openai.com' });
    }
    next(err);
  }
}

async function clearOpenAiKey(req, res, next) {
  try {
    const profile = await profileService.clearOpenAiKey(req.user.sub);
    res.json({ message: 'OpenAI key removed', profile });
  } catch (err) {
    next(err);
  }
}

async function testOpenAiKey(req, res, next) {
  try {
    const test = await openaiService.testConnection(req.user.sub);
    res.json(test);
  } catch (err) {
    if (!err.status) err.status = 400;
    next(err);
  }
}

const recruiterKeySchema = z.object({
  apiKey: z.string().min(8).max(200),
});

async function saveHunterKey(req, res, next) {
  try {
    const { apiKey } = recruiterKeySchema.parse(req.body);
    const profile = await profileService.setHunterKey(req.user.sub, apiKey.trim());
    res.json({ message: 'Hunter.io key saved', profile });
  } catch (err) {
    next(err);
  }
}

async function clearHunterKey(req, res, next) {
  try {
    const profile = await profileService.clearHunterKey(req.user.sub);
    res.json({ message: 'Hunter.io key removed', profile });
  } catch (err) {
    next(err);
  }
}

async function saveApolloKey(req, res, next) {
  try {
    const { apiKey } = recruiterKeySchema.parse(req.body);
    const profile = await profileService.setApolloKey(req.user.sub, apiKey.trim());
    res.json({ message: 'Apollo key saved', profile });
  } catch (err) {
    next(err);
  }
}

async function clearApolloKey(req, res, next) {
  try {
    const profile = await profileService.clearApolloKey(req.user.sub);
    res.json({ message: 'Apollo key removed', profile });
  } catch (err) {
    next(err);
  }
}

async function getApplyPreview(req, res, next) {
  try {
    const profile = await profileService.getOrCreate(req.user.sub);
    const raw = await profileService.getRaw(req.user.sub);
    const contact = await applicantContactService.resolveApplicantContact(
      req.user.sub,
      raw || profile,
      req.user.email
    );
    const email = contact.email || '';
    let emailWarning = null;
    if (!email) {
      emailWarning = 'Add your personal email — applications need a real address, not a system account.';
    } else if (applicantContactService.isAppOrSystemEmail(email)) {
      emailWarning = 'This looks like a system email. Add your personal Gmail or work email below.';
    }
    res.json({
      contact,
      tailoring: {
        defaultApplyResumeMode: profile.defaultApplyResumeMode || 'base',
        defaultSupplementPages: profile.defaultSupplementPages || 4,
        defaultTailorMode: profile.defaultTailorMode || 'high_match',
        highMatchTarget: profile.highMatchTarget || 100,
        autoApplyEnabled: profile.autoApplyEnabled === true,
      },
      emailWarning,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMe,
  updateMe,
  parseResume,
  getApplyPreview,
  saveOpenAiKey,
  clearOpenAiKey,
  testOpenAiKey,
  saveHunterKey,
  clearHunterKey,
  saveApolloKey,
  clearApolloKey,
};
