<script setup>
import { computed, ref, watch } from 'vue';
import http from '../api/http';

const props = defineProps({
  jobId: { type: String, required: true },
  refreshKey: { type: Number, default: 0 },
  compact: { type: Boolean, default: false },
});

const loading = ref(false);
const ats = ref(null);
const error = ref('');

const scoreClass = computed(() => {
  const s = ats.value?.score ?? 0;
  if (s >= 95) return 'text-teal-300';
  if (s >= 80) return 'text-amber-300';
  return 'text-red-300';
});

const statusLabel = {
  green: 'Matched',
  yellow: 'Partial',
  red: 'Missing',
};

async function load() {
  if (!props.jobId) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await http.get(`/applications/kit/${encodeURIComponent(props.jobId)}/ats-score`);
    ats.value = data;
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not score keywords';
    ats.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => [props.jobId, props.refreshKey], load, { immediate: true });
</script>

<template>
  <div class="ats-keyword-panel" :class="{ 'ats-keyword-panel--compact': compact }">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-medium text-slate-200">ATS keyword alignment</p>
      <p v-if="ats" class="text-sm font-semibold" :class="scoreClass">
        {{ ats.score }}%
        <span class="font-normal text-slate-500">/ target {{ ats.targetScore || 95 }}%</span>
      </p>
    </div>

    <p v-if="loading" class="mt-2 text-xs text-slate-500">Analyzing job description vs resume…</p>
    <p v-else-if="error" class="mt-2 text-xs text-red-300">{{ error }}</p>

    <template v-else-if="ats">
      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        <span class="ats-pill ats-pill--green">{{ ats.green }} matched</span>
        <span class="ats-pill ats-pill--yellow">{{ ats.yellow }} partial</span>
        <span class="ats-pill ats-pill--red">{{ ats.red }} missing</span>
      </div>

      <p v-if="ats.readyToSubmit" class="mt-3 text-xs text-teal-300">
        Strong ATS fit — good to submit after a quick read-through.
      </p>
      <p v-else class="mt-3 text-xs text-amber-300">
        Regenerate with <strong>ATS high match</strong> to close red gaps before submitting.
      </p>

      <div v-if="!compact && ats.breakdown?.length" class="mt-4 max-h-52 overflow-auto">
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="row in ats.breakdown"
            :key="row.term"
            class="ats-term"
            :class="`ats-term--${row.status}`"
            :title="statusLabel[row.status]"
          >{{ row.term }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
