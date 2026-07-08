<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';
import { useProfileStore } from '../stores/profile';
import { useAuthStore } from '../stores/auth';
import ResumeUpload from '../components/ResumeUpload.vue';
import ResumePreview from '../components/ResumePreview.vue';
import TopMatchJobsPreview from '../components/TopMatchJobsPreview.vue';
import TailoredResumeDashboard from '../components/TailoredResumeDashboard.vue';
import SetupChecklist from '../components/SetupChecklist.vue';
import AppliedJobsPanel from '../components/AppliedJobsPanel.vue';
import { useQuickApply } from '../composables/useQuickApply';
import { useProfileAutosave } from '../composables/useProfileAutosave';
import { isUnreadableResumeText } from '../utils/resumeText';

const profileStore = useProfileStore();
const auth = useAuthStore();
const { applying, message, error: applyError, step: applyStep, quickApply } = useQuickApply();
const { saveState, schedule, flush } = useProfileAutosave();

const resumeText = ref('');
const digestEmail = ref('');
const applicantName = ref('');
const jobCount = ref(3);
const autoApplyEnabled = ref(false);
const savingResume = ref(false);
const queueCounts = ref({ pending: 0, approved: 0, applied: 0 });
const recentApplied = ref([]);
const activityCompanies = ref([]);
const totalApplications = ref(0);
const loading = ref(true);
const tailoredRefreshKey = ref(0);
const tailoredSeedKits = ref([]);
const tailoredPreferredJobId = ref('');
const showTailoredPreview = ref(false);
const autosaveEnabled = ref(false);
const setupRef = ref(null);
const activityLoading = ref(false);
const resumeExpanded = ref(false);
const matchRefreshKey = ref(0);

const wizardSteps = [
  { n: 1, label: 'Resume' },
  { n: 2, label: 'Matches' },
  { n: 3, label: 'Apply' },
  { n: 4, label: 'Queue' },
];

const firstName = computed(() => {
  const name =
    profileStore.profile?.applicantName?.trim() ||
    profileStore.profile?.displayName?.trim() ||
    auth.user?.name ||
    '';
  return name ? name.split(' ')[0] : '';
});

const resumeUnreadable = computed(
  () =>
    Boolean(profileStore.profile?.resumeUnreadable) ||
    Boolean(resumeText.value?.trim() && isUnreadableResumeText(resumeText.value))
);
const hasResume = computed(
  () => !resumeUnreadable.value && (resumeText.value || '').trim().length >= 50
);
const hasEmail = computed(() => Boolean(digestEmail.value?.trim()));
const hasApplicantName = computed(() => Boolean(applicantName.value?.trim()));
const profileReady = computed(
  () => hasResume.value && profileStore.profile?.onboardingComplete && hasEmail.value && hasApplicantName.value
);
const canApply = computed(() => profileReady.value && !applying.value);
const currentWizardStep = computed(() => {
  if (!hasResume.value) return 1;
  if (!profileReady.value) return 1;
  return 3;
});

const applyButtonLabel = computed(() => {
  if (applying.value) return applyStep.value || 'Working…';
  if (autoApplyEnabled.value) return `Apply to top ${jobCount.value} callback matches`;
  return `Prepare ${jobCount.value} high-callback applications`;
});

function syncFromProfile(p) {
  if (!p) return;
  if (p.resumeUnreadable || (p.resumeText?.trim() && isUnreadableResumeText(p.resumeText))) {
    resumeText.value = '';
  } else {
    resumeText.value = p.resumeText || '';
  }
  digestEmail.value = p.digestEmail || '';
  applicantName.value = p.applicantName || p.displayName || auth.user?.name || '';
  if (p.defaultQuickApplyCount) jobCount.value = p.defaultQuickApplyCount;
  autoApplyEnabled.value = p.autoApplyEnabled === true;
  if (!hasResume.value) resumeExpanded.value = true;
}

watch(() => profileStore.profile, syncFromProfile, { immediate: true });

function dashboardPayload() {
  return {
    resumeText: resumeText.value,
    digestEmail: digestEmail.value.trim(),
    applicantName: applicantName.value.trim(),
    defaultQuickApplyCount: jobCount.value,
    autoApplyEnabled: autoApplyEnabled.value,
    tailorResumeOnApply: true,
    defaultApplyResumeMode: 'tailored',
    defaultTailorMode: 'high_match',
  };
}

