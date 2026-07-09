<script setup>
defineProps({
  job: { type: Object, required: true },
  showFactors: { type: Boolean, default: false },
});

const matchPct = (job) => {
  const v = job.personalMatchPct ?? job.matchPct;
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

function likelihoodClass(pct) {
  if (pct >= 40) return 'badge-gold';
  if (pct >= 25) return 'badge-teal';
  if (pct >= 15) return 'text-slate-300 border border-slate-600';
  return 'badge-slate';
}

function likelihoodLabel(tier) {
  if (tier === 'high') return 'High callback chance';
  if (tier === 'good') return 'Good callback chance';
  if (tier === 'moderate') return 'Moderate callback';
  return 'Low callback';
}

function postedLabel(job) {
  return job.postedAgeLabel || null;
}

function trustLabel(job) {
  return job.employerTrustLabel || (job.isDirectEmployer ? 'Direct employer' : null);
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span v-if="trustLabel(job)" class="badge badge-teal" :title="trustLabel(job)">
      {{ trustLabel(job) }}
    </span>
    <span v-if="postedLabel(job)" class="badge badge-slate">
      {{ postedLabel(job) }}
    </span>
    <span class="badge badge-teal" v-if="matchPct(job) != null">{{ matchPct(job) }}% match</span>
    <span
      v-if="job.interviewLikelihoodPct != null"
      class="badge"
      :class="likelihoodClass(job.interviewLikelihoodPct)"
      :title="likelihoodLabel(job.likelihoodTier)"
    >
      {{ job.interviewLikelihoodPct }}% callback score
    </span>
  </div>
  <ul v-if="showFactors && job.likelihoodFactors?.length" class="mt-2 space-y-1 text-xs text-slate-500">
    <li v-for="(f, i) in job.likelihoodFactors" :key="i">• {{ f.label }}</li>
  </ul>
</template>
