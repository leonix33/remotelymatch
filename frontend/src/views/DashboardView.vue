<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';
import { useProfileStore } from '../stores/profile';
import ResumeUpload from '../components/ResumeUpload.vue';
import ApplyWorkflowBanner from '../components/ApplyWorkflowBanner.vue';
import { useApplyQueue } from '../composables/useApplyQueue';

const profileStore = useProfileStore();
const { queueing, addToQueue } = useApplyQueue();
const recommendedJobs = ref([]);
const applications = ref([]);
const followUps = ref([]);
const loading = ref(true);
const queueMessage = ref('');
const queueError = ref('');

const savedJobs = computed(() => profileStore.profile?.savedJobs || []);
const extractedSkills = computed(() => profileStore.extractedSkills.slice(0, 10));

const firstName = computed(() => {
  const name = profileStore.profile?.displayName?.trim();
  return name ? name.split(' ')[0] : '';
});

const profileIncomplete = computed(() => !profileStore.complete);

const resumeScoreLabel = computed(() => {
  const score = profileStore.resumeScore;
  if (score >= 80) return 'Strong';
  if (score >= 50) return 'Good start';
  if (score > 0) return 'Needs work';
  return 'Not started';
});

const resumeScoreColor = computed(() => {
  const score = profileStore.resumeScore;
  if (score >= 80) return 'text-teal-300';
  if (score >= 50) return 'text-amber-300';
  return 'text-slate-400';
});

function matchPct(job) {
  return job.personalMatchPct || job.matchPct || 0;
}