watch([resumeText, digestEmail, applicantName, jobCount, autoApplyEnabled], () => {
  if (!autosaveEnabled.value || !profileStore.loaded) return;
  schedule(dashboardPayload);
});

async function saveSettings() {
  await flush(dashboardPayload);
}

async function onResumeParsed() {
  syncFromProfile(profileStore.profile);
  matchRefreshKey.value += 1;
  resumeExpanded.value = false;
}

async function onMatchApproved() {
  await loadStatus();
}

function mergeBatchIntoActivity(result) {
  if (!result?.jobs?.length) return;
  const status = result.queued || result.preparedOnly ? 'queued' : 'submitted';
  const now = new Date().toISOString();
  const batch = result.jobs.map((j) => ({
    jobId: j.jobId,
    title: j.title,
    company: j.company,
    url: j.url,
    source: j.source,
    status: result.preparedOnly ? 'prepared' : status,
    submittedAt: result.preparedOnly ? null : now,
    lastAttempted: now,
  }));
  const seen = new Set(batch.map((j) => j.jobId));
  recentApplied.value = [...batch, ...recentApplied.value.filter((j) => !seen.has(j.jobId))].slice(0, 25);
  if (!result.preparedOnly) {
    totalApplications.value = Math.max(totalApplications.value, recentApplied.value.length);
    queueCounts.value = {
      ...queueCounts.value,
      applied: (queueCounts.value.applied || 0) + batch.length,
    };
  }
}

async function startApplying() {
  await saveSettings();
  tailoredSeedKits.value = [];
  tailoredPreferredJobId.value = '';
  showTailoredPreview.value = false;
  try {
    const result = await quickApply({
      count: jobCount.value,
      useTailoredResume: true,
      autoApply: autoApplyEnabled.value,
      minMatch: profileStore.profile?.minMatchScore || 50,
      minCallback: profileStore.profile?.minCallbackScore ?? 25,
      runSearch: false,
    });
    if (result?.kits?.length || result?.count) {
      tailoredSeedKits.value = result.kits || [];
      tailoredPreferredJobId.value = result.kits?.[0]?.jobId || result.jobs?.[0]?.jobId || '';
      showTailoredPreview.value = true;
    }
    await loadStatus();
    mergeBatchIntoActivity(result);
    setupRef.value?.refresh?.();
    tailoredRefreshKey.value += 1;
    matchRefreshKey.value += 1;
  } catch {
    /* error shown via applyError */
  }
}

async function loadStatus() {
  activityLoading.value = true;
  try {
    const [summaryRes, activityRes] = await Promise.all([
      http.get('/approvals/summary'),
      http.get('/applications/activity'),
    ]);
    queueCounts.value = summaryRes.data || { pending: 0, approved: 0, applied: 0 };
    const activity = activityRes.data || {};
    recentApplied.value = activity.recentApplied || [];
    activityCompanies.value = activity.companies || [];
    totalApplications.value = activity.totalApplications || 0;
  } catch {
    queueCounts.value = { pending: 0, approved: 0, applied: 0 };
  } finally {
    activityLoading.value = false;
  }
}

onMounted(async () => {
  if (!profileStore.loaded) {
    profileStore.hydrateFromCache();
    await profileStore.fetch().catch(() => {});
  }
  syncFromProfile(profileStore.profile);
  loading.value = false;
  autosaveEnabled.value = true;
  await loadStatus();
});
</script>

