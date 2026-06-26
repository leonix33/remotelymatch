<script setup>
import { computed, ref } from 'vue';
import { useProfileStore } from '../stores/profile';
import ResumePreview from './ResumePreview.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  showPreview: { type: Boolean, default: true },
  applyToProfile: { type: Boolean, default: false },
  mergeSkills: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'parsed', 'error']);

const profileStore = useProfileStore();
const parsing = ref(false);
const fileName = ref('');
const parseSummary = ref(null);
const localError = ref('');

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

const MAX_RESUME_BYTES = 8 * 1024 * 1024;

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const lowerName = file.name.toLowerCase();
  const allowed =
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.text');
  if (!allowed) {
    localError.value = 'Use PDF, .docx, .txt, or .md — or paste your resume text below.';
    emit('error', localError.value);
    event.target.value = '';
    return;
  }

  if (lowerName.endsWith('.doc')) {
    localError.value = 'Legacy .doc is not supported. Save as .docx or PDF and try again.';
    emit('error', localError.value);
    event.target.value = '';
    return;
  }

  if (file.size > MAX_RESUME_BYTES) {
    localError.value = 'Resume must be 8 MB or smaller. Try a shorter PDF or paste text instead.';
    emit('error', localError.value);
    event.target.value = '';
    return;
  }

  localError.value = '';
  parseSummary.value = null;
  parsing.value = true;
  fileName.value = file.name;

  try {
    const fileBase64 = await fileToBase64(file);
    const result = await profileStore.parseResume({
      fileBase64,
      filename: file.name,
      applyToProfile: props.applyToProfile,
      mergeSkills: props.mergeSkills,
    });

    emit('update:modelValue', result.resumeText);
    parseSummary.value = {
      skills: result.extractedSkills?.all?.length || 0,
      words: result.wordCount || 0,
      score: result.resumeScore ?? profileStore.resumeScore,
      mustHave: result.extractedSkills?.mustHave || [],
      niceToHave: result.extractedSkills?.niceToHave || [],
      suggestedHeadline: result.suggestedHeadline || '',
      suggestedTitles: result.suggestedTitles || [],
    };
    emit('parsed', result);
  } catch (e) {
    localError.value = e.response?.data?.message || e.message || 'Could not parse resume';
    emit('error', localError.value);
  } finally {
    parsing.value = false;
    event.target.value = '';
  }
}

const previewSkills = computed(() => {
  if (parseSummary.value?.mustHave?.length) {
    return [...parseSummary.value.mustHave, ...(parseSummary.value.niceToHave || [])];
  }
  return profileStore.extractedSkills;
});
</script>

<template>
  <div class="space-y-3">
    <label
      class="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/40 px-4 py-6 transition hover:border-teal-600/50 hover:bg-slate-800/60"
      :class="parsing ? 'pointer-events-none opacity-70' : ''"
    >
      <span class="text-2xl">{{ parsing ? '⏳' : '📄' }}</span>
      <span class="mt-2 text-sm font-medium text-slate-300">
        {{ parsing ? 'Parsing resume…' : fileName || 'Upload resume (PDF, .docx, .txt, .md)' }}
      </span>
      <span class="mt-1 text-xs text-slate-500">PDF, Word (.docx), .txt, or .md · max 8 MB</span>
      <input
        type="file"
        accept=".pdf,.docx,.txt,.md,.text,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        class="hidden"
        :disabled="parsing"
        @change="handleFile"
      />
    </label>

    <p v-if="localError" class="text-sm text-red-300">{{ localError }}</p>
    <p
      v-else-if="profileStore.profile?.resumeUnreadable"
      class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
    >
      Your saved resume looks like a broken file upload (not readable text). Re-upload as PDF or .docx.
    </p>

    <ResumePreview
      v-if="showPreview"
      :resume-text="modelValue || profileStore.profile?.resumeText || ''"
      :score="parseSummary?.score ?? profileStore.resumeScore"
      :skills="previewSkills"
      :file-name="fileName"
    />
  </div>
</template>
