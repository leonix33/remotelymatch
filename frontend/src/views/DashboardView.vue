<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';
import { useProfileStore } from '../stores/profile';

const profileStore = useProfileStore();
const stats = ref(null);
const queue = ref({ pending: 0, approved: 0 });
const topJobs = ref([]);
const marketPulse = ref(null);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    const [statsRes, summaryRes, jobsRes, pulseRes] = await Promise.all([
      http.get('/analytics/summary'),
      http.get('/approvals/summary'),
      http.get('/approvals', { params: { status: 'pending', limit: 5, minMatch: 85 } }),
      http.get('/intelligence/market-pulse').catch(() => ({ data: null })),
    ]);
    stats.value = statsRes.data;
    queue.value = summaryRes.data;
    const payload = jobsRes.data;
    topJobs.value = payload?.items || payload || [];
    marketPulse.value = pulseRes.data;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!profileStore.loaded) await profileStore.fetch().catch(() => {});
  load();
});
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-slate-100">Good to see you{{ profileStore.profile?.displayName ? `, ${profileStore.profile.displayName.split(' ')[0]}` : '' }}</h2>
    <p class="mt-1 text-slate-400">Your remote job search command center</p>

    <!-- Primary action -->
    <div v-if="queue.pending > 0" class="mt-8 card border-teal-600/30 bg-gradient-to-r from-teal-950/80 to-slate-900/80 p-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-sm font-medium uppercase tracking-wider text-teal-400">Today's focus</p>
          <h3 class="mt-1 text-xl font-bold text-slate-100">{{ queue.pending }} jobs waiting for your review</h3>
          <p class="mt-2 text-sm text-slate-400">
            {{ queue.approved }} already approved
            <span v-if="queue.approved > 0"> — ready to apply when you are</span>
          </p>
        </div>
        <RouterLink to="/approvals" class="btn-primary px-6 py-3">Review apply queue →</RouterLink>
      </div>
    </div>

    <div v-else-if="queue.approved > 0" class="mt-8 card border-amber-600/30 p-6">
      <h3 class="text-xl font-bold text-amber-300">{{ queue.approved }} jobs approved — ready to apply</h3>
      <p class="mt-2 text-sm text-slate-400">Head to Apply Queue and click Apply Approved.</p>
      <RouterLink to="/approvals" class="btn-primary mt-4 inline-block">Go to queue →</RouterLink>
    </div>

    <div v-if="loading" class="mt-8 text-slate-400">Loading…</div>

    <template v-else>
      <div v-if="stats" class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="card p-5">
          <p class="text-sm text-slate-400">Jobs tracked</p>
          <p class="mt-1 text-3xl font-bold text-teal-300">{{ stats.totalJobs }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-400">Apply today</p>
          <p class="mt-1 text-3xl font-bold text-amber-300">{{ stats.applyToday }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-400">Submitted</p>
          <p class="mt-1 text-3xl font-bold text-teal-300">{{ stats.submitted }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-400">80%+ match</p>
          <p class="mt-1 text-3xl font-bold text-amber-300">{{ stats.highMatch }}</p>
        </div>
      </div>

      <div v-if="topJobs.length" class="mt-8 card p-6">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-slate-200">Top matches to review</h3>
          <RouterLink to="/approvals" class="text-sm text-teal-400 hover:underline">See all →</RouterLink>
        </div>
        <div class="mt-4 space-y-3">
          <div v-for="job in topJobs" :key="job.jobId" class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3 last:border-0">
            <div>
              <p class="font-medium text-slate-200">{{ job.title }}</p>
              <p class="text-sm text-slate-500">{{ job.company }}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="badge badge-teal">{{ job.personalMatchPct || job.matchPct }}%</span>
              <RouterLink to="/approvals" class="btn-secondary px-2 py-1 text-xs">Review</RouterLink>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!profileStore.profile?.complete" class="mt-8 card border-amber-700/30 p-6">
        <h3 class="font-semibold text-amber-200">Complete your profile for better matches</h3>
        <p class="mt-2 text-sm text-slate-400">Add your skills and target titles so jobs are scored to you — not just the agent default.</p>
        <RouterLink to="/profile" class="btn-primary mt-4 inline-block">Set up profile</RouterLink>
      </div>

      <div v-if="marketPulse" class="mt-8 card p-6">
        <h3 class="font-semibold text-slate-200">Market pulse</h3>
        <p class="mt-2 text-sm text-slate-400">
          {{ marketPulse.totalJobs }} jobs · {{ marketPulse.remotePercent }}% remote · Avg {{ marketPulse.avgMatchPct }}% match
        </p>
        <p class="mt-3 text-sm text-slate-500">
          Hot:
          <span v-for="s in marketPulse.trendingSkills?.slice(0, 6)" :key="s.skill" class="ml-2 badge badge-teal">{{ s.skill }}</span>
        </p>
        <RouterLink to="/intelligence" class="mt-3 inline-block text-sm text-teal-400">Full intelligence hub →</RouterLink>
      </div>

      <div class="mt-8 card p-6">
        <h3 class="font-semibold text-slate-200">Quick actions</h3>
        <div class="mt-4 flex flex-wrap gap-3">
          <RouterLink to="/approvals" class="btn-primary">Apply Queue</RouterLink>
          <RouterLink to="/jobs" class="btn-secondary">Browse jobs</RouterLink>
          <RouterLink to="/agent" class="btn-secondary">Run agent</RouterLink>
          <RouterLink to="/intelligence" class="btn-secondary">AI intel</RouterLink>
          <RouterLink to="/chat" class="btn-secondary">AI coach</RouterLink>
        </div>
      </div>
    </template>
  </div>
</template>