function statusClass(status) {
  if (status === 'submitted') return 'badge-teal';
  if (status === 'bot-blocked') return 'badge-red';
  return 'badge-slate';
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function followUpIcon(type) {
  if (type === 'application') return '📋';
  if (type === 'interview') return '🎙';
  if (type === 'deadline') return '⏰';
  return '📌';
}

async function queueJob(job) {
  queueMessage.value = '';
  queueError.value = '';
  try {
    await addToQueue(job, 'dashboard');
    queueMessage.value = `${job.title} added to your apply queue`;
    await loadRecommendedJobs();
  } catch (e) {
    queueError.value = e.response?.data?.message || 'Could not add to queue';
  }
}

async function loadRecommendedJobs() {
  try {
    const { data } = await http.get('/approvals', {
      params: { status: 'pending', limit: 5, minMatch: 70 },
    });
    const items = data?.items || data || [];
    if (items.length) {
      recommendedJobs.value = items;
      return;
    }
  } catch {
    /* fall through to jobs list */
  }
  try {
    const { data } = await http.get('/jobs', { params: { minMatch: 75 } });
    recommendedJobs.value = (data || []).slice(0, 5);
  } catch {
    recommendedJobs.value = [];
  }
}

async function load() {
  loading.value = true;
  try {
    const [appsRes, followUpsRes] = await Promise.all([
      http.get('/applications'),
      http.get('/calendar/upcoming', { params: { days: 14 } }).catch(() => ({ data: [] })),
    ]);
    applications.value = (appsRes.data || []).slice(0, 5);
    followUps.value = (followUpsRes.data || [])
      .filter((e) => e.type === 'application' || e.type === 'interview' || e.type === 'deadline')
      .slice(0, 5);
    await loadRecommendedJobs();
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
    <!-- Top card -->
    <div class="card border-teal-600/30 bg-gradient-to-r from-teal-950/80 to-slate-900/80 p-6">
      <div class="flex flex-wrap items-start justify-between gap-6">
        <div class="min-w-0 flex-1">
          <h2 class="mt-1 text-2xl font-bold text-slate-100">
            Welcome back{{ firstName ? `, ${firstName}` : '' }}
          </h2>
          <div class="mt-4 max-w-sm">
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-400">Profile completion</span>
              <span class="font-semibold text-teal-300">{{ profileStore.completionPct }}%</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                class="h-full rounded-full bg-teal-500 transition-all"
                :style="{ width: `${profileStore.completionPct}%` }"
              />
            </div>
          </div>
        </div>
        <RouterLink to="/jobs" class="btn-primary btn-continue shrink-0 px-6 py-3">
          <span>Find matches</span>
          <span aria-hidden="true">→</span>
        </RouterLink>
      </div>
    </div>

    <ApplyWorkflowBanner class="mt-6" />

    <RouterLink
      to="/linkedin"
      class="mt-6 card flex flex-wrap items-center justify-between gap-4 border-sky-900/40 bg-sky-950/20 p-5 transition hover:border-sky-700/50"
    >
      <div>
        <p class="text-sm font-medium text-sky-200">LinkedIn workflow</p>
        <p class="mt-1 text-sm text-slate-400">
          Saved searches, extension queueing, and approve → agent apply — no bots.
        </p>
      </div>
      <span class="btn-secondary text-sm">Open →</span>
    </RouterLink>

    <p v-if="queueMessage" class="mt-4 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ queueMessage }}</p>
    <p v-if="queueError" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ queueError }}</p>

    <!-- Profile incomplete empty state -->
    <div
      v-if="profileIncomplete"
      class="mt-6 card border-amber-700/40 bg-amber-950/20 p-5"
    >
      <p class="font-medium text-amber-200">Complete your profile to unlock better matches.</p>
      <p class="mt-1 text-sm text-slate-400">
        Add your skills, target roles, and resume so we can score jobs to you.
      </p>
      <RouterLink to="/onboarding" class="btn-secondary mt-4 inline-block text-sm">Complete profile →</RouterLink>
    </div>

    <div v-if="loading" class="mt-8 text-slate-400">Loading your dashboard…</div>

    <template v-else>
      <div class="mt-8 space-y-6">
        <!-- 1. Recommended Jobs -->
        <section class="card p-6">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-slate-200">Recommended Jobs</h3>
            <RouterLink to="/jobs" class="text-sm text-teal-400 hover:underline">Browse all →</RouterLink>
          </div>
          <div v-if="recommendedJobs.length" class="mt-4 space-y-3">
            <div
              v-for="job in recommendedJobs"
              :key="job.jobId || job._id"
              class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3 last:border-0"
            >
              <div class="min-w-0">
                <p class="font-medium text-slate-200">{{ job.title }}</p>
                <p class="text-sm text-slate-500">{{ job.company }}</p>
              </div>
              <div class="flex items-center gap-2">
                <span class="badge badge-teal">{{ matchPct(job) }}%</span>
                <button
                  class="btn-primary px-2 py-1 text-xs"
                  :disabled="queueing === job.jobId"
                  @click="queueJob(job)"
                >
                  {{ queueing === job.jobId ? '…' : 'Queue' }}
                </button>
                <RouterLink to="/approvals" class="btn-secondary px-2 py-1 text-xs">Review</RouterLink>
              </div>
            </div>
          </div>
          <p v-else class="mt-4 text-sm text-slate-500">
            No matches yet.
            <RouterLink to="/agent" class="text-teal-400 hover:underline">Run the agent</RouterLink>
            to discover jobs, or
            <RouterLink to="/jobs" class="text-teal-400 hover:underline">browse the board</RouterLink>.
          </p>
        </section>

        <!-- 2 & 3: Application Tracker + AI Resume Score -->
        <div class="grid gap-6 lg:grid-cols-2">
          <section class="card p-6">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-slate-200">Application Tracker</h3>
              <RouterLink to="/applications" class="text-sm text-teal-400 hover:underline">See all →</RouterLink>
            </div>
            <div v-if="applications.length" class="mt-4 space-y-3">
              <div
                v-for="app in applications"
                :key="app.jobId || app._id"
                class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3 last:border-0"
              >
                <div class="min-w-0">
                  <p class="truncate font-medium text-slate-200">{{ app.title }}</p>
                  <p class="text-xs text-slate-500">{{ app.lastAttempted || 'No attempts yet' }}</p>
                </div>
                <span class="badge shrink-0" :class="statusClass(app.status)">
                  <RouterLink to="/applications" class="hover:underline">{{ app.status }}</RouterLink>
                </span>
              </div>
            </div>
            <p v-else class="mt-4 text-sm text-slate-500">
              No applications yet. Approve jobs from your
              <RouterLink to="/approvals" class="text-teal-400 hover:underline">apply queue</RouterLink>
              to get started.
            </p>
          </section>

          <section class="card p-6">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-slate-200">AI Resume Score</h3>
              <RouterLink to="/profile" class="text-sm text-teal-400 hover:underline">Improve →</RouterLink>
            </div>
            <div class="mt-4 flex items-end gap-4">
              <p class="text-5xl font-bold" :class="resumeScoreColor">{{ profileStore.resumeScore }}</p>
              <div>
                <p class="font-medium text-slate-300">{{ resumeScoreLabel }}</p>
                <p class="text-sm text-slate-500">Based on your profile &amp; resume</p>
              </div>
            </div>
            <div class="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                class="h-full rounded-full bg-teal-500/80 transition-all"
                :style="{ width: `${profileStore.resumeScore}%` }"
              />
            </div>
            <div v-if="extractedSkills.length" class="mt-4 flex flex-wrap gap-2">
              <span v-for="skill in extractedSkills" :key="skill" class="badge badge-teal">{{ skill }}</span>
            </div>
            <ResumeUpload
              class="mt-4"
              :model-value="profileStore.profile?.resumeText || ''"
              :apply-to-profile="true"
              :merge-skills="true"
              :show-preview="false"
              @parsed="load"
            />
            <p v-if="profileStore.resumeScore < 80" class="mt-4 text-sm text-slate-500">
              Upload a PDF resume or add more skills to raise your score and improve job matches.
            </p>
            <p v-else class="mt-4 text-sm text-slate-500">
              Your resume is in good shape. Use per-job resume diff on the jobs page to tailor further.
            </p>
          </section>
        </div>

        <!-- 4 & 5: Saved Jobs + Upcoming Follow-ups -->
        <div class="grid gap-6 lg:grid-cols-2">
          <section class="card p-6">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-slate-200">Saved Jobs</h3>
              <RouterLink to="/jobs" class="text-sm text-teal-400 hover:underline">Browse jobs →</RouterLink>
            </div>
            <div v-if="savedJobs.length" class="mt-4 space-y-3">
              <div
                v-for="job in savedJobs.slice(0, 5)"
                :key="job.jobId"
                class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3 last:border-0"
              >
                <div class="min-w-0">
                  <p class="font-medium text-slate-200">{{ job.title }}</p>
                  <p class="text-sm text-slate-500">{{ job.company }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <span v-if="job.matchPct" class="badge badge-teal">{{ job.matchPct }}%</span>
                  <button
                    class="btn-primary px-2 py-1 text-xs"
                    :disabled="queueing === job.jobId"
                    @click="queueJob(job)"
                  >
                    {{ queueing === job.jobId ? '…' : 'Queue' }}
                  </button>
                  <a
                    v-if="job.url"
                    :href="job.url"
                    target="_blank"
                    rel="noopener"
                    class="btn-secondary px-2 py-1 text-xs"
                  >
                    Open
                  </a>
                </div>
              </div>
            </div>
            <div v-else class="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-800/30 p-6 text-center">
              <p class="text-sm text-slate-400">No saved jobs yet.</p>
              <p class="mt-1 text-xs text-slate-500">Save jobs from the board to revisit them here.</p>
              <RouterLink to="/jobs" class="btn-secondary mt-4 inline-block text-sm">Find jobs to save</RouterLink>
            </div>
          </section>

          <section class="card p-6">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-slate-200">Upcoming Follow-ups</h3>
              <RouterLink to="/calendar" class="text-sm text-teal-400 hover:underline">Calendar →</RouterLink>
            </div>
            <div v-if="followUps.length" class="mt-4 space-y-3">
              <div
                v-for="event in followUps"
                :key="event.id"
                class="flex items-start gap-3 border-b border-slate-800/80 pb-3 last:border-0"
              >
                <span class="text-lg leading-none">{{ followUpIcon(event.type) }}</span>
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-slate-200">{{ event.title }}</p>
                  <p class="text-sm text-slate-500">{{ formatDate(event.startDate) }}</p>
                </div>
              </div>
            </div>
            <p v-else class="mt-4 text-sm text-slate-500">
              No follow-ups scheduled.
              <RouterLink to="/calendar" class="text-teal-400 hover:underline">Add one on the calendar</RouterLink>
              to stay on top of applications.
            </p>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
