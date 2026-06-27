<script setup>
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { advancedNav } from '../utils/navigation';

defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const route = useRoute();
const auth = useAuthStore();

const items = computed(() => advancedNav.filter((item) => !item.adminOnly || auth.isAdmin));

function isActive(item) {
  return route.path === item.to || route.path.startsWith(`${item.to}/`);
}

function pick(item) {
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mobile-more-overlay" @click.self="emit('close')">
      <div class="mobile-more-sheet safe-bottom" role="dialog" aria-label="More navigation">
        <div class="mobile-more-handle" aria-hidden="true" />
        <div class="flex items-center justify-between gap-3 px-4 pb-3 pt-2">
          <p class="text-sm font-semibold text-slate-200">More</p>
          <button type="button" class="btn-secondary min-h-[44px] px-4 text-sm" @click="emit('close')">Done</button>
        </div>
        <nav class="mobile-more-nav custom-scrollbar max-h-[min(70dvh,32rem)] overflow-y-auto px-3 pb-4">
          <RouterLink
            v-for="item in items"
            :key="item.to"
            :to="item.to"
            class="mobile-more-link"
            :class="isActive(item) ? 'mobile-more-link-active' : ''"
            @click="pick(item)"
          >
            <span class="mobile-more-link-icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>
      </div>
    </div>
  </Teleport>
</template>
