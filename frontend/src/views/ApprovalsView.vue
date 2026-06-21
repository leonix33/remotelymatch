<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import http from '../api/http';

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

const search = ref('');
const minMatch = ref('85');
const ats = ref('all');
const page = ref(1);
const pageSize = 25;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
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
    const [listRes, summaryRes] = await Promise.all([
      http.get('/approvals', {
        params: {
          status: currentStatus,
          search: search.value,
          minMatch: minMatch.value,
          ats: ats.value,
          sort: 'match',
          limit: pageSize,
          offset: (page.value - 1) * pageSize,
        },
      }),
      http.get('/approvals/summary'),
    ]);
    const payload = listRes.data;
    items.value = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
    total.value = payload?.total ?? items.value.length;
    counts.value = summaryRes.data;
  } catch (e) {
    const msg = e.response?.data?.message || e.message || 'Could not load approval queue';
    error.value = `${msg} — try Refresh or log out and back in.`;
    items.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function applyApproved() {
  applying.value = true;
  applyMessage.value = '';
  error.value = '';
  try {
    const { data } = await http.post('/agent/apply-approved');
    applyMessage.value = data.message || `Applied to ${data.count} jobs`;
    await load();
  } catch (e) {
    const d = e.response?.data;
    applyMessage.value = d?.message || d?.hint || 'Apply failed';
    if (d?.hint) error.value = d.hint;
  } finally {
    applying.value = false;
  }
}

async function approve(jobId) {
  acting.value = jobId;
  try {
    await http.post(`/approvals/${encodeURIComponent(jobId)}/approve`);
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

async function bulkApprove(count) {
  bulkActing.value = true;
  try {
    const ids = items.value.slice(0, count).map((j) => j.jobId);
    const { data } = await http.post('/approvals/bulk-approve', { jobIds: ids });
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

function resetPage() {
  page.value = 1;
}

watch([status, search, minMatch, ats], () => {
  resetPage();
  load();
});
watch(page, load);

onMounted(() => { load(); loadWhisper(); });
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold text-slate-100">Apply queue</h2>
        <p class="mt-1 max-w-xl text-slate-400">
          Triage high-match jobs fast. Approve what you want the agent to submit — skip the rest.
        </p>
      </div>
      <div class="flex flex-wrap gap-3">
        <div class="card px-4 py-3 text-center">
          <p class="text-2xl font-bold text-amber-300">{{ counts.pending }}</p>
          <p class="text-xs text-slate-500">pending</p>
        </div>
        <div class="card px-4 py-3 text-center">
          <p class="text-2xl font-bold text-teal-300">{{ counts.approved }}</p>
          <p class="text-xs text-slate-500">approved</p>
        </div>
        <button
          v-if="counts.approved > 0"
          class="btn-primary self-center px-4 py-2 text-sm"
          :disabled="applying"
          @click="applyApproved"
        >
          {{ applying ? 'Applying…' : `Apply ${counts.approved} approved` }}
        </button>
      </div>
    </div>

    <div v-if="status === 'pending' && counts.pending > 0" class="mt-6 card flex flex-wrap items-center gap-3 p-4">
      <span class="text-sm text-slate-400">Quick triage:</span>
      <button class="btn-primary text-xs" :disabled="bulkActing" @click="bulkApprove(5)">Approve top 5</button>
      <button class="btn-primary text-xs" :disabled="bulkActing" @click="bulkApprove(10)">Approve top 10</button>
      <button class="btn-secondary text-xs" :disabled="bulkActing" @click="bulkRejectPage">Skip this page</button>
    </div>

    <div class="mt-6 flex flex-wrap items-end gap-3">
      <div class="flex flex-wrap gap-2">
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
      <input v-model="search" class="input max-w-[200px] text-sm" placeholder="Search title or company" />
      <select v-model="minMatch" class="input w-auto text-sm">
        <option value="85">85%+ match</option>
        <option value="75">75%+ match</option>
        <option value="65">65%+ match</option>
        <option value="0">All matches</option>
      </select>
      <select v-model="ats" class="input w-auto text-sm">
        <option value="all">All ATS</option>
        <option value="greenhouse">Greenhouse</option>
        <option value="lever">Lever</option>
        <option value="ashby">Ashby</option>
      </select>
      <button class="btn-secondary px-3 py-2 text-sm" :disabled="loading" @click="load">Refresh</button>
    </div>

    <p v-if="error" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
    <p v-if="applyMessage" class="mt-4 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ applyMessage }}</p>

    <div v-if="whisper.length && status === 'pending'" class="mt-6 card p-4">
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
      <div class="space-y-3">
        <div v-for="job in items" :key="job.jobId" class="card p-4 transition hover:border-teal-700/50">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold text-slate-100">{{ job.title }}</h3>
              <p class="text-sm text-slate-400">{{ job.company }}</p>
              <p v-if="job.source === 'chrome-extension'" class="mt-1 text-xs text-amber-400">From Chrome extension</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="badge badge-teal">{{ job.personalMatchPct || job.matchPct || 0 }}% match</span>
              <span v-if="job.emailSection" class="badge" :class="sectionBadge(job.emailSection)">{{ job.emailSection }}</span>
              <span v-if="job.atsType && job.atsType !== 'unknown'" class="badge badge-gold">{{ job.atsType }}</span>
              <span v-if="job.status && job.status !== 'pending'" class="badge badge-slate">{{ job.status }}</span>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <a v-if="job.url" :href="job.url" target="_blank" rel="noopener" class="text-teal-400 hover:underline">View job →</a>
            <template v-if="status === 'pending' || job.status === 'pending'">
              <button class="btn-primary px-3 py-1.5 text-xs" :disabled="acting === job.jobId" @click="approve(job.jobId)">
                Approve
              </button>
              <button class="btn-secondary px-3 py-1.5 text-xs" :disabled="acting === job.jobId" @click="reject(job.jobId)">
                Skip
              </button>
            </template>
          </div>
        </div>
        <p v-if="!items.length" class="text-slate-500">No jobs match your filters. Try lowering the match % or clearing search.</p>
      </div>

      <div v-if="totalPages > 1" class="mt-6 flex items-center justify-center gap-3">
        <button class="btn-secondary text-sm" :disabled="page <= 1" @click="page--">← Prev</button>
        <span class="text-sm text-slate-400">Page {{ page }} / {{ totalPages }}</span>
        <button class="btn-secondary text-sm" :disabled="page >= totalPages" @click="page++">Next →</button>
      </div>
    </div>
  </div>
</template>
