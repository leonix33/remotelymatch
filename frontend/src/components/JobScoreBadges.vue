<script setup>
defineProps({
  job: { type: Object, required: true },
  showFactors: { type: Boolean, default: false },
});

const matchPct = (job) => {
  const v = job.personalMatchPct ?? job.matchPct;
  return v != null && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null;
};

function likelihoodClass(pct) {
  if (pct >= 40) return 'badge-gold';
  if (pct >= 25) return 'badge-teal';
  if (pct >= 15) return 'text-slate-300 border border-slate-600';
  return 'badge-slate';
}

function likelihoodLabel(tier) {
  if (tier === 'high') return 'High reply chance';
  if (tier === 'good') return 'Good reply chance';
  if (tier === 'moderate') return 'Moderate';
  return 'Low';
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span class="badge badge-teal" v-if="matchPct(job) != null">{{ matchPct(job) }}% match</span>
    <span
      v-if="job.interviewLikelihoodPct != null"
      class="badge"
      :class="likelihoodClass(job.interviewLikelihoodPct)"
      :title="likelihoodLabel(job.likelihoodTier)"
    >
      {{ job.interviewLikelihoodPct }}% interview likelihood
    </span>
  </div>
  <ul v-if="showFactors && job.likelihoodFactors?.length" class="mt-2 space-y-1 text-xs text-slate-500">
    <li v-for="(f, i) in job.likelihoodFactors" :key="i">• {{ f.label }}</li>
  </ul>
</template>
