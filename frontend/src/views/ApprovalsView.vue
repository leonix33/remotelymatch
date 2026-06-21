<script setup>
import { onMounted, ref, watch } from 'vue';
import http from '../api/http';

const items = ref([]);
const counts = ref({ pending: 0, approved: 0, rejected: 0 });
const loading = ref(true);
const acting = ref('');
const status = ref('pending');
const error = ref('');
const whisper = ref([]);
const whisperLoading = ref(false);
const applying = ref(false);
const applyMessage = ref('');

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

async function loadSummary() {
  try {
    const { data } = await http.get('/approvals/summary');
    counts.value = data;
  } catch {
    /* optional when mongo unavailable */
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await http.get('/approvals', { params: { status } });
    items.value = data;
    await loadSummary();
  } catch (e) {
    const msg = e.response?.data?.message || e.message || 'Could not load approval queue';
    error.value = `${msg} — try logging out and back in, or click Refresh below.`;
    items.value = [];
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
    error.value = e.response?.data?.message || 'Reject failed';
  } finally {
    acting.value = '';
  }
}

function sectionBadge(s) {
  if (s === 'apply_today') return 'badge-gold';
  if (s === 'strong_review') return 'badge-teal';
  return 'badge-slate';
}

onMounted(() => { load(); loadWhisper(); });
watch(status, load);
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold text-slate-100">Apply queue</h2>
        <p class="mt-1 max-w-xl text-slate-400">
          Review high-match jobs before they go to auto-apply. Approve roles you want the agent to submit.
        </p>
      </div>
      <div class="flex gap-3">
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

    <div class="mt-6 flex flex-wrap items-center gap-2">
      <button
        v-for="tab in ['pending', 'approved', 'rejected', 'all']"
        :key="tab"
        class="rounded-xl px-4 py-2 text-sm capitalize transition"
        :class="status === tab ? 'bg-teal-500/20 text-teal-200' : 'text-slate-400 hover:bg-slate-800/60'"
        @click="status = tab"
      >
        {{ tab }}
      </button>
      <button class="btn-secondary ml-2 px-3 py-2 text-sm" :disabled="loading" @click="load">
        {{ loading ? 'Loading…' : 'Refresh queue' }}
      </button>
    </div>

    <p v-if="error" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
    <p v-if="applyMessage" class="mt-4 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ applyMessage }}</p>

    <div v-if="whisper.length && status === 'pending'" class="mt-6 card p-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-slate-200">Agent whisper</h3>
        <button class="btn-secondary px-2 py-1 text-xs" :disabled="whisperLoading" @click="loadWhisper">Refresh</button>
      </div>
      <div class="mt-3 space-y-2">
        <div v-for="w in whisper.slice(0, 8)" :key="w.jobId" class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span class="text-slate-300">{{ w.company }} — {{ w.title }}</span>
          <span class="badge" :class="w.recommend === 'approve' ? 'badge-teal' : 'badge-slate'">{{ w.rationale }}</span>
        </div>
      </div>
    </div>

    <div v-if="loading" class="mt-8 text-slate-400">Loading queue…</div>
    <div v-else class="mt-6 space-y-3">
      <div v-for="job in items" :key="job.jobId" class="card p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-slate-100">{{ job.title }}</h3>
            <p class="text-sm text-slate-400">{{ job.company }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <span class="badge badge-teal">{{ job.personalMatchPct || job.matchPct || 0 }}% match</span>
            <span v-if="job.agentMatchPct && job.personalMatchPct !== job.agentMatchPct" class="badge badge-slate text-[10px]">agent {{ job.agentMatchPct }}%</span>
            <span v-if="job.emailSection" class="badge" :class="sectionBadge(job.emailSection)">{{ job.emailSection }}</span>
            <span v-if="job.atsType && job.atsType !== 'unknown'" class="badge badge-gold">{{ job.atsType }}</span>
            <span v-if="job.status && job.status !== 'pending'" class="badge badge-slate">{{ job.status }}</span>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <a v-if="job.url" :href="job.url" target="_blank" rel="noopener" class="text-teal-400 hover:underline">View job →</a>
          <template v-if="status === 'pending' || job.status === 'pending'">
            <button
              class="btn-primary px-3 py-1.5 text-xs"
              :disabled="acting === job.jobId"
              @click="approve(job.jobId)"
            >
              Approve apply
            </button>
            <button
              class="btn-secondary px-3 py-1.5 text-xs"
              :disabled="acting === job.jobId"
              @click="reject(job.jobId)"
            >
              Skip
            </button>
          </template>
        </div>
      </div>
      <p v-if="!items.length" class="text-slate-500">No jobs in this queue. Run the agent or lower your min match score in Profile.</p>
    </div>
  </div>
</template>
