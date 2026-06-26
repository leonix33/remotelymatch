<script setup>
import { computed } from 'vue';

const props = defineProps({
  kit: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
});

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

    <div v-else-if="!kit?.tailored" class="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
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

      <p v-if="kit.contactEmail" class="mt-3 text-xs text-slate-400">
        {{ kit.contactName || 'You' }} · {{ kit.contactEmail }}
      </p>

      <div v-if="resumeText" class="mt-5">
        <p class="text-sm font-medium text-slate-200">Tailored resume</p>
        <p class="mt-1 text-xs text-slate-500">Same structure as your original — credentials and certificates kept, wording aligned to the job.</p>
        <pre class="custom-scrollbar mt-3 max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-700/80 bg-white/[0.03] p-5 font-sans text-sm leading-relaxed text-slate-200">{{ resumeText }}</pre>
      </div>

      <div v-if="kit.coverLetterParagraph && !compact" class="mt-5">
        <p class="text-sm font-medium text-slate-200">Cover letter</p>
        <div class="custom-scrollbar mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-4">
          <p class="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{{ kit.coverLetterParagraph }}</p>
        </div>
      </div>
    </template>
  </div>
</template>
