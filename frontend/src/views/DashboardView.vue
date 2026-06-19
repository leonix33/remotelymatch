<script setup>
import { onMounted, ref } from 'vue';
import http from '../api/http';
import { isProduction } from '../config';
import { useProfileStore } from '../stores/profile';

const profileStore = useProfileStore();
const stats = ref(null);
const syncStatus = ref(null);
const loading = ref(true);
const syncing = ref(false);
const syncMessage = ref('');
const victories = ref([]);
const marketPulse = ref(null);

async function load() {
  loading.value = true;
  try {
    const [statsRes, syncRes, vicRes, pulseRes] = await Promise.all([
      http.get('/analytics/summary'),
      http.get('/sync/status').catch(() => ({ data: null })),
      http.get('/social/victories').catch(() => ({ data: [] })),
      http.get('/intelligence/market-pulse').catch(() => ({ data: null })),
    ]);
    stats.value = statsRes.data;
    syncStatus.value = syncRes.data;
    victories.value = vicRes.data.slice(0, 5);
    marketPulse.value = pulseRes.data;
  } finally {
    loading.value = false;
  }
}

async function syncNow() {
  syncing.value = true;
  syncMessage.value = '';
  try {
    const { data } = await http.post('/sync/all');
    syncMessage.value = `Synced ${data.jobs ?? 0} jobs and ${data.applications ?? 0} applications`;
    await load();
  } catch (e) {
    syncMessage.value = e.response?.data?.message || 'Sync failed';
  } finally {
    syncing.value = false;
  }
}

