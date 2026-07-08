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

async function fetchPendingJobs(count, minMatch, minCallback = 25) {
  const floor = Math.max(50, Number(minMatch) || 60);
  const { data } = await http.get('/approvals', {
    params: {
      status: 'pending',
      sort: 'match',
      limit: Math.max(count * 3, 15),
      minMatch: floor,
      minCallback,
      offset: 0,
    },
  });
  const jobs = (data?.items || [])
    .sort((a, b) => (b.interviewLikelihoodPct || 0) - (a.interviewLikelihoodPct || 0))
    .slice(0, count);
  return { jobs, listData: data, minMatchUsed: floor, minCallbackUsed: minCallback };
}

export function useQuickApply() {
  const applying = ref(false);
  const message = ref('');
  const error = ref('');
  const step = ref('');

  async function quickApply({ count = 3, useTailoredResume = false, autoApply = true, minMatch, minCallback = 25, runSearch = false } = {}) {
    applying.value = true;
    message.value = '';
    error.value = '';
    step.value = '';

    try {
      if (runSearch) {
        step.value = 'Refreshing job listings…';
        try {
          await http.post('/agent/run', {}, { timeout: 300000 });
        } catch {
          /* search may fail on cold start — continue with existing jobs */
        }
      }

      step.value = 'Finding your highest callback matches…';
      let { jobs, listData, minMatchUsed, minCallbackUsed } = await fetchPendingJobs(count, minMatch, minCallback);

      if (!jobs.length && !runSearch) {
        step.value = 'Refreshing job listings…';
        try {
          await http.post('/agent/run', {}, { timeout: 300000 });
          ({ jobs, listData, minMatchUsed, minCallbackUsed } = await fetchPendingJobs(count, minMatch, minCallback));
        } catch {
          /* continue */
        }
      }

      if (!jobs.length) {
        const hint = listData?.hint;
        throw new Error(
          hint ||
            `No roles at ${minCallbackUsed}%+ callback score and ${minMatchUsed || minMatch || 60}%+ match. Add higher-quality matches from step 2 — quality beats volume for recruiter replies.`
        );
      }

      const jobIds = jobs.map((j) => j.jobId);

      step.value = `Approving ${jobs.length} job(s)…`;
      const { data: approveData } = await http.post('/approvals/bulk-approve', {
        jobIds,
        tailorResume: useTailoredResume,
        skipKitGeneration: true,
      });
      if (!approveData?.count) {
        throw new Error(
          'Could not approve jobs — you may have hit your monthly approval limit. Try fewer jobs or upgrade your plan.'
        );
      }

      step.value = autoApply
        ? `Preparing and submitting ${approveData.count} application(s)…`
        : `Preparing ${approveData.count} application(s) for review…`;
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
          step.value = `Generating tailored resumes (${ready}/${total})…`;
        });
        if (polled.length) kits = polled;
      }

      const queued = Boolean(data.queued || data.recorded);
      const preparedOnly = Boolean(data.preparedOnly);
      const emailNote = formatApplyEmailNotice(data.emailNotification);
      if (status === 202 || queued) {
        const hint = data.hint || data.message;
        message.value =
          queued
            ? `Queued ${data.count || jobs.length} application(s)${kits.length ? ` · ${kits.length} tailored resume${kits.length === 1 ? '' : 's'} ready` : data.kitsGenerating ? ' · tailored resumes generating' : ''}. ${hint || ''}`.trim()
            : hint || data.message || 'Apply could not finish on the server.';
        if (emailNote) message.value = `${message.value} ${emailNote}`.trim();
        if (!queued) {
          error.value = message.value;
          throw new Error(message.value);
        }
        return {
          count: data.count || jobs.length,
          jobs,
          kits,
          output: data.output,
          queued: true,
          preparedOnly: false,
          emailNotification: data.emailNotification,
        };
      }

      if (preparedOnly) {
        const emailNote = formatApplyEmailNotice(data.emailNotification);
        message.value = [data.message || `Prepared ${data.count || jobs.length} application(s) for review`, emailNote]
          .filter(Boolean)
          .join(' ');
        return {
          count: data.count || jobs.length,
          jobs,
          kits,
          preparedOnly: true,
          autoApply: false,
          emailNotification: data.emailNotification,
        };
      }

      message.value = [data.message || `Applied to ${data.count || jobs.length} job(s)`, emailNote]
        .filter(Boolean)
        .join(' ');
      return {
        count: data.count || jobs.length,
        jobs,
        kits,
        output: data.output,
        queued: Boolean(data.queued),
        preparedOnly: false,
        emailNotification: data.emailNotification,
      };
    } catch (e) {
      const status = e.response?.status;
      const d = e.response?.data;
      if (status === 502 || status === 504) {
        error.value =
          'The server timed out while preparing applications. Try fewer jobs at once, or wait a minute and refresh tailored resumes.';
      } else {
        error.value = d?.message || d?.hint || e.message || 'Apply failed';
      }
      throw e;
    } finally {
      applying.value = false;
      step.value = '';
    }
  }

  return { applying, message, error, step, quickApply };
}
