<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import http from '../api/http';
import { formatApplyEmailNotice } from '../utils/applyEmailMessage';
import ApplyWorkflowBanner from '../components/ApplyWorkflowBanner.vue';
import ApplicationKitPanel from '../components/ApplicationKitPanel.vue';
import JobScoreBadges from '../components/JobScoreBadges.vue';
import KitReadinessBadges from '../components/KitReadinessBadges.vue';
import KitJdComparePanel from '../components/KitJdComparePanel.vue';
import MatchCopilotBrief from '../components/MatchCopilotBrief.vue';
import JobInterviewInsight from '../components/JobInterviewInsight.vue';
import {
  isKitReadyToApply,
  summaryFromKitPayload,
  READY_ATS_TARGET,
  READY_ATS_MIN,
} from '../utils/kitReadiness';
import { formatApiError } from '../utils/formatApiError';
import { useProfileStore } from '../stores/profile';
import { useAuthStore } from '../stores/auth';
import { buildLinkedInSearchFromJob, isLinkedInJob, isLinkedInUrl, openLinkedIn } from '../utils/linkedin';

const profileStore = useProfileStore();
const auth = useAuthStore();
const isAdmin = computed(() => auth.isAdmin);
const route = useRoute();

const items = ref([]);
const total = ref(0);
const counts = ref({ pending: 0, approved: 0, rejected: 0 });
const loading = ref(true);
const acting = ref('');
const bulkActing = ref(false);
const status = ref('pending');
const error = ref('');
const whisper = ref([]);
const whisperLoading = ref(false);
const applying = ref(false);
const applyMessage = ref('');
const applyEmailNotice = ref('');
const tailorOnApprove = ref(false);
const applyResumeMode = ref('base');
const kitJob = ref(null);
const kitOpen = ref(false);
const highlightJobId = ref('');
const queueBanner = ref('');

const search = ref('');
const minMatch = ref('');
const ats = ref('all');
const page = ref(1);
const pageSize = 25;
const selected = ref(new Set());
const polishing = ref('');
const expandedInsightJobId = ref(null);

function toggleInsight(jobId) {
  expandedInsightJobId.value = expandedInsightJobId.value === jobId ? null : jobId;
}
const polishMsg = ref('');
const compareJobId = ref('');
const applyAnywayIds = ref(new Set());

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const allSelected = computed(
  () => items.value.length > 0 && items.value.every((j) => selected.value.has(j.jobId))
);
function canApplyJob(job, force = false) {
  if (force || applyAnywayIds.value.has(job.jobId)) return true;
  if (applyResumeMode.value === 'base') return true;
  return isKitReadyToApply(job.kit);
}

const approvedReadyCount = computed(() => {
  if (status.value !== 'approved') return 0;
  return items.value.filter((j) => j.status === 'approved' && canApplyJob(j)).length;
});

const approvedNotReadyCount = computed(() => {
  if (status.value !== 'approved') return 0;
  return items.value.filter((j) => j.status === 'approved' && !canApplyJob(j)).length;
});


function toggleSelect(jobId) {
  const next = new Set(selected.value);
  if (next.has(jobId)) next.delete(jobId);
  else next.add(jobId);
  selected.value = next;
}

function toggleSelectAll() {
  if (allSelected.value) {
    selected.value = new Set();
  } else {
    selected.value = new Set(items.value.map((j) => j.jobId));
  }
}

function statusLink(status) {
  if (status === 'approved' || status === 'applied') return '/applications';
  if (status === 'rejected') return '/jobs';
  return '/approvals';
}
const pageLabel = computed(() => {
  if (!total.value) return '0 jobs';
  const start = (page.value - 1) * pageSize + 1;
  const end = Math.min(page.value * pageSize, total.value);
  return `${start}–${end} of ${total.value}`;
});

