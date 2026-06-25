<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../../api/http';
import { useMonitorData } from '../../composables/useMonitorData';

const { agentRuns, refresh: refreshMonitor } = useMonitorData();
const running = ref(false);
const output = ref('');
const error = ref('');

async function loadRuns() {
  await refreshMonitor();
}

async function runAgent() {
  error.value = '';
  output.value = '';
  running.value = true;
  try {
    const { data } = await http.post('/agent/run');
    output.value = data.output || data.message;
    await loadRuns();
  } catch (e) {
    error.value = e.response?.data?.message || e.message || 'Agent run failed';
  } finally {
    running.value = false;
  }
}

onMounted(loadRuns);
</script>

<template>
  <div class="space-y-8">
    <section class="monitor-panel monitor-panel-glass">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="monitor-section-title">Job search agent</h2>
          <p class="monitor-section-desc">Fetch and score new roles — approvals stay in your queue</p>
        </div>
        <button type="button" class="btn-primary" :disabled="running" @click="runAgent">
          {{ running ? 'Searching…' : '▶ Run search now' }}
        </button>
      </div>
      <p v-if="error" class="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{{ error }}</p>
      <pre v-if="output" class="monitor-console mt-4">{{ output }}</pre>
    </section>

    <!-- Timeline layout -->
    <section class="monitor-panel">
      <div class="monitor-panel-head">
        <h2>Run history</h2>
        <RouterLink to="/agent" class="text-sm text-teal-400 hover:underline">Full agent page →</RouterLink>
      </div>

      <div v-if="agentRuns.length" class="monitor-run-timeline">
        <div v-for="(run, i) in agentRuns" :key="run._id" class="monitor-run-node">
          <div class="monitor-run-rail">
            <span class="monitor-run-marker" :class="run.status === 'completed' ? 'marker-ok' : 'marker-fail'" />
            <span v-if="i < agentRuns.length - 1" class="monitor-run-line" />
          </div>
          <div class="monitor-run-card">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="font-medium text-slate-200">Agent search</p>
              <span class="badge" :class="run.status === 'completed' ? 'badge-teal' : 'badge-red'">{{ run.status }}</span>
            </div>
            <time class="mt-1 block text-xs text-slate-500">
              {{ new Date(run.createdAt).toLocaleString() }}
            </time>
            <p v-if="run.output" class="mt-3 line-clamp-2 text-sm text-slate-400">{{ run.output }}</p>
          </div>
        </div>
      </div>
      <p v-else class="monitor-empty">No agent runs yet — start a search above.</p>
    </section>
  </div>
</template>
