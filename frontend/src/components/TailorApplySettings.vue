<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import http from '../api/http';
import ResumePreview from './ResumePreview.vue';
import { useProfileStore } from '../stores/profile';
import { useAuthStore } from '../stores/auth';

const resumeMode = defineModel('resumeMode', { type: String, default: 'tailored' });
const supplementPages = defineModel('supplementPages', { type: Number, default: 4 });
const tailorMode = defineModel('tailorMode', { type: String, default: 'high_match' });
const digestEmail = defineModel('digestEmail', { type: String, default: '' });
const contactPhone = defineModel('contactPhone', { type: String, default: '' });
const applicantName = defineModel('applicantName', { type: String, default: '' });

const props = defineProps({
  showResumeMode: { type: Boolean, default: true },
  showJobCount: { type: Boolean, default: false },
  showApplicantContact: { type: Boolean, default: true },
  resumeText: { type: String, default: '' },
  showResumeDocumentPreview: { type: Boolean, default: true },
  emailDigestEnabled: { type: Boolean, default: true },
  applySummaryEmailsEnabled: { type: Boolean, default: true },
});

const jobCount = defineModel('jobCount', { type: Number, default: 5 });
const autoApply = defineModel('autoApply', { type: Boolean, default: false });

const profileStore = useProfileStore();
const auth = useAuthStore();

const applyPreview = ref(null);
const loadingPreview = ref(false);

const isTailored = computed(() => resumeMode.value === 'tailored');

const tailorModeLabel = computed(
  () =>
    'Standard high-match tailoring — same ATS-optimized pipeline for every user and every job (all employers preserved, credentials intact).'
);

const applySummary = computed(() => {
  const contact = applyPreview.value?.contact;
  const name =
    applicantName.value?.trim() ||
    contact?.name ||
    profileStore.profile?.applicantName ||
    profileStore.profile?.displayName ||
    auth.user?.name ||
    '—';
  const email = contact?.email || digestEmail.value || auth.user?.email || '—';
  const phone = contact?.phone || contactPhone.value || '—';
  return { name, email, phone };
});

const emailMissing = computed(() => !applySummary.value.email || applySummary.value.email === '—');

const hasResumePreview = computed(
  () => props.showResumeDocumentPreview && (props.resumeText || '').trim().length >= 50
);

const resumePreviewNote = computed(() => {
  if (resumeMode.value === 'tailored') {
    return 'Your base resume layout below — each job gets a tailored version in the same format.';
  }
  return 'This is the resume employers receive on every application.';
});

async function loadApplyPreview() {
  loadingPreview.value = true;
  try {
    const { data } = await http.get('/profile/me/apply-preview');
    applyPreview.value = data;
    if (!digestEmail.value && data.contact?.email) {
      digestEmail.value = data.contact.email;
    }
  } catch {
    applyPreview.value = null;
  } finally {
    loadingPreview.value = false;
  }
}

watch([digestEmail, contactPhone, applicantName], () => {
  if (applyPreview.value?.contact) {
    applyPreview.value = {
      ...applyPreview.value,
      contact: {
        ...applyPreview.value.contact,
        name: applicantName.value?.trim() || applyPreview.value.contact.name,
        email: digestEmail.value || applyPreview.value.contact.email,
        phone: contactPhone.value || applyPreview.value.contact.phone,
      },
    };
  }
});

onMounted(loadApplyPreview);
</script>

