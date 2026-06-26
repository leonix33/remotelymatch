import { ref } from 'vue';
import http from '../api/http';

export function useQuickApply() {
  const applying = ref(false);
  const message = ref('');
  const error = ref('');
  const step = ref('');

  async function quickApply({ count = 5, useTailoredResume = false, minMatch, runSearch = false } = {}) {
    applying.value = true;
    message.value = '';
    error.value = '';
    step.value = '';

    try {
      if (runSearch) {
        step.value = 'Searching for new jobs…';
        try {
          await http.post('/agent/run');
        } catch {
          /* search may fail on cloud — continue with existing jobs */
        }
      }

      step.value = 'Finding your best matches…';
      const { data: listData } = await http.get('/approvals', {
        params: {
          status: 'pending',
          sort: 'match',
          limit: count,
          minMatch: minMatch || 70,
          offset: 0,
        },
      });
      const jobs = listData?.items || [];
      if (!jobs.length) {
        throw new Error('No matching jobs found. Try lowering your match threshold or run a job search first.');
      }

      step.value = `Approving ${jobs.length} job(s)…`;
      await http.post('/approvals/bulk-approve', {
        jobIds: jobs.map((j) => j.jobId),
        tailorResume: useTailoredResume,
      });

      step.value = `Submitting ${jobs.length} application(s)…`;
      const { data } = await http.post('/agent/apply-approved', { useTailoredResume });
      message.value = data.message || `Applied to ${data.count || jobs.length} job(s)`;
      return { count: data.count || jobs.length, jobs, output: data.output };
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
