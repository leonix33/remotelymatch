<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';
import FollowUpJobCard from '../components/FollowUpJobCard.vue';
import AtsKeywordScore from '../components/AtsKeywordScore.vue';
import {
  isKitReadyToApply,
  summaryFromKitPayload,
  READY_ATS_TARGET,
} from '../utils/kitReadiness';
import { useProfileStore } from '../stores/profile';

const profileStore = useProfileStore();
const MAX_POLISH_PASSES = 4;

const loading = ref(true);
const loadError = ref('');
const board = ref(null);
const filter = ref('all');
const visibleCount = ref(25);
const pageSize = 25;
const selectedId = ref('');
const copied = ref('');
const enriching = ref('');
const generating = ref('');
const polishing = ref('');
const reapplying = ref('');
const kitErrors = ref({});
const polishMsgs = ref({});
const actionMsgs = ref({});
const enrichmentTest = ref(null);
const testingEnrichment = ref(false);

const jobs = computed(() => board.value?.jobs || []);
const filteredJobs = computed(() => {
  if (filter.value === 'due') return jobs.value.filter((j) => j.followUpDue);
  if (filter.value === 'upcoming') return jobs.value.filter((j) => j.followUpUpcoming);
  return jobs.value;
});

const visibleJobs = computed(() => filteredJobs.value.slice(0, visibleCount.value));
const hasMoreJobs = computed(() => visibleCount.value < filteredJobs.value.length);
const dueFilterEmpty = computed(
  () => filter.value === 'due' && !filteredJobs.value.length && jobs.value.length > 0
);

function setFilter(next) {
  filter.value = next;
  visibleCount.value = pageSize;
}

async function runEnrichmentTest() {
  testingEnrichment.value = true;
  try {
    const sampleJob = jobs.value[0];
    const domain = sampleJob?.followUpKit?.companyDomain || undefined;
    const company = sampleJob?.company || undefined;
    const { data } = await http.post('/traction/enrichment/test', {
      domain,
      company,
    });
    enrichmentTest.value = data;
  } catch (e) {
    enrichmentTest.value = {
      hunter: { tested: false, ok: false, message: e.response?.data?.message || 'Test failed' },
      apollo: { tested: false, ok: false, message: e.response?.data?.message || 'Test failed' },
    };
  } finally {
    testingEnrichment.value = false;
  }
}

async function loadBoard() {
  loading.value = true;
  loadError.value = '';
  try {
    const { data } = await http.get('/traction/follow-up/board', { timeout: 120000 });
    board.value = data;
    if (data.summary?.dueNow > 0) {
      filter.value = 'due';
    } else {
      filter.value = 'all';
    }
    visibleCount.value = pageSize;
    if (!selectedId.value && data.jobs?.length) {
      const due = data.jobs.find((j) => j.followUpDue);
      selectedId.value = due?.jobId || data.jobs[0].jobId;
    }
    http.post('/traction/scan').catch(() => {});
    if (data.enrichment?.hunterConfigured || data.enrichment?.apolloConfigured) {
      runEnrichmentTest();
    }
  } catch (e) {
    loadError.value =
      e.response?.data?.message ||
      (e.code === 'ECONNABORTED' ? 'Request timed out — try Refresh' : 'Could not load follow-ups');
    board.value = null;
  } finally {
    loading.value = false;
  }
}

function selectJob(job) {
  selectedId.value = selectedId.value === job.jobId ? '' : job.jobId;
  if (selectedId.value === job.jobId) {
    kitErrors.value = { ...kitErrors.value, [job.jobId]: '' };
  }
}

async function copyText(value, label) {
  if (!value) return;
  await navigator.clipboard.writeText(value);
  copied.value = label;
  setTimeout(() => {
    copied.value = '';
  }, 2000);
}

async function markDone(job) {
  try {
    await http.post(`/traction/follow-up/${job.jobId}/done`, { notes: '' });
    job.followUpCompleted = true;
    job.followUpDue = false;
    await loadBoard();
  } catch (e) {
    kitErrors.value = {
      ...kitErrors.value,
      [job.jobId]: e.response?.data?.message || 'Could not mark complete',
    };
  }
}

function patchJobRow(jobId, patch) {
  const row = board.value?.jobs?.find((j) => j.jobId === jobId);
  if (row) Object.assign(row, patch);
}

