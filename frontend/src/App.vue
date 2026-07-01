<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useProfileStore } from './stores/profile';
import PwaPrompt from './components/PwaPrompt.vue';
import ShareInstallTab from './components/ShareInstallTab.vue';
import ShareInstallPanel from './components/ShareInstallPanel.vue';
import LogoMark from './components/LogoMark.vue';
import AppSidebar from './components/AppSidebar.vue';
import AppConcierge from './components/AppConcierge.vue';
import NotificationBell from './components/NotificationBell.vue';
import MobileMoreMenu from './components/MobileMoreMenu.vue';
import { simpleNav } from './utils/navigation';
import { isProduction, canonicalDomain } from './config';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const showMoreMenu = ref(false);

const mobileNav = computed(() => simpleNav.map((item) => ({ ...item, to: item.to })));

const mainClass = computed(() => {
  const base = 'mobile-main flex-1 overflow-y-auto overflow-x-hidden lg:p-8';
  if (route.path === '/onboarding') return `${base} mobile-main-onboarding pt-2 pb-4`;
  return `${base} mobile-main-with-tabs py-4 lg:pb-8`;
});

function isMobileActive(item) {
  if (item.exact) return route.path === item.to;
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

onMounted(async () => {
  navigator.serviceWorker?.addEventListener('message', onSwMessage);
  const auth = useAuthStore();
  const profileStore = useProfileStore();
  if (auth.accessToken && !profileStore.loaded) {
    profileStore.hydrateFromCache();
    await profileStore.fetch().catch(() => {});
  }
});

onUnmounted(() => {
  navigator.serviceWorker?.removeEventListener('message', onSwMessage);
});
</script>

<template>
  <!-- Always on: login, guest pages, and signed-in app -->
  <PwaPrompt />
  <ShareInstallTab />
  <ShareInstallPanel />

  <div v-if="route.path === '/login' || route.path === '/privacy' || route.path === '/terms'" class="min-h-screen min-h-dvh safe-top safe-bottom safe-x">
    <RouterView />
  </div>
  <div v-else class="mobile-app-shell flex min-h-screen min-h-dvh w-full flex-col lg:flex-row">
    <AppSidebar :on-logout="logout" />

    <div class="flex min-w-0 flex-1 flex-col mobile-content-column">
      <header
        v-if="route.path !== '/onboarding'"
        class="mobile-header safe-top flex items-center justify-between border-b border-teal-900/30 bg-slate-950/80 py-3 backdrop-blur lg:hidden"
      >
        <RouterLink to="/" class="flex min-w-0 items-center gap-2.5" aria-label="remotelymatch home">
          <LogoMark :size="40" class="shrink-0 shadow-lg shadow-teal-900/30" />
          <div class="min-w-0 leading-none">
            <p class="text-base font-bold tracking-tight">
              <span class="text-teal-400">remote</span><span class="text-amber-300">match</span>
            </p>
          </div>
        </RouterLink>
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
          Local dev — production:
          <a href="https://remotelymatch.app" class="text-teal-500 hover:underline">{{ canonicalDomain }}</a>
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
          <span class="mobile-tab-label">{{
            item.label === 'My Queue' ? 'Queue' : item.label === 'Follow-ups' ? 'Follow' : item.label
          }}</span>
        </RouterLink>
        <button
          type="button"
          class="mobile-tab flex flex-1 flex-col items-center justify-center gap-0.5 font-medium text-slate-400 transition hover:text-slate-300"
          aria-label="More navigation"
          @click="showMoreMenu = true"
        >
          <span class="mobile-tab-icon text-slate-500">☰</span>
          <span class="mobile-tab-label">More</span>
        </button>
      </nav>

      <MobileMoreMenu :open="showMoreMenu" @close="showMoreMenu = false" />
    </div>

    <AppConcierge
      v-if="auth.isAdmin && route.path !== '/login' && route.path !== '/onboarding' && route.path !== '/welcome'"
    />
  </div>
</template>
