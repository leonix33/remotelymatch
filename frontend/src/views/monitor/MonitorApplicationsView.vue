<script setup>
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useMonitorData } from '../../composables/useMonitorData';

const { loading, analytics, applications, refresh } = useMonitorData();

const statusGrid = computed(() => {
  const by = analytics.value?.byStatus || {};
  const total = analytics.value?.totalApplications || 1;
  const colors = {
    submitted: 'emerald',
    'bot-blocked': 'red',
    'manual-review': 'amber',
    pending: 'slate',
    failed: 'red',
  };
  return Object.entries(by).map(([status, count]) => ({
    status,
    count,
    pct: Math.round((count / total) * 100),
    tone: colors[status] || 'sky',
  }));
});

const recentApps = computed(() => {
  const list = Array.isArray(applications.value) ? applications.value : applications.value?.items || [];
  return list.slice(0, 12);
});

function statusBadge(status) {
  if (status === 'submitted') return 'badge-teal';
  if (status === 'bot-blocked') return 'badge-red';
  return 'badge-slate';
}

onMounted(refresh);
</script>

<template>
  <div v-if="loading && !analytics" class="py-12 text-center text-slate-400">Loading applications…</div>

  <div v-else class="space-y-8">
    <!-- Status donuts as rounded squares -->
    <div class="monitor-status-grid">
      <div
        v-for="item in statusGrid"
        :key="item.status"
        class="monitor-status-card"
        :class="`status-${item.tone}`"
      >
        <div class="monitor-status-ring">
          <span class="text-2xl font-bold text-slate-100">{{ item.count }}</span>
          <span class="text-[10px] uppercase text-slate-500">{{ item.pct }}%</span>
        </div>
        <p class="mt-3 text-sm font-medium capitalize text-slate-300">{{ item.status.replace(/-/g, ' ') }}</p>
      </div>
      <p v-if="!statusGrid.length" class="monitor-empty col-span-full">No applications tracked yet.</p>
    </div>

    <!-- Summary row -->
    <div class="grid gap-4 sm:grid-cols-4">
      <div class="monitor-stat-tile">
        <p class="text-xs text-slate-500">Total</p>
        <p class="mt-1 text-2xl font-bold text-teal-300">{{ analytics?.totalApplications ?? 0 }}</p>
      </div>
      <div class="monitor-stat-tile">
        <p class="text-xs text-slate-500">Submitted</p>
        <p class="mt-1 text-2xl font-bold text-emerald-300">{{ analytics?.submitted ?? 0 }}</p>
      </div>
      <div class="monitor-stat-tile">
        <p class="text-xs text-slate-500">Bot blocked</p>
        <p class="mt-1 text-2xl font-bold text-red-300">{{ analytics?.botBlocked ?? 0 }}</p>
      </div>
      <div class="monitor-stat-tile">
        <p class="text-xs text-slate-500">Manual review</p>
        <p class="mt-1 text-2xl font-bold text-amber-300">{{ analytics?.manualReview ?? 0 }}</p>
      </div>
    </div>

    <!-- Enterprise table -->
    <section class="monitor-table-panel">
      <div class="monitor-panel-head px-6 pt-6">
        <h2>Recent applications</h2>
        <RouterLink to="/applications" class="text-sm text-teal-400 hover:underline">Full list →</RouterLink>
      </div>
      <div class="overflow-x-auto">
        <table class="monitor-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Company</th>
              <th>Source</th>
              <th>Status</th>
              <th>Last tried</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="app in recentApps" :key="app._id || app.jobId">
              <td class="font-medium text-slate-200">{{ app.title || app.jobTitle || '—' }}</td>
              <td>{{ app.company || '—' }}</td>
              <td class="text-slate-500">{{ app.source || '—' }}</td>
              <td><span class="badge" :class="statusBadge(app.status)">{{ app.status }}</span></td>
              <td class="text-slate-500">
                {{ app.lastTriedAt ? new Date(app.lastTriedAt).toLocaleDateString() : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!recentApps.length" class="monitor-empty p-8">No applications yet.</p>
      </div>
    </section>
  </div>
</template>
