<script setup>
import { ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';

const props = defineProps({
  job: { type: Object, required: true },
  expanded: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle']);

const insight = ref(null);
const followUp = ref(null);
const loading = ref(false);
const followUpLoading = ref(false);
const error = ref('');

function callbackClass(score) {
  if (score >= 40) return 'text-amber-300';
  if (score >= 25) return 'text-teal-300';
  if (score >= 15) return 'text-slate-300';
  return 'text-slate-500';
}

function callbackLabel(tier) {
  if (tier === 'high') return 'Strong callback signal';
  if (tier === 'good') return 'Good callback signal';
  if (tier === 'moderate') return 'Moderate callback signal';
  return 'Low callback signal';
}

async function loadInsight() {
  if (!props.job?.jobId || insight.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await http.get(`/jobs/${props.job.jobId}/interview-insight`);
    insight.value = data;
  } catch {
    error.value = 'Could not load interview insights.';
  } finally {
    loading.value = false;
  }
}

async function loadFollowUp() {
  if (!props.job?.jobId || followUp.value) return;
  followUpLoading.value = true;
  try {
    const { data } = await http.get(`/traction/follow-up/${props.job.jobId}/kit`);
    followUp.value = data;
  } catch {
    followUp.value = {
      emailSubject: `Following up — ${props.job.title}`,
      emailBody: `Hi — I applied for the ${props.job.title} role at ${props.job.company} and wanted to follow up.`,
    };
  } finally {
    followUpLoading.value = false;
  }
}

watch(
  () => props.expanded,
  (open) => {
    if (open) loadInsight();
  },
  { immediate: true }
);
</script>

<template>
  <div v-if="expanded" class="mt-3 border-t border-slate-800 pt-3 text-sm">
    <div v-if="loading" class="text-slate-500">Loading interview intelligence…</div>
    <p v-else-if="error" class="text-amber-300">{{ error }}</p>

    <div v-else-if="insight" class="space-y-4">
      <!-- 1. Recruiter Callback Score -->
      <section>
        <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Recruiter callback score</h4>
        <p class="mt-1">
          <span class="text-lg font-bold" :class="callbackClass(insight.recruiterCallbackScore)">
            {{ insight.recruiterCallbackScore }}%
          </span>
          <span class="ml-2 text-slate-400">{{ callbackLabel(insight.callbackTier) }}</span>
        </p>
        <ul v-if="insight.whyThisJob?.factors?.length" class="mt-2 space-y-1 text-xs text-slate-500">
          <li v-for="(f, i) in insight.whyThisJob.factors.slice(0, 4)" :key="i">• {{ f.label }}</li>
        </ul>
      </section>

      <!-- 2. Why this job -->
      <section v-if="insight.whyThisJob?.strengths?.length || insight.whyThisJob?.summary">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Why this job</h4>
        <p v-if="insight.whyThisJob.summary" class="mt-1 text-slate-300">{{ insight.whyThisJob.summary }}</p>
        <ul v-if="insight.whyThisJob.strengths?.length" class="mt-2 space-y-1 text-slate-400">
          <li v-for="(s, i) in insight.whyThisJob.strengths" :key="i">✓ {{ s }}</li>
        </ul>
      </section>

      <!-- 3. Resume gap analysis -->
      <section v-if="insight.resumeGaps?.missing?.length || insight.resumeGaps?.keywordsToAdd?.length">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Resume gap analysis</h4>
        <ul v-if="insight.resumeGaps.missing?.length" class="mt-2 space-y-1 text-amber-200/90">
          <li v-for="(g, i) in insight.resumeGaps.missing" :key="i">△ {{ g }}</li>
        </ul>
        <p v-if="insight.resumeGaps.keywordsToAdd?.length" class="mt-2 text-xs text-slate-500">
          Keywords to weave in: {{ insight.resumeGaps.keywordsToAdd.join(', ') }}
        </p>
      </section>

      <!-- 4. Tailored resume bullets -->
      <section v-if="insight.tailoredBullets?.length">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Tailored resume bullets
          <span v-if="!insight.hasKit" class="font-normal normal-case text-slate-600">(from your resume — full tailor on apply)</span>
        </h4>
        <ul class="mt-2 space-y-1.5 text-slate-300">
          <li v-for="(b, i) in insight.tailoredBullets" :key="i" class="rounded-lg bg-slate-900/60 px-2 py-1.5 text-xs leading-relaxed">
            {{ b }}
          </li>
        </ul>
      </section>

      <!-- 5. Follow-up message generator -->
      <section>
        <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Follow-up message</h4>
        <button
          v-if="!followUp"
          type="button"
          class="mt-2 text-xs text-teal-400 hover:underline"
          :disabled="followUpLoading"
          @click="loadFollowUp"
        >
          {{ followUpLoading ? 'Generating…' : 'Generate follow-up draft' }}
        </button>
        <div v-else class="mt-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs">
          <p class="font-medium text-slate-300">{{ followUp.emailSubject }}</p>
          <p class="mt-2 whitespace-pre-wrap text-slate-400">{{ followUp.emailBody }}</p>
          <RouterLink :to="`/follow-ups?job=${job.jobId}`" class="mt-2 inline-block text-teal-400 hover:underline">
            Open in Follow-ups →
          </RouterLink>
        </div>
      </section>

      <!-- 6 & 7. Outcome tracker + learning loop -->
      <section class="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Learning from your replies</h4>
        <p class="mt-1 text-xs text-slate-400">{{ insight.learningLoop?.note }}</p>
        <p v-if="insight.learningLoop?.sampleSize >= 3" class="mt-1 text-xs text-teal-400/80">
          Your reply rate: {{ insight.learningLoop.userReplyRatePct }}%
          <span v-if="insight.learningLoop.sourceReplyRatePct != null">
            · {{ insight.source || 'This source' }}: {{ insight.learningLoop.sourceReplyRatePct }}%
          </span>
        </p>
        <RouterLink
          :to="{ path: '/outcomes', query: { jobId: job.jobId, title: job.title, company: job.company } }"
          class="mt-2 inline-block text-xs text-teal-400 hover:underline"
        >
          Log outcome after you apply →
        </RouterLink>
      </section>
    </div>
  </div>
</template>
