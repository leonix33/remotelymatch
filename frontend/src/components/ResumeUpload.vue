<script setup>
import { computed, ref } from 'vue';
import { useProfileStore } from '../stores/profile';
import ResumePreview from './ResumePreview.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  showPreview: { type: Boolean, default: true },
  applyToProfile: { type: Boolean, default: false },
  mergeSkills: { type: Boolean, default: true },
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
        {{ parsing ? 'Parsing resume…' : fileName || 'Upload resume (PDF, .txt, .md)' }}
      </span>
      <span class="mt-1 text-xs text-slate-500">PDF, .txt, or .md · max 8 MB</span>
      <input
        type="file"
        accept=".pdf,.txt,.md,.text,application/pdf"
        class="hidden"
        :disabled="parsing"
        @change="handleFile"
      />
    </label>

    <p v-if="localError" class="text-sm text-red-300">{{ localError }}</p>

    <ResumePreview
      v-if="showPreview"
      :resume-text="modelValue || profileStore.profile?.resumeText || ''"
      :score="parseSummary?.score ?? profileStore.resumeScore"
      :skills="previewSkills"
      :file-name="fileName"
    />
  </div>
</template>
