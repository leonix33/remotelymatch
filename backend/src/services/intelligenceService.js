const openaiService = require('./openaiService');
const env = require('../config/env');
const profileService = require('./profileService');
const jobService = require('./jobService');
const applicationKitService = require('./applicationKitService');

function requireMongo() {
  if (!env.mongoUri) throw new Error('MongoDB is required');
}

async function aiComplete(userId, system, user, maxTokens = 500) {
  const live = await openaiService.isLive(userId);
  if (!live) {
    return `[Demo mode — add your OpenAI API key in Profile → AI Integration]\n\n${user.slice(0, 200)}... Analysis would appear here with live AI.`;
  }
  return openaiService.chatCompletion(userId, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
  });
}

function profileBlock(profile) {
  return `Name: ${profile.displayName || 'Candidate'}
Target roles: ${(profile.targetTitles || []).join(', ')}
Must-have skills: ${(profile.mustHaveSkills || []).join(', ')}
Nice-to-have: ${(profile.niceToHaveSkills || []).join(', ')}
Resume highlights: ${(profile.resumeText || '').slice(0, 800)}`;
}

async function findJob(userId, jobId) {
  return applicationKitService.findJob(userId, jobId);
}

async function matchCopilot(userId, jobId) {
  const profile = await profileService.getOrCreate(userId);
  const job = await findJob(userId, jobId);
  if (!job) throw new Error('Job not found');

  const system = `You are Match Copilot. Analyze job fit. Respond in JSON only:
{"matchPct":number,"verdict":"strong|good|stretch|weak","strengths":["..."],"gaps":["..."],"talkingPoints":["..."],"oneLiner":"..."}`;
  const user = `PROFILE:\n${profileBlock(profile)}\n\nJOB:\nTitle: ${job.title}\nCompany: ${job.company}\nMatch: ${job.matchPct}%\nSource: ${job.source}\nATS: ${job.atsType}`;

  const raw = await aiComplete(userId, system, user, 400);
  const live = await openaiService.isLive(userId);
  try {
    const json = JSON.parse(raw.replace(/```json\n?|\n?```/g, ''));
    return { job, analysis: json, demo: !live };
  } catch {
    return {
      job,
      analysis: {
        matchPct: job.matchPct,
        verdict: job.matchPct >= 80 ? 'strong' : job.matchPct >= 65 ? 'good' : 'stretch',
        strengths: ['Cloud infrastructure', 'Automation'],
        gaps: ['Review job description for specifics'],
        talkingPoints: [raw.slice(0, 300)],
        oneLiner: raw.slice(0, 120),
      },
      demo: !live,
    };
  }
}

async function companyIntel(userId, company) {
  requireMongo();
  const profile = await profileService.getOrCreate(userId);
  const system = `You are a company intelligence analyst for job seekers. Provide concise intel in markdown sections: Culture, Interview Style, Comp Bands (ranges), Remote Policy, Tips for ${profile.targetTitles?.[0] || 'tech'} candidates.`;
  const content = await aiComplete(userId, system, `Company: ${company}`, 600);
  const live = await openaiService.isLive(userId);
  return { company, intel: content, demo: !live };
}

async function salaryOracle(userId, query) {
  requireMongo();
  const profile = await profileService.getOrCreate(userId);
  const system = `You are a compensation advisor. Give US remote salary range (USD), equity note, and a 3-sentence negotiation script. Be realistic for 2025-2026.`;
  const user = `Query: ${query}\nCandidate context: ${profile.headline || profile.targetTitles?.[0] || 'engineer'}, skills: ${(profile.mustHaveSkills || []).slice(0, 5).join(', ')}`;
  const content = await aiComplete(userId, system, user, 450);
  const live = await openaiService.isLive(userId);
  return { query, report: content, demo: !live };
}

async function resumeDiff(userId, jobId) {
  const applicationKitService = require('./applicationKitService');
  const profile = await profileService.getOrCreate(userId);
  const kit = await applicationKitService.generateForJob(userId, jobId, {
    tailorResume: Boolean(profile.tailorResumeOnApply),
    force: true,
  });
  const job = await applicationKitService.findJob(userId, jobId);
  if (!kit.tailored) {
    return {
      job,
      suggestions:
        'Resume tailoring is off. Enable it in Profile → Application quality, or click Generate kit with tailoring enabled.',
      kit,
      demo: !(await openaiService.isLive(userId)),
    };
  }
  return {
    job,
    suggestions: kit.formatted || '',
    kit,
    demo: Boolean(kit.demo),
  };
}

async function agentWhisper(userId, limit = 10) {
  requireMongo();
  const profile = await profileService.getOrCreate(userId);
  const minMatch = profile.minMatchScore || 60;
  const jobs = jobService.readJobsFromSqlite(200).filter((j) => (j.matchPct || 0) >= minMatch).slice(0, limit);

  const system = `For each job, write one-line approve/skip rationale (max 15 words). Return JSON array: [{"jobId":"...","rationale":"...","recommend":"approve|skip|review"}]`;
  const user = `Profile skills: ${(profile.mustHaveSkills || []).join(', ')}\nJobs:\n${jobs.map((j) => `${j.jobId}|${j.title}|${j.company}|${j.matchPct}%`).join('\n')}`;

  const raw = await aiComplete(userId, system, user, 500);
  try {
    const items = JSON.parse(raw.replace(/```json\n?|\n?```/g, ''));
    return jobs.map((j) => {
      const w = items.find((i) => i.jobId === j.jobId) || {};
      return { ...j, rationale: w.rationale || 'Review manually', recommend: w.recommend || 'review' };
    });
  } catch {
    return jobs.map((j) => ({
      ...j,
      rationale: j.matchPct >= 80 ? 'Strong skill overlap' : 'Worth a look',
      recommend: j.matchPct >= 75 ? 'approve' : 'review',
    }));
  }
}

async function voiceApplyParse(userId, transcript) {
  requireMongo();
  const profile = await profileService.getOrCreate(userId);
  const jobs = jobService.readJobsFromSqlite(100).filter((j) => (j.matchPct || 0) >= (profile.minMatchScore || 60));
  const system = `Parse voice command for job apply. Return JSON: {"action":"queue_top|queue_company|search","count":number,"company":"","jobIds":[]}`;
  const user = `Transcript: "${transcript}"\nTop jobs:\n${jobs.slice(0, 15).map((j) => `${j.jobId}|${j.title}|${j.company}`).join('\n')}`;
  const raw = await aiComplete(userId, system, user, 200);
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return { action: 'queue_top', count: 3, company: '', jobIds: jobs.slice(0, 3).map((j) => j.jobId) };
  }
}

async function companyScan(userId, companyName) {
  requireMongo();
  const jobs = jobService.readJobsFromSqlite(5000).filter(
    (j) => j.company?.toLowerCase().includes(companyName.toLowerCase())
  );
  const profile = await profileService.getOrCreate(userId);
  return {
    company: companyName,
    jobs: jobs.slice(0, 20),
    count: jobs.length,
    topMatch: jobs[0] || null,
    profileFit: jobs.length ? `Found ${jobs.length} roles; best match ${jobs[0]?.matchPct || 0}%` : 'No open roles in feed',
  };
}

module.exports = {
  matchCopilot,
  companyIntel,
  salaryOracle,
  resumeDiff,
  agentWhisper,
  voiceApplyParse,
  companyScan,
};
