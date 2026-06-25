<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../../api/http';
import { useMonitorData } from '../../composables/useMonitorData';

const { swarmRuns, refresh: refreshMonitor } = useMonitorData();
const running = ref(false);
const active = ref(null);

const stageMeta = [
  { key: 'scout', label: 'Scout', desc: 'Finds matching roles', icon: '◎' },
  { key: 'writer', label: 'Writer', desc: 'Drafts application copy', icon: '✦' },
  { key: 'reviewer', label: 'Reviewer', desc: 'Queues for your approval', icon: '✓' },
];

async function load() {
  await refreshMonitor();
}

async function runSwarm() {
  running.value = true;
  active.value = null;
  try {
    const { data } = await http.post('/swarm/run');
    active.value = data;
    await load();
  } finally {
    running.value = false;
  }
}

function stageStatus(run, key) {
  return run?.stages?.[key]?.status || run?.status || 'idle';
}

onMounted(load);
</script>

<template>
  <div class="space-y-8">
    <section class="monitor-panel monitor-panel-glass">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="monitor-section-title">Multi-agent swarm</h2>
          <p class="monitor-section-desc">Scout → Writer → Reviewer pipeline with human-in-the-loop</p>
        </div>
        <button type="button" class="btn-primary" :disabled="running" @click="runSwarm">
          {{ running ? 'Swarm running…' : '⚡ Launch swarm' }}
        </button>
      </div>
    </section>

    <!-- Active run — horizontal pipeline -->
    <section v-if="active" class="monitor-swarm-pipeline">
      <div
        v-for="(stage, i) in stageMeta"
        :key="stage.key"
        class="monitor-swarm-stage"
        :class="`stage-${stageStatus(active, stage.key)}`"
      >
        <div class="monitor-swarm-stage-icon">{{ stage.icon }}</div>
        <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">{{ stage.label }}</p>
        <p class="mt-1 text-sm font-medium text-teal-200">{{ stageStatus(active, stage.key) }}</p>
        <p class="mt-2 line-clamp-3 text-xs text-slate-400">{{ active.stages?.[stage.key]?.result || stage.desc }}</p>
        <span v-if="i < stageMeta.length - 1" class="monitor-swarm-connector" aria-hidden="true">→</span>
      </div>
    </section>
    <p v-if="active?.summary" class="rounded-xl border border-teal-800/40 bg-teal-950/30 px-4 py-3 text-sm text-teal-200">
      {{ active.summary }}
    </p>

    <!-- Past runs — stacked cards with stage pills -->
    <section class="monitor-panel">
      <div class="monitor-panel-head">
        <h2>Past swarm runs</h2>
        <RouterLink to="/swarm" class="text-sm text-teal-400 hover:underline">Full swarm page →</RouterLink>
      </div>
      <div class="space-y-4">
        <article v-for="run in swarmRuns" :key="run._id" class="monitor-swarm-run-card">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <time class="text-xs text-slate-500">{{ new Date(run.createdAt).toLocaleString() }}</time>
            <span class="badge badge-slate">{{ run.status }}</span>
          </div>
          <p class="mt-2 text-sm text-slate-300">{{ run.summary || 'Swarm run' }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <span
              v-for="stage in stageMeta"
              :key="`${run._id}-${stage.key}`"
              class="monitor-stage-pill"
              :class="`pill-${stageStatus(run, stage.key)}`"
            >
              {{ stage.label }}: {{ stageStatus(run, stage.key) }}
            </span>
          </div>
        </article>
        <p v-if="!swarmRuns.length" class="monitor-empty">No swarm runs yet.</p>
      </div>
    </section>
  </div>
</template>