<template>
  <div class="mobile-page-shell mx-auto max-w-3xl">
    <div class="text-center lg:text-left">
      <h1 class="text-2xl font-bold text-slate-100">
        {{ firstName ? `${firstName}, let's get interviews` : 'Get interviews' }}
      </h1>
      <p class="mt-1 text-slate-400">
        Upload any resume → we find the best jobs → tailor &amp; apply → you polish in Queue when needed.
      </p>
    </div>

    <!-- Wizard progress -->
    <div class="mt-6">
      <div class="flex gap-2">
        <div
          v-for="s in wizardSteps"
          :key="s.n"
          class="flex flex-1 flex-col items-center gap-1"
        >
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors"
            :class="currentWizardStep >= s.n ? 'bg-teal-500/25 text-teal-300' : 'bg-slate-800 text-slate-500'"
          >
            {{ s.n }}
          </div>
          <span class="text-[10px] text-slate-500">{{ s.label }}</span>
        </div>
      </div>
    </div>

    <SetupChecklist v-if="auth.isAdmin" ref="setupRef" class="mt-6" />

    <!-- Step 1: Resume -->
    <section class="card mt-8 p-4 sm:p-6">
      <button
        type="button"
        class="flex w-full items-center gap-3 text-left"
        @click="resumeExpanded = !resumeExpanded"
      >
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          :class="hasResume ? 'bg-teal-500/25 text-teal-300' : 'bg-teal-500/20 text-teal-300'"
        >1</span>
        <div class="min-w-0 flex-1">
          <h2 class="font-semibold text-slate-100">Your resume</h2>
          <p class="text-sm text-slate-500">
            {{ hasResume ? 'Uploaded — tap to update' : 'Upload once, we build your whole profile' }}
          </p>
        </div>
        <span class="text-slate-500">{{ resumeExpanded ? '▾' : '▸' }}</span>
      </button>

      <div v-if="resumeExpanded || !hasResume" class="mt-5 space-y-4">
        <ResumeUpload
          v-model="resumeText"
          :variant="hasResume ? 'default' : 'hero'"
          :apply-to-profile="true"
          :merge-skills="false"
          :show-preview="false"
          @parsed="onResumeParsed"
        />
        <details class="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <summary class="cursor-pointer text-sm text-slate-400">Or paste resume text</summary>
          <textarea
            :value="resumeUnreadable ? '' : resumeText"
            rows="5"
            class="input mt-3 text-sm"
            placeholder="Paste your resume here…"
            @input="resumeText = $event.target.value"
            @blur="saveSettings"
          />
        </details>
        <ResumePreview
          :resume-text="resumeUnreadable ? '' : resumeText"
          :score="resumeUnreadable ? 0 : profileStore.resumeScore"
          :skills="profileStore.extractedSkills"
          :unreadable="resumeUnreadable"
        />
      </div>
      <p v-else-if="hasResume" class="mt-3 text-sm text-teal-400/90">
        ✓ Resume ready · {{ profileStore.extractedSkills?.length || 0 }} skills detected
      </p>
    </section>

    <!-- Step 2: Matches -->
    <section class="card mt-6 p-4 sm:p-6">
      <div class="flex items-center gap-3">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-sm font-bold text-teal-300">2</span>
        <div>
          <h2 class="font-semibold text-slate-100">Best matches for recruiter callbacks</h2>
          <p class="text-sm text-slate-500">
            Quality over volume — US remote $140k+ from company ATS boards, ranked by callback score
          </p>
        </div>
      </div>
      <TopMatchJobsPreview
        class="mt-5"
        :refresh-key="matchRefreshKey"
        :min-match="profileStore.profile?.minMatchScore || 50"
        :limit="jobCount"
        @approved="onMatchApproved"
      />
    </section>

    <!-- Step 3: Apply -->
    <section class="card mt-6 p-4 sm:p-6">
      <div class="flex items-center gap-3">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-sm font-bold text-teal-300">3</span>
        <div>
          <h2 class="font-semibold text-slate-100">Apply</h2>
          <p class="text-sm text-slate-500">Tailor for a few high-callback roles — quality beats spray-and-pray</p>
        </div>
      </div>

      <div class="mt-5 space-y-4">
        <div>
          <label class="mb-1 block text-sm text-slate-400">Your email on applications</label>
          <input v-model="digestEmail" type="email" class="input" placeholder="you@gmail.com" @blur="saveSettings" />
        </div>
        <div>
          <label class="mb-1 block text-sm text-slate-400">Name on applications</label>
          <input v-model="applicantName" class="input" placeholder="Full name" @blur="saveSettings" />
        </div>

        <div class="flex flex-wrap items-center gap-4">
          <label class="text-sm text-slate-300">
            Jobs to apply:
            <input
              v-model.number="jobCount"
              type="number"
              min="1"
              max="10"
              class="input ml-2 inline-block w-16 text-center"
              @change="saveSettings"
            />
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input v-model="autoApplyEnabled" type="checkbox" class="accent-teal-500" @change="saveSettings" />
            Submit immediately (off = review kits first)
          </label>
        </div>

        <div class="rounded-lg border border-teal-900/40 bg-teal-950/20 p-3 text-sm text-teal-200/90">
          <p class="font-medium text-teal-300">Quality-first strategy</p>
          <ul class="mt-2 space-y-1 text-xs text-slate-400">
            <li>· Only roles with <strong class="text-slate-300">25%+ callback score</strong> are queued</li>
            <li>· Prefer <strong class="text-slate-300">Greenhouse / Lever / Ashby</strong> — recruiters actually review these</li>
            <li>· Apply to <strong class="text-slate-300">3–5 strong fits/week</strong>, then follow up within 5 days</li>
            <li>· Log every reply at <RouterLink to="/outcomes" class="text-teal-400 hover:underline">Outcomes</RouterLink> — scores improve over time</li>
          </ul>
        </div>

        <details class="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <summary class="cursor-pointer text-sm text-slate-400">Customize tailoring</summary>
          <p class="mt-2 text-xs text-slate-500">
            Tailored resumes with high ATS match are on by default.
            <RouterLink to="/profile" class="text-teal-400 hover:underline">Edit in Profile</RouterLink>
          </p>
        </details>
      </div>

      <div v-if="resumeUnreadable" class="mt-5 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm text-amber-200">
        Resume upload failed — re-upload PDF or .docx.
      </div>
      <div v-else-if="!hasResume" class="mt-5 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm text-amber-200">
        Upload your resume in step 1 first.
      </div>
      <div v-else-if="!hasEmail || !hasApplicantName" class="mt-5 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm text-amber-200">
        Add your email and name above — recruiters need a way to reach you.
      </div>
      <div v-else-if="!profileStore.profile?.onboardingComplete" class="mt-5 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4">
        <p class="text-sm text-amber-200">Quick setup first.</p>
        <RouterLink to="/onboarding" class="btn-secondary mt-3 inline-block text-sm">Finish setup →</RouterLink>
      </div>

      <button
        class="btn-primary mt-5 w-full py-4 text-base font-semibold"
        :disabled="!canApply"
        @click="startApplying"
      >
        {{ applyButtonLabel }}
      </button>

      <p v-if="applyError" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ applyError }}</p>
      <p v-if="message" class="mt-4 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ message }}</p>
    </section>

    <!-- Step 4: Queue -->
    <section class="card mt-6 p-4 sm:p-6">
      <div class="flex items-center gap-3">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-sm font-bold text-teal-300">4</span>
        <div>
          <h2 class="font-semibold text-slate-100">Queue — polish &amp; follow up</h2>
          <p class="text-sm text-slate-500">Manual tweaks when you want them — polish kits, then recruiter follow-ups</p>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-3 gap-3 text-center">
        <div class="rounded-xl bg-slate-800/50 p-3">
          <p class="text-2xl font-bold text-amber-300">{{ queueCounts.pending }}</p>
          <p class="text-xs text-slate-500">in queue</p>
        </div>
        <div class="rounded-xl bg-slate-800/50 p-3">
          <p class="text-2xl font-bold text-teal-300">{{ queueCounts.approved }}</p>
          <p class="text-xs text-slate-500">ready</p>
        </div>
        <div class="rounded-xl bg-slate-800/50 p-3">
          <p class="text-2xl font-bold text-slate-200">{{ queueCounts.applied }}</p>
          <p class="text-xs text-slate-500">applied</p>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap gap-3">
        <RouterLink to="/approvals" class="btn-primary text-sm">Open Queue</RouterLink>
        <RouterLink to="/follow-ups" class="btn-secondary text-sm">Follow-ups</RouterLink>
      </div>
      <p class="mt-3 text-xs text-slate-500">
        In Queue: <strong class="text-slate-400">Polish until ready</strong> for 95% ATS match,
        then <strong class="text-slate-400">Generate follow-up kit</strong> to reach recruiters.
      </p>
    </section>

    <section v-if="showTailoredPreview" class="card mt-6 p-6">
      <TailoredResumeDashboard
        :refresh-key="tailoredRefreshKey"
        :preferred-job-id="tailoredPreferredJobId"
        :seed-kits="tailoredSeedKits"
      />
    </section>

    <section v-if="!loading && recentApplied.length" class="card mt-6 p-6">
      <AppliedJobsPanel
        :jobs="recentApplied"
        :companies="activityCompanies"
        :total="totalApplications"
        :loading="activityLoading"
      />
    </section>

    <p v-if="saveState === 'saved'" class="mt-4 text-center text-xs text-teal-400/80">Saved</p>
    <p class="mt-4 text-center text-xs text-slate-600">
      <RouterLink to="/profile" class="hover:text-teal-400">Profile settings</RouterLink>
      ·
      <RouterLink to="/jobs" class="hover:text-teal-400">Browse all jobs</RouterLink>
    </p>
  </div>
</template>
