const { z } = require('zod');
const profileService = require('../services/profileService');
const {
  parseResumeFile,
  mergeSkillLists,
  extractSkillsFromText,
} = require('../services/resumeParseService');

const updateSchema = z.object({
  displayName: z.string().min(2).optional(),
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
});

const parseResumeSchema = z.object({
  fileBase64: z.string().min(1),
  filename: z.string().min(1).max(255),
  applyToProfile: z.boolean().optional(),
  mergeSkills: z.boolean().optional(),
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
    if (body.resumeText && !body.extractedSkills) {
      payload.extractedSkills = extractSkillsFromText(body.resumeText).all;
      payload.resumeParsedAt = new Date();
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
    const buffer = Buffer.from(body.fileBase64, 'base64');
    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(400).json({ message: 'Resume file must be under 8 MB' });
    }

    const parsed = await parseResumeFile(buffer, body.filename);
    let profile = await profileService.getOrCreate(req.user.sub);

    if (body.applyToProfile) {
      const patch = {
        resumeText: parsed.resumeText,
        extractedSkills: parsed.extractedSkills.all,
        resumeFileName: body.filename,
        resumeParsedAt: new Date(),
      };

      if (body.mergeSkills) {
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

      if (!(profile.targetTitles || []).length && parsed.suggestedTitles.length) {
        patch.targetTitles = parsed.suggestedTitles;
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

module.exports = { getMe, updateMe, parseResume };
