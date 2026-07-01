<script setup>
import { computed, ref } from 'vue';
import ResumePreviewModal from './ResumePreviewModal.vue';
import { prepareResumeTextForParsing } from '../utils/resumeRepair';

const props = defineProps({
  resumeText: { type: String, default: '' },
  score: { type: Number, default: 0 },
  skills: { type: Array, default: () => [] },
  fileName: { type: String, default: '' },
  unreadable: { type: Boolean, default: false },
  emptyMessage: {
    type: String,
    default: 'Upload or paste your resume, then tap Preview to see the formatted layout.',
  },
  title: { type: String, default: 'Resume preview' },
  subtitle: {
    type: String,
    default: 'Professional layout — same format for every candidate',
  },
  downloadFileName: { type: String, default: '' },
  prominent: { type: Boolean, default: false },
});

const previewOpen = ref(false);

const hasContent = computed(() => !props.unreadable && (props.resumeText || '').trim().length >= 20);

const displayText = computed(() => {
  const raw = (props.resumeText || '').trim();
  return raw ? prepareResumeTextForParsing(raw) : '';
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

const modalSubtitle = computed(() => {
  if (props.fileName) return props.fileName;
  return props.subtitle;
});
</script>

<template>
  <div
    class="resume-preview-launcher overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/60"
    :class="prominent ? 'resume-preview-launcher-prominent' : ''"
  >
    <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div class="min-w-0">
        <p class="text-sm font-medium text-slate-200">{{ title }}</p>
        <p class="mt-0.5 text-xs text-slate-500">
          <template v-if="unreadable">Re-upload PDF or .docx to preview.</template>
          <template v-else-if="hasContent">{{ scoreLabel }} · tap Preview for full layout</template>
          <template v-else>{{ emptyMessage }}</template>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <div v-if="hasContent && score > 0" class="text-right">
          <p class="text-lg font-bold leading-none" :class="scoreColor">{{ score }}</p>
        </div>
        <button
          type="button"
          class="resume-preview-tab"
          :disabled="!hasContent"
          @click="previewOpen = true"
        >
          Preview
        </button>
      </div>
    </div>

    <div v-if="hasContent && score > 0" class="px-4 pb-3">
      <div class="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div class="h-full rounded-full transition-all" :class="barColor" :style="{ width: `${Math.min(score, 100)}%` }" />
      </div>
    </div>

    <div v-if="hasContent && skills.length" class="flex flex-wrap gap-1.5 px-4 pb-3">
      <span v-for="skill in skills.slice(0, 8)" :key="skill" class="badge badge-teal text-xs">{{ skill }}</span>
      <span v-if="skills.length > 8" class="self-center text-xs text-slate-500">+{{ skills.length - 8 }} more</span>
    </div>

    <ResumePreviewModal
      v-model="previewOpen"
      :text="displayText"
      :title="title"
      :subtitle="modalSubtitle"
      :download-file-name="downloadFileName"
    />
  </div>
</template>
