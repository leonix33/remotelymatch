<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  resumeText: { type: String, default: '' },
  score: { type: Number, default: 0 },
  skills: { type: Array, default: () => [] },
  fileName: { type: String, default: '' },
  emptyMessage: {
    type: String,
    default: 'Upload or paste your resume to preview it here before applying.',
  },
});

const expanded = ref(false);

const hasContent = computed(() => (props.resumeText || '').trim().length >= 20);

const previewLines = computed(() => {
  const text = (props.resumeText || '').trim();
  if (!text) return [];
  return text.split('\n').filter((line) => line.trim());
});

const displayLines = computed(() => {
  if (expanded.value) return previewLines.value;
  return previewLines.value.slice(0, 12);
});

const scoreLabel = computed(() => {
  if (props.score >= 80) return 'Ready to apply';
  if (props.score >= 50) return 'Good — consider adding more detail';
  if (props.score > 0) return 'Needs improvement';
  return 'Not uploaded';
});

const scoreColor = computed(() => {
  if (props.score >= 80) return 'text-teal-300';
  if (props.score >= 50) return 'text-amber-300';
  return 'text-slate-400';
});

const barColor = computed(() => {
  if (props.score >= 80) return 'bg-teal-500';
  if (props.score >= 50) return 'bg-amber-500';
  return 'bg-slate-600';
});
</script>

<template>
  <div class="rounded-xl border border-slate-700/80 bg-slate-900/60 overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
      <div>
        <p class="text-sm font-medium text-slate-200">Resume preview</p>
        <p v-if="fileName" class="mt-0.5 text-xs text-slate-500">{{ fileName }}</p>
      </div>
      <div v-if="hasContent" class="text-right">
        <p class="text-2xl font-bold" :class="scoreColor">{{ score }}</p>
        <p class="text-xs text-slate-500">{{ scoreLabel }}</p>
      </div>
    </div>

    <div v-if="!hasContent" class="px-4 py-8 text-center text-sm text-slate-500">
      {{ emptyMessage }}
    </div>

    <template v-else>
      <div v-if="score > 0" class="px-4 pt-3">
        <div class="h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div class="h-full rounded-full transition-all" :class="barColor" :style="{ width: `${Math.min(score, 100)}%` }" />
        </div>
      </div>

      <div v-if="skills.length" class="flex flex-wrap gap-1.5 px-4 pt-3">
        <span v-for="skill in skills.slice(0, 10)" :key="skill" class="badge badge-teal text-xs">{{ skill }}</span>
        <span v-if="skills.length > 10" class="text-xs text-slate-500 self-center">+{{ skills.length - 10 }} more</span>
      </div>

      <div class="custom-scrollbar max-h-72 overflow-y-auto px-4 py-3">
        <pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">{{ displayLines.join('\n') }}</pre>
        <p v-if="!expanded && previewLines.length > 12" class="mt-2 text-xs text-slate-500">
          … {{ previewLines.length - 12 }} more lines
        </p>
      </div>

      <div v-if="previewLines.length > 12" class="border-t border-slate-800 px-4 py-2">
        <button type="button" class="text-xs text-teal-400 hover:underline" @click="expanded = !expanded">
          {{ expanded ? 'Show less' : 'Show full resume' }}
        </button>
      </div>
    </template>
  </div>
</template>
