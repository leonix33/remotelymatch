<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router';
import { useAuthStore } from './stores/auth';
import PwaPrompt from './components/PwaPrompt.vue';
import AppLogo from './components/AppLogo.vue';
import AppSidebar from './components/AppSidebar.vue';
import AppConcierge from './components/AppConcierge.vue';
import NotificationBell from './components/NotificationBell.vue';
import { isProduction } from './config';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const mobileNav = computed(() => [
  { to: '/', label: 'Apply', icon: '▶' },
  { to: '/jobs', label: 'Jobs', icon: '◎' },
  { to: '/approvals', label: 'Queue', icon: '✓' },
  { to: '/profile', label: 'Profile', icon: '◆' },
]);

const mainClass = computed(() => {
  if (route.path === '/onboarding') return 'mobile-main flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8';
  return 'mobile-main mobile-main-with-tabs flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8 lg:pb-8';
});

function isMobileActive(item) {
  return route.path === item.to || (item.to !== '/' && route.path.startsWith(item.to));
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
  <div v-if="route.path === '/login' || route.path === '/privacy' || route.path === '/terms'" class="min-h-screen min-h-dvh safe-top safe-bottom safe-x">
    <RouterView />
  </div>
  <div v-else class="mobile-app-shell flex min-h-screen min-h-dvh w-full">
    <PwaPrompt />

    <AppSidebar :on-logout="logout" />

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="mobile-header safe-top flex items-center justify-between border-b border-teal-900/30 bg-slate-950/80 py-3 backdrop-blur lg:hidden">
        <AppLogo size="sm" />
        <div class="flex items-center gap-2">
          <NotificationBell />
          <button class="btn-secondary min-h-[44px] px-3 py-2 text-sm" @click="logout">Logout</button>
        </div>
      </header>

      <header class="hidden items-center justify-end gap-3 border-b border-teal-900/20 bg-slate-950/40 px-8 py-3 lg:flex">
        <NotificationBell />
      </header>

      <main :class="mainClass">
        <RouterView />
        <p v-if="!isProduction" class="mt-8 text-center text-xs text-slate-600">
          Local dev — production: <span class="text-teal-500">remotematch.onrender.com</span>
        </p>
      </main>

      <nav
        v-if="route.path !== '/onboarding'"
        class="mobile-tab-bar safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-teal-900/40 bg-slate-950/95 backdrop-blur lg:hidden"
        aria-label="Main navigation"
      >
        <RouterLink
          v-for="item in mobileNav"
          :key="item.to"
          :to="item.to"
          :title="item.label"
          :aria-label="item.label"
          class="mobile-tab flex flex-1 flex-col items-center justify-center gap-0.5 font-medium transition"
          :class="isMobileActive(item) ? 'bg-teal-500/10 text-teal-200' : 'text-slate-400 hover:text-slate-300'"
        >
          <span class="mobile-tab-icon" :class="isMobileActive(item) ? 'text-teal-300' : 'text-slate-500'">
            {{ item.icon }}
          </span>
          <span class="mobile-tab-label">{{ item.label }}</span>
        </RouterLink>
      </nav>
    </div>

    <AppConcierge
      v-if="auth.isAdmin && route.path !== '/login' && route.path !== '/onboarding' && route.path !== '/welcome'"
    />
  </div>
</template>
