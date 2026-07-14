<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import http from '../api/http';
import { useProfileStore } from '../stores/profile';
import { enqueueMatchAnalysis } from '../utils/matchAnalysisQueue';

const props = defineProps({
  jobId: { type: String, required: true },
  job: { type: Object, default: null },
  compact: { type: Boolean, default: false },
  lazy: { type: Boolean, default: false },
});

const profileStore = useProfileStore();
const loading = ref(false);
const error = ref('');
const result = ref(null);
const rootEl = ref(null);
let observer = null;

const analysis = computed(() => result.value?.analysis || previewAnalysis.value || null);
const isDemo = computed(() => Boolean(result.value?.demo));
const usedFallback = computed(() => Boolean(result.value?.fallback));

const profileLine = computed(() => {
  const p = profileStore.profile;
  if (!p) return '';
  const name = p.applicantName || p.displayName || 'Candidate';
  const roles = (p.targetTitles || []).slice(0, 3).join(', ');
  return `Name: ${name}${roles ? ` Target roles: ${roles}` : ''}`;
});

const previewAnalysis = computed(() => {
  if (!props.job) return null;
  const matchPct = Number(props.job.matchPct ?? props.job.personalMatchPct ?? 0) || 0;
  const strengths = (props.job.strengths || []).filter(Boolean).slice(0, 4);
  const gaps = (props.job.gaps || []).filter(Boolean).slice(0, 3);
  return {
    matchPct,
    verdict: matchPct >= 80 ? 'strong' : matchPct >= 65 ? 'good' : matchPct >= 50 ? 'stretch' : 'weak',
    strengths: strengths.length ? strengths : ['Skill overlap from your profile'],
    gaps: gaps.length ? gaps : [],
    talkingPoints: [],
    oneLiner: `${props.job.title} at ${props.job.company} — ${matchPct}% match.`,
  };
});

function verdictClass(verdict) {
  if (verdict === 'strong') return 'text-teal-200';
  if (verdict === 'good') return 'text-emerald-200';
  if (verdict === 'stretch') return 'text-amber-200';
  return 'text-slate-300';
}

async function load() {
  if (!props.jobId || result.value || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    if (!profileStore.loaded) await profileStore.fetch().catch(() => {});
    const { data } = await enqueueMatchAnalysis(() =>
      http.get(`/intelligence/match/${encodeURIComponent(props.jobId)}`, { timeout: 45000 })
    );
    result.value = data;
  } catch (e) {
    if (previewAnalysis.value) {
      result.value = { analysis: previewAnalysis.value, fallback: true };
      error.value = '';
    } else {
      error.value = e.response?.data?.message || 'Could not load match analysis';
    }
  } finally {
    loading.value = false;
  }
}

function setupLazyLoad() {
  if (!props.lazy || !rootEl.value) {
    load();
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        load();
        observer?.disconnect();
        observer = null;
      }
    },
    { rootMargin: '120px' }
  );
  observer.observe(rootEl.value);
}

onMounted(() => {
  if (props.lazy) setupLazyLoad();
  else load();
});

onBeforeUnmount(() => {
  observer?.disconnect();
});

defineExpose({ reload: load });
</script>

<template>
  <div
    ref="rootEl"
    class="match-copilot-brief mt-2 rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2 text-sm"
  >
    <p v-if="loading && !analysis" class="text-xs text-slate-500">Analyzing fit…</p>
    <p v-else-if="error" class="text-xs text-red-300/90">{{ error }}</p>
    <template v-else-if="analysis">
      <p v-if="isDemo" class="text-xs leading-relaxed text-teal-300/95">
        [Demo mode — add your OpenAI API key in Profile → AI Integration]
      </p>
      <p v-if="isDemo && profileLine" class="mt-1 text-xs text-teal-300/80">PROFILE: {{ profileLine }}</p>
      <p v-else-if="analysis.oneLiner && !compact" class="text-xs leading-relaxed text-teal-300">
        {{ analysis.oneLiner }}
      </p>
      <p v-if="usedFallback && !isDemo" class="text-xs text-slate-500">Skill-match summary (AI brief unavailable)</p>
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
