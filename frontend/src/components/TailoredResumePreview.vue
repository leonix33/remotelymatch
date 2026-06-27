<script setup>
import { computed, ref } from 'vue';
import ResumeDocumentPreview from './ResumeDocumentPreview.vue';

const props = defineProps({
  kit: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  prominent: { type: Boolean, default: false },
});

const viewMode = ref('document');

const resumeText = computed(() => {
  const k = props.kit;
  if (!k) return '';
  return (
    k.tailoredResumeText ||
    k.fullSupplementText ||
    k.supplementPages?.map((p) => p.content).join('\n\n') ||
    k.formatted ||
    ''
  );
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
        <span v-if="kit.pageCount">{{ kit.pageCount }} page{{ kit.pageCount === 1 ? '' : 's' }}</span>
        <span v-if="kit.jobTitle">{{ kit.jobTitle }} · {{ kit.company }}</span>
      </div>

      <div v-if="resumeText" class="mt-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-slate-200">Tailored resume</p>
            <p class="mt-1 text-xs text-slate-500">
              Professional layout — centered name, section headers, and your original structure.
            </p>
          </div>
          <div class="flex rounded-lg border border-slate-700 bg-slate-900/60 p-0.5 text-xs">
            <button
              type="button"
              class="rounded-md px-3 py-1.5 transition"
              :class="viewMode === 'document' ? 'bg-teal-500/20 text-teal-200' : 'text-slate-500 hover:text-slate-300'"
              @click="viewMode = 'document'"
            >
              Document
            </button>
            <button
              type="button"
              class="rounded-md px-3 py-1.5 transition"
              :class="viewMode === 'plain' ? 'bg-teal-500/20 text-teal-200' : 'text-slate-500 hover:text-slate-300'"
              @click="viewMode = 'plain'"
            >
              Plain text
            </button>
          </div>
        </div>

        <p v-if="kit.resumeStructure?.sectionHeadings?.length" class="mt-2 text-xs text-slate-600">
          Sections: {{ kit.resumeStructure.sectionHeadings.join(' · ') }}
        </p>

        <ResumeDocumentPreview
          v-if="viewMode === 'document'"
          class="mt-4"
          :class="prominent ? 'resume-preview-prominent' : ''"
          :text="resumeText"
          :scale="prominent ? 'full' : 'fit'"
        />

        <pre
          v-else
          class="custom-scrollbar mt-4 max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-700/80 bg-white/[0.03] p-5 font-sans text-sm leading-relaxed text-slate-200"
        >{{ resumeText }}</pre>
      </div>

      <div v-if="kit.coverLetterParagraph && !compact" class="mt-5">
        <p class="text-sm font-medium text-slate-200">Cover letter</p>
        <div class="resume-cover-letter mt-2">
          <p class="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{{ kit.coverLetterParagraph }}</p>
        </div>
      </div>
    </template>
  </div>
</template>
