<script setup>
import { computed, ref } from 'vue';
import ResumePreviewModal from './ResumePreviewModal.vue';
import { prepareResumeTextForParsing } from '../utils/resumeRepair';

const props = defineProps({
  kit: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  prominent: { type: Boolean, default: false },
});

const previewOpen = ref(false);

const resumeText = computed(() => {
  const k = props.kit;
  if (!k) return '';
  const raw =
    k.tailoredResumeText ||
    k.fullSupplementText ||
    k.supplementPages?.map((p) => p.content).join('\n\n') ||
    k.formatted ||
    '';
  return raw ? prepareResumeTextForParsing(raw) : '';
});

const previewTitle = computed(() => {
  if (props.kit?.jobTitle) return `Tailored resume · ${props.kit.jobTitle}`;
  return 'Tailored resume preview';
});

const previewSubtitle = computed(() => {
  const parts = [];
  if (props.kit?.company) parts.push(props.kit.company);
  if (props.kit?.atsScore != null) parts.push(`ATS ${props.kit.atsScore}%`);
  if (props.kit?.jdMatchPct != null) parts.push(`Fit ${props.kit.jdMatchPct}%`);
  if (props.kit?.pageCount) parts.push(`${props.kit.pageCount} page${props.kit.pageCount === 1 ? '' : 's'}`);
  return parts.join(' · ') || 'Same professional layout as your base resume';
});

const downloadFileName = computed(() => {
  const company = (props.kit?.company || 'role').replace(/[^\w.-]+/g, '-').toLowerCase();
  return `tailored-resume-${company}.txt`;
});
</script>

<template>
  <div>
    <div v-if="loading" class="py-4 text-center text-sm text-slate-500">Loading tailored resume…</div>

    <div
      v-else-if="!kit?.tailored"
      class="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-5 text-center text-sm text-slate-500"
    >
      Select a job below or apply with tailoring enabled to preview your resume for that role.
    </div>

    <template v-else>
      <div class="resume-preview-launcher overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/60">
        <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-slate-200">{{ previewTitle }}</p>
            <p class="mt-0.5 text-xs text-slate-500">{{ previewSubtitle }}</p>
          </div>
          <button
            type="button"
            class="resume-preview-tab"
            :disabled="!resumeText"
            @click="previewOpen = true"
          >
            Preview
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2 px-4 pb-3">
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="kit.useForApply !== false ? 'bg-teal-500/15 text-teal-300' : 'bg-slate-800 text-slate-400'"
          >
            {{ kit.useForApply !== false ? 'Will submit this version' : 'Saved only' }}
          </span>
          <span
            v-if="kit.atsScore != null"
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="kit.recruiterReady ? 'bg-teal-500/15 text-teal-300' : 'bg-amber-500/15 text-amber-300'"
          >
            ATS {{ kit.atsScore }}%<span v-if="kit.jdMatchPct != null"> · Fit {{ kit.jdMatchPct }}%</span>
          </span>
        </div>
      </div>

      <ul v-if="kit.atsTips?.length && !compact" class="mt-3 space-y-1 text-xs text-slate-500">
        <li v-for="(tip, i) in kit.atsTips" :key="i">{{ tip }}</li>
      </ul>

      <div v-if="kit.coverLetterParagraph && !compact" class="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <p class="text-sm font-medium text-slate-200">Cover letter</p>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-400">{{ kit.coverLetterParagraph }}</p>
      </div>

      <ResumePreviewModal
        v-model="previewOpen"
        :text="resumeText"
        :title="previewTitle"
        :subtitle="previewSubtitle"
        :download-file-name="downloadFileName"
      />
    </template>
  </div>
</template>
