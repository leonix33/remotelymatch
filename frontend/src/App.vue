<script setup>
import { computed } from 'vue';
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router';
import { useAuthStore } from './stores/auth';
import PwaPrompt from './components/PwaPrompt.vue';
import AppLogo from './components/AppLogo.vue';
import NotificationBell from './components/NotificationBell.vue';
import { isProduction, appUrl } from './config';
import { brand, displayDomain } from './brand';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const nav = computed(() => {
  const items = [
    { to: '/', label: 'Home', icon: '◉', mobile: true },
    { to: '/jobs', label: 'Jobs', icon: '◎', mobile: true },
    { to: '/approvals', label: 'Apply Queue', icon: '✓', mobile: false },
    { to: '/chat', label: 'Connect', icon: '💬', mobile: false },
    { to: '/intelligence', label: 'AI Intel', icon: '🧠', mobile: false },
    { to: '/interview', label: 'Interview', icon: '🎙', mobile: false },
    { to: '/resumes', label: 'Resumes', icon: '📄', mobile: false },
    { to: '/calendar', label: 'Calendar', icon: '📆', mobile: true },
    { to: '/conferences', label: 'Events', icon: '📅', mobile: false },
    { to: '/social', label: 'Social', icon: '🤝', mobile: false },
    { to: '/swarm', label: 'Swarm', icon: '⚡', mobile: false },
    { to: '/outcomes', label: 'Outcomes', icon: '📈', mobile: false },
    { to: '/applications', label: 'Apps', icon: '▣', mobile: true },
    { to: '/profile', label: 'Profile', icon: '◆', mobile: false },
    { to: '/generator', label: 'Cover Letter', icon: '✦', mobile: false },
    { to: '/agent', label: 'Run Agent', icon: '▶', mobile: false },
    { to: '/analytics', label: 'Analytics', icon: '◈', mobile: true },
  ];
  if (auth.isAdmin) items.push({ to: '/users', label: 'Team', icon: '◇', mobile: false });
  return items;
});

const mobileNav = computed(() => nav.value.filter((i) => i.mobile));

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div v-if="route.path === '/login'" class="min-h-screen safe-top safe-bottom">
    <RouterView />
  </div>
  <div v-else class="flex min-h-screen min-h-dvh">
    <PwaPrompt />

    <!-- Desktop sidebar -->
    <aside class="hidden w-64 shrink-0 border-r border-teal-900/40 bg-slate-950/80 p-6 lg:flex lg:flex-col">
      <div class="mb-10">
        <AppLogo size="md" />
        <p class="mt-3 text-xs text-slate-400">{{ brand.tagline }}</p>
        <p v-if="isProduction" class="mt-2 truncate text-[10px] text-slate-600">{{ displayDomain() }}</p>
      </div>
      <nav class="space-y-1">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition"
          :class="route.path === item.to ? 'bg-teal-500/20 text-teal-200' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'"
        >
          <span class="text-teal-400">{{ item.icon }}</span>
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="mt-auto pt-10">
        <p class="text-sm font-medium text-slate-200">{{ auth.user?.name }}</p>
        <p class="text-xs text-slate-500">{{ auth.user?.role }}</p>
        <button class="btn-secondary mt-4 w-full text-sm" @click="logout">Logout</button>
      </div>
    </aside>

    <div class="flex flex-1 flex-col">
      <!-- Mobile header -->
      <header class="safe-top flex items-center justify-between border-b border-teal-900/30 bg-slate-950/80 px-4 py-3 backdrop-blur lg:hidden">
        <AppLogo size="sm" />
        <div class="flex items-center gap-2">
          <NotificationBell />
          <button class="btn-secondary px-3 py-1.5 text-xs" @click="logout">Logout</button>
        </div>
      </header>

      <header class="hidden items-center justify-end gap-3 border-b border-teal-900/20 bg-slate-950/40 px-8 py-3 lg:flex">
        <NotificationBell />
      </header>

      <main class="flex-1 overflow-y-auto p-4 pb-24 lg:p-8 lg:pb-8">
        <RouterView />
        <p v-if="!isProduction" class="mt-8 text-center text-xs text-slate-600">
          Local dev — production: <span class="text-teal-500">remotematch.onrender.com</span>
        </p>
      </main>

      <!-- Mobile bottom tab bar -->
      <nav
        class="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-teal-900/40 bg-slate-950/95 backdrop-blur lg:hidden"
      >
        <RouterLink
          v-for="item in mobileNav"
          :key="item.to"
          :to="item.to"
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition"
          :class="route.path === item.to ? 'text-teal-300' : 'text-slate-500'"
        >
          <span class="text-lg">{{ item.icon }}</span>
          {{ item.label }}
        </RouterLink>
      </nav>
    </div>
  </div>
</template>
