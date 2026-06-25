<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import AppLogo from './AppLogo.vue';
import { isProduction } from '../config';
import { brand, displayDomain } from '../brand';

defineProps({
  onLogout: { type: Function, required: true },
});

const route = useRoute();
const auth = useAuthStore();

const expanded = ref({
  monitor: true,
  workflow: true,
  intelligence: false,
  automation: false,
  social: false,
});

const monitorItems = [
  { to: '/monitor', label: 'Command Center', icon: '◈', exact: true },
  { to: '/monitor/pipeline', label: 'Job Pipeline', icon: '⬡' },
  { to: '/monitor/agent', label: 'Agent Runs', icon: '▶' },
  { to: '/monitor/swarm', label: 'Swarm Stages', icon: '⚡' },
  { to: '/monitor/applications', label: 'Applications', icon: '▣' },
];

const navGroups = computed(() => {
  const groups = [
    {
      id: 'overview',
      label: 'Overview',
      collapsible: false,
      items: [{ to: '/', label: 'Home', icon: '◉', exact: true }],
    },
    {
      id: 'monitor',
      label: 'Monitor',
      collapsible: true,
      badge: 'Live',
      items: monitorItems,
    },
    {
      id: 'workflow',
      label: 'Workflow',
      collapsible: true,
      items: [
        { to: '/jobs', label: 'Jobs', icon: '◎' },
        { to: '/linkedin', label: 'LinkedIn', icon: 'in' },
        { to: '/approvals', label: 'Apply Queue', icon: '✓' },
        { to: '/tailored-resumes', label: 'Tailored', icon: '📋' },
        { to: '/follow-ups', label: 'Follow-ups', icon: '↗' },
        { to: '/applications', label: 'Applications', icon: '▣' },
        { to: '/calendar', label: 'Calendar', icon: '📆' },
      ],
    },
    {
      id: 'intelligence',
      label: 'Intelligence',
      collapsible: true,
      items: [
        { to: '/chat', label: 'Connect', icon: '💬' },
        { to: '/intelligence', label: 'AI Intel', icon: '🧠' },
        { to: '/interview', label: 'Interview', icon: '🎙' },
        { to: '/resumes', label: 'Resumes', icon: '📄' },
        { to: '/generator', label: 'Cover Letter', icon: '✦' },
      ],
    },
    {
      id: 'automation',
      label: 'Automation',
      collapsible: true,
      items: [
        { to: '/agent', label: 'Run Agent', icon: '▶' },
        { to: '/swarm', label: 'Swarm', icon: '⚡' },
        { to: '/analytics', label: 'Analytics', icon: '◈' },
      ],
    },
    {
      id: 'social',
      label: 'Growth',
      collapsible: true,
      items: [
        { to: '/conferences', label: 'Events', icon: '📅' },
        { to: '/social', label: 'Social', icon: '🤝' },
        { to: '/outcomes', label: 'Outcomes', icon: '📈' },
      ],
    },
    {
      id: 'account',
      label: 'Account',
      collapsible: false,
      items: [{ to: '/profile', label: 'Profile', icon: '◆' }],
    },
  ];

  if (auth.isAdmin) {
    groups.find((g) => g.id === 'account').items.push({ to: '/users', label: 'Team', icon: '◇' });
  }

  return groups;
});

function isActive(item) {
  if (item.exact) return route.path === item.to;
  if (item.to === '/monitor') return route.path === '/monitor';
  return route.path === item.to || route.path.startsWith(`${item.to}/`);
}

function groupHasActive(group) {
  return group.items.some((item) => isActive(item));
}

function toggleGroup(id) {
  expanded.value[id] = !expanded.value[id];
}

watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/monitor')) expanded.value.monitor = true;
    if (['/jobs', '/linkedin', '/approvals', '/tailored-resumes', '/follow-ups', '/applications', '/calendar'].includes(path)) {
      expanded.value.workflow = true;
    }
  },
  { immediate: true }
);
</script>

<template>
  <aside class="sidebar-shell hidden w-72 shrink-0 lg:flex lg:flex-col">
    <div class="sidebar-brand">
      <AppLogo size="md" />
      <p class="mt-3 text-xs leading-relaxed text-slate-400">{{ brand.tagline }}</p>
      <p v-if="isProduction" class="mt-2 truncate text-[10px] tracking-wide text-slate-600 uppercase">
        {{ displayDomain() }}
      </p>
    </div>

    <nav class="sidebar-nav custom-scrollbar flex-1 space-y-5 overflow-y-auto pr-1">
      <section v-for="group in navGroups" :key="group.id" class="sidebar-section">
        <button
          v-if="group.collapsible"
          type="button"
          class="sidebar-section-header"
          :class="groupHasActive(group) ? 'text-teal-300' : ''"
          @click="toggleGroup(group.id)"
        >
          <span class="sidebar-section-label">{{ group.label }}</span>
          <span v-if="group.badge" class="sidebar-badge">{{ group.badge }}</span>
          <span class="sidebar-chevron" :class="expanded[group.id] ? 'rotate-180' : ''">▾</span>
        </button>
        <p v-else class="sidebar-section-label px-3">{{ group.label }}</p>

        <div v-show="!group.collapsible || expanded[group.id]" class="mt-1 space-y-0.5">
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="sidebar-link"
            :class="isActive(item) ? 'sidebar-link-active' : ''"
          >
            <span class="sidebar-link-icon">{{ item.icon }}</span>
            <span class="truncate">{{ item.label }}</span>
          </RouterLink>
        </div>
      </section>
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-user-card">
        <p class="text-sm font-semibold text-slate-100">{{ auth.user?.name }}</p>
        <p class="mt-0.5 text-xs capitalize text-slate-500">{{ auth.user?.role }}</p>
      </div>
      <div class="flex gap-3 text-[11px] text-slate-600">
        <RouterLink to="/privacy" class="hover:text-teal-400 transition">Privacy</RouterLink>
        <RouterLink to="/terms" class="hover:text-teal-400 transition">Terms</RouterLink>
      </div>
      <button type="button" class="btn-secondary w-full text-sm" @click="onLogout">Logout</button>
    </div>
  </aside>
</template>
