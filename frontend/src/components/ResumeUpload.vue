<script setup>
import { computed, ref } from 'vue';
import mammoth from 'mammoth';
import { useProfileStore } from '../stores/profile';
import ResumePreview from './ResumePreview.vue';
import {
  formatResumeUploadError,
  isUnreadableResumeText,
  isZipDocxFile,
} from '../utils/resumeText';
import { normalizeResumeLayout } from '../utils/resumeLayout';
import { prepareResumeTextForParsing } from '../utils/resumeRepair';

const props = defineProps({
  modelValue: { type: String, default: '' },
  showPreview: { type: Boolean, default: true },
  applyToProfile: { type: Boolean, default: false },
  mergeSkills: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'parsed', 'error', 'cleared']);

const profileStore = useProfileStore();
const parsing = ref(false);
const fileName = ref('');
const parseSummary = ref(null);
const localError = ref('');
const saveWarning = ref('');

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function extractDocxText(file) {
  if (!(await isZipDocxFile(file))) {
    throw new Error('This is not a valid .docx file. Save as .docx from Word or export as PDF.');
  }
  const arrayBuffer = await file.arrayBuffer();
  const { value, messages } = await mammoth.extractRawText({ arrayBuffer });
  const text = prepareResumeTextForParsing(value || '');
  if (!text && messages?.length) {
    throw new Error('Word file opened but no text was found. Try PDF or paste your resume.');
  }
  return text;
}

const MAX_RESUME_BYTES = 8 * 1024 * 1024;

const savedResumeUnreadable = computed(
  () => profileStore.profile?.resumeUnreadable || isUnreadableResumeText(props.modelValue)
);

function buildParseSummary(result, resumeText) {
  return {
    skills: result.extractedSkills?.all?.length || profileStore.extractedSkills?.length || 0,
    words: result.wordCount || resumeText.split(/\s+/).filter(Boolean).length,
    score: result.resumeScore ?? profileStore.resumeScore,
    mustHave: result.extractedSkills?.mustHave || [],
    niceToHave: result.extractedSkills?.niceToHave || [],
    suggestedHeadline: result.suggestedHeadline || '',
    suggestedTitles: result.suggestedTitles || [],
  };
}

async function applyLocalResume(resumeText, meta = {}) {
  emit('update:modelValue', resumeText);
  parseSummary.value = {
    skills: profileStore.extractedSkills?.length || 0,
    words: resumeText.split(/\s+/).filter(Boolean).length,
    score: profileStore.resumeScore || 0,
    mustHave: [],
    niceToHave: [],
    suggestedHeadline: '',
    suggestedTitles: [],
    ...meta,
  };
}

async function clearCorruptResume() {
  localError.value = '';
  saveWarning.value = '';
  parsing.value = true;
  try {
    await profileStore.clearResume();
    emit('update:modelValue', '');
    parseSummary.value = null;
    fileName.value = '';
    emit('cleared');
  } catch (e) {
    localError.value = formatResumeUploadError(e);
  } finally {
    parsing.value = false;
  }
}

async function saveDocxResume(file, resumeText) {
  applyLocalResume(resumeText);
  saveWarning.value = '';

  if (!props.applyToProfile) {
    emit('parsed', { resumeText, extractedSkills: { all: profileStore.extractedSkills } });
    return;
  }

  try {
    const profile = await profileStore.saveResumeText(resumeText, { resumeFileName: file.name });
    parseSummary.value = buildParseSummary({ resumeScore: profile.resumeScore }, resumeText);
    emit('parsed', {
      resumeText,
      extractedSkills: { all: profile.extractedSkills || [] },
      resumeScore: profile.resumeScore,
    });
  } catch {
    saveWarning.value =
      'Resume text loaded here but the server could not save yet. Wait 30 seconds and click Save resume, or paste the text below.';
    emit('parsed', { resumeText, extractedSkills: { all: [] } });
  }
}

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
  saveWarning.value = '';
  parseSummary.value = null;
  parsing.value = true;
  fileName.value = file.name;

  try {
    if (lowerName.endsWith('.docx')) {
      const resumeText = await extractDocxText(file);
      if (isUnreadableResumeText(resumeText)) {
        throw new Error('Could not read this Word file. Try PDF or paste your resume text below.');
      }
      try {
        await saveDocxResume(file, resumeText);
      } catch (e) {
        localError.value = formatResumeUploadError(e);
        emit('error', localError.value);
      }
      return;
    }

    if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.text')) {
      const resumeText = prepareResumeTextForParsing((await file.text()).trim());
      if (isUnreadableResumeText(resumeText)) {
        throw new Error('Could not read this file. Paste your resume text instead.');
      }
      await saveDocxResume(file, resumeText);
      return;
    }

    const fileBase64 = await fileToBase64(file);
    const result = await profileStore.parseResume({
      fileBase64,
      filename: file.name,
      applyToProfile: props.applyToProfile,
      mergeSkills: props.mergeSkills,
    });
    if (isUnreadableResumeText(result.resumeText)) {
      throw new Error('Could not extract readable text from this PDF. Paste your resume text instead.');
    }
    emit('update:modelValue', result.resumeText);
    parseSummary.value = buildParseSummary(result, result.resumeText);
    emit('parsed', result);
  } catch (e) {
    localError.value = formatResumeUploadError(e);
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

const previewText = computed(() => {
  if (savedResumeUnreadable.value) return '';
  return props.modelValue || profileStore.profile?.resumeText || '';
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
        {{ parsing ? 'Reading resume…' : fileName || 'Upload resume (PDF, .docx, .txt, .md)' }}
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
    <p v-if="saveWarning" class="text-sm text-amber-300">{{ saveWarning }}</p>
    <div
      v-if="savedResumeUnreadable"
      class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-200"
    >
      <p>Your saved resume is broken file data, not readable text. Clear it and upload again.</p>
      <button type="button" class="btn-secondary mt-3 text-xs" :disabled="parsing" @click="clearCorruptResume">
        Clear broken resume
      </button>
    </div>

    <ResumePreview
      v-if="showPreview"
      :resume-text="previewText"
      :score="savedResumeUnreadable ? 0 : (parseSummary?.score ?? profileStore.resumeScore)"
      :skills="previewSkills"
      :file-name="fileName"
      :unreadable="savedResumeUnreadable"
    />
  </div>
</template>
