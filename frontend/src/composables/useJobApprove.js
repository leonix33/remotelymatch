import { ref } from 'vue';
import http from '../api/http';
import { formatApplyEmailNotice } from '../utils/applyEmailMessage';

const APPLY_TIMEOUT_MS = 10 * 60 * 1000;

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
      actionMessage.value = `"${job.title}" approved — ready to apply.`;
      return true;
    } catch (e) {
      actionError.value = e.response?.data?.message || 'Could not approve job';
      return false;
    } finally {
      acting.value = '';
    }
  }

  async function applyJob(job, { useTailoredResume = true, autoApply = true } = {}) {
    if (!job?.jobId) return false;
    acting.value = job.jobId;
    actionMessage.value = '';
    actionError.value = '';
    try {
      const { data } = await http.post(
        '/agent/apply-approved',
        {
          jobIds: [job.jobId],
          useTailoredResume,
          autoApply,
        },
        { timeout: APPLY_TIMEOUT_MS }
      );
      const emailNote = formatApplyEmailNotice(data.emailNotification);
      actionMessage.value = [data.message || `Applied to ${job.title}`, emailNote].filter(Boolean).join(' ');
      return true;
    } catch (e) {
      actionError.value = e.response?.data?.message || e.response?.data?.hint || e.message || 'Apply failed';
      return false;
    } finally {
      acting.value = '';
    }
  }

  async function approveAndApplyJob(job, { tailorResume = true, useTailoredResume = true, autoApply = true } = {}) {
    if (!job?.jobId) return false;
    acting.value = job.jobId;
    actionMessage.value = '';
    actionError.value = '';
    try {
      await http.post(`/approvals/${encodeURIComponent(job.jobId)}/approve`, { tailorResume });
      actionMessage.value = autoApply
        ? `Submitting application for "${job.title}"…`
        : `Approved "${job.title}" — preparing kit…`;
      const { data } = await http.post(
        '/agent/apply-approved',
        {
          jobIds: [job.jobId],
          useTailoredResume,
          autoApply,
        },
        { timeout: APPLY_TIMEOUT_MS }
      );
      const emailNote = formatApplyEmailNotice(data.emailNotification);
      if (data.preparedOnly) {
        actionMessage.value = [data.message || `Prepared "${job.title}" for review`, emailNote].filter(Boolean).join(' ');
      } else {
        actionMessage.value = [data.message || `Applied to ${job.title}`, emailNote].filter(Boolean).join(' ');
      }
      return true;
    } catch (e) {
      actionError.value = e.response?.data?.message || e.response?.data?.hint || e.message || 'Approve & apply failed';
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

  return { acting, actionMessage, actionError, approveJob, applyJob, approveAndApplyJob, skipJob };
}
