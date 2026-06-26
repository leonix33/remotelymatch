const AgentRun = require('../models/AgentRun');
const jobService = require('../services/jobService');
const approvalService = require('../services/approvalService');
const profileService = require('../services/profileService');
const teamService = require('../services/teamService');
const { scoreJobsForProfile } = require('../services/jobScoringService');
const jobIngestService = require('../services/jobs/jobIngestService');
const env = require('../config/env');

async function runAgent(req, res, next) {
  try {
    await teamService.checkLimit(req.user.sub, 'agent');
    let run;
    if (env.mongoUri) {
      run = await AgentRun.create({ status: 'running', startedBy: req.user.sub, mode: 'search' });
    }
    const output = await jobService.runAgentScript({ autoApply: false });
    await jobService.syncJobsToMongo();
    await jobService.syncApplicationsToMongo();
    let ingestNote = '';
    if (env.mongoUri && env.openJobMarket !== false) {
      try {
        const ingest = await jobIngestService.ingestJobs({ persist: true });
        ingestNote = ` Broad ingest saved ${ingest.totals?.saved || 0} jobs.`;
      } catch (ingestErr) {
        ingestNote = ` Broad ingest skipped: ${ingestErr.message}`;
      }
    }
    if (run) {
      run.status = 'completed';
      run.output = (output + ingestNote).slice(-4000);
      run.finishedAt = new Date();
      await run.save();
    }
    await teamService.incrementUsage(req.user.sub, 'agent');
    res.json({
      message: `Agent search completed (no auto-apply).${ingestNote} Review jobs in Apply Queue, then click Apply Approved.`,
      output: (output + ingestNote).slice(-2000),
    });
  } catch (err) {
    if (env.mongoUri) {
      await AgentRun.create({
        status: 'failed',
        error: err.message,
        startedBy: req.user.sub,
        finishedAt: new Date(),
      });
    }
    next(err);
  }
}

async function applyApproved(req, res, next) {
  try {
    const approved = await approvalService.listApproved(req.user.sub);
    if (!approved.length) {
      return res.status(400).json({ message: 'No approved jobs in your queue. Approve jobs first.' });
    }

    const profile = await profileService.getOrCreate(req.user.sub);
    const scored = scoreJobsForProfile(approved, profile, req.user.sub);
    const useTailoredResume =
      typeof req.body?.useTailoredResume === 'boolean'
        ? req.body.useTailoredResume
        : profile.defaultApplyResumeMode === 'tailored';

    let run;
    if (env.mongoUri) {
      run = await AgentRun.create({
        status: 'running',
        startedBy: req.user.sub,
        mode: 'apply-approved',
      });
    }

    const { file: itemsFile, tailoredCount, missingKitCount } = await jobService.writeApprovedItemsFile(
      scored,
      req.user.sub,
      { useTailoredResume, authEmail: req.user.email }
    );
    const applicantContactService = require('../services/applicantContactService');
    const contact = await applicantContactService.resolveApplicantContact(
      req.user.sub,
      profile,
      req.user.email
    );
    const applicantEnv = {};
    if (contact.email) applicantEnv.APPLICANT_EMAIL = contact.email;
    if (contact.name) applicantEnv.APPLICANT_NAME = contact.name;
    if (contact.phone) applicantEnv.APPLICANT_PHONE = contact.phone;
    if (contact.linkedin) applicantEnv.LINKEDIN_URL = contact.linkedin;
    if (contact.github) applicantEnv.GITHUB_URL = contact.github;
    if (contact.portfolio) applicantEnv.PORTFOLIO_URL = contact.portfolio;

    let output;
    try {
      output = await jobService.runApprovedAutoApply(itemsFile, applicantEnv);
      await jobService.syncApplicationsToMongo();
      await approvalService.markApplied(
        req.user.sub,
        scored.map((j) => j.jobId)
      );
      if (run) {
        run.status = 'completed';
        run.output = output.slice(-4000);
        run.finishedAt = new Date();
        await run.save();
      }
      const modeLabel = useTailoredResume ? 'tailored application kits' : 'base resume only';
      let message = `Applied to ${scored.length} approved job(s) using ${modeLabel}`;
      if (useTailoredResume && missingKitCount > 0) {
        message += ` (${tailoredCount} with kits, ${missingKitCount} fell back to base resume)`;
      }
      res.json({
        message,
        count: scored.length,
        useTailoredResume,
        tailoredCount,
        missingKitCount,
        output: output.slice(-2000),
      });
    } catch (applyErr) {
      if (run) {
        run.status = 'failed';
        run.error = applyErr.message;
        run.finishedAt = new Date();
        await run.save();
      }
      res.status(202).json({
        message: applyErr.message,
        count: scored.length,
        useTailoredResume,
        itemsFile,
        hint: 'On Mac: cd job-event-agent && bash apply_approved.sh ' + itemsFile,
      });
    }
  } catch (err) {
    next(err);
  }
}

async function listRuns(req, res, next) {
  try {
    if (!env.mongoUri) return res.json([]);
    const runs = await AgentRun.find().sort({ createdAt: -1 }).limit(20).lean();
    res.json(runs);
  } catch (err) {
    next(err);
  }
}

module.exports = { runAgent, applyApproved, listRuns };
