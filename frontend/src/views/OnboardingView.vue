<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useProfileStore } from '../stores/profile';
import { useAuthStore } from '../stores/auth';
import ResumeUpload from '../components/ResumeUpload.vue';
import ResumePreview from '../components/ResumePreview.vue';
import TailorApplySettings from '../components/TailorApplySettings.vue';
import { useProfileAutosave } from '../composables/useProfileAutosave';
import {
  clearOnboardingStep,
  readOnboardingStep,
  writeOnboardingStep,
} from '../utils/profileDraft';

const router = useRouter();
const profileStore = useProfileStore();
const auth = useAuthStore();
const { saveState, schedule, flush } = useProfileAutosave({ delay: 700 });

const steps = [
  { label: 'About you' },
  { label: 'Resume' },
  { label: 'Apply settings' },
];

const step = ref(1);
const saving = ref(false);
const error = ref('');
const autosaveEnabled = ref(false);

const resumeMode = ref('tailored');
const supplementPages = ref(3);
const tailorMode = ref('balanced');
const digestEmail = ref('');
const contactPhone = ref('');

function onResumeParsed(result) {
  form.value.resumeText = result.resumeText;
  const mustHave = result.extractedSkills?.mustHave || [];
  const niceToHave = result.extractedSkills?.niceToHave || [];
  const suggestedTitles = result.suggestedTitles || [];

  if (mustHave.length) {
    form.value.mustHaveSkills = mustHave.join('\n');
  }
  if (niceToHave.length) {
    form.value.niceToHaveSkills = niceToHave.join('\n');
  }
  if (!form.value.headline?.trim() && result.suggestedHeadline) {
    form.value.headline = result.suggestedHeadline;
  }
  if (suggestedTitles.length) {
    form.value.targetTitles = suggestedTitles.join('\n');
  }
}

const form = ref({
  displayName: auth.user?.name || '',
  headline: '',
  linkedin: '',
  targetTitles: '',
  mustHaveSkills: '',
  niceToHaveSkills: '',
  resumeText: '',
});

function draftPayload() {
  return {
    displayName: form.value.displayName,
    headline: form.value.headline,
    linkedin: form.value.linkedin,
    resumeText: form.value.resumeText,
    targetTitles: form.value.targetTitles.split('\n').filter(Boolean),
    mustHaveSkills: form.value.mustHaveSkills.split('\n').filter(Boolean),
    niceToHaveSkills: form.value.niceToHaveSkills.split('\n').filter(Boolean),
    contactPhone: contactPhone.value.trim(),
    digestEmail: digestEmail.value.trim(),
    defaultApplyResumeMode: resumeMode.value,
    defaultSupplementPages: supplementPages.value,
    defaultTailorMode: tailorMode.value,
    onboardingComplete: false,
  };
}

function loadFromProfile(p) {
  if (!p) return;
  form.value.displayName = p.displayName || form.value.displayName || auth.user?.name || '';
  form.value.headline = p.headline || '';
  form.value.linkedin = p.linkedin || '';
  form.value.resumeText = p.resumeText || '';
  if (p.targetTitles?.length) form.value.targetTitles = p.targetTitles.join('\n');
  if (p.mustHaveSkills?.length) form.value.mustHaveSkills = p.mustHaveSkills.join('\n');
  if (p.niceToHaveSkills?.length) form.value.niceToHaveSkills = p.niceToHaveSkills.join('\n');
  digestEmail.value = p.digestEmail || auth.user?.email || '';
  contactPhone.value = p.contactPhone || '';
  resumeMode.value = p.defaultApplyResumeMode === 'base' ? 'base' : 'tailored';
  supplementPages.value = p.defaultSupplementPages || 3;
  tailorMode.value = p.defaultTailorMode === 'high_match' ? 'high_match' : 'balanced';
}

watch(
  [form, resumeMode, supplementPages, tailorMode, digestEmail, contactPhone],
  () => {
    if (!autosaveEnabled.value || !profileStore.loaded) return;
    schedule(draftPayload);
    writeOnboardingStep(auth.user?.id, step.value);
  },
  { deep: true }
);

async function finish() {
  error.value = '';
  if (!form.value.resumeText.trim() || form.value.resumeText.trim().length < 50) {
    error.value = 'Please upload or paste your resume (at least a few lines).';
    return;
  }
  if (!digestEmail.value.trim()) {
    error.value = 'Add your personal email — applications need your real address.';
    return;
  }
  saving.value = true;
  try {
    await profileStore.save({
      ...draftPayload(),
      onboardingComplete: true,
    });
    clearOnboardingStep(auth.user?.id);
    router.push('/');
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not save profile';
  } finally {
    saving.value = false;
  }
}

