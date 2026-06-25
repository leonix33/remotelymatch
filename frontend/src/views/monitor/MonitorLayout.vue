<script setup>
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

const route = useRoute();

const tabs = [
  { to: '/monitor', label: 'Command Center', shape: 'diamond' },
  { to: '/monitor/pipeline', label: 'Pipeline', shape: 'hex' },
  { to: '/monitor/agent', label: 'Agent', shape: 'circle' },
  { to: '/monitor/swarm', label: 'Swarm', shape: 'pill' },
  { to: '/monitor/applications', label: 'Applications', shape: 'square' },
];

function isActive(tab) {
  if (tab.to === '/monitor') return route.path === '/monitor';
  return route.path.startsWith(tab.to);
}
</script>

<template>
  <div class="monitor-shell">
    <header class="monitor-header">
      <div>
        <p class="monitor-eyebrow">Operations</p>
        <h1 class="monitor-title">Monitor</h1>
        <p class="monitor-subtitle">Real-time view of jobs, agents, and your apply pipeline</p>
      </div>
      <div class="monitor-tab-bar">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="monitor-tab"
          :class="[
            `monitor-tab-${tab.shape}`,
            isActive(tab) ? 'monitor-tab-active' : '',
          ]"
        >
          {{ tab.label }}
        </RouterLink>
      </div>
    </header>

    <div class="monitor-content">
      <RouterView />
    </div>
  </div>
</template>
