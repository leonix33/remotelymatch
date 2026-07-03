<script setup>
import { computed } from 'vue';
import { brand } from '../brand';
import LogoMark from './LogoMark.vue';

const props = defineProps({
  size: { type: String, default: 'md' },
  showText: { type: Boolean, default: true },
  variant: { type: String, default: 'sidebar' }, // sidebar | compact | hero
  showTagline: { type: Boolean, default: undefined },
});

const showTaglineLine = computed(() => {
  if (props.showTagline !== undefined) return props.showTagline;
  return props.variant === 'sidebar';
});

const markSize = computed(() => {
  if (props.size === 'sm') return 32;
  if (props.size === 'lg') return 56;
  return 40;
});

const textClass = computed(() => {
  if (props.size === 'sm') return 'text-lg';
  if (props.size === 'lg') return 'text-3xl';
  return 'text-xl';
});
</script>

<template>
  <div class="flex items-center gap-3">
    <LogoMark :size="markSize" class="shrink-0 shadow-lg shadow-teal-900/30" />
    <div v-if="showText" class="min-w-0 leading-none">
      <p :class="[textClass, 'font-bold tracking-tight']">
        <span class="text-teal-400">{{ brand.nameTop }}</span><span class="text-amber-300">{{ brand.nameBottom }}</span>
      </p>
      <p
        v-if="showTaglineLine"
        class="mt-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500"
      >
        {{ brand.tagline }}
      </p>
    </div>
  </div>
</template>
