import { ref } from 'vue';
import http from '../api/http';

export function useJobApprove() {
  const acting = ref('');
  const actionMessage = ref('');
  const actionError = ref('');

  async function approveJob(job, { tailorResume = true } = {}) {
    if (!job?.jobId) return false;
    acting.value = job.jobId;
    actionMessage.value = '';
    actionError.value = '';
    try {
      await http.post(`/approvals/${encodeURIComponent(job.jobId)}/approve`, { tailorResume });
      actionMessage.value = `"${job.title}" added to your queue — tailoring resume…`;
      return true;
    } catch (e) {
      actionError.value = e.response?.data?.message || 'Could not add to queue';
      return false;
    } finally {
      acting.value = '';
    }
  }

  async function skipJob(job) {
    if (!job?.jobId) return false;
    acting.value = job.jobId;
    actionMessage.value = '';
    actionError.value = '';
    try {
      await http.post(`/approvals/${encodeURIComponent(job.jobId)}/reject`);
      return true;
    } catch (e) {
      const notFound =
        e.response?.status === 404 ||
        String(e.response?.data?.message || '').toLowerCase().includes('not found');
      if (!notFound) {
        actionError.value = e.response?.data?.message || 'Could not skip job';
        return false;
      }
      try {
        await http.post('/approvals/queue', {
          jobId: job.jobId,
          title: job.title,
          company: job.company,
          url: job.url,
          matchPct: job.personalMatchPct ?? job.matchPct ?? 0,
          atsType: job.atsType,
          source: job.source || 'jobs',
        });
        await http.post(`/approvals/${encodeURIComponent(job.jobId)}/reject`);
        return true;
      } catch (err) {
        actionError.value = err.response?.data?.message || 'Could not skip job';
        return false;
      }
    } finally {
      acting.value = '';
    }
  }

  return { acting, actionMessage, actionError, approveJob, skipJob };
}
