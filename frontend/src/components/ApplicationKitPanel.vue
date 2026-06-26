<script setup>
import { ref, watch } from 'vue';
import http from '../api/http';
import TailoredResumePreview from './TailoredResumePreview.vue';

const props = defineProps({
  job: { type: Object, required: true },
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'updated']);

const loading = ref(false);
const generating = ref(false);
const savingPref = ref(false);
const error = ref('');
const prefMsg = ref('');
const kit = ref(null);
const tailor = ref(true);
const useForApply = ref(true);
const tailorFocus = ref('');
const supplementPages = ref(3);
const tailorMode = ref('balanced');
const viewTab = ref('preview');

async function loadKit() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await http.get(`/applications/kit/${encodeURIComponent(props.job.jobId)}`);
    kit.value = data;
    useForApply.value = data.useForApply !== false;
    tailorFocus.value = data.tailorFocus || '';
    supplementPages.value = data.supplementPagesTarget || data.pageCount || 3;
    tailorMode.value = data.tailorMode === 'high_match' ? 'high_match' : 'balanced';
  } catch {
    kit.value = null;
    useForApply.value = true;
    tailorFocus.value = '';
    supplementPages.value = 3;
    tailorMode.value = 'balanced';
  } finally {
    loading.value = false;
  }
}

async function generate() {
  generating.value = true;
  error.value = '';
  prefMsg.value = '';
  try {
    const { data } = await http.post(`/applications/kit/${encodeURIComponent(props.job.jobId)}/generate`, {
      tailorResume: tailor.value,
      force: true,
      tailorFocus: tailorFocus.value.trim(),
      supplementPages: supplementPages.value,
      tailorMode: tailorMode.value,
      highMatchTarget: 90,
    });
    kit.value = data;
    useForApply.value = data.useForApply !== false;
    supplementPages.value = data.supplementPagesTarget || data.pageCount || supplementPages.value;
    tailorMode.value = data.tailorMode || tailorMode.value;
    emit('updated', data);
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not generate application kit';
  } finally {
    generating.value = false;
  }
}

async function savePreference() {
  if (!kit.value?.tailored) return;
  savingPref.value = true;
  prefMsg.value = '';
  error.value = '';
  try {
    const { data } = await http.patch(`/applications/kit/${encodeURIComponent(props.job.jobId)}/preference`, {
      useForApply: useForApply.value,
      tailorFocus: tailorFocus.value.trim(),
      supplementPages: supplementPages.value,
      tailorMode: tailorMode.value,
    });
    kit.value = { ...kit.value, ...data };
    prefMsg.value = useForApply.value
      ? 'This tailored kit will be used when you apply.'
      : 'Base resume only for this job — kit saved for reference.';
    emit('updated', data);
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not save preference';
  } finally {
    savingPref.value = false;
  }
}

