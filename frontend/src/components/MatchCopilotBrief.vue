<script setup>
import { computed, onMounted, ref } from 'vue';
import http from '../api/http';
import { useProfileStore } from '../stores/profile';

const props = defineProps({
  jobId: { type: String, required: true },
  compact: { type: Boolean, default: false },
});

const profileStore = useProfileStore();
const loading = ref(false);
const error = ref('');
const result = ref(null);

const analysis = computed(() => result.value?.analysis || null);
const isDemo = computed(() => Boolean(result.value?.demo));

const profileLine = computed(() => {
  const p = profileStore.profile;
  if (!p) return '';
  const name = p.applicantName || p.displayName || 'Candidate';
  const roles = (p.targetTitles || []).slice(0, 3).join(', ');
  return `Name: ${name}${roles ? ` Target roles: ${roles}` : ''}`;
});

function verdictClass(verdict) {
  if (verdict === 'strong') return 'text-teal-200';
  if (verdict === 'good') return 'text-emerald-200';
  if (verdict === 'stretch') return 'text-amber-200';
  return 'text-slate-300';
}

async function load() {
  if (!props.jobId || result.value) return;
  loading.value = true;
  error.value = '';
  try {
    if (!profileStore.loaded) await profileStore.fetch().catch(() => {});
    const { data } = await http.get(`/intelligence/match/${encodeURIComponent(props.jobId)}`);
    result.value = data;
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not load match analysis';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

defineExpose({ reload: load });
</script>

<template>
  <div class="match-copilot-brief mt-2 rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2 text-sm">
    <p v-if="loading" class="text-xs text-slate-500">Analyzing fit…</p>
    <p v-else-if="error" class="text-xs text-red-300/90">{{ error }}</p>
    <template v-else-if="analysis">
      <p v-if="isDemo" class="text-xs leading-relaxed text-teal-300/95">
        [Demo mode — add your OpenAI API key in Profile → AI Integration]
      </p>
      <p v-if="isDemo && profileLine" class="mt-1 text-xs text-teal-300/80">PROFILE: {{ profileLine }}</p>
      <p v-else-if="analysis.oneLiner && !compact" class="text-xs leading-relaxed text-teal-300">
        {{ analysis.oneLiner }}
      </p>
      <p class="mt-1">
        <span class="text-slate-500">Verdict:</span>
        <span class="font-medium" :class="verdictClass(analysis.verdict)">
          {{ analysis.verdict }} ({{ analysis.matchPct }}%)
        </span>
      </p>
      <p v-if="analysis.strengths?.length">
        <span class="text-slate-500">Strengths:</span>
        <span class="text-slate-200">{{ analysis.strengths.join(', ') }}</span>
      </p>
      <p v-if="!compact && analysis.gaps?.length" class="mt-0.5">
        <span class="text-slate-500">Gaps:</span>
        <span class="text-slate-400">{{ analysis.gaps.join(', ') }}</span>
      </p>
      <ul v-if="!compact && analysis.talkingPoints?.length" class="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-400">
        <li v-for="(point, i) in analysis.talkingPoints" :key="i">{{ point }}</li>
      </ul>
    </template>
  </div>
</template>
