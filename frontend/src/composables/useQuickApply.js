import { ref } from 'vue';
import http from '../api/http';
import { formatApplyEmailNotice } from '../utils/applyEmailMessage';

const APPLY_TIMEOUT_MS = 10 * 60 * 1000;
const KIT_POLL_INTERVAL_MS = 2500;
const KIT_POLL_MAX_ATTEMPTS = 48;

async function pollTailoredKits(jobIds, onProgress) {
  const idSet = new Set(jobIds);
  let best = [];
  for (let attempt = 0; attempt < KIT_POLL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const { data } = await http.get('/applications/kits');
      const kits = (Array.isArray(data) ? data : []).filter((k) => k.jobId && idSet.has(k.jobId) && k.tailored);
      if (kits.length > best.length) {
        best = kits;
        onProgress?.(best.length, jobIds.length);
      }
      if (best.length >= jobIds.length) return best;
    } catch {
      /* keep polling */
    }
    await new Promise((resolve) => setTimeout(resolve, KIT_POLL_INTERVAL_MS));
  }
  return best;
}

async function fetchApprovedJobs(count, minCallback = 25) {
  const callbackFloor = Math.max(0, Number(minCallback) || 0);
  const params = {
    status: 'approved',
    sort: 'match',
    limit: Math.max(count * 2, 20),
    offset: 0,
  };
  if (callbackFloor > 0) params.minCallback = callbackFloor;
  const { data } = await http.get('/approvals', { params });
  const jobs = (data?.items || [])
    .sort((a, b) => (b.interviewLikelihoodPct || 0) - (a.interviewLikelihoodPct || 0))
    .slice(0, count);
  return { jobs, listData: data };
}

async function fetchPendingJobsOnce(count, minMatch, minCallback = 25) {
  const floor = Math.max(0, Number(minMatch) || 50);
  const callbackFloor = Math.max(0, Number(minCallback) || 0);
  const { data } = await http.get('/approvals', {
    params: {
      status: 'pending',
      sort: 'match',
      limit: Math.max(count * 3, 15),
      minMatch: floor,
      minCallback: callbackFloor,
      offset: 0,
    },
  });
  const jobs = (data?.items || [])
    .sort((a, b) => (b.interviewLikelihoodPct || 0) - (a.interviewLikelihoodPct || 0))
    .slice(0, count);
  return { jobs, listData: data, minMatchUsed: floor, minCallbackUsed: callbackFloor };
}

async function fetchPendingJobs(count, minMatch, minCallback = 25) {
  const attempts = [
    { minMatch, minCallback },
    { minMatch: Math.min(50, Number(minMatch) || 50), minCallback: Math.min(15, Number(minCallback) || 25) },
    { minMatch: 40, minCallback: 0 },
  ];

  let last = null;
  for (const attempt of attempts) {
    const result = await fetchPendingJobsOnce(count, attempt.minMatch, attempt.minCallback);
    last = result;
    if (result.jobs.length) return result;
  }
  return last || { jobs: [], listData: {}, minMatchUsed: minMatch, minCallbackUsed: minCallback };
}

async function submitApplyRequest({ jobIds, useTailoredResume, autoApply, onStep }) {
  onStep?.(
    autoApply
      ? `Preparing and submitting ${jobIds.length} application(s)…`
      : `Preparing ${jobIds.length} application(s) for review…`
  );
  const { data, status } = await http.post(
    '/agent/apply-approved',
    {
      useTailoredResume,
      autoApply,
      jobIds,
    },
    { timeout: APPLY_TIMEOUT_MS, validateStatus: (s) => s < 500 }
  );

  let kits = data.kits || [];
  if (useTailoredResume && (data.kitsGenerating || kits.length < jobIds.length)) {
    const polled = await pollTailoredKits(jobIds, (ready, total) => {
      onStep?.(`Generating tailored resumes (${ready}/${total})…`);
    });
    if (polled.length) kits = polled;
  }

  return { data, status, kits };
}

function buildApplyResult({ data, status, kits, jobs, autoApply }) {
  const jobIds = jobs.map((j) => j.jobId);
  const queued = Boolean(data.queued || data.recorded);
  const preparedOnly = Boolean(data.preparedOnly);
  const emailNote = formatApplyEmailNotice(data.emailNotification);

  if (status === 202 || queued) {
    const hint = data.hint || data.message;
    const message = queued
      ? `Queued ${data.count || jobs.length} application(s)${kits.length ? ` · ${kits.length} tailored resume${kits.length === 1 ? '' : 's'} ready` : data.kitsGenerating ? ' · tailored resumes generating' : ''}. ${hint || ''}`.trim()
      : hint || data.message || 'Apply could not finish on the server.';
    return {
      ok: queued,
      message: emailNote ? `${message} ${emailNote}`.trim() : message,
      result: {
        count: data.count || jobs.length,
        jobs,
        kits,
        output: data.output,
        queued: true,
        preparedOnly: false,
        emailNotification: data.emailNotification,
        usedApproved: data.usedApproved,
      },
    };
  }

  if (preparedOnly) {
    const message = [data.message || `Prepared ${data.count || jobs.length} application(s) for review`, emailNote]
      .filter(Boolean)
      .join(' ');
    return {
      ok: true,
      message,
      result: {
        count: data.count || jobs.length,
        jobs,
        kits,
        preparedOnly: true,
        autoApply: false,
        emailNotification: data.emailNotification,
        usedApproved: data.usedApproved,
      },
    };
  }

  const message = [data.message || `Applied to ${data.count || jobs.length} job(s)`, emailNote]
    .filter(Boolean)
    .join(' ');
  return {
    ok: true,
    message,
    result: {
      count: data.count || jobs.length,
      jobs,
      kits,
      output: data.output,
      queued: Boolean(data.queued),
      preparedOnly: false,
      emailNotification: data.emailNotification,
      usedApproved: data.usedApproved,
    },
  };
}

