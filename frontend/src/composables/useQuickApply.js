import { ref } from 'vue';
import http from '../api/http';

const APPLY_TIMEOUT_MS = 10 * 60 * 1000;

async function fetchPendingJobs(count, minMatch) {
  const thresholds = [minMatch || 40, 35, 30, 25, 20];
  let lastData = null;

  for (const threshold of thresholds) {
    const { data } = await http.get('/approvals', {
      params: {
        status: 'pending',
        sort: 'match',
        limit: count,
        minMatch: threshold,
        offset: 0,
      },
    });
    lastData = data;
    const jobs = data?.items || [];
    if (jobs.length >= count || threshold === 20) {
      return { jobs, listData: data };
    }
  }

  return { jobs: lastData?.items || [], listData: lastData };
}

export function useQuickApply() {
  const applying = ref(false);
  const message = ref('');
  const error = ref('');
  const step = ref('');

  async function quickApply({ count = 15, useTailoredResume = false, minMatch, runSearch = false } = {}) {
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

      step.value = 'Finding your best matches…';
      let { jobs, listData } = await fetchPendingJobs(count, minMatch);

      if (!jobs.length && !runSearch) {
        step.value = 'Refreshing job listings…';
        try {
          await http.post('/agent/run', {}, { timeout: 300000 });
          ({ jobs, listData } = await fetchPendingJobs(count, minMatch));
        } catch {
          /* continue */
        }
      }

      if (!jobs.length) {
        const hint = listData?.hint;
        throw new Error(
          hint ||
            'No matching jobs found. Update your resume and target roles in Profile, or lower your match threshold.'
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

      step.value = `Preparing and submitting ${approveData.count} application(s)…`;
      const { data, status } = await http.post(
        '/agent/apply-approved',
        {
          useTailoredResume,
          jobIds,
        },
        { timeout: APPLY_TIMEOUT_MS, validateStatus: (s) => s < 500 }
      );

      if (status === 202) {
        const hint = data.hint || data.message;
        message.value =
          data.queued || data.recorded
            ? `Queued ${data.count || jobs.length} application(s). ${hint || ''}`.trim()
            : hint || data.message || 'Apply could not finish on the server.';
        if (!data.queued && !data.recorded) {
          error.value = message.value;
          throw new Error(message.value);
        }
        return {
          count: data.count || jobs.length,
          jobs,
          kits: data.kits || [],
          output: data.output,
          queued: true,
        };
      }

      message.value = data.message || `Applied to ${data.count || jobs.length} job(s)`;
      return {
        count: data.count || jobs.length,
        jobs,
        kits: data.kits || [],
        output: data.output,
        queued: Boolean(data.queued),
      };
    } catch (e) {
      const d = e.response?.data;
      error.value = d?.message || d?.hint || e.message || 'Apply failed';
      throw e;
    } finally {
      applying.value = false;
      step.value = '';
    }
  }

  return { applying, message, error, step, quickApply };
}
