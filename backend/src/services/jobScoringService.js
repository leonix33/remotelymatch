/**
 * Per-user job scoring — mirrors Python profile scoring at a high level.
 */
const { extractSkillsFromText, profileResumeAlignment } = require('./resumeParseService');
const { freshnessScore } = require('./jobs/jobQualityService');
const { enrichJobWithLikelihood } = require('./interviewLikelihoodService');
const { getConversionContext, companyJobCounts } = require('./conversionStatsService');

function normalize(text = '') {
  return String(text).toLowerCase();
}

function scoreJobForProfile(job, profile, scoringContext = {}) {
  const title = normalize(job.title);
  const company = normalize(job.company);
  const location = normalize(job.location);
  const resumeBlob = normalize(profile?.resumeText || '');
  const blob = normalize(`${job.title} ${job.company} ${job.source} ${job.description || ''}`);
  const freshness =
    job.freshnessScore ?? freshnessScore(job.postedAt || job.firstSeen);

  const alignment = profileResumeAlignment(profile);
  const resumeSkills = (
    profile?.extractedSkills?.length
      ? profile.extractedSkills
      : extractSkillsFromText(profile?.resumeText || '').all
  ).map(normalize);

  let targetTitles = (profile?.targetTitles || []).map(normalize).filter(Boolean);
  let mustSkills = (profile?.mustHaveSkills || []).map(normalize).filter(Boolean);
  const niceSkills = (profile?.niceToHaveSkills || []).map(normalize).filter(Boolean);
  const targetCompanies = (profile?.targetCompanies || []).map(normalize).filter(Boolean);

  if (!alignment.aligned && resumeSkills.length) {
    mustSkills = resumeSkills.slice(0, 12);
    if (!targetTitles.length) {
      const resumeTitles = ['devops', 'sre', 'platform', 'cloud', 'infrastructure', 'software', 'data', 'product'];
      targetTitles = resumeTitles.filter((t) => resumeBlob.includes(t));
    }
  }

  let score = 0;
  const strengths = [];
  const gaps = [];

  if (targetTitles.some((t) => title.includes(t) || t.split(' ').every((w) => title.includes(w)))) {
    score += 40;
    strengths.push('Title match');
  } else if (targetTitles.length) {
    gaps.push('Title stretch');
  } else if (resumeBlob && targetTitles.length === 0) {
    const resumeTitles = ['devops', 'sre', 'platform', 'cloud', 'infrastructure'];
    if (resumeTitles.some((t) => title.includes(t) && resumeBlob.includes(t))) {
      score += 20;
      strengths.push('Resume role fit');
    }
  }

  let mustHits = 0;
  for (const skill of mustSkills) {
    if (blob.includes(skill) || resumeBlob.includes(skill)) {
      mustHits += 1;
      score += Math.min(35 / Math.max(mustSkills.length, 1), 12);
    } else {
      gaps.push(skill);
    }
  }
  if (mustHits >= 3) strengths.push(`${mustHits} must-have skills`);

  for (const skill of niceSkills) {
    if (blob.includes(skill) || resumeBlob.includes(skill)) score += 2;
  }

  let resumeHits = 0;
  for (const skill of resumeSkills.slice(0, 20)) {
    if (blob.includes(skill)) {
      resumeHits += 1;
      score += 2;
    }
  }
  if (resumeHits >= 4) strengths.push(`${resumeHits} resume skills match`);

  if (/remote|anywhere|distributed/.test(location) || /remote/.test(blob)) {
    score += 15;
    strengths.push('Remote');
  }

  if (targetCompanies.some((c) => company.includes(c))) {
    score += 10;
    strengths.push('Target company');
  }

  if (freshness >= 75) {
    score += 5;
    strengths.push('Fresh posting');
  }

  if (job.description) score += Math.min(10, Math.floor(job.description.length / 200));
  if ((job.qualityScore || 0) >= 60) score += 5;

  let personalMatchPct = Math.min(100, Math.round(score));
  if (!alignment.aligned && (job.matchPct || job.agentMatchPct)) {
    const agentScore = job.matchPct || job.agentMatchPct || 0;
    personalMatchPct = Math.min(100, Math.round(personalMatchPct * 0.35 + agentScore * 0.65));
  }

  const minMatch = profile?.minMatchScore || 60;
  let emailSection = 'manual_browse';
  if (personalMatchPct >= 80) emailSection = 'apply_today';
  else if (personalMatchPct >= minMatch) emailSection = 'strong_review';

  const scored = {
    ...job,
    freshnessScore: freshness,
    agentMatchPct: job.matchPct || 0,
    personalMatchPct,
    matchPct: personalMatchPct,
    emailSection,
    strengths: strengths.slice(0, 5),
    gaps: gaps.slice(0, 5),
  };

  return enrichJobWithLikelihood(
    scored,
    profile,
    scoringContext.conversionContext,
    scoringContext.companyCounts
  );
}

function scoreJobsForProfile(jobs, profile, userId = null) {
  const conversionContext = userId ? getConversionContext(userId) : { sourceReplyRates: {}, sampleSize: 0 };
  const counts = companyJobCounts(jobs);
  const scoringContext = { conversionContext, companyCounts: counts };
  return jobs
    .map((j) => scoreJobForProfile(j, profile, scoringContext))
    .sort(
      (a, b) =>
        (b.interviewLikelihoodPct || 0) - (a.interviewLikelihoodPct || 0) ||
        (b.personalMatchPct ?? 0) - (a.personalMatchPct ?? 0)
    );
}

module.exports = { scoreJobForProfile, scoreJobsForProfile };
