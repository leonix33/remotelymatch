<script setup>
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';
import { useProfileStore } from '../stores/profile';
import { useApplyQueue } from '../composables/useApplyQueue';
import ApplicationKitPanel from '../components/ApplicationKitPanel.vue';
import JobScoreBadges from '../components/JobScoreBadges.vue';

const profileStore = useProfileStore();
const { queueing, addToQueue } = useApplyQueue();
const jobs = ref([]);
const contacts = ref([]);
const loading = ref(true);
const section = ref('all');
const minMatch = ref('0');
const search = ref('');
const copilotJob = ref(null);
const copilot = ref(null);
const resumeJob = ref(null);
const kitOpen = ref(false);
const squadJob = ref(null);
const squadMembers = ref([]);
const aiLoading = ref(false);
const savingJobId = ref('');
const queueMessage = ref('');
const queueError = ref('');

async function addJobToQueue(job) {
  queueMessage.value = '';
  queueError.value = '';
  try {
    await addToQueue(job, 'jobs');
    queueMessage.value = `Added "${job.title}" to your apply queue`;
  } catch (e) {
    queueError.value = e.response?.data?.message || 'Could not add to queue';
  }
}

async function toggleSave(job) {
  savingJobId.value = job.jobId;
  try {
    await profileStore.toggleSavedJob(job);
  } finally {
    savingJobId.value = '';
  }
}

function isSaved(jobId) {
  return profileStore.isJobSaved(jobId);
}

async function load() {
  loading.value = true;
  try {
    const { data } = await http.get('/jobs', {
      params: { section: section.value, minMatch: minMatch.value, search: search.value },
    });
    jobs.value = data;
  } finally {
    loading.value = false;
  }
}

async function loadContacts() {
  try {
    const { data } = await http.get('/chat/contacts');
    contacts.value = data;
  } catch {
    contacts.value = [];
  }
}

async function runCopilot(job) {
  copilotJob.value = job;
  aiLoading.value = true;
  copilot.value = null;
  try {
    const { data } = await http.get(`/intelligence/match/${encodeURIComponent(job.jobId)}`);
    copilot.value = data;
  } finally {
    aiLoading.value = false;
  }
}

async function runResumeDiff(job) {
  resumeJob.value = job;
  kitOpen.value = true;
}

function openSquad(job) {
  squadJob.value = job;
  squadMembers.value = [];
}

async function createSquad() {
  if (!squadJob.value || !squadMembers.value.length) return;
  await http.post('/chat/squads', {
    jobId: squadJob.value.jobId,
    jobTitle: squadJob.value.title,
    company: squadJob.value.company,
    memberIds: squadMembers.value,
  });
  squadJob.value = null;
}

function toggleSquadMember(id) {
  const i = squadMembers.value.indexOf(id);
  if (i >= 0) squadMembers.value.splice(i, 1);
  else squadMembers.value.push(id);
}

function sectionBadge(s) {
  if (s === 'apply_today') return 'badge-gold';
  if (s === 'strong_review') return 'badge-teal';
  return 'badge-slate';
}

function sectionLabel(s) {
  if (s === 'apply_today') return 'Apply Today';
  if (s === 'strong_review') return 'Strong Match';
  return 'Browse';
}

