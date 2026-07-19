<script setup>
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';
import JobScoreBadges from './JobScoreBadges.vue';
import JobInterviewInsight from './JobInterviewInsight.vue';
import { useJobApprove } from '../composables/useJobApprove';

const props = defineProps({
  limit: { type: Number, default: 5 },
  minMatch: { type: Number, default: null },
  minCallback: { type: Number, default: null },
  refreshKey: { type: Number, default: 0 },
  compact: { type: Boolean, default: false },
  showApprove: { type: Boolean, default: true },
});

const emit = defineEmits(['approved', 'skipped']);

const jobs = ref([]);
const loading = ref(true);
const error = ref('');
const expandedJobId = ref(null);
const approvedLocally = ref(new Set());
const skippedLocally = ref(new Set());

const { acting, actionMessage, actionError, approveJob, approveAndApplyJob, skipJob } = useJobApprove();

function toggleInsight(jobId) {
  expandedJobId.value = expandedJobId.value === jobId ? null : jobId;
}

function jobStatus(job) {
  if (approvedLocally.value.has(job.jobId)) return 'approved';
  if (skippedLocally.value.has(job.jobId)) return 'rejected';
  return job.status || 'pending';
}

async function loadApprovalStatuses() {
  try {
    const { data } = await http.get('/approvals', {
      params: { status: 'all', limit: 500, offset: 0, minMatch: 0 },
    });
    const items = data?.items || [];
    return {
      approved: new Set(items.filter((j) => j.status === 'approved').map((j) => j.jobId)),
      rejected: new Set(items.filter((j) => j.status === 'rejected').map((j) => j.jobId)),
    };
  } catch {
    return { approved: new Set(), rejected: new Set() };
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  actionMessage.value = '';
  actionError.value = '';
  try {
    const floor = props.minMatch != null ? props.minMatch : 40;
    const callbackFloor = props.minCallback != null ? props.minCallback : 25;
    const approvalParams = {
      status: 'pending',
      sort: 'match',
      limit: props.limit,
      minMatch: floor,
      offset: 0,
    };
    if (callbackFloor > 0) approvalParams.minCallback = callbackFloor;

    const statuses = await loadApprovalStatuses();
    let rows = [];
    try {
      const { data: approvalData } = await http.get('/approvals', { params: approvalParams });
      rows = approvalData?.items || [];
    } catch (e) {
      console.warn('approvals load failed, falling back to /jobs', e);
    }

    if (!rows.length) {
      const jobParams = { limit: props.limit * 2, offset: 0, minMatch: floor };
      const { data: jobData } = await http.get('/jobs', { params: jobParams });
      rows = (jobData?.jobs || []).filter(
        (j) => !statuses.approved.has(j.jobId) && !statuses.rejected.has(j.jobId)
      );
    }

    jobs.value = rows.slice(0, props.limit);
    approvedLocally.value = new Set();
    skippedLocally.value = new Set();
    if (!jobs.value.length) {
      error.value = '';
    }
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not load job matches yet — try again in a moment.';
    jobs.value = [];
  } finally {
    loading.value = false;
  }
}

async function onApprove(job) {
  const ok = await approveJob(job, { tailorResume: true });
  if (!ok) return;
  approvedLocally.value = new Set([...approvedLocally.value, job.jobId]);
  jobs.value = jobs.value.filter((j) => j.jobId !== job.jobId);
  emit('approved', job);
}

async function onApproveAndApply(job) {
  const ok = await approveAndApplyJob(job, { tailorResume: true, useTailoredResume: true, autoApply: true });
  if (!ok) return;
  approvedLocally.value = new Set([...approvedLocally.value, job.jobId]);
  jobs.value = jobs.value.filter((j) => j.jobId !== job.jobId);
  emit('approved', job);
}

async function onSkip(job) {
  const ok = await skipJob(job);
  if (!ok) return;
  skippedLocally.value = new Set([...skippedLocally.value, job.jobId]);
  jobs.value = jobs.value.filter((j) => j.jobId !== job.jobId);
  emit('skipped', job);
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

    <p v-else-if="!jobs.length && !actionMessage" class="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-500">
      No matches yet for your profile — we're refreshing listings across all fields. You can finish setup and browse jobs from the dashboard.
    </p>

    <template v-else>
      <p v-if="actionMessage" class="mb-3 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ actionMessage }}</p>
      <p v-if="actionError" class="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ actionError }}</p>

      <ul v-if="jobs.length" class="space-y-2">
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
            <p v-if="job.source" class="mt-0.5 text-xs" :class="compact ? 'text-slate-600' : 'text-teal-400/70'">
              via {{ job.source }}
            </p>
          </div>
          <JobScoreBadges :job="job" :show-factors="expandedJobId === job.jobId" />
        </div>

        <div
          v-if="showApprove && !compact"
          class="mt-3 flex flex-wrap items-center gap-2"
        >
          <button
            v-if="jobStatus(job) !== 'approved'"
            type="button"
            class="btn-primary min-h-[44px] px-5 text-sm font-semibold"
            :disabled="acting === job.jobId"
            @click="onApproveAndApply(job)"
          >
            {{ acting === job.jobId ? 'Applying…' : 'Approve & apply' }}
          </button>
          <button
            v-if="jobStatus(job) !== 'approved'"
            type="button"
            class="btn-secondary min-h-[44px] px-4 text-sm"
            :disabled="acting === job.jobId"
            @click="onApprove(job)"
          >
            Approve only
          </button>
          <RouterLink
            v-else
            to="/approvals"
            class="badge badge-teal min-h-[44px] inline-flex items-center px-3"
          >
            In queue ✓
          </RouterLink>
          <button
            v-if="jobStatus(job) === 'pending'"
            type="button"
            class="min-h-[44px] px-3 text-sm text-slate-500 hover:text-slate-300"
            :disabled="acting === job.jobId"
            @click="onSkip(job)"
          >
            Skip
          </button>
          <a
            v-if="job.url"
            :href="job.url"
            target="_blank"
            rel="noopener"
            class="min-h-[44px] inline-flex items-center px-2 text-xs text-slate-500 hover:text-teal-400"
          >
            View posting
          </a>
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

      <p v-if="jobs.length" class="mt-3 text-xs text-slate-500">
        <strong class="text-slate-400">Approve &amp; apply</strong> submits in one step.
        Use <strong class="text-slate-400">Approve only</strong> if you want to batch apply from step 3 or the Queue.
        <RouterLink to="/approvals" class="text-teal-400 hover:underline">Open queue</RouterLink>
        ·
        <RouterLink to="/jobs" class="text-teal-400 hover:underline">Browse all jobs</RouterLink>
      </p>
    </template>
  </div>
</template>
