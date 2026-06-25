<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useMonitorData } from '../../composables/useMonitorData';

const { loading, analytics, queue, agentRuns, swarmRuns, applications, recentJobs, refresh } = useMonitorData();

let pollTimer;

const kpis = computed(() => {
  const q = queue.value || {};
  const a = analytics.value || {};
  return [
    { label: 'Pending review', value: q.pending ?? 0, tone: 'amber', href: '/approvals' },
    { label: 'Approved queue', value: q.approved ?? 0, tone: 'teal', href: '/approvals?status=approved' },
    { label: 'Total jobs', value: a.totalJobs ?? 0, tone: 'sky', href: '/jobs' },
    { label: 'Applications', value: a.totalApplications ?? 0, tone: 'violet', href: '/monitor/applications' },
    { label: 'Submitted', value: a.submitted ?? 0, tone: 'emerald', href: '/applications' },
    { label: 'Agent runs', value: a.agentRuns ?? agentRuns.value.length, tone: 'slate', href: '/monitor/agent' },
  ];
});

const activity = computed(() => {
  const events = [];
  for (const run of agentRuns.value.slice(0, 4)) {
    events.push({
      id: `agent-${run._id}`,
      time: run.createdAt,
      title: 'Agent search',
      detail: run.status,
      tone: run.status === 'completed' ? 'teal' : 'red',
      href: '/monitor/agent',
    });
  }
  for (const run of swarmRuns.value.slice(0, 3)) {
    events.push({
      id: `swarm-${run._id}`,
      time: run.createdAt,
      title: 'Swarm run',
      detail: run.summary || run.status,
      tone: run.status === 'completed' ? 'amber' : 'slate',
      href: '/monitor/swarm',
    });
  }
  for (const job of recentJobs.value.slice(0, 5)) {
    events.push({
      id: `job-${job.jobId}`,
      time: job.queuedAt || job.createdAt,
      title: job.title || 'Queued job',
      detail: `${job.company || 'Company'} · ${job.status || 'pending'}`,
      tone: 'sky',
      href: `/approvals?jobId=${job.jobId}`,
    });
  }
  return events
    .filter((e) => e.time)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 10);
});

const healthItems = computed(() => {
  const q = queue.value || {};
  const pending = q.pending ?? 0;
  return [
    { label: 'Queue ingestion', status: pending > 0 ? 'active' : 'idle', note: `${pending} awaiting review` },
    { label: 'Agent scheduler', status: agentRuns.value[0]?.status === 'failed' ? 'warn' : 'ok', note: 'Last run tracked' },
    { label: 'Swarm pipeline', status: swarmRuns.value.length ? 'ok' : 'idle', note: `${swarmRuns.value.length} runs on record` },
    { label: 'Apply tracker', status: (applications.value?.length || analytics.value?.totalApplications) ? 'ok' : 'idle', note: 'Applications synced' },
  ];
});

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

onMounted(() => {
  refresh();
  pollTimer = setInterval(refresh, 45000);
});

onUnmounted(() => clearInterval(pollTimer));
</script>

<template>
  <div v-if="loading && !analytics" class="py-16 text-center text-slate-400">Loading command center…</div>

  <div v-else class="space-y-8">
    <!-- KPI rings -->
    <div class="monitor-kpi-grid">
      <RouterLink
        v-for="kpi in kpis"
        :key="kpi.label"
        :to="kpi.href"
        class="monitor-kpi-card"
        :class="`monitor-kpi-${kpi.tone}`"
      >
        <div class="monitor-kpi-ring">
          <span class="monitor-kpi-value">{{ kpi.value }}</span>
        </div>
        <p class="monitor-kpi-label">{{ kpi.label }}</p>
      </RouterLink>
    </div>

    <div class="grid gap-6 xl:grid-cols-5">
      <!-- Activity feed — vertical timeline -->
      <section class="monitor-panel xl:col-span-3">
        <div class="monitor-panel-head">
          <h2>Activity stream</h2>
          <button type="button" class="monitor-refresh-btn" @click="refresh">Refresh</button>
        </div>
        <ul v-if="activity.length" class="monitor-timeline">
          <li v-for="event in activity" :key="event.id" class="monitor-timeline-item">
            <span class="monitor-timeline-dot" :class="`dot-${event.tone}`" />
            <div class="monitor-timeline-body">
              <RouterLink :to="event.href" class="monitor-timeline-title">{{ event.title }}</RouterLink>
              <p class="monitor-timeline-detail">{{ event.detail }}</p>
              <time class="monitor-timeline-time">{{ formatTime(event.time) }}</time>
            </div>
          </li>
        </ul>
        <p v-else class="monitor-empty">No recent activity — run the agent or queue a LinkedIn job.</p>
      </section>

      <!-- System health — status cards -->
      <section class="monitor-panel xl:col-span-2">
        <div class="monitor-panel-head">
          <h2>System health</h2>
        </div>
        <div class="space-y-3">
          <div v-for="item in healthItems" :key="item.label" class="monitor-health-row">
            <div class="flex items-center gap-3">
              <span class="monitor-health-led" :class="`led-${item.status}`" />
              <div>
                <p class="text-sm font-medium text-slate-200">{{ item.label }}</p>
                <p class="text-xs text-slate-500">{{ item.note }}</p>
              </div>
            </div>
            <span class="monitor-health-badge" :class="`badge-${item.status}`">{{ item.status }}</span>
          </div>
        </div>

        <div class="mt-6 grid grid-cols-2 gap-3">
          <RouterLink to="/agent" class="monitor-quick-action">▶ Run agent</RouterLink>
          <RouterLink to="/approvals" class="monitor-quick-action monitor-quick-action-alt">✓ Open queue</RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>
