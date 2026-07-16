<script setup>
import { computed, ref, watch } from 'vue';
import ResumeDocumentPreview from './ResumeDocumentPreview.vue';
import { prepareTailoredResumeForDisplay } from '../utils/resumeRepair';
import { parseResumeHeader } from '../utils/resumeDocument';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  text: { type: String, default: '' },
  title: { type: String, default: 'Resume preview' },
  subtitle: { type: String, default: '' },
  downloadFileName: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue']);

const copied = ref(false);
let copiedTimer = null;

const displayText = computed(() => {
  const raw = (props.text || '').trim();
  // Text is already prepared by TailoredResumePreview; only light normalize again.
  return raw ? prepareTailoredResumeForDisplay(raw) : '';
});

const downloadName = computed(() => {
  if (props.downloadFileName) return props.downloadFileName;
  const header = parseResumeHeader(displayText.value.split('\n').slice(0, 12));
  const safe = (header.name || 'resume').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').toLowerCase();
  return `${safe || 'resume'}.txt`;
});

function close() {
  emit('update:modelValue', false);
}

async function copyResume() {
  if (!displayText.value) return;
  await navigator.clipboard.writeText(displayText.value);
  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function downloadResume() {
  if (!displayText.value) return;
  const blob = new Blob([displayText.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = downloadName.value;
  anchor.click();
  URL.revokeObjectURL(url);
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) copied.value = false;
  }
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="resume-preview-modal fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @click.self="close"
    >
      <div class="resume-preview-modal-panel card flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden sm:max-h-[92vh] sm:rounded-2xl">
        <div class="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
          <div class="min-w-0 flex-1">
            <h3 class="font-semibold text-slate-100">{{ title }}</h3>
            <p v-if="subtitle" class="mt-0.5 text-xs text-slate-500">{{ subtitle }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="btn-secondary text-xs sm:text-sm" :disabled="!displayText" @click="copyResume">
              {{ copied ? 'Copied!' : 'Copy' }}
            </button>
            <button type="button" class="btn-secondary text-xs sm:text-sm" :disabled="!displayText" @click="downloadResume">
              Download
            </button>
            <button type="button" class="btn-secondary text-xs sm:text-sm" @click="close">Close</button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
          <ResumeDocumentPreview v-if="displayText" :text="displayText" scale="full" />
          <p v-else class="py-8 text-center text-sm text-slate-500">No resume content to preview.</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
