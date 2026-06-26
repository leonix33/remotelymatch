<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';
import { useProfileStore } from '../stores/profile';
import { useAuthStore } from '../stores/auth';
import ResumeUpload from '../components/ResumeUpload.vue';
import ResumePreview from '../components/ResumePreview.vue';
import TailorApplySettings from '../components/TailorApplySettings.vue';
import TailoredResumeDashboard from '../components/TailoredResumeDashboard.vue';
import { useQuickApply } from '../composables/useQuickApply';
import { useProfileAutosave } from '../composables/useProfileAutosave';
import { isUnreadableResumeText } from '../utils/resumeText';

const profileStore = useProfileStore();
const auth = useAuthStore();
const { applying, message, error: applyError, step, quickApply } = useQuickApply();
const { saveState, schedule, flush } = useProfileAutosave();

const resumeText = ref('');
const resumeMode = ref('tailored');
const supplementPages = ref(3);
const tailorMode = ref('balanced');
const digestEmail = ref('');
const contactPhone = ref('');
const applicantName = ref('');
const jobCount = ref(15);
const savingResume = ref(false);
const saveMessage = ref('');
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

const firstName = computed(() => {
  const name =
    profileStore.profile?.applicantName?.trim() ||
    profileStore.profile?.displayName?.trim() ||
    auth.user?.name ||
    '';
  return name ? name.split(' ')[0] : '';
});

const resumeUnreadable = computed(
  () => profileStore.profile?.resumeUnreadable || isUnreadableResumeText(resumeText.value)
);
const hasResume = computed(
  () => !resumeUnreadable.value && (resumeText.value || '').trim().length >= 50
);
const hasEmail = computed(() => Boolean(digestEmail.value?.trim()));
const hasApplicantName = computed(() => Boolean(applicantName.value?.trim()));
const profileReady = computed(() => hasResume.value && profileStore.profile?.onboardingComplete && hasEmail.value && hasApplicantName.value);
const canApply = computed(() => profileReady.value && !applying.value);

const extractedSkills = computed(() => profileStore.extractedSkills);

const applyPlanSummary = computed(() => {
  if (resumeMode.value === 'base') {
    return `Base resume · submitted as ${digestEmail.value || 'your email'}`;
  }
  const mode =
    tailorMode.value === 'high_match'
      ? 'high-match (word-for-word JD alignment)'
      : 'balanced tailoring';
  return `Tailored · ${supplementPages.value} supplement page${supplementPages.value === 1 ? '' : 's'} · ${mode} · ${digestEmail.value || 'your email'}`;
});

function syncFromProfile(p) {
  if (!p) return;
  if (p.resumeUnreadable || isUnreadableResumeText(p.resumeText || '')) {
    resumeText.value = '';
  } else {
    resumeText.value = p.resumeText || '';
  }
  resumeMode.value = p.defaultApplyResumeMode === 'base' ? 'base' : 'tailored';
  supplementPages.value = p.defaultSupplementPages || 3;
  tailorMode.value = p.defaultTailorMode === 'high_match' ? 'high_match' : 'balanced';
  digestEmail.value = p.digestEmail || '';
  contactPhone.value = p.contactPhone || '';
  applicantName.value = p.applicantName || p.displayName || auth.user?.name || '';
  if (p.defaultQuickApplyCount) jobCount.value = p.defaultQuickApplyCount;
}

watch(() => profileStore.profile, syncFromProfile, { immediate: true });

function dashboardPayload() {
  return {
    resumeText: resumeText.value,
    defaultApplyResumeMode: resumeMode.value,
    defaultSupplementPages: supplementPages.value,
    defaultTailorMode: tailorMode.value,
    digestEmail: digestEmail.value.trim(),
    contactPhone: contactPhone.value.trim(),
    applicantName: applicantName.value.trim(),
    defaultQuickApplyCount: jobCount.value,
  };
}

watch([resumeText, resumeMode, supplementPages, tailorMode, digestEmail, contactPhone, applicantName, jobCount], () => {
  if (!autosaveEnabled.value || !profileStore.loaded) return;
  schedule(dashboardPayload);
});

const saveStatusLabel = computed(() => {
  if (saveState.value === 'saving') return 'Saving…';
  if (saveState.value === 'saved') return 'Saved';
  if (saveState.value === 'error') return 'Save failed — will retry when you edit';
  return '';
});

async function saveApplySettings() {
  await flush(dashboardPayload);
}

async function saveResumeText() {
  if (isUnreadableResumeText(resumeText.value)) {
    saveMessage.value = 'This looks like a broken file upload. Upload PDF or .docx instead.';
    return;
  }
  savingResume.value = true;
  saveMessage.value = '';
  try {
    await flush(dashboardPayload);
    saveMessage.value = 'Resume saved';
    setTimeout(() => { saveMessage.value = ''; }, 2500);
  } catch (e) {
    saveMessage.value = e.response?.data?.message || 'Could not save resume';
  } finally {
    savingResume.value = false;
  }
}