async function loadWhisper() {
  whisperLoading.value = true;
  try {
    const { data } = await http.get('/intelligence/whisper');
    whisper.value = data;
  } catch {
    whisper.value = [];
  } finally {
    whisperLoading.value = false;
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  const currentStatus = status.value;
  try {
    const listRes = await http.get('/approvals', {
      params: {
        status: currentStatus,
        search: search.value,
        minMatch: minMatch.value,
        ats: ats.value,
        sort: 'match',
        limit: pageSize,
        offset: (page.value - 1) * pageSize,
      },
    });
    const payload = listRes.data;
    items.value = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
    total.value = payload?.total ?? items.value.length;
    if (payload?.counts) counts.value = payload.counts;
    selected.value = new Set();
  } catch (e) {
    const msg = e.response?.data?.message || e.message || 'Could not load approval queue';
    error.value = `${msg} — try Refresh or log out and back in.`;
    items.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function fetchApprovedItems() {
  const { data } = await http.get('/approvals', {
    params: { status: 'approved', search: '', minMatch: 0, sort: 'match', limit: 200, offset: 0 },
  });
  return Array.isArray(data?.items) ? data.items : [];
}

async function submitApply({ jobIds, force = false } = {}) {
  applying.value = true;
  applyMessage.value = '';
  applyEmailNotice.value = '';
  error.value = '';
  try {
    let ids = jobIds;
    if (!ids?.length) {
      const approved = status.value === 'approved' ? items.value : await fetchApprovedItems();
      ids = approved
        .filter((j) => force || canApplyJob(j, force))
        .map((j) => j.jobId);
    }
    if (!ids.length) {
      applyMessage.value =
        applyResumeMode.value === 'tailored'
          ? 'No approved jobs with a ready tailored kit. Use Polish until ready or Apply anyway.'
          : 'No approved jobs to apply.';
      return;
    }
    const { data } = await http.post('/agent/apply-approved', {
      jobIds: ids,
      useTailoredResume: applyResumeMode.value === 'tailored',
      autoApply: true,
    });
    applyMessage.value = data.message || `Applied to ${data.count ?? ids.length} job(s)`;
    applyEmailNotice.value = formatApplyEmailNotice(data.emailNotification);
    await load();
  } catch (e) {
    const d = e.response?.data;
    applyMessage.value = d?.message || d?.hint || 'Apply failed';
    applyEmailNotice.value = formatApplyEmailNotice(d?.emailNotification);
    if (d?.hint) error.value = d.hint;
  } finally {
    applying.value = false;
  }
}

async function applyApproved({ force = false } = {}) {
  await submitApply({ force });
}

async function applyOneJob(job, { force = false } = {}) {
  if (!force && !canApplyJob(job, force)) return;
  await submitApply({ jobIds: [job.jobId], force });
}

function markApplyAnyway(jobId) {
  const next = new Set(applyAnywayIds.value);
  next.add(jobId);
  applyAnywayIds.value = next;
}

function patchJobKit(jobId, data) {
  const idx = items.value.findIndex((j) => j.jobId === jobId);
  if (idx < 0) return;
  const job = items.value[idx];
  items.value[idx] = {
    ...job,
    kit: { ...(job.kit || {}), ...summaryFromKitPayload(data) },
  };
}

function toggleCompare(jobId) {
  compareJobId.value = compareJobId.value === jobId ? '' : jobId;
}

async function polishUntilReady(job) {
  polishing.value = job.jobId;
  polishMsg.value = '';
  error.value = '';
  const profile = profileStore.profile || {};
  try {
    polishMsg.value = `Running one polish pass (~20s) toward ${READY_ATS_MIN}%+ ATS…`;
    const { data } = await http.post(`/applications/kit/${encodeURIComponent(job.jobId)}/polish`, {
      highMatchTarget: READY_ATS_TARGET,
      supplementPages: profile.defaultSupplementPages || 3,
    }, { timeout: 300000 });
    patchJobKit(job.jobId, data.kit);
    const kit = items.value.find((j) => j.jobId === job.jobId)?.kit;
    const last = data.passes?.[data.passes.length - 1];
    const passLine = data.passes?.length
      ? `ATS ${last?.atsScore ?? kit?.atsScore ?? '—'}% · Fit ${last?.jdMatchPct ?? kit?.jdMatchPct ?? '—'}% after ${data.passes.length} step(s)`
      : `ATS ${kit?.atsScore ?? '—'}%`;
    if (data.ready || isKitReadyToApply(kit)) {
      polishMsg.value = `Ready to apply — ${passLine}`;
      return;
    }
    polishMsg.value = `Best achieved: ${passLine} — click Polish again if still below ${READY_ATS_MIN}%.`;
  } catch (e) {
    error.value = formatApiError(e, 'Polish until ready failed');
  } finally {
    polishing.value = '';
  }
}

async function approve(jobId) {
  acting.value = jobId;
  try {
    await http.post(`/approvals/${encodeURIComponent(jobId)}/approve`, {
      tailorResume: tailorOnApprove.value,
    });
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Approve failed';
  } finally {
    acting.value = '';
  }
}

async function reject(jobId) {
  acting.value = jobId;
  try {
    await http.post(`/approvals/${encodeURIComponent(jobId)}/reject`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Skip failed';
  } finally {
    acting.value = '';
  }
}

async function bulkApproveSelected() {
  const ids = [...selected.value];
  if (!ids.length) return;
  bulkActing.value = true;
  try {
    const { data } = await http.post('/approvals/bulk-approve', {
      jobIds: ids,
      tailorResume: tailorOnApprove.value,
    });
    applyMessage.value = data.message;
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Bulk approve failed';
  } finally {
    bulkActing.value = false;
  }
}

async function bulkRejectSelected() {
  const ids = [...selected.value];
  if (!ids.length) return;
  bulkActing.value = true;
  try {
    const { data } = await http.post('/approvals/bulk-reject', { jobIds: ids });
    applyMessage.value = data.message;
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Bulk skip failed';
  } finally {
    bulkActing.value = false;
  }
}

async function bulkApprove(count) {
  bulkActing.value = true;
  try {
    const ids = items.value.slice(0, count).map((j) => j.jobId);
    const { data } = await http.post('/approvals/bulk-approve', {
      jobIds: ids,
      tailorResume: tailorOnApprove.value,
    });
    applyMessage.value = data.message;
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Bulk approve failed';
  } finally {
    bulkActing.value = false;
  }
}

async function bulkRejectPage() {
  bulkActing.value = true;
  try {
    const ids = items.value.map((j) => j.jobId);
    const { data } = await http.post('/approvals/bulk-reject', { jobIds: ids });
    applyMessage.value = data.message;
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Bulk skip failed';
  } finally {
    bulkActing.value = false;
  }
}

function sectionBadge(s) {
  if (s === 'apply_today') return 'badge-gold';
  if (s === 'strong_review') return 'badge-teal';
  return 'badge-slate';
}

function openKit(job) {
  kitJob.value = job;
  kitOpen.value = true;
}

function onKitUpdated() {
  load();
}

async function highlightQueuedJob(jobId) {
  if (!jobId) return;
  status.value = 'all';
  minMatch.value = '0';
  search.value = '';
  page.value = 1;
  await load();
  highlightJobId.value = jobId;
  queueBanner.value = 'Opened from notification — review this job below.';
  await nextTick();
  const el = document.getElementById(`job-${jobId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    queueBanner.value = `Job ${jobId} is in your queue — use search if not visible on this page.`;
  }
  setTimeout(() => {
    highlightJobId.value = '';
  }, 10000);
}

function kitBadge(job) {
  if (job.kit?.applied) return { label: 'Applied', cls: 'badge-teal' };
  if (!job.kit?.hasKit) return null;
  if (job.kit.useForApply === false) return { label: 'Kit saved · base on apply', cls: 'badge-slate' };
  const mode = job.kit.tailorMode === 'high_match' ? '95% match kit' : 'kit ready';
  return { label: `${job.kit.pageCount || 3}-page ${mode}`, cls: 'badge-teal' };
}

function openJobLinkedIn(job) {
  if (isLinkedInUrl(job.url)) {
    openLinkedIn(job.url);
    return;
  }
  openLinkedIn(buildLinkedInSearchFromJob(job));
}

function resetPage() {
  page.value = 1;
}

watch([status, search, minMatch, ats], () => {
  resetPage();
  load();
});
watch(page, load);

watch(
  () => route.query.jobId,
  (jobId) => {
    if (jobId) highlightQueuedJob(String(jobId));
  }
);

onMounted(() => {
  profileStore.fetch().catch(() => {});
  tailorOnApprove.value = Boolean(profileStore.profile?.tailorResumeOnApply);
  applyResumeMode.value = profileStore.profile?.defaultApplyResumeMode === 'tailored' ? 'tailored' : 'base';
  load();
  loadWhisper();
  if (route.query.jobId) highlightQueuedJob(String(route.query.jobId));
});
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0 flex-1">
        <h2 class="text-2xl font-bold text-slate-100">{{ isAdmin ? 'Apply queue' : 'Queue' }}</h2>
        <p class="mt-1 max-w-xl text-slate-400">
          {{ isAdmin
            ? 'Triage by interview likelihood — approve roles with the best chance of a human reply.'
            : 'Polish tailored resumes, apply when ready, then generate follow-up kits to reach recruiters.' }}
        </p>
      </div>
      <div class="mobile-queue-stats flex flex-wrap gap-3">
        <div class="card px-4 py-3 text-center">
          <p class="text-2xl font-bold text-amber-300">{{ counts.pending }}</p>
          <p class="text-xs text-slate-500">pending</p>
        </div>
        <div class="card px-4 py-3 text-center">
          <p class="text-2xl font-bold text-teal-300">{{ counts.approved }}</p>
          <p class="text-xs text-slate-500">approved</p>
        </div>
        <div v-if="counts.approved > 0" class="card mobile-queue-apply-card flex flex-col gap-3 self-center px-4 py-3 min-w-[240px]">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Apply settings</p>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input v-model="applyResumeMode" type="radio" value="base" class="accent-teal-500" />
            Base resume only
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input v-model="applyResumeMode" type="radio" value="tailored" class="accent-teal-500" />
            Tailored ({{ profileStore.profile?.defaultSupplementPages || 3 }} pages)
          </label>
          <p v-if="applyResumeMode === 'tailored'" class="text-xs text-slate-500">
            {{
              profileStore.profile?.defaultTailorMode === 'high_match'
                ? 'High match — word-for-word JD alignment'
                : 'Balanced tailoring'
            }}
          </p>
          <p class="text-xs text-teal-300/90">
            Email on forms: {{ profileStore.profile?.digestEmail || auth.user?.email || 'add in Profile' }}
          </p>
          <p class="text-xs text-slate-500">
            After applying, a summary email goes to that address (if enabled in Profile).
          </p>
          <button
            class="btn-primary px-4 py-2 text-sm"
            :disabled="applying"
            @click="applyApproved()"
          >
            {{ applying ? 'Applying…' : (applyResumeMode === 'tailored' ? (status === 'approved' && approvedReadyCount ? `Apply ${approvedReadyCount} ready` : 'Apply ready jobs') : `Apply ${counts.approved} approved`) }}
          </button>
          <button
            v-if="applyResumeMode === 'tailored'"
            type="button"
            class="btn-secondary px-4 py-2 text-sm"
            :disabled="applying"
            @click="applyApproved({ force: true })"
          >
            Apply anyway (all {{ counts.approved }})
          </button>
        </div>
      </div>
    </div>

    <ApplyWorkflowBanner class="mt-6" />

    <div
      v-if="counts.approved > 0 || counts.pending > 0"
      class="mt-4 rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/90"
    >
      <p class="font-medium text-amber-200">Polish &amp; follow up</p>
      <p class="mt-1 text-xs text-amber-100/80">
        <strong>Polish until ready</strong> targets 95% ATS on each tailored resume.
        <strong>Generate follow-up kit</strong> drafts recruiter outreach after you apply.
        <RouterLink to="/follow-ups" class="text-violet-300 hover:underline">Follow-ups</RouterLink> tracks replies and day-5 reminders.
      </p>
    </div>

    <div v-if="status === 'pending' && counts.pending > 0 && isAdmin" class="mt-6 card flex flex-wrap items-center gap-3 p-4">
      <span class="text-sm text-slate-400">Quick triage:</span>
      <label class="flex items-center gap-2 text-xs text-slate-400">
        <input v-model="tailorOnApprove" type="checkbox" class="accent-teal-500" />
        Tailor resume on approve
      </label>
      <span class="text-slate-600">|</span>
      <button class="btn-primary text-xs" :disabled="bulkActing" @click="bulkApprove(5)">Approve top 5</button>
      <button class="btn-primary text-xs" :disabled="bulkActing" @click="bulkApprove(10)">Approve top 10</button>
      <button class="btn-secondary text-xs" :disabled="bulkActing" @click="bulkRejectPage">Skip this page</button>
      <template v-if="selected.size">
        <span class="text-slate-600">|</span>
        <button class="btn-primary text-xs" :disabled="bulkActing" @click="bulkApproveSelected">
          Approve selected ({{ selected.size }})
        </button>
        <button class="btn-secondary text-xs" :disabled="bulkActing" @click="bulkRejectSelected">
          Skip selected
        </button>
      </template>
    </div>

    <div class="mt-6 mobile-stack-filters flex flex-wrap items-end gap-3">
      <div class="mobile-filter-tabs flex flex-wrap gap-2">
        <button
          v-for="tab in ['pending', 'approved', 'rejected', 'all']"
          :key="tab"
          class="rounded-xl px-4 py-2 text-sm capitalize transition"
          :class="status === tab ? 'bg-teal-500/20 text-teal-200' : 'text-slate-400 hover:bg-slate-800/60'"
          @click="status = tab"
        >
          {{ tab }}
        </button>
      </div>
      <input v-model="search" class="input w-full text-sm sm:max-w-[200px]" placeholder="Search title or company" />
      <select v-model="minMatch" class="input w-auto text-sm">
        <option value="85">85%+ match</option>
        <option value="75">75%+ match</option>
        <option value="65">65%+ match</option>
        <option value="0">All matches</option>
      </select>
      <select v-if="isAdmin" v-model="ats" class="input w-auto text-sm">
        <option value="all">All ATS</option>
        <option value="greenhouse">Greenhouse</option>
        <option value="lever">Lever</option>
        <option value="ashby">Ashby</option>
      </select>
      <button class="btn-secondary px-3 py-2 text-sm" :disabled="loading" @click="load">Refresh</button>
    </div>

    <p v-if="error" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
    <p v-if="applyMessage" class="mt-4 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ applyMessage }}</p>
    <p
      v-if="applyEmailNotice"
      class="mt-2 rounded-lg px-3 py-2 text-sm"
      :class="applyEmailNotice.startsWith('Summary email sent') ? 'bg-sky-500/10 text-sky-200' : 'bg-amber-500/10 text-amber-200'"
    >
      {{ applyEmailNotice }}
    </p>
    <p v-if="polishMsg" class="mt-4 rounded-lg bg-violet-500/10 px-3 py-2 text-sm text-violet-200">{{ polishMsg }}</p>
    <p v-if="queueBanner" class="mt-4 rounded-lg bg-sky-500/10 px-3 py-2 text-sm text-sky-200">{{ queueBanner }}</p>

    <div v-if="whisper.length && status === 'pending' && isAdmin" class="mt-6 card p-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-slate-200">Agent whisper</h3>
        <button class="btn-secondary px-2 py-1 text-xs" :disabled="whisperLoading" @click="loadWhisper">Refresh</button>
      </div>
      <div class="mt-3 space-y-2">
        <div v-for="w in whisper.slice(0, 5)" :key="w.jobId" class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span class="text-slate-300">{{ w.company }} — {{ w.title }}</span>
          <span class="badge" :class="w.recommend === 'approve' ? 'badge-teal' : 'badge-slate'">{{ w.rationale }}</span>
        </div>
      </div>
    </div>

    <div v-if="loading" class="mt-8 text-slate-400">Loading queue…</div>
    <div v-else class="mt-6">
      <p class="mb-3 text-sm text-slate-500">{{ pageLabel }}</p>
      <div v-if="items.length && status === 'pending'" class="mb-3 flex items-center gap-2 text-sm text-slate-500">
        <input type="checkbox" class="accent-teal-500" :checked="allSelected" @change="toggleSelectAll" />
        Select all on this page
      </div>
      <div class="space-y-3">
        <div
          v-for="job in items"
          :id="`job-${job.jobId}`"
          :key="job.jobId"
          class="card p-4 transition hover:border-teal-700/50"
          :class="highlightJobId === job.jobId ? 'ring-2 ring-teal-400 border-teal-500/60' : ''"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex min-w-0 flex-1 gap-3">
              <input
                v-if="status === 'pending' || job.status === 'pending'"
                type="checkbox"
                class="mt-1 accent-teal-500"
                :checked="selected.has(job.jobId)"
                @change="toggleSelect(job.jobId)"
              />
              <div class="min-w-0">
                <h3 class="font-semibold text-slate-100">{{ job.title }}</h3>
                <p class="text-sm text-slate-400">{{ job.company }}</p>
                <p class="mt-1 text-xs text-slate-500">
                  Job board: <span class="text-teal-300/90">{{ job.source || 'Unknown' }}</span>
                </p>
                <p v-if="job.strengths?.length" class="mt-2 text-xs text-teal-400/80">
                  Match: {{ job.strengths.slice(0, 3).join(' · ') }}
                </p>
                <p v-if="job.gaps?.length" class="mt-1 text-xs text-slate-500">
                  Gaps: {{ job.gaps.slice(0, 3).join(' · ') }}
                </p>
                <p v-if="job.source === 'chrome-extension'" class="mt-1 text-xs text-sky-400">Queued from browser (often LinkedIn)</p>
                <div class="mt-2">
                  <KitReadinessBadges :kit="job.kit" />
                </div>
                <MatchCopilotBrief :job-id="job.jobId" :job="job" lazy compact />
                <button
                  type="button"
                  class="mt-2 text-xs text-teal-400 hover:underline"
                  @click="toggleInsight(job.jobId)"
                >
                  {{ expandedInsightJobId === job.jobId ? 'Hide callback insights' : 'Callback score & gaps' }}
                </button>
                <JobInterviewInsight :job="job" :expanded="expandedInsightJobId === job.jobId" />
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <JobScoreBadges :job="job" :show-factors="false" />
              <span v-if="job.emailSection" class="badge" :class="sectionBadge(job.emailSection)">{{ job.emailSection }}</span>
              <span v-if="kitBadge(job)" class="badge" :class="kitBadge(job).cls">{{ kitBadge(job).label }}</span>
              <span v-if="job.atsType && job.atsType !== 'unknown'" class="badge badge-gold">{{ job.atsType }}</span>
              <RouterLink
                v-if="job.status && job.status !== 'pending'"
                :to="statusLink(job.status)"
                class="badge badge-slate hover:bg-slate-700/50"
              >
                {{ job.status }} →
              </RouterLink>
            </div>
          </div>
          <div class="mt-3 mobile-job-actions flex flex-wrap items-center gap-3 text-sm">
            <a v-if="job.url" :href="job.url" target="_blank" rel="noopener" class="mobile-job-link text-teal-400 hover:underline">View job →</a>
            <button
              type="button"
              class="text-sky-400 hover:underline min-h-[44px]"
              @click="openJobLinkedIn(job)"
            >
              {{ isLinkedInJob(job) ? 'Open in LinkedIn →' : 'Search on LinkedIn →' }}
            </button>
            <button type="button" class="btn-secondary" @click="openKit(job)">
              {{ job.kit?.hasKit ? 'View tailored resume' : 'Application kit' }}
            </button>
            <button
              type="button"
              class="btn-secondary"
              :disabled="polishing === job.jobId"
              @click="polishUntilReady(job)"
            >
              {{ polishing === job.jobId ? 'Polishing…' : (job.kit?.hasKit ? 'Polish until ready' : 'Generate & polish') }}
            </button>
            <button
              type="button"
              class="btn-secondary"
              :class="compareJobId === job.jobId ? 'ring-1 ring-teal-500/50' : ''"
              @click="toggleCompare(job.jobId)"
            >
              {{ compareJobId === job.jobId ? 'Hide compare' : 'Compare to JD' }}
            </button>
            <template v-if="job.status === 'approved' || status === 'approved'">
              <button
                type="button"
                class="btn-primary"
                :disabled="applying || !canApplyJob(job)"
                @click="applyOneJob(job)"
              >
                Apply
              </button>
              <button
                v-if="applyResumeMode === 'tailored' && !canApplyJob(job)"
                type="button"
                class="text-xs text-amber-300 underline min-h-[44px]"
                :disabled="applying"
                @click="applyOneJob(job, { force: true })"
              >
                Apply anyway
              </button>
            </template>
            <template v-if="status === 'pending' || job.status === 'pending'">
              <button class="btn-primary" :disabled="acting === job.jobId" @click="approve(job.jobId)">
                Approve
              </button>
              <button class="btn-secondary" :disabled="acting === job.jobId" @click="reject(job.jobId)">
                Skip
              </button>
            </template>
          </div>
          <KitJdComparePanel
            v-if="compareJobId === job.jobId"
            :job-id="job.jobId"
            :refresh-key="`${job.kit?.atsScore ?? ''}-${job.kit?.generatedAt ?? ''}`"
            class="mt-4"
          />
        </div>
        <div v-if="!items.length" class="rounded-xl border border-dashed border-slate-700 bg-slate-800/30 p-8 text-center">
          <p class="font-medium text-slate-300">Your apply queue is empty</p>
          <p class="mt-2 text-sm text-slate-500">
            Browse recommended jobs, save roles you like, then add them here to approve or skip.
          </p>
          <div class="mt-4 flex flex-wrap justify-center gap-3">
            <RouterLink to="/jobs" class="btn-primary text-sm">Browse jobs</RouterLink>
            <RouterLink to="/" class="btn-secondary text-sm">Dashboard</RouterLink>
          </div>
        </div>
      </div>

      <div v-if="totalPages > 1" class="mt-6 flex items-center justify-center gap-3">
        <button class="btn-secondary text-sm" :disabled="page <= 1" @click="page--">← Prev</button>
        <span class="text-sm text-slate-400">Page {{ page }} / {{ totalPages }}</span>
        <button class="btn-secondary text-sm" :disabled="page >= totalPages" @click="page++">Next →</button>
      </div>
    </div>

    <ApplicationKitPanel
      v-if="kitJob"
      :job="kitJob"
      :open="kitOpen"
      @close="kitOpen = false"
      @updated="onKitUpdated"
    />
  </div>
</template>
