const applicationKitService = require('../services/applicationKitService');
const tractionService = require('../services/tractionService');
const applicationService = require('../services/applicationService');
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
    let approved = await approvalService.listApproved(req.user.sub);
    if (!approved.length) {
      return res.status(400).json({ message: 'No approved jobs in your queue. Approve jobs first.' });
    }

    const requestedIds = Array.isArray(req.body?.jobIds)
      ? req.body.jobIds.map(String).filter(Boolean)
      : [];
    if (requestedIds.length) {
      const idSet = new Set(requestedIds);
      approved = approved.filter((job) => idSet.has(job.jobId));
      if (!approved.length) {
        return res.status(400).json({ message: 'None of the selected jobs are approved. Try again from Start applying.' });
      }
    }

    const profile = await profileService.getOrCreate(req.user.sub);
    const scored = scoreJobsForProfile(approved, profile, req.user.sub);
    const useTailoredResume =
      typeof req.body?.useTailoredResume === 'boolean'
        ? req.body.useTailoredResume
        : profile.defaultApplyResumeMode === 'tailored';
    const autoApply =
      typeof req.body?.autoApply === 'boolean' ? req.body.autoApply : profile.autoApplyEnabled !== false;

    const agentAvailable = jobService.isAgentApplyAvailable();
    const jobCount = scored.length;
    const shouldDeferKits = useTailoredResume && (!agentAvailable || jobCount > 4);

    let run;
    if (env.mongoUri) {
      run = await AgentRun.create({
        status: 'running',
        startedBy: req.user.sub,
        mode: 'apply-approved',
      });
    }

    let itemsFile;
    let tailoredCount = 0;
    let missingKitCount = 0;

    if (shouldDeferKits) {
      ({ file: itemsFile } = await jobService.writeApprovedItemsFile(scored, req.user.sub, {
        useTailoredResume: false,
        authEmail: req.user.email,
      }));
      applicationKitService.schedulePrepareKits(req.user.sub, scored, {
        useTailoredResume: true,
        authEmail: req.user.email,
      });
      missingKitCount = jobCount;
    } else {
      ({ file: itemsFile, tailoredCount, missingKitCount } = await jobService.writeApprovedItemsFile(
        scored,
        req.user.sub,
        { useTailoredResume, authEmail: req.user.email }
      ));
    }

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

    const jobIds = scored.map((j) => j.jobId);
    let kits = await applicationKitService.getKitsForJobIds(req.user.sub, jobIds);
    kits = kits.map(applicationKitService.kitListItem);

    if (!autoApply) {
      if (run) {
        run.status = 'completed';
        run.output = `Prepared ${scored.length} jobs (auto-apply off)`.slice(-4000);
        run.finishedAt = new Date();
        await run.save();
      }
      return res.json({
        message: `Prepared ${scored.length} job(s)${useTailoredResume ? ' with tailored resumes' : ''}. Review below, then turn on Auto apply or submit from the queue.`,
        count: scored.length,
        preparedOnly: true,
        autoApply: false,
        useTailoredResume,
        tailoredCount,
        missingKitCount,
        kits,
        jobIds,
        kitsGenerating: shouldDeferKits,
      });
    }

    function scheduleApplyFeedback(queued) {
      setImmediate(() => {
        tractionService
          .sendPostApplyFeedback(req.user.sub, scored, { useTailoredResume, queued })
          .then((r) => {
            if (r.sent) console.log(`Post-apply email sent to ${r.to}`);
            else console.warn(`Post-apply email skipped: ${r.reason}`);
          })
          .catch((err) => console.warn('Post-apply email failed:', err.message));
      });
    }

    let output;
    try {
      if (agentAvailable && !shouldDeferKits) {
        output = await jobService.runApprovedAutoApply(itemsFile, applicantEnv);
      } else {
        throw new Error(
          'Python agent not on this server. Approved jobs saved to approved_jobs.json — run apply from your Mac with AGENT_HOME set.'
        );
      }
      await applicationService.recordApplicationsFromJobs(req.user.sub, scored, {
        status: 'submitted',
        submittedAt: new Date(),
      });
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
      scheduleApplyFeedback(false);
      res.json({
        message,
        count: scored.length,
        useTailoredResume,
        tailoredCount,
        missingKitCount,
        kits,
        jobIds,
        kitsGenerating: shouldDeferKits,
        output: output.slice(-2000),
      });
    } catch (applyErr) {
      const unavailable = !agentAvailable || jobService.isAgentUnavailableError(applyErr);
      if (unavailable) {
        await applicationService.recordApplicationsFromJobs(req.user.sub, scored, {
          status: 'queued',
          notes: 'Application kits ready — submit via Chrome extension or local agent',
          submittedAt: new Date(),
        });
        await approvalService.markApplied(
          req.user.sub,
          scored.map((j) => j.jobId)
        );
        if (run) {
          run.status = 'completed';
          run.output = `Cloud queue: ${scored.length} jobs prepared. ${applyErr.message}`.slice(-4000);
          run.finishedAt = new Date();
          await run.save();
        }
        const modeLabel = useTailoredResume ? 'tailored kits' : 'base resume';
        scheduleApplyFeedback(true);
        return res.json({
          message: `Queued ${scored.length} application(s) with ${modeLabel}.${shouldDeferKits ? ' Tailored resumes are generating — refresh the preview in a moment.' : ''} Open each job in Chrome and use the RemoteMatch extension to submit forms.`,
          count: scored.length,
          useTailoredResume,
          tailoredCount,
          missingKitCount,
          queued: true,
          recorded: true,
          kits,
          jobIds,
          kitsGenerating: shouldDeferKits,
          itemsFile,
          hint: 'Install the Chrome extension from Team access, open a job posting, and click Apply with RemoteMatch.',
        });
      }

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
        tailoredCount,
        missingKitCount,
        kits,
        jobIds,
        kitsGenerating: shouldDeferKits,
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
    const q = req.user.role === 'admin' ? {} : { startedBy: req.user.sub };
    const runs = await AgentRun.find(q).sort({ createdAt: -1 }).limit(20).lean();
    res.json(runs);
  } catch (err) {
    next(err);
  }
}

module.exports = { runAgent, applyApproved, listRuns };