async function copyText(text) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function appliedLabel(k) {
  if (!k) return '';
  if (k.applied || k.applicationStatus === 'submitted') return `Applied${k.submittedAt ? ` · ${formatDate(k.submittedAt)}` : ''}`;
  if (k.applicationStatus) return `Status: ${k.applicationStatus.replace(/-/g, ' ')}`;
  if (k.approvalStatus === 'approved') return 'Approved — not applied yet';
  return 'Not applied yet';
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      kit.value = null;
      viewTab.value = 'preview';
      loadKit();
    }
  }
);
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="emit('close')">
    <div class="card max-h-[90vh] w-full max-w-4xl overflow-y-auto p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="font-semibold text-slate-100">Tailored application kit</h3>
          <p class="mt-1 text-sm text-slate-400">{{ job.title }} · {{ job.company }}</p>
          <p v-if="kit?.generatedAt" class="mt-1 text-xs text-slate-600">Generated {{ formatDate(kit.generatedAt) }}</p>
        </div>
        <button type="button" class="btn-secondary text-sm" @click="emit('close')">Close</button>
      </div>

      <div
        v-if="kit"
        class="mt-3 rounded-lg border px-3 py-2 text-xs"
        :class="kit.applied ? 'border-teal-800/60 bg-teal-950/30 text-teal-200' : 'border-slate-800 bg-slate-950/40 text-slate-400'"
      >
        {{ appliedLabel(kit) }}
      </div>

      <p class="mt-3 rounded-lg border border-teal-900/40 bg-teal-950/20 px-3 py-2 text-xs text-teal-100/90">
        Your base resume is <strong class="text-teal-200">never rewritten</strong>. Review the supplement below, choose whether to
        <strong class="text-teal-200">use it when applying</strong>, or re-tailor with notes for this specific role.
      </p>

      <div v-if="kit?.tailored" class="mt-4 flex gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-sm"
          :class="viewTab === 'preview' ? 'bg-teal-500/20 text-teal-200' : 'text-slate-400 hover:text-slate-200'"
          @click="viewTab = 'preview'"
        >
          Preview
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-sm"
          :class="viewTab === 'settings' ? 'bg-teal-500/20 text-teal-200' : 'text-slate-400 hover:text-slate-200'"
          @click="viewTab = 'settings'"
        >
          Use / re-tailor
        </button>
      </div>

      <div v-if="viewTab === 'settings' || !kit?.tailored" class="mt-4 space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div v-if="kit?.tailored" class="space-y-3">
          <p class="text-sm font-medium text-slate-200">When applying to this job</p>
          <label class="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
            <input v-model="useForApply" type="radio" :value="true" class="mt-0.5 accent-teal-500" name="use-kit" />
            <span>
              <strong class="text-slate-100">Use tailored kit</strong>
              <span class="mt-0.5 block text-xs text-slate-500">Cover letter + 3-page supplement attached on auto-apply</span>
            </span>
          </label>
          <label class="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
            <input v-model="useForApply" type="radio" :value="false" class="mt-0.5 accent-teal-500" name="use-kit" />
            <span>
              <strong class="text-slate-100">Base resume only</strong>
              <span class="mt-0.5 block text-xs text-slate-500">Keep kit for reference but don't send it with this application</span>
            </span>
          </label>
          <button type="button" class="btn-secondary text-sm" :disabled="savingPref" @click="savePreference">
            {{ savingPref ? 'Saving…' : 'Save apply preference' }}
          </button>
          <p v-if="prefMsg" class="text-xs text-teal-300">{{ prefMsg }}</p>
        </div>

        <div>
          <label class="mb-1 block text-sm text-slate-400">Target length (pages)</label>
          <div class="flex items-center gap-3">
            <input v-model.number="supplementPages" type="range" min="1" max="6" class="flex-1 accent-teal-500" />
            <span class="w-16 text-sm text-slate-300">{{ supplementPages }} page{{ supplementPages > 1 ? 's' : '' }}</span>
          </div>
        </div>

        <div>
          <p class="mb-2 text-sm text-slate-400">How closely to match the job description</p>
          <label class="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
            <input v-model="tailorMode" type="radio" value="balanced" class="mt-0.5 accent-teal-500" name="tailor-mode" />
            <span>
              <strong class="text-slate-100">Balanced</strong>
              <span class="mt-0.5 block text-xs text-slate-500">Natural wording with strong skill alignment.</span>
            </span>
          </label>
          <label class="mt-2 flex cursor-pointer items-start gap-2 text-sm text-slate-300">
            <input v-model="tailorMode" type="radio" value="high_match" class="mt-0.5 accent-teal-500" name="tailor-mode" />
            <span>
              <strong class="text-slate-100">High match</strong>
              <span class="mt-0.5 block text-xs text-slate-500">Uses the employer's wording where it fits your real experience.</span>
            </span>
          </label>
        </div>

        <div>
          <label class="mb-1 block text-sm text-slate-400">Re-tailor notes (optional)</label>
          <textarea
            v-model="tailorFocus"
            rows="3"
            class="input text-sm"
            placeholder="e.g. Emphasize Databricks platform work, downplay legacy VMware, highlight on-call SRE experience for this staff role…"
          />
          <p class="mt-1 text-xs text-slate-600">These notes steer the next generation for this specific job.</p>
        </div>

        <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input v-model="tailor" type="checkbox" class="accent-teal-500" />
          Tailor resume for this job
        </label>

        <button class="btn-primary text-sm" :disabled="generating" @click="generate">
          {{ generating ? 'Generating…' : kit?.tailored ? 'Re-tailor for this role' : 'Generate kit' }}
        </button>
      </div>

      <div v-if="viewTab === 'preview' && kit?.tailored" class="mt-4 flex flex-wrap gap-2">
        <button v-if="kit.coverLetterParagraph" class="btn-secondary text-sm" @click="copyText(kit.coverLetterParagraph)">
          Copy cover letter
        </button>
        <button v-if="kit.tailoredResumeText || kit.fullSupplementText" class="btn-secondary text-sm" @click="copyText(kit.tailoredResumeText || kit.fullSupplementText)">
          Copy tailored resume
        </button>
        <button v-if="kit.formatted" class="btn-secondary text-sm" @click="copyText(kit.formatted)">
          Copy full kit
        </button>
      </div>

      <p v-if="error" class="mt-3 text-sm text-red-300">{{ error }}</p>
      <p v-if="loading" class="mt-4 text-sm text-slate-400">Loading…</p>

      <div v-else-if="kit && !kit.tailored && viewTab === 'preview'" class="mt-4 text-sm text-slate-400">
        {{ kit.message || 'No kit yet — switch to Use / re-tailor to generate.' }}
      </div>

      <div v-else-if="kit?.tailored && viewTab === 'preview'" class="mt-5">
        <TailoredResumePreview :kit="kit" />
      </div>
    </div>
  </div>
</template>