<template>
  <div class="space-y-5">
    <!-- Applicant identity -->
    <div v-if="showApplicantContact" class="rounded-xl border border-sky-900/40 bg-sky-950/20 p-4">
      <p class="text-sm font-medium text-sky-200">Applications will use your info</p>
      <p class="mt-1 text-xs text-slate-500">This name and email go on every job form and tailored resume.</p>

      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="mb-1 block text-xs text-slate-500">Name employers see on applications</label>
          <input
            v-model="applicantName"
            type="text"
            class="input text-sm"
            placeholder="Legal name as it should appear on forms"
            required
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-slate-500">Your email on applications</label>
          <input
            v-model="digestEmail"
            type="email"
            class="input text-sm"
            placeholder="you@gmail.com"
            required
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-slate-500">Phone (optional)</label>
          <input v-model="contactPhone" type="tel" class="input text-sm" placeholder="+1 555 123 4567" />
        </div>
      </div>

      <div v-if="loadingPreview" class="mt-4 text-xs text-slate-500">Loading preview…</div>
      <div v-else class="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Preview — what employers see</p>
        <dl class="mt-2 space-y-1.5">
          <div class="flex gap-2">
            <dt class="w-14 shrink-0 text-slate-500">Name</dt>
            <dd class="text-slate-200">{{ applySummary.name }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-14 shrink-0 text-slate-500">Email</dt>
            <dd class="font-medium text-teal-300">{{ applySummary.email }}</dd>
          </div>
          <div v-if="applySummary.phone && applySummary.phone !== '—'" class="flex gap-2">
            <dt class="w-14 shrink-0 text-slate-500">Phone</dt>
            <dd class="text-slate-300">{{ applySummary.phone }}</dd>
          </div>
        </dl>
      </div>

      <p v-if="emailMissing" class="mt-3 text-xs text-amber-300">
        Add your personal email above — not a system or admin address.
      </p>
      <p v-else-if="applyPreview?.emailWarning" class="mt-3 text-xs text-amber-300">{{ applyPreview.emailWarning }}</p>

      <div
        v-if="digestEmail && applySummaryEmailsEnabled !== false"
        class="mt-4 rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-2.5 text-xs text-sky-100/90"
      >
        <strong class="text-sky-200">Application summary emails</strong>
        <span class="mt-1 block text-slate-400">
          After you apply, we email a list of companies, roles, and follow-up tips to
          <span class="font-medium text-teal-300">{{ digestEmail }}</span>.
          Check spam if you do not see it within a few minutes.
        </span>
      </div>
      <p v-else-if="digestEmail && applySummaryEmailsEnabled === false" class="mt-3 text-xs text-slate-500">
        Apply summary emails are off — enable “Email me when I apply” in Profile → Email &amp; follow-ups.
      </p>
    </div>

    <!-- Resume mode -->
    <div v-if="showResumeMode">
      <p class="mb-3 text-sm font-medium text-slate-300">Resume for applications</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <label
          class="cursor-pointer rounded-xl border p-4 transition"
          :class="resumeMode === 'base' ? 'border-teal-500/60 bg-teal-950/30' : 'border-slate-700'"
        >
          <input v-model="resumeMode" type="radio" value="base" class="accent-teal-500" />
          <p class="mt-2 font-medium text-slate-200">Base resume</p>
          <p class="mt-1 text-xs text-slate-500">Same uploaded resume for every job.</p>
        </label>
        <label
          class="cursor-pointer rounded-xl border p-4 transition"
          :class="resumeMode === 'tailored' ? 'border-teal-500/60 bg-teal-950/30' : 'border-slate-700'"
        >
          <input v-model="resumeMode" type="radio" value="tailored" class="accent-teal-500" />
          <p class="mt-2 font-medium text-slate-200">Tailored resume</p>
          <p class="mt-1 text-xs text-slate-500">A version of your resume aligned to each job — same format, all credentials kept.</p>
        </label>
      </div>

      <ResumePreview
        v-if="hasResumePreview && resumeMode === 'base'"
        class="mt-4"
        :resume-text="resumeText"
        title="Resume document preview"
        :subtitle="resumePreviewNote"
      />
    </div>

    <!-- Tailoring options (only when tailored) -->
    <div v-if="isTailored" class="rounded-xl border border-violet-900/30 bg-violet-950/10 p-4">
      <p class="text-sm font-medium text-violet-200">Tailoring options</p>
      <p class="mt-1 text-xs text-slate-500">
        Your resume is reformatted for each job — same sections and credentials, wording matched to the posting.
      </p>

      <div class="mt-4 rounded-lg border border-teal-900/40 bg-teal-950/20 px-3 py-3 text-xs text-slate-400">
        <p class="text-sm font-medium text-teal-200">Resume perfection for every user</p>
        <p class="mt-1">
          Every job from your original resume stays — same employers, titles, dates, and bullet count per role. We rewrite bullet wording to match each posting; credentials and structure stay intact.
        </p>
        <p class="mt-2">
          <strong class="text-slate-300">Output:</strong> 4 pages · all jobs preserved · bullets tailored to the job · 90%+ ATS target
        </p>
      </div>

      <ResumePreview
        v-if="hasResumePreview"
        class="mt-5"
        :resume-text="resumeText"
        title="Resume document preview"
        :subtitle="resumePreviewNote"
      />
    </div>

    <div v-if="showJobCount" class="space-y-5">
      <div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-slate-200">Auto apply</p>
            <p class="mt-1 text-xs text-slate-500">
              <strong class="text-slate-400">Off (recommended)</strong> — prepare tailored resumes, review in My Queue, then submit yourself.
              On — submit forms automatically when you click start.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="autoApply"
            class="relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors"
            :class="autoApply ? 'bg-teal-500' : 'bg-slate-700'"
            @click="autoApply = !autoApply"
          >
            <span
              class="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform"
              :class="autoApply ? 'translate-x-5' : 'translate-x-0'"
            ></span>
          </button>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-sm text-slate-400">How many jobs per batch</label>
        <select v-model.number="jobCount" class="input w-auto min-w-[12rem]">
          <option :value="3">Top 3 matches</option>
          <option :value="5">Top 5 matches (recommended)</option>
          <option :value="10">Top 10 matches</option>
          <option :value="15">Top 15 matches</option>
          <option :value="20">Top 20 matches</option>
        </select>
        <p class="mt-1 text-xs text-slate-600">
          {{
            autoApply
              ? 'Fewer, stronger applications beat mass applying. Review match scores in My Queue first.'
              : 'Resumes are prepared for review — submit from My Queue after you check each role.'
          }}
        </p>
      </div>
    </div>
  </div>
</template>