onMounted(() => {
  profileStore.fetch().catch(() => {});
  load();
  loadContacts();
});
watch([section, minMatch], load);
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold">Jobs</h2>
    <p class="mt-1 text-slate-400">Save roles you like, add strong matches to your apply queue, then approve by <strong class="text-slate-300">interview likelihood</strong>.</p>

    <p v-if="queueMessage" class="mt-4 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">
      {{ queueMessage }}
      <RouterLink to="/approvals" class="ml-2 underline">Open queue →</RouterLink>
    </p>
    <p v-if="queueError" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ queueError }}</p>

    <div class="mt-6 mobile-stack-filters flex flex-wrap gap-3">
      <select v-model="section" class="input w-auto">
        <option value="all">All sections</option>
        <option value="apply_today">Apply Today</option>
        <option value="strong_review">Strong Match</option>
        <option value="manual_browse">Browse</option>
      </select>
      <select v-model="minMatch" class="input w-auto">
        <option value="0">Any match %</option>
        <option value="60">60%+</option>
        <option value="80">80%+</option>
      </select>
      <input v-model="search" class="input max-w-xs" placeholder="Search title, company…" @keyup.enter="load" />
      <button class="btn-secondary" @click="load">Search</button>
    </div>

    <div v-if="loading" class="mt-8 text-slate-400">Loading jobs…</div>
    <div v-else class="mt-6 space-y-3">
      <div v-for="job in jobs" :key="job.jobId || job._id" class="card p-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 class="font-semibold text-slate-100">{{ job.title }}</h3>
            <p class="text-sm text-slate-400">{{ job.company }} · {{ job.location || 'Remote' }}</p>
            <p class="mt-1 text-xs text-slate-500">Job board: <span class="text-teal-300/90">{{ job.source || 'Unknown' }}</span></p>
          </div>
          <JobScoreBadges :job="job" />
          <div class="flex flex-wrap gap-2">
            <span class="badge" :class="sectionBadge(job.emailSection)">{{ sectionLabel(job.emailSection) }}</span>
            <span v-if="job.atsType && job.atsType !== 'unknown'" class="badge badge-gold">{{ job.atsType }}</span>
          </div>
        </div>
        <div class="mt-3 mobile-job-actions flex flex-wrap gap-2 text-sm">
          <a v-if="job.url" :href="job.url" target="_blank" rel="noopener" class="mobile-job-link text-teal-400 hover:underline">View job →</a>
          <button
            class="btn-secondary"
            :disabled="savingJobId === job.jobId"
            @click="toggleSave(job)"
          >
            {{ isSaved(job.jobId) ? '★ Saved' : '☆ Save' }}
          </button>
          <button
            class="btn-primary"
            :disabled="queueing === job.jobId"
            @click="addJobToQueue(job)"
          >
            {{ queueing === job.jobId ? '…' : '+ Queue' }}
          </button>
          <button class="btn-secondary" @click="runCopilot(job)">Match Copilot</button>
          <button class="btn-secondary" @click="runResumeDiff(job)">Application kit</button>
          <button class="btn-secondary" @click="openSquad(job)">Apply squad</button>
        </div>
      </div>
      <p v-if="!jobs.length" class="rounded-xl border border-dashed border-slate-700 bg-slate-800/30 p-6 text-center text-slate-500">
        No jobs match your filters.
        <span class="mt-2 block text-sm">Run the agent to fetch new listings, or lower the match threshold.</span>
      </p>
    </div>

    <div v-if="copilotJob" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 mobile-modal-sheet" @click.self="copilotJob = null">
      <div class="card w-full max-w-lg overflow-y-auto p-4 sm:max-h-[80vh] sm:p-6">
        <h3 class="font-semibold text-slate-200">Match Copilot — {{ copilotJob.title }}</h3>
        <p v-if="aiLoading" class="mt-4 text-slate-400">Analyzing…</p>
        <div v-else-if="copilot?.analysis" class="mt-4 space-y-3 text-sm">
          <p class="text-teal-300">{{ copilot.analysis.oneLiner }}</p>
          <p><span class="text-slate-500">Verdict:</span> {{ copilot.analysis.verdict }} ({{ copilot.analysis.matchPct }}%)</p>
          <p><span class="text-slate-500">Strengths:</span> {{ copilot.analysis.strengths?.join(', ') }}</p>
          <p><span class="text-slate-500">Gaps:</span> {{ copilot.analysis.gaps?.join(', ') }}</p>
          <ul class="list-disc pl-5 text-slate-400">
            <li v-for="(p, i) in copilot.analysis.talkingPoints" :key="i">{{ p }}</li>
          </ul>
        </div>
        <button class="btn-secondary mt-4" @click="copilotJob = null">Close</button>
      </div>
    </div>

    <ApplicationKitPanel
      v-if="resumeJob"
      :job="resumeJob"
      :open="kitOpen"
      @close="kitOpen = false"
    />

    <div v-if="squadJob" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 mobile-modal-sheet" @click.self="squadJob = null">
      <form class="card w-full max-w-md p-4 sm:p-6" @submit.prevent="createSquad">
        <h3 class="font-semibold text-slate-200">Apply squad — {{ squadJob.company }}</h3>
        <p class="mt-1 text-sm text-slate-500">Invite teammates to coordinate on this role</p>
        <label v-for="c in contacts" :key="c.id" class="mt-2 flex gap-2 text-sm">
          <input type="checkbox" :checked="squadMembers.includes(c.id)" @change="toggleSquadMember(c.id)" />
          {{ c.name }}
        </label>
        <div class="mt-4 flex gap-2">
          <button type="button" class="btn-secondary flex-1" @click="squadJob = null">Cancel</button>
          <button type="submit" class="btn-primary flex-1">Create squad</button>
        </div>
      </form>
    </div>
  </div>
</template>
