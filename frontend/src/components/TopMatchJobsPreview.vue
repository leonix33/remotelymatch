<script setup>
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';
import JobScoreBadges from './JobScoreBadges.vue';
import JobInterviewInsight from './JobInterviewInsight.vue';

const props = defineProps({
  limit: { type: Number, default: 5 },
  minMatch: { type: Number, default: null },
  refreshKey: { type: Number, default: 0 },
  compact: { type: Boolean, default: false },
});

const jobs = ref([]);
const loading = ref(true);
const error = ref('');
const expandedJobId = ref(null);

function toggleInsight(jobId) {
  expandedJobId.value = expandedJobId.value === jobId ? null : jobId;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const floor = props.minMatch != null ? props.minMatch : 50;
    const { data: approvalData } = await http.get('/approvals', {
      params: { status: 'pending', sort: 'match', limit: props.limit, minMatch: floor, offset: 0 },
    });
    jobs.value = approvalData?.items || [];
    if (!jobs.value.length) {
      const { data: jobData } = await http.get('/jobs', {
        params: { limit: props.limit, offset: 0, minMatch: floor },
      });
      jobs.value = jobData?.jobs || [];
    }
  } catch {
    error.value = 'Could not load job matches yet — try again in a moment.';
    jobs.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => [props.refreshKey, props.limit, props.minMatch], load);
onMounted(load);

defineExpose({ refresh: load });
</script>

<template>
  <div>
    <div v-if="loading" class="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-500">
      Finding your best matches across all job boards…
    </div>

    <p v-else-if="error" class="text-sm text-amber-300">{{ error }}</p>

    <p v-else-if="!jobs.length" class="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-500">
      No matches yet — we're refreshing listings. You can still apply and we'll queue the best roles as they arrive.
    </p>

    <ul v-else class="space-y-2">
      <li
        v-for="job in jobs"
        :key="job.jobId"
        class="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
        :class="compact ? 'text-sm' : ''"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="font-medium text-slate-100">{{ job.title }}</p>
            <p class="text-slate-400">{{ job.company }}</p>
            <p v-if="job.source && !compact" class="mt-0.5 text-xs text-slate-600">{{ job.source }}</p>
          </div>
          <JobScoreBadges :job="job" :show-factors="expandedJobId === job.jobId" />
        </div>
        <button
          v-if="!compact"
          type="button"
          class="mt-2 text-xs text-teal-400 hover:underline"
          @click="toggleInsight(job.jobId)"
        >
          {{ expandedJobId === job.jobId ? 'Hide insights' : 'Why this job & callback score' }}
        </button>
        <JobInterviewInsight
          v-if="!compact"
          :job="job"
          :expanded="expandedJobId === job.jobId"
        />
      </li>
    </ul>

    <p v-if="jobs.length && !loading" class="mt-3 text-xs text-slate-500">
      Tailored resumes are generated for each role when you apply.
      <RouterLink to="/jobs" class="text-teal-400 hover:underline">Browse all jobs</RouterLink>
    </p>
  </div>
</template>