function clearJobMsg(jobId) {
  kitErrors.value = { ...kitErrors.value, [jobId]: '' };
  polishMsgs.value = { ...polishMsgs.value, [jobId]: '' };
  actionMsgs.value = { ...actionMsgs.value, [jobId]: '' };
}

async function generateKit(job, force = false) {
  const jobId = job.jobId;
  selectedId.value = jobId;
  generating.value = jobId;
  clearJobMsg(jobId);
  try {
    const { data } = await http.get(`/traction/follow-up/${encodeURIComponent(jobId)}/kit`, {
      timeout: 120000,
      params: force ? { regenerate: '1' } : {},
    });
    patchJobRow(jobId, { followUpKit: data, hasFollowUpKit: true });
    actionMsgs.value = { ...actionMsgs.value, [jobId]: force ? 'Follow-up kit regenerated.' : 'Follow-up kit ready.' };
  } catch (e) {
    kitErrors.value = {
      ...kitErrors.value,
      [jobId]: e.response?.data?.message || 'Could not generate follow-up kit — check Profile email and try again.',
    };
  } finally {
    generating.value = '';
  }
}

async function polishKit(job) {
  const jobId = job.jobId;
  selectedId.value = jobId;
  polishing.value = jobId;
  clearJobMsg(jobId);
  const profile = profileStore.profile || {};
  let lastAts = -1;
  let lastJd = -1;
  try {
    for (let attempt = 0; attempt < MAX_POLISH_PASSES; attempt += 1) {
      const { data } = await http.post(`/applications/kit/${encodeURIComponent(jobId)}/generate`, {
        tailorResume: true,
        force: true,
        tailorMode: 'high_match',
        supplementPages: profile.defaultSupplementPages || 3,
        highMatchTarget: READY_ATS_TARGET,
      }, { timeout: 180000 });
      const kit = summaryFromKitPayload(data);
      patchJobRow(jobId, { kit });
      polishMsgs.value = {
        ...polishMsgs.value,
        [jobId]: `Pass ${attempt + 1}: ATS ${kit.atsScore ?? '—'}% · Fit ${kit.jdMatchPct ?? '—'}%`,
      };
      if (isKitReadyToApply(kit)) {
        polishMsgs.value = {
          ...polishMsgs.value,
          [jobId]: `Ready — ATS ${kit.atsScore}% · regenerating follow-up kit…`,
        };
        await generateKit(job, true);
        return;
      }
      const ats = kit.atsScore ?? 0;
      const jd = kit.jdMatchPct ?? 0;
      if (attempt > 0 && ats <= lastAts && jd <= lastJd) break;
      lastAts = ats;
      lastJd = jd;
    }
    const kit = board.value?.jobs?.find((j) => j.jobId === jobId)?.kit;
    polishMsgs.value = {
      ...polishMsgs.value,
      [jobId]: `Best: ATS ${kit?.atsScore ?? '—'}% — regenerate follow-up kit or reapply when ready.`,
    };
  } catch (e) {
    kitErrors.value = {
      ...kitErrors.value,
      [jobId]: e.response?.data?.message || 'Polish kit failed',
    };
  } finally {
    polishing.value = '';
  }
}

async function reapplyJob(job) {
  const jobId = job.jobId;
  if (!isKitReadyToApply(job.kit)) {
    kitErrors.value = {
      ...kitErrors.value,
      [jobId]: 'Polish your application kit to ATS 95%+ before reapplying.',
    };
    return;
  }
  reapplying.value = jobId;
  clearJobMsg(jobId);
  try {
    const { data } = await http.post(`/applications/${encodeURIComponent(jobId)}/reapply`, {
      useTailoredResume: true,
    }, { timeout: 180000 });
    actionMsgs.value = { ...actionMsgs.value, [jobId]: data.message || 'Reapplied.' };
    if (data.queued) {
      actionMsgs.value = {
        ...actionMsgs.value,
        [jobId]: `${data.message} Open the job posting or use your local agent to submit.`,
      };
    }
    await generateKit(job, true);
    await loadBoard();
  } catch (e) {
    kitErrors.value = {
      ...kitErrors.value,
      [jobId]: e.response?.data?.message || 'Reapply failed',
    };
  } finally {
    reapplying.value = '';
  }
}

async function enrichContacts(job) {
  enriching.value = job.jobId;
  try {
    const { data } = await http.post(`/traction/follow-up/${job.jobId}/enrich`);
    job.followUpKit = data;
    const row = board.value?.jobs?.find((j) => j.jobId === job.jobId);
    if (row) row.followUpKit = data;
  } finally {
    enriching.value = '';
  }
}

