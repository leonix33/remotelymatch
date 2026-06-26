<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';
import TailoredResumePreview from './TailoredResumePreview.vue';

const props = defineProps({
  refreshKey: { type: Number, default: 0 },
  preferredJobId: { type: String, default: '' },
  seedKits: { type: Array, default: () => [] },
});

const kits = ref([]);
const selectedJobId = ref('');
const kitDetail = ref(null);
const listLoading = ref(true);
const detailLoading = ref(false);
const error = ref('');

function kitListItem(kit) {
  return {
    jobId: kit.jobId,
    jobTitle: kit.jobTitle || kit.title || 'Job',
    company: kit.company || 'Unknown',
    pageCount: kit.pageCount || kit.supplementPages?.length || 0,
    tailorMode: kit.tailorMode || 'balanced',
    estimatedMatchPct: kit.estimatedMatchPct,
    useForApply: kit.useForApply,
    generatedAt: kit.generatedAt,
  };
}

function mergeSeedKits(seedList) {
  if (!seedList?.length) return;
  const byId = new Map(kits.value.map((k) => [k.jobId, k]));
  for (const kit of seedList) {
    if (!kit?.jobId || !kit.tailored) continue;
    byId.set(kit.jobId, kitListItem(kit));
  }
  kits.value = Array.from(byId.values()).sort(
    (a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0)
  );
}

function applyPreferredSelection() {
  const preferred = props.preferredJobId || props.seedKits[0]?.jobId || kits.value[0]?.jobId || '';
  if (preferred && kits.value.some((k) => k.jobId === preferred)) {
    selectedJobId.value = preferred;
  } else if (!selectedJobId.value && kits.value.length) {
    selectedJobId.value = kits.value[0].jobId;
  }
}

function setDetailFromSeed(jobId) {
  const seeded = props.seedKits.find((k) => k.jobId === jobId && k.tailored);
  if (seeded) {
    kitDetail.value = seeded;
    return true;
  }
  return false;
}

async function loadKits() {
  listLoading.value = true;
  error.value = '';
  try {
    const { data } = await http.get('/applications/kits');
    kits.value = Array.isArray(data) ? data : [];
    mergeSeedKits(props.seedKits);
    applyPreferredSelection();
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not load tailored resumes';
    mergeSeedKits(props.seedKits);
    applyPreferredSelection();
  } finally {
    listLoading.value = false;
  }
}

async function loadKitDetail(jobId) {
  if (!jobId) {
    kitDetail.value = null;
    return;
  }
  if (setDetailFromSeed(jobId)) return;

  detailLoading.value = true;
  try {
    const { data } = await http.get(`/applications/kit/${encodeURIComponent(jobId)}`);
    kitDetail.value = data;
  } catch {
    kitDetail.value = props.seedKits.find((k) => k.jobId === jobId) || null;
  } finally {
    detailLoading.value = false;
  }
}

const hasPreview = computed(() => Boolean(kitDetail.value?.tailored));

watch(selectedJobId, (id) => {
  loadKitDetail(id);
});

watch(
  () => props.refreshKey,
  () => {
    loadKits().then(() => {
      if (selectedJobId.value) loadKitDetail(selectedJobId.value);
    });
  }
);

watch(
  () => props.seedKits,
  (seedList) => {
    if (!seedList?.length) return;
    mergeSeedKits(seedList);
    applyPreferredSelection();
    if (selectedJobId.value) loadKitDetail(selectedJobId.value);
  },
  { deep: true }
);

watch(
  () => props.preferredJobId,
  (id) => {
    if (!id) return;
    selectedJobId.value = id;
    loadKitDetail(id);
  }
);

onMounted(async () => {
  mergeSeedKits(props.seedKits);
  await loadKits();
  if (selectedJobId.value) await loadKitDetail(selectedJobId.value);
});

defineExpose({ refresh: loadKits });
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="font-semibold text-slate-100">Tailored resume preview</h3>
        <p class="mt-1 text-sm text-slate-500">Review the resume version for each job before you submit.</p>
      </div>
      <button type="button" class="btn-secondary text-sm" :disabled="listLoading" @click="loadKits">
        {{ listLoading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <p v-if="error" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>

    <div v-if="listLoading && !kits.length" class="mt-6 text-sm text-slate-500">Loading tailored resumes…</div>

    <div v-else-if="!kits.length" class="mt-5 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center">
      <p class="text-sm text-slate-400">No tailored resumes yet.</p>
      <p class="mt-2 text-xs text-slate-500">
        Apply with <strong class="text-slate-400">Tailored resume</strong> selected — your resume for each job appears here after apply finishes.
      </p>
    </div>

    <template v-else>
      <div class="mt-5">
        <label class="mb-1 block text-sm text-slate-400">Preview for job</label>
        <select v-model="selectedJobId" class="input w-full text-sm sm:max-w-md">
          <option v-for="k in kits" :key="k.jobId" :value="k.jobId">
            {{ k.jobTitle }} · {{ k.company }}
            ({{ k.pageCount }}p{{ k.tailorMode === 'high_match' ? ' · high-match' : '' }})
          </option>
        </select>
      </div>

      <div class="mt-5 rounded-xl border border-violet-900/30 bg-violet-950/10 p-4">
        <TailoredResumePreview :kit="kitDetail" :loading="detailLoading && !hasPreview" />
      </div>

      <p class="mt-4 text-xs text-slate-500">
        <RouterLink to="/tailored-resumes" class="text-teal-400 hover:underline">View all tailored resumes</RouterLink>
        ·
        <RouterLink to="/approvals" class="text-teal-400 hover:underline">Apply queue</RouterLink>
      </p>
    </template>
  </div>
</template>
