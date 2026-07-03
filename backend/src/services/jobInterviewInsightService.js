const profileService = require('./profileService');
const jobService = require('./jobService');
const jobListCache = require('./jobListCache');
const { scoreJobsForProfile } = require('./jobScoringService');
const applicationKitService = require('./applicationKitService');
const { getConversionContext, DEFAULT_REPLY_RATE } = require('./conversionStatsService');

function extractBullets(text = '', limit = 4) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-•*●▪]/.test(l) || /^(Architected|Led|Built|Managed|Implemented|Designed|Developed|Created|Reduced|Improved|Automated|Deployed)/.test(l));
  return lines.slice(0, limit).map((l) => l.replace(/^[-•*●▪]\s+/, ''));
}

async function resolveJob(userId, jobId) {
  const cached = await jobListCache.listScoredForUser(userId).catch(() => null);
  const fromCache = cached?.jobs?.find((j) => j.jobId === jobId);
  if (fromCache) return fromCache;

  const sqlite = jobService.readJobsFromSqlite(8000).find((j) => j.jobId === jobId);
  if (sqlite) return sqlite;

  const kit = await applicationKitService.getKit(userId, jobId).catch(() => null);
  if (kit?.jobTitle) {
    return {
      jobId,
      title: kit.jobTitle,
      company: kit.company,
      url: kit.jobUrl,
      description: kit.jobDescription || '',
    };
  }

  const err = new Error('Job not found');
  err.status = 404;
  throw err;
}

function buildLearningNote(job, conversion) {
  const source = String(job.source || 'unknown').toLowerCase();
  const sourceRate = conversion.sourceReplyRates[source];
  const userPct = Math.round((conversion.userReplyRate || DEFAULT_REPLY_RATE) * 100);
  const sample = conversion.sampleSize || 0;

  if (sample < 3) {
    return {
      userReplyRatePct: userPct,
      sourceReplyRatePct: sourceRate != null ? Math.round(sourceRate * 100) : null,
      sampleSize: sample,
      note: 'Log outcomes after you apply — callback scores improve as we learn what works for you.',
    };
  }

  const sourcePct = sourceRate != null ? Math.round(sourceRate * 100) : Math.round(DEFAULT_REPLY_RATE * 100);
  return {
    userReplyRatePct: userPct,
    sourceReplyRatePct: sourcePct,
    sampleSize: sample,
    note: `Based on ${sample} tracked applications: your reply rate is ${userPct}%. ${job.source || 'This source'} converts at ~${sourcePct}% for you.`,
  };
}

async function getInterviewInsight(userId, jobId) {
  const profile = await profileService.getOrCreate(userId);
  const rawJob = await resolveJob(userId, jobId);
  const scored = scoreJobsForProfile([rawJob], profile, userId)[0];
  const kit = await applicationKitService.getKit(userId, jobId).catch(() => null);
  const conversion = getConversionContext(userId);

  const tailoredBullets = kit?.tailoredResumeText
    ? extractBullets(kit.tailoredResumeText, 5)
  : kit?.skillsToHighlight?.length
    ? kit.skillsToHighlight.slice(0, 5).map((s) => `Highlight ${s} experience aligned to this role.`)
    : extractBullets(profile.resumeText, 3);

  const callbackScore = scored.interviewLikelihoodPct ?? scored.personalMatchPct ?? 0;

  return {
    jobId: scored.jobId,
    title: scored.title,
    company: scored.company,
    source: scored.source,
    matchPct: scored.personalMatchPct ?? scored.matchPct ?? 0,
    recruiterCallbackScore: callbackScore,
    callbackTier: scored.likelihoodTier || 'moderate',
    recommendAction: scored.recommendAction || 'review',
    whyThisJob: {
      strengths: scored.strengths || [],
      factors: scored.likelihoodFactors || [],
      summary:
        (scored.strengths || []).slice(0, 3).join(' · ') ||
        (scored.likelihoodFactors || [])
          .slice(0, 2)
          .map((f) => f.label)
          .join(' · ') ||
        'Profile overlap with this posting',
    },
    resumeGaps: {
      missing: scored.gaps || [],
      atsScore: kit?.atsScore ?? kit?.estimatedMatchPct ?? null,
      keywordsToAdd: (kit?.missingKeywords || []).slice(0, 8),
    },
    tailoredBullets,
    followUpAvailable: true,
    learningLoop: buildLearningNote(scored, conversion),
    hasKit: Boolean(kit?.tailoredResumeText),
  };
}

module.exports = { getInterviewInsight };
