<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import AppLogo from './AppLogo.vue';
import { isProduction, canonicalDomain } from '../config';
import { simpleNav, advancedNav } from '../utils/navigation';

defineProps({
  onLogout: { type: Function, required: true },
});

const route = useRoute();
const auth = useAuthStore();

const showAdvanced = ref(false);

const visibleAdvanced = computed(() =>
  advancedNav.filter((item) => !item.adminOnly || auth.isAdmin)
);

function isActive(item) {
  if (item.exact) return route.path === item.to;
  return route.path === item.to || route.path.startsWith(`${item.to}/`);
}

watch(
  () => route.path,
  (path) => {
    if (visibleAdvanced.value.some((item) => isActive(item))) {
      showAdvanced.value = true;
    }
  },
  { immediate: true }
);
</script>

<template>
  <aside class="sidebar-shell hidden w-72 shrink-0 lg:flex lg:flex-col">
    <div class="sidebar-brand">
      <AppLogo size="md" variant="sidebar" />
      <p v-if="isProduction" class="mt-3 truncate text-[10px] tracking-wide text-slate-500">
        {{ canonicalDomain }}
      </p>
    </div>

    <nav class="sidebar-nav custom-scrollbar flex-1 space-y-5 overflow-y-auto pr-1">
      <section class="sidebar-section">
        <p class="sidebar-section-label px-3">Get started</p>
        <div class="mt-1 space-y-0.5">
          <RouterLink
            v-for="item in simpleNav"
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

      <section class="sidebar-section">
        <button
          type="button"
          class="sidebar-section-header w-full"
          @click="showAdvanced = !showAdvanced"
        >
          <span class="sidebar-section-label">More tools</span>
          <span class="sidebar-chevron" :class="showAdvanced ? 'rotate-180' : ''">▾</span>
        </button>
        <div v-show="showAdvanced" class="mt-1 space-y-0.5">
          <RouterLink
            v-for="item in visibleAdvanced"
            :key="item.to"
            :to="item.to"
            class="sidebar-link text-sm"
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
