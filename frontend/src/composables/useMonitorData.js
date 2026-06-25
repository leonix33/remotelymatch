import { ref } from 'vue';
import http from '../api/http';

export function useMonitorData() {
  const loading = ref(true);
  const error = ref('');
  const analytics = ref(null);
  const queue = ref(null);
  const agentRuns = ref([]);
  const swarmRuns = ref([]);
  const applications = ref([]);
  const recentJobs = ref([]);

  async function refresh() {
    loading.value = true;
    error.value = '';
    try {
      const [analyticsRes, queueRes, agentRes, swarmRes, appsRes, jobsRes] = await Promise.allSettled([
        http.get('/analytics/summary'),
        http.get('/approvals/summary'),
        http.get('/agent/runs'),
        http.get('/swarm'),
        http.get('/applications'),
        http.get('/approvals', { params: { status: 'all', limit: 8, offset: 0 } }),
      ]);

      analytics.value = analyticsRes.status === 'fulfilled' ? analyticsRes.value.data : null;
      queue.value = queueRes.status === 'fulfilled' ? queueRes.value.data : { pending: 0, approved: 0, rejected: 0 };
      agentRuns.value = agentRes.status === 'fulfilled' ? agentRes.value.data : [];
      swarmRuns.value = swarmRes.status === 'fulfilled' ? swarmRes.value.data : [];
      applications.value = appsRes.status === 'fulfilled' ? appsRes.value.data : [];
      recentJobs.value = jobsRes.status === 'fulfilled' ? jobsRes.value.data.items || [] : [];
    } catch (e) {
      error.value = e.response?.data?.message || 'Could not load monitor data';
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    analytics,
    queue,
    agentRuns,
    swarmRuns,
    applications,
    recentJobs,
    refresh,
  };
}