async function goNext() {
  if (step.value === 2 && form.value.resumeText.trim().length < 50) {
    error.value = 'Please upload or paste your resume first.';
    return;
  }
  if (step.value === 3 && !digestEmail.value.trim()) {
    error.value = 'Add your personal email before continuing.';
    return;
  }
  error.value = '';
  await flush(draftPayload);
  writeOnboardingStep(auth.user?.id, step.value + 1);
  step.value += 1;
}

onMounted(async () => {
  step.value = readOnboardingStep(auth.user?.id);
  if (!profileStore.loaded) {
    profileStore.hydrateFromCache();
    await profileStore.fetch().catch(() => {});
  }
  loadFromProfile(profileStore.profile);
  autosaveEnabled.value = true;
  if (profileStore.profile?.onboardingComplete) {
    router.replace('/');
  }
});
</script>

<template>
  <div class="min-h-screen safe-top px-4 pb-4 pt-4 lg:py-8">
    <div class="mx-auto max-w-2xl">
      <h1 class="text-2xl font-bold text-slate-100">Set up your account</h1>
      <p class="mt-1 text-slate-400">Three quick steps — your progress is saved automatically.</p>
      <p v-if="saveState === 'saving'" class="mt-1 text-xs text-slate-500">Saving…</p>
      <p v-else-if="saveState === 'saved'" class="mt-1 text-xs text-teal-400">Progress saved</p>

      <div class="mt-6">
        <p class="text-sm font-medium text-slate-300">Step {{ step }} of {{ steps.length }}</p>
        <div class="mt-3 flex gap-2">
          <div
            v-for="(_, i) in steps"
            :key="i"
            class="h-1 flex-1 rounded-full transition-colors"
            :class="step > i ? 'bg-teal-500' : 'bg-slate-800'"
          />
        </div>
      </div>

      <form class="card relative mt-6 space-y-4 p-6 pb-28 sm:pb-6" @submit.prevent="step < 3 ? goNext() : finish()">
        <template v-if="step === 1">
          <h2 class="font-semibold text-slate-200">About you</h2>
          <input v-model="form.displayName" required class="input" placeholder="Your full name" />
          <input
            v-model="form.headline"
            class="input"
            placeholder="e.g. Cloud Engineer | AWS | Kubernetes"
          />
          <input v-model="form.linkedin" class="input" placeholder="LinkedIn URL (optional)" />
        </template>

        <template v-else-if="step === 2">
          <h2 class="font-semibold text-slate-200">Upload your resume</h2>
          <p class="text-sm text-slate-500">Preview it below to make sure it looks right before applying.</p>
          <ResumeUpload v-model="form.resumeText" :apply-to-profile="false" @parsed="onResumeParsed" />
          <textarea
            v-model="form.resumeText"
            rows="6"
            class="input text-sm"
            placeholder="Or paste your resume text here…"
          />
          <ResumePreview
            :resume-text="form.resumeText"
            :score="profileStore.resumeScore"
            :skills="profileStore.extractedSkills"
          />
          <div>
            <label class="mb-1 block text-sm text-slate-400">Target job titles (one per line)</label>
            <textarea v-model="form.targetTitles" rows="4" class="input font-mono text-sm" required />
          </div>
        </template>

        <template v-else>
          <h2 class="font-semibold text-slate-200">How you'll apply</h2>
          <p class="text-sm text-slate-400">Set your email, resume mode, pages, and JD matching.</p>

          <TailorApplySettings
            v-model:resume-mode="resumeMode"
            v-model:supplement-pages="supplementPages"
            v-model:tailor-mode="tailorMode"
            v-model:digest-email="digestEmail"
            v-model:contact-phone="contactPhone"
            :show-job-count="false"
          />

          <ResumePreview
            :resume-text="form.resumeText"
            :score="profileStore.resumeScore"
            :skills="profileStore.extractedSkills"
            empty-message="No resume loaded — go back and upload one."
          />
        </template>

        <p v-if="error" class="text-sm text-red-300">{{ error }}</p>

        <div
          class="onboarding-actions safe-bottom fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-slate-800 bg-slate-950/95 p-4 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:pt-2"
        >
          <button v-if="step > 1" type="button" class="btn-secondary" @click="step--">Back</button>
          <button type="submit" class="btn-primary btn-continue flex-1" :disabled="saving">
            <span>{{ step < 3 ? 'Continue' : saving ? 'Saving…' : 'Start applying' }}</span>
            <span v-if="step < 3 && !saving" class="ml-1" aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