onMounted(async () => {
  if (!profileStore.loaded) await profileStore.fetch().catch(() => {});
  load();
});
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-slate-100">Dashboard</h2>
    <p class="mt-1 text-slate-400">Your remote job search at a glance</p>

    <div v-if="profileStore.profile?.displayName" class="mt-6 card flex flex-wrap items-center justify-between gap-4 p-4">
      <div>
        <p class="font-medium text-slate-200">{{ profileStore.profile.displayName }}</p>
        <p class="text-sm text-slate-500">{{ profileStore.profile.headline || 'Add a headline in Profile' }}</p>
      </div>
      <RouterLink to="/profile" class="btn-secondary text-sm">Edit profile</RouterLink>
    </div>

    <div v-if="loading" class="mt-8 text-slate-400">Loading…</div>
    <div v-else-if="stats" class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div class="card p-5">
        <p class="text-sm text-slate-400">Total Jobs</p>
        <p class="mt-1 text-3xl font-bold text-teal-300">{{ stats.totalJobs }}</p>
      </div>
      <div class="card p-5">
        <p class="text-sm text-slate-400">Apply Today</p>
        <p class="mt-1 text-3xl font-bold text-amber-300">{{ stats.applyToday }}</p>
      </div>
      <div class="card p-5">
        <p class="text-sm text-slate-400">Submitted</p>
        <p class="mt-1 text-3xl font-bold text-teal-300">{{ stats.submitted }}</p>
      </div>
      <div class="card p-5">
        <p class="text-sm text-slate-400">High Match (80%+)</p>
        <p class="mt-1 text-3xl font-bold text-amber-300">{{ stats.highMatch }}</p>
      </div>
    </div>

    <div v-if="syncStatus" class="mt-8 card p-6">
      <h3 class="font-semibold text-slate-200">Data sync</h3>
      <p class="mt-2 text-sm text-slate-400">
        Source: <span class="text-teal-300">{{ syncStatus.source }}</span>
        · SQLite: {{ syncStatus.sqliteJobs }} jobs, {{ syncStatus.sqliteApps }} apps
        <span v-if="syncStatus.mongoJobs"> · MongoDB: {{ syncStatus.mongoJobs }} jobs, {{ syncStatus.mongoApps }} apps</span>
      </p>
      <p v-if="syncStatus.inSync" class="mt-2 text-sm text-teal-300">Data is in sync</p>
      <p v-else-if="isProduction" class="mt-2 text-sm text-amber-300">
        Production data may be behind your Mac. Run <code class="text-teal-300">npm run sync:render</code> locally to push latest jobs.
      </p>
      <button v-if="isProduction && syncStatus.mongoJobs" class="btn-secondary mt-4" :disabled="syncing" @click="syncNow">
        {{ syncing ? 'Syncing…' : 'Re-sync bundled data to MongoDB' }}
      </button>
      <p v-if="syncMessage" class="mt-3 text-sm text-slate-300">{{ syncMessage }}</p>
    </div>

    <div v-if="stats" class="mt-8 grid gap-6 lg:grid-cols-2">
      <div class="card p-6">
        <h3 class="font-semibold text-slate-200">Job Sections</h3>
        <ul class="mt-4 space-y-2 text-sm">
          <li class="flex justify-between"><span class="text-slate-400">Apply Today</span><span class="badge badge-gold">{{ stats.applyToday }}</span></li>
          <li class="flex justify-between"><span class="text-slate-400">Strong Review</span><span class="badge badge-teal">{{ stats.strongReview }}</span></li>
          <li class="flex justify-between"><span class="text-slate-400">Manual Browse</span><span class="badge badge-slate">{{ stats.manualBrowse }}</span></li>
        </ul>
      </div>
      <div class="card p-6">
        <h3 class="font-semibold text-slate-200">Application Status</h3>
        <ul class="mt-4 space-y-2 text-sm">
          <li v-for="(count, status) in stats.byStatus" :key="status" class="flex justify-between">
            <span class="text-slate-400">{{ status }}</span>
            <span class="badge badge-teal">{{ count }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="mt-8 card p-6">
      <h3 class="font-semibold text-slate-200">Quick actions</h3>
      <div class="mt-4 flex flex-wrap gap-3">
        <RouterLink to="/jobs" class="btn-primary">Browse Jobs</RouterLink>
        <RouterLink to="/intelligence" class="btn-secondary">AI Intelligence</RouterLink>
        <RouterLink to="/interview" class="btn-secondary">Interview Sim</RouterLink>
        <RouterLink to="/resumes" class="btn-secondary">Community Resumes</RouterLink>
        <RouterLink to="/calendar" class="btn-secondary">Calendar</RouterLink>
        <RouterLink to="/conferences" class="btn-secondary">Conferences</RouterLink>
        <RouterLink to="/swarm" class="btn-secondary">Launch Swarm</RouterLink>
        <RouterLink to="/chat" class="btn-secondary">AI Coach & Chat</RouterLink>
        <RouterLink to="/approvals" class="btn-secondary">Apply Queue</RouterLink>
        <RouterLink to="/social" class="btn-secondary">Social Hub</RouterLink>
        <RouterLink to="/agent" class="btn-secondary">Run Agent</RouterLink>
      </div>
    </div>

    <div v-if="marketPulse" class="mt-8 card p-6">
      <h3 class="font-semibold text-slate-200">Market pulse</h3>
      <p class="mt-2 text-sm text-slate-400">
        Hot skills:
        <span v-for="s in marketPulse.trendingSkills?.slice(0, 6)" :key="s.skill" class="ml-2 badge badge-teal">{{ s.skill }}</span>
      </p>
    </div>

    <div v-if="victories.length" class="mt-8 card p-6">
      <h3 class="font-semibold text-slate-200">Victory feed</h3>
      <div class="mt-4 space-y-2">
        <p v-for="v in victories" :key="v._id" class="text-sm text-slate-400">
          <span class="text-teal-300">{{ v.userName }}</span> — {{ v.type }} @ {{ v.company }}
          <span v-if="v.message"> · {{ v.message }}</span>
        </p>
      </div>
      <RouterLink to="/social" class="mt-3 inline-block text-sm text-teal-400">View social hub →</RouterLink>
    </div>
  </div>
</template>
