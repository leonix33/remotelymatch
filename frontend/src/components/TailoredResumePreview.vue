<script setup>
import { computed } from 'vue';
import ResumeDocumentPreview from './ResumeDocumentPreview.vue';
import { prepareResumeTextForParsing } from '../utils/resumeRepair';

const props = defineProps({
  kit: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  prominent: { type: Boolean, default: false },
});

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
</script>

<template>
  <div>
    <div v-if="loading" class="py-6 text-center text-sm text-slate-500">Loading tailored resume…</div>

    <div
      v-else-if="!kit?.tailored"
      class="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-sm text-slate-500"
    >
      Select a job below or apply with tailoring enabled to preview your resume for that role.
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span
          class="rounded-full px-2 py-0.5 font-medium"
          :class="kit.useForApply !== false ? 'bg-teal-500/15 text-teal-300' : 'bg-slate-800 text-slate-400'"
        >
          {{ kit.useForApply !== false ? 'Will submit this version' : 'Saved only' }}
        </span>
        <span v-if="kit.atsScore != null" class="rounded-full px-2 py-0.5 font-medium" :class="kit.recruiterReady ? 'bg-teal-500/15 text-teal-300' : 'bg-amber-500/15 text-amber-300'">
          ATS {{ kit.atsScore }}%<span v-if="kit.jdMatchPct != null"> · Fit {{ kit.jdMatchPct }}%</span>
        </span>
        <span v-if="kit.pageCount">{{ kit.pageCount }} page{{ kit.pageCount === 1 ? '' : 's' }}</span>
        <span v-if="kit.jobTitle">{{ kit.jobTitle }} · {{ kit.company }}</span>
      </div>

      <div v-if="resumeText" class="mt-5">
        <div>
          <p class="text-sm font-medium text-slate-200">Tailored resume</p>
          <p class="mt-1 text-xs text-slate-500">
            Same professional layout as your base resume — tight bullets, no keyword stuffing.
          </p>
        </div>

        <p v-if="kit.resumeStructure?.sectionHeadings?.length" class="mt-2 text-xs text-slate-600">
          Sections: {{ kit.resumeStructure.sectionHeadings.join(' · ') }}
        </p>

        <ResumeDocumentPreview
          class="mt-4"
          :class="prominent ? 'resume-preview-prominent' : ''"
          :text="resumeText"
          :scale="prominent ? 'full' : 'fit'"
        />
      </div>

      <ul v-if="kit.atsTips?.length && !compact" class="mt-3 space-y-1 text-xs text-slate-500">
        <li v-for="(tip, i) in kit.atsTips" :key="i">{{ tip }}</li>
      </ul>

      <div v-if="kit.coverLetterParagraph && !compact" class="mt-5">
        <p class="text-sm font-medium text-slate-200">Cover letter</p>
        <div class="resume-cover-letter mt-2">
          <p class="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{{ kit.coverLetterParagraph }}</p>
        </div>
      </div>
    </template>
  </div>
</template>