function openJob(job) {
  const url = job.url || job.followUpKit?.jobUrl;
  if (url) window.open(url, '_blank', 'noopener');
}

onMounted(() => {
  profileStore.fetch().catch(() => {});
  loadBoard();
});
</script>

<template>
  <div class="follow-up-hub min-h-[40vh]">
    <header class="follow-up-hero card p-6 sm:p-8">
      <p class="text-xs font-semibold uppercase tracking-widest text-teal-400">Interview traction</p>
      <h2 class="mt-2 text-2xl font-bold text-slate-50 sm:text-3xl">Follow-up command center</h2>
      <p class="mt-2 max-w-2xl text-sm text-slate-400">
        Every application gets a tailored follow-up email, recruiter contacts, call script, and a day-5 reminder —
        so you reach hiring managers, not just the ATS black hole.
      </p>

      <div v-if="board" class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="follow-up-stat">
          <p class="follow-up-stat__label">Applied</p>
          <p class="follow-up-stat__value">{{ board.summary?.total || 0 }}</p>
        </div>
        <div class="follow-up-stat follow-up-stat--due">
          <p class="follow-up-stat__label">Due now</p>
          <p class="follow-up-stat__value text-amber-300">{{ board.summary?.dueNow || 0 }}</p>
        </div>
        <div class="follow-up-stat">
          <p class="follow-up-stat__label">Reminder in 1–2 days</p>
          <p class="follow-up-stat__value text-teal-300">{{ board.summary?.upcoming || 0 }}</p>
        </div>
        <div class="follow-up-stat">
          <p class="follow-up-stat__label">Completed</p>
          <p class="follow-up-stat__value">{{ board.summary?.completed || 0 }}</p>
        </div>
      </div>

      <div
        v-if="board?.enrichment"
        class="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium text-slate-200">Recruiter enrichment</p>
          <button
            type="button"
            class="btn-secondary text-xs"
            :disabled="testingEnrichment"
            @click="runEnrichmentTest"
          >
            {{ testingEnrichment ? 'Testing…' : 'Test live' }}
          </button>
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div
            class="rounded-lg border px-3 py-2.5"
            :class="
              enrichmentTest?.hunter?.ok
                ? 'border-teal-800/60 bg-teal-950/30'
                : board.enrichment.hunterConfigured
                  ? 'border-amber-900/40 bg-amber-950/20'
                  : 'border-slate-800 bg-slate-900/40'
            "
          >
            <p class="text-xs font-semibold text-slate-300">Hunter.io</p>
            <p class="mt-1 text-sm" :class="board.enrichment.hunterConfigured ? 'text-teal-300' : 'text-slate-500'">
              {{ board.enrichment.hunterConfigured ? 'API key configured' : 'Not configured on server' }}
            </p>
            <p v-if="enrichmentTest?.hunter?.tested" class="mt-1 text-xs text-slate-400">
              {{ enrichmentTest.hunter.ok ? '✓' : '⚠' }} {{ enrichmentTest.hunter.message }}
            </p>
          </div>
          <div
            class="rounded-lg border px-3 py-2.5"
            :class="
              enrichmentTest?.apollo?.ok
                ? 'border-teal-800/60 bg-teal-950/30'
                : board.enrichment.apolloConfigured
                  ? 'border-amber-900/40 bg-amber-950/20'
                  : 'border-slate-800 bg-slate-900/40'
            "
          >
            <p class="text-xs font-semibold text-slate-300">Apollo.io</p>
            <p class="mt-1 text-sm" :class="board.enrichment.apolloConfigured ? 'text-teal-300' : 'text-slate-500'">
              {{ board.enrichment.apolloConfigured ? 'API key configured' : 'Not configured on server' }}
            </p>
            <p v-if="enrichmentTest?.apollo?.tested" class="mt-1 text-xs text-slate-400">
              {{ enrichmentTest.apollo.ok ? '✓' : '⚠' }} {{ enrichmentTest.apollo.message }}
            </p>
          </div>
        </div>
        <p v-if="enrichmentTest?.sampleDomain" class="mt-2 text-[11px] text-slate-600">
          Live test sample: {{ enrichmentTest.sampleCompany || 'company' }} · {{ enrichmentTest.sampleDomain }}
        </p>
      </div>

      <p v-if="board?.summary?.total > 20" class="mt-3 text-xs text-amber-200/90">
        {{ board.summary.total }} applications on file — use <strong class="text-amber-100">All applied</strong> or
        <strong class="text-amber-100">Due for follow-up</strong> to focus. Expand a role and click
        <strong class="text-amber-100">Generate follow-up kit</strong> for email drafts.
      </p>
    </header>

    <div class="mt-6 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="btn-secondary text-sm"
        :class="{ 'ring-1 ring-teal-500': filter === 'all' }"
        @click="setFilter('all')"
      >
        All applied
        <span v-if="board?.summary?.total" class="ml-1 text-slate-400">({{ board.summary.total }})</span>
      </button>
      <button
        type="button"
        class="btn-secondary text-sm"
        :class="{ 'ring-1 ring-amber-500': filter === 'due' }"
        @click="setFilter('due')"
      >
        Due for follow-up
        <span v-if="board?.summary?.dueNow" class="ml-1 text-amber-300">({{ board.summary.dueNow }})</span>
      </button>
      <button
        type="button"
        class="btn-secondary text-sm"
        :class="{ 'ring-1 ring-teal-500': filter === 'upcoming' }"
        @click="setFilter('upcoming')"
      >
        Upcoming
      </button>
      <button type="button" class="btn-secondary ml-auto text-sm" :disabled="loading" @click="loadBoard">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="loadError" class="card mt-6 border-amber-900/40 bg-amber-950/20 p-6 text-amber-200">
      <p class="font-medium">Could not load follow-ups</p>
      <p class="mt-1 text-sm text-amber-200/80">{{ loadError }}</p>
      <button type="button" class="btn-secondary mt-4 text-sm" @click="loadBoard">Try again</button>
    </div>

    <div v-else-if="loading" class="mt-8 text-slate-400">Loading your applications…</div>

    <div v-else-if="dueFilterEmpty" class="card mt-6 p-10 text-center">
      <p class="text-slate-300">No follow-ups due yet.</p>
      <p class="mt-2 text-sm text-slate-500">
        Reminders appear {{ board?.followUpDay || 5 }}+ days after you apply. You have
        <strong class="text-slate-300">{{ jobs.length }}</strong> applications on file.
      </p>
      <button type="button" class="btn-primary mt-5 text-sm" @click="setFilter('all')">Show all applications</button>
    </div>

    <div v-else-if="!filteredJobs.length" class="card mt-6 p-10 text-center text-slate-500">
      <p v-if="filter === 'upcoming'">Nothing scheduled in the next 2 days.</p>
      <p v-else>No submitted applications yet.</p>
      <RouterLink to="/" class="btn-primary mt-5 inline-block text-sm">Go to Apply</RouterLink>
    </div>

    <div v-else class="mt-6 space-y-4">
      <p class="text-xs text-slate-500">
        Showing {{ visibleJobs.length }} of {{ filteredJobs.length }}
        <span v-if="filter !== 'all'">({{ filter }} filter)</span>
      </p>
      <FollowUpJobCard
        v-for="job in visibleJobs"
        :key="job.jobId"
        :job="job"
        :selected="selectedId === job.jobId"
        :copied="copied"
        :generating="generating === job.jobId"
        :polishing="polishing === job.jobId"
        :reapplying="reapplying === job.jobId"
        :kit-error="kitErrors[job.jobId] || ''"
        :polish-msg="polishMsgs[job.jobId] || ''"
        :action-msg="actionMsgs[job.jobId] || ''"
        @select="selectJob"
        @copy="copyText"
        @mark-done="markDone"
        @open-job="openJob"
        @enrich="enrichContacts"
        @generate="generateKit"
        @polish="polishKit"
        @reapply="reapplyJob"
      />

      <div v-if="hasMoreJobs" class="text-center">
        <button type="button" class="btn-secondary text-sm" @click="visibleCount += pageSize">
          Show more ({{ filteredJobs.length - visibleCount }} remaining)
        </button>
      </div>

      <div v-if="selectedId && jobs.find((j) => j.jobId === selectedId)?.ats" class="card p-5">
        <AtsKeywordScore :job-id="selectedId" />
      </div>
    </div>

    <p class="mt-8 text-center text-xs text-slate-600">
      Tip: Expand a job → <strong class="text-slate-400">Polish kit for apply</strong> →
      <strong class="text-slate-400">Regenerate follow-up kit</strong> →
      <strong class="text-slate-400">Reapply</strong> when ATS is 95%+.
    </p>
  </div>
</template>
