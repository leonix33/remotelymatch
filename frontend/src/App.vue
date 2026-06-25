<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router';
import { useAuthStore } from './stores/auth';
import PwaPrompt from './components/PwaPrompt.vue';
import AppLogo from './components/AppLogo.vue';
import AppSidebar from './components/AppSidebar.vue';
import NotificationBell from './components/NotificationBell.vue';
import { isProduction } from './config';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const mobileNav = computed(() => [
  { to: '/', label: 'Home', icon: '◉' },
  { to: '/monitor', label: 'Monitor', icon: '◈' },
  { to: '/jobs', label: 'Jobs', icon: '◎' },
  { to: '/linkedin', label: 'LinkedIn', icon: 'in' },
  { to: '/follow-ups', label: 'Follow', icon: '↗' },
  { to: '/applications', label: 'Apps', icon: '▣' },
]);

function isMobileActive(item) {
  if (item.to === '/monitor') return route.path.startsWith('/monitor');
  return route.path === item.to;
}

function logout() {
  auth.logout();
  router.push('/login');
}

function onSwMessage(event) {
  if (event.data?.type === 'REMOTEMATCH_NAVIGATE' && event.data.url) {
    router.push(event.data.url);
  }
}

onMounted(() => {
  navigator.serviceWorker?.addEventListener('message', onSwMessage);
});

onUnmounted(() => {
  navigator.serviceWorker?.removeEventListener('message', onSwMessage);
});
</script>

<template>
  <div v-if="route.path === '/login' || route.path === '/privacy' || route.path === '/terms'" class="min-h-screen safe-top safe-bottom">
    <RouterView />
  </div>
  <div v-else class="flex min-h-screen min-h-dvh">
    <PwaPrompt />

    <AppSidebar :on-logout="logout" />

    <div class="flex flex-1 flex-col min-w-0">
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

      <main
        class="flex-1 overflow-y-auto p-4 lg:p-8"
        :class="route.path === '/onboarding' ? 'pb-4 lg:pb-8' : 'pb-24 lg:pb-8'"
      >
        <RouterView />
        <p v-if="!isProduction" class="mt-8 text-center text-xs text-slate-600">
          Local dev — production: <span class="text-teal-500">remotematch.onrender.com</span>
        </p>
      </main>

      <nav
        v-if="route.path !== '/onboarding'"
        class="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-teal-900/40 bg-slate-950/95 backdrop-blur lg:hidden"
      >
        <RouterLink
          v-for="item in mobileNav"
          :key="item.to"
          :to="item.to"
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition"
          :class="isMobileActive(item) ? 'bg-teal-500/10 text-teal-200' : 'text-slate-400 hover:text-slate-300'"
        >
          <span class="text-lg leading-none" :class="isMobileActive(item) ? 'text-teal-300' : 'text-slate-500'">
            {{ item.icon }}
          </span>
          {{ item.label }}
        </RouterLink>
      </nav>
    </div>
  </div>
</template>