function onResumeParsed() {
  resumeText.value = profileStore.profile?.resumeText || resumeText.value;
}

async function startApplying() {
  await saveResumeText();
  await saveApplySettings();
  tailoredSeedKits.value = [];
  tailoredPreferredJobId.value = '';
  showTailoredPreview.value = resumeMode.value === 'tailored';
  try {
    const result = await quickApply({
      count: jobCount.value,
      useTailoredResume: resumeMode.value === 'tailored',
      minMatch: profileStore.profile?.minMatchScore || 40,
      runSearch: true,
    });
    if (result?.kits?.length) {
      tailoredSeedKits.value = result.kits;
      tailoredPreferredJobId.value = result.kits[0]?.jobId || result.jobs?.[0]?.jobId || '';
      showTailoredPreview.value = true;
    } else if (resumeMode.value === 'tailored') {
      showTailoredPreview.value = true;
    }
    await loadStatus();
    tailoredRefreshKey.value += 1;
  } catch {
    /* error shown via applyError */
  }
}

async function loadStatus() {
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
    if (activity.submitted != null) {
      queueCounts.value = { ...queueCounts.value, applied: activity.submitted };
    }
  } catch {
    queueCounts.value = { pending: 0, approved: 0, applied: 0 };
    recentApplied.value = [];
    activityCompanies.value = [];
    totalApplications.value = 0;
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
  <div class="mx-auto max-w-3xl">
    <div class="text-center lg:text-left">
      <h1 class="text-2xl font-bold text-slate-100">
        {{ firstName ? `Hi ${firstName}` : 'Welcome' }}
      </h1>
      <p class="mt-1 text-slate-400">Upload your resume, set tailoring options, and apply with your email.</p>
      <p v-if="saveStatusLabel" class="mt-2 text-xs text-teal-400/90">{{ saveStatusLabel }}</p>
    </div>

    <!-- Step 1: Resume -->
    <section class="card mt-8 p-6">
      <div class="flex items-center gap-3">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-sm font-bold text-teal-300">1</span>
        <div>
          <h2 class="font-semibold text-slate-100">Your resume</h2>
          <p class="text-sm text-slate-500">Upload and preview before applying</p>
        </div>
      </div>

      <div class="mt-5">
        <ResumeUpload
          v-model="resumeText"
          :apply-to-profile="true"
          :merge-skills="false"
          :show-preview="false"
          @parsed="onResumeParsed"
        />
      </div>

      <div class="mt-4">
        <label class="mb-1 block text-sm text-slate-400">Or paste resume text</label>
        <textarea
          :value="resumeUnreadable ? '' : resumeText"
          rows="6"
          class="input text-sm"
          placeholder="Paste your resume here…"
          @input="resumeText = $event.target.value"
          @blur="saveResumeText"
        />
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" class="btn-secondary text-sm" :disabled="savingResume" @click="saveResumeText">
            {{ savingResume ? 'Saving…' : 'Save resume' }}
          </button>
          <p v-if="saveMessage" class="text-sm text-teal-300">{{ saveMessage }}</p>
        </div>
      </div>

      <ResumePreview
        class="mt-5"
        :resume-text="resumeUnreadable ? '' : resumeText"
        :score="resumeUnreadable ? 0 : profileStore.resumeScore"
        :skills="extractedSkills"
        :unreadable="resumeUnreadable"
      />
    </section>

    <!-- Step 2: Tailoring + email -->
    <section class="card mt-6 p-6">
      <div class="flex items-center gap-3">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-sm font-bold text-teal-300">2</span>
        <div>
          <h2 class="font-semibold text-slate-100">How to apply</h2>
          <p class="text-sm text-slate-500">Resume mode, pages, JD matching, and your application email</p>
        </div>
      </div>

      <TailorApplySettings
        v-model:resume-mode="resumeMode"
        v-model:supplement-pages="supplementPages"
        v-model:tailor-mode="tailorMode"
        v-model:digest-email="digestEmail"
        v-model:contact-phone="contactPhone"
        v-model:applicant-name="applicantName"
        v-model:job-count="jobCount"
        class="mt-5"
        :show-job-count="true"
      />
    </section>

    <!-- Step 3: Apply -->
    <section class="card mt-6 p-6">
      <div class="flex items-center gap-3">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-sm font-bold text-teal-300">3</span>
        <div>
          <h2 class="font-semibold text-slate-100">Start applying</h2>
          <p class="text-sm text-slate-500">Review your plan, then submit</p>
        </div>
      </div>

      <div class="mt-5 rounded-xl border border-teal-900/40 bg-teal-950/20 p-4 text-sm">
        <p class="font-medium text-teal-200">Your apply plan</p>
        <p class="mt-2 text-slate-300">{{ applyPlanSummary }}</p>
        <p class="mt-1 text-xs text-slate-500">{{ jobCount }} top-matching jobs · forms filled with the email above</p>
      </div>

      <div v-if="resumeUnreadable" class="mt-5 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm text-amber-200">
        Your resume data is corrupted. Use <strong>Clear broken resume</strong> above, then re-upload your .docx or PDF.
      </div>
      <div v-else-if="!hasResume" class="mt-5 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm text-amber-200">
        Upload or paste your resume above before applying.
      </div>
      <div v-else-if="!hasEmail" class="mt-5 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm text-amber-200">
        Add your personal email in step 2 — applications need your real address.
      </div>
      <div v-else-if="!hasApplicantName" class="mt-5 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm text-amber-200">
        Add your application name in step 2 — employers need the name that should appear on forms.
      </div>
      <div v-else-if="!profileStore.profile?.onboardingComplete" class="mt-5 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4">
        <p class="text-sm text-amber-200">Finish setting up your profile first.</p>
        <RouterLink to="/onboarding" class="btn-secondary mt-3 inline-block text-sm">Complete setup →</RouterLink>
      </div>

      <button
        class="btn-primary mt-5 w-full py-4 text-base font-semibold sm:w-auto sm:px-10"
        :disabled="!canApply"
        @click="startApplying"
      >
        {{ applying ? step || 'Applying…' : `Start applying to ${jobCount} jobs` }}
      </button>

      <p v-if="applyError" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ applyError }}</p>
      <p v-if="message" class="mt-4 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ message }}</p>

      <p class="mt-4 text-xs text-slate-500">
        Want to pick jobs yourself?
        <RouterLink to="/jobs" class="text-teal-400 hover:underline">Browse jobs</RouterLink>
        or
        <RouterLink to="/approvals" class="text-teal-400 hover:underline">review queue</RouterLink>
      </p>
    </section>

    <!-- Tailored resume preview (after apply) -->
    <section v-if="showTailoredPreview || resumeMode === 'tailored'" class="card mt-6 p-6">
      <TailoredResumeDashboard
        :refresh-key="tailoredRefreshKey"
        :preferred-job-id="tailoredPreferredJobId"
        :seed-kits="tailoredSeedKits"
      />
    </section>

    <!-- Status -->
    <section v-if="!loading" class="card mt-6 p-6">
      <h2 class="font-semibold text-slate-200">Your activity</h2>
      <div class="mt-4 grid grid-cols-3 gap-3 text-center">
        <div class="rounded-xl bg-slate-800/50 p-3">
          <p class="text-2xl font-bold text-amber-300">{{ queueCounts.pending }}</p>
          <p class="text-xs text-slate-500">waiting</p>
        </div>
        <div class="rounded-xl bg-slate-800/50 p-3">
          <p class="text-2xl font-bold text-teal-300">{{ queueCounts.approved }}</p>
          <p class="text-xs text-slate-500">approved</p>
        </div>
        <div class="rounded-xl bg-slate-800/50 p-3">
          <p class="text-2xl font-bold text-slate-200">{{ queueCounts.applied }}</p>
          <p class="text-xs text-slate-500">applied</p>
        </div>
      </div>

      <div v-if="recentApplied.length" class="mt-5 space-y-2">
        <p class="text-sm font-medium text-slate-400">Recently applied</p>
        <div
          v-for="job in recentApplied"
          :key="job.jobId"
          class="flex items-center justify-between gap-2 rounded-lg bg-slate-800/40 px-3 py-2 text-sm"
        >
          <div class="min-w-0 truncate">
            <span class="text-slate-200">{{ job.title }}</span>
            <span class="text-slate-500"> · {{ job.company }}</span>
          </div>
          <span class="badge badge-teal shrink-0">{{ job.status || 'applied' }}</span>
        </div>
      </div>

      <div v-if="activityCompanies.length" class="mt-5">
        <p class="text-sm font-medium text-slate-400">Companies you've applied to</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <span
            v-for="company in activityCompanies"
            :key="`${company.name}-${company.jobId}`"
            class="rounded-full border border-slate-700/80 bg-slate-800/50 px-3 py-1 text-xs text-slate-300"
            :title="company.title"
          >
            {{ company.name }}
          </span>
        </div>
      </div>

      <p v-if="!recentApplied.length && !totalApplications" class="mt-4 text-sm text-slate-500">No applications yet — hit Start applying above.</p>
      <p v-else-if="totalApplications" class="mt-4 text-xs text-slate-600">{{ totalApplications }} application{{ totalApplications === 1 ? '' : 's' }} on your account</p>
    </section>

    <p class="mt-6 text-center text-xs text-slate-600">
      <RouterLink to="/profile" class="hover:text-teal-400">Edit profile</RouterLink>
      <template v-if="auth.isAdmin">
        · <RouterLink to="/agent" class="hover:text-teal-400">Admin: Run agent</RouterLink>
      </template>
    </p>
  </div>
</template>
