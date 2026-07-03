<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../../api/http';
import { useMonitorData } from '../../composables/useMonitorData';

const { loading, analytics, queue, recentJobs, refresh } = useMonitorData();

const sourcesExpanded = ref(false);
const ingestSources = ref([]);
const ingestLoading = ref(false);

const funnel = computed(() => {
  const a = analytics.value || {};
  const q = queue.value || {};
  const total = a.totalJobs || 1;
  return [
    { label: 'Discovered', value: a.totalJobs ?? 0, pct: 100, color: 'from-sky-500/40 to-sky-600/10' },
    { label: 'High match (80%+)', value: a.highMatch ?? 0, pct: Math.round(((a.highMatch ?? 0) / total) * 100), color: 'from-teal-500/40 to-teal-600/10' },
    { label: 'Pending review', value: q.pending ?? 0, pct: Math.round(((q.pending ?? 0) / total) * 100), color: 'from-amber-500/40 to-amber-600/10' },
    { label: 'Approved', value: q.approved ?? 0, pct: Math.round(((q.approved ?? 0) / total) * 100), color: 'from-emerald-500/40 to-emerald-600/10' },
    { label: 'Submitted', value: a.submitted ?? 0, pct: Math.round(((a.submitted ?? 0) / total) * 100), color: 'from-violet-500/40 to-violet-600/10' },
  ];
});

const sections = computed(() => {
  const by = analytics.value?.bySection || {};
  return Object.entries(by).map(([key, count]) => ({ key, count }));
});

onMounted(async () => {
  refresh();
  ingestLoading.value = true;
  try {
    const { data } = await http.get('/jobs/ingest/status');
    ingestSources.value = data.sources || [];
  } catch {
    ingestSources.value = [];
  } finally {
    ingestLoading.value = false;
  }
});
</script>

<template>
  <div v-if="loading && !analytics" class="py-12 text-center text-slate-400">Loading pipeline…</div>

  <div v-else class="space-y-8">
    <!-- Funnel — tapered bars -->
    <section class="monitor-funnel">
      <h2 class="monitor-section-title">Apply funnel</h2>
      <p class="monitor-section-desc">Jobs flowing from discovery through submission</p>
      <div class="mt-6 space-y-3">
        <RouterLink
          v-for="(step, i) in funnel"
          :key="step.label"
          to="/approvals"
          class="monitor-funnel-step group"
          :style="{ width: `${Math.max(35, 100 - i * 12)}%` }"
        >
          <div class="monitor-funnel-bar bg-gradient-to-r" :class="step.color">
            <span class="monitor-funnel-label">{{ step.label }}</span>
            <span class="monitor-funnel-value">{{ step.value }}</span>
          </div>
          <span class="monitor-funnel-pct">{{ step.pct }}%</span>
        </RouterLink>
      </div>
    </section>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Source breakdown — horizontal bars -->
      <section class="monitor-panel monitor-panel-angular">
        <h2 class="monitor-section-title">Jobs by source</h2>
        <div class="mt-5 space-y-4">
          <div v-for="(count, board) in analytics?.byJobBoard || {}" :key="board" class="monitor-bar-row">
            <span class="monitor-bar-label" :title="board">{{ board }}</span>
            <div class="monitor-bar-track">
              <div
                class="monitor-bar-fill monitor-bar-teal"
                :style="{ width: `${Math.min(100, (count / Math.max(analytics?.totalJobs || 1, 1)) * 100)}%` }"
              />
            </div>
            <span class="monitor-bar-count">{{ count }}</span>
          </div>
          <p v-if="!Object.keys(analytics?.byJobBoard || {}).length" class="monitor-empty">No job sources yet.</p>
        </div>
      </section>

      <!-- Queue sections -->
      <section class="monitor-panel monitor-panel-angular">
        <h2 class="monitor-section-title">Queue by section</h2>
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <div v-for="sec in sections" :key="sec.key" class="monitor-stat-tile">
            <p class="text-xs uppercase tracking-wider text-slate-500">{{ sec.key.replace(/_/g, ' ') }}</p>
            <p class="mt-2 text-3xl font-bold text-teal-300">{{ sec.count }}</p>
          </div>
          <p v-if="!sections.length" class="monitor-empty sm:col-span-2">No sections yet.</p>
        </div>
      </section>
    </div>

    <section class="monitor-panel">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 text-left"
        @click="sourcesExpanded = !sourcesExpanded"
      >
        <div>
          <h2 class="monitor-section-title">Configured job sources</h2>
          <p class="monitor-section-desc">
            All live boards are searched by default · {{ ingestSources.filter((s) => s.enabled).length }} active
          </p>
        </div>
        <span class="text-slate-500">{{ sourcesExpanded ? '▾' : '▸' }}</span>
      </button>
      <div v-show="sourcesExpanded" class="mt-4">
        <p v-if="ingestLoading" class="text-sm text-slate-500">Loading sources…</p>
        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="source in ingestSources"
            :key="source.name"
            class="badge text-[10px]"
            :class="source.enabled && source.configured ? 'badge-teal' : 'badge-slate'"
            :title="source.apiKeyPresent === false ? 'API key missing' : ''"
          >
            {{ source.name }}
          </span>
          <p v-if="!ingestSources.length" class="text-sm text-slate-500">No sources configured.</p>
        </div>
        <p class="mt-3 text-xs text-slate-600">
          Searches all boards in <code class="text-slate-400">backend/src/config/jobSources.js</code> automatically.
          Optional: set <code class="text-slate-400">JOB_SOURCES_ENABLED</code> on Render to limit sources.
        </p>
      </div>
    </section>

    <!-- Recent queue — card strip -->
    <section class="monitor-panel">
      <div class="monitor-panel-head">
        <h2>Latest in queue</h2>
        <RouterLink to="/approvals" class="text-sm text-teal-400 hover:underline">View all →</RouterLink>
      </div>
      <div class="mt-4 flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
        <RouterLink
          v-for="job in recentJobs.slice(0, 6)"
          :key="job.jobId"
          :to="`/approvals?jobId=${job.jobId}`"
          class="monitor-job-chip shrink-0"
        >
          <p class="font-medium text-slate-200 line-clamp-1">{{ job.title }}</p>
          <p class="mt-1 text-xs text-slate-500">{{ job.company }}</p>
          <span class="mt-2 badge" :class="job.status === 'approved' ? 'badge-teal' : job.status === 'rejected' ? 'badge-red' : 'badge-gold'">
            {{ job.status || 'pending' }}
          </span>
        </RouterLink>
        <p v-if="!recentJobs.length" class="monitor-empty">Queue is empty.</p>
      </div>
    </section>
  </div>
</template>