export function useQuickApply() {
  const applying = ref(false);
  const message = ref('');
  const error = ref('');
  const step = ref('');

  async function applyJobIds({
    jobIds,
    jobs = [],
    useTailoredResume = false,
    autoApply = true,
  } = {}) {
    if (!jobIds?.length) {
      throw new Error('No approved jobs to apply. Approve roles in step 2 or the Queue first.');
    }
    applying.value = true;
    message.value = '';
    error.value = '';
    step.value = '';
    try {
      const { data, status, kits } = await submitApplyRequest({
        jobIds,
        useTailoredResume,
        autoApply,
        onStep: (s) => {
          step.value = s;
        },
      });
      const outcome = buildApplyResult({
        data: { ...data, usedApproved: true },
        status,
        kits,
        jobs,
        autoApply,
      });
      if (!outcome.ok) {
        error.value = outcome.message;
        throw new Error(outcome.message);
      }
      message.value = outcome.message;
      return outcome.result;
    } catch (e) {
      const statusCode = e.response?.status;
      const d = e.response?.data;
      if (statusCode === 502 || statusCode === 504) {
        error.value =
          'The server timed out while preparing applications. Try fewer jobs at once, or wait a minute and refresh tailored resumes.';
      } else if (!error.value) {
        error.value = d?.message || d?.hint || e.message || 'Apply failed';
      }
      throw e;
    } finally {
      applying.value = false;
      step.value = '';
    }
  }

  async function quickApply({
    count = 3,
    useTailoredResume = false,
    autoApply = true,
    minMatch,
    minCallback = 25,
    runSearch = false,
    preferApproved = true,
    jobIds = null,
  } = {}) {
    applying.value = true;
    message.value = '';
    error.value = '';
    step.value = '';

    try {
      if (Array.isArray(jobIds) && jobIds.length) {
        return await applyJobIds({ jobIds, jobs: [], useTailoredResume, autoApply });
      }

      if (runSearch) {
        step.value = 'Refreshing job listings…';
        try {
          await http.post('/agent/run', {}, { timeout: 300000 });
        } catch {
          /* search may fail on cold start — continue with existing jobs */
        }
      }

      let jobs = [];
      let usedApproved = false;
      let listData = {};

      if (preferApproved) {
        step.value = 'Checking approved jobs…';
        const approved = await fetchApprovedJobs(count, minCallback);
        if (approved.jobs.length) {
          jobs = approved.jobs;
          usedApproved = true;
          listData = approved.listData;
        }
      }

      if (!jobs.length) {
        step.value = 'Finding your highest callback matches…';
        let pendingResult = await fetchPendingJobs(count, minMatch, minCallback);

        if (!pendingResult.jobs.length) {
          step.value = 'Refreshing job listings…';
          try {
            await http.post('/agent/run', {}, { timeout: 300000 });
            pendingResult = await fetchPendingJobs(count, minMatch, minCallback);
          } catch {
            /* continue */
          }
        }

        if (!pendingResult.jobs.length) {
          const approvedRetry = await fetchApprovedJobs(count, 0);
          if (approvedRetry.jobs.length) {
            jobs = approvedRetry.jobs;
            usedApproved = true;
          } else {
            const hint = pendingResult.listData?.hint;
            const stats = pendingResult.listData?.poolStats;
            const statsNote = stats
              ? ` (${stats.totalInDb ?? stats.raw} in database → ${stats.raw} recent → ${stats.afterQuality} quality → ${stats.afterMatch} match your profile)`
              : '';
            throw new Error(
              hint
                ? `${hint}${statsNote}`
                : `No approved or pending roles to apply. Approve matches in step 2, or lower thresholds in Profile.${statsNote}`
            );
          }
        } else {
          jobs = pendingResult.jobs;
          listData = pendingResult.listData;
        }
      }

      const ids = jobs.map((j) => j.jobId);

      if (!usedApproved) {
        step.value = `Approving ${jobs.length} job(s)…`;
        const { data: approveData } = await http.post('/approvals/bulk-approve', {
          jobIds: ids,
          tailorResume: useTailoredResume,
          skipKitGeneration: true,
        });
        if (!approveData?.count) {
          throw new Error(
            'Could not approve jobs — you may have hit your monthly approval limit. Try fewer jobs or upgrade your plan.'
          );
        }
      } else {
        step.value = `Applying to ${jobs.length} approved job(s)…`;
      }

      const { data, status, kits } = await submitApplyRequest({
        jobIds: ids,
        useTailoredResume,
        autoApply,
        onStep: (s) => {
          step.value = s;
        },
      });

      const outcome = buildApplyResult({
        data: { ...data, usedApproved },
        status,
        kits,
        jobs,
        autoApply,
      });
      if (!outcome.ok) {
        error.value = outcome.message;
        throw new Error(outcome.message);
      }
      message.value = outcome.message;
      return outcome.result;
    } catch (e) {
      const statusCode = e.response?.status;
      const d = e.response?.data;
      if (statusCode === 502 || statusCode === 504) {
        error.value =
          'The server timed out while preparing applications. Try fewer jobs at once, or wait a minute and refresh tailored resumes.';
      } else if (!error.value) {
        error.value = d?.message || d?.hint || e.message || 'Apply failed';
      }
      throw e;
    } finally {
      applying.value = false;
      step.value = '';
    }
  }

  return { applying, message, error, step, quickApply, applyJobIds };
}
