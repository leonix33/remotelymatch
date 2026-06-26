<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import http from '../api/http';
import { useProfileStore } from '../stores/profile';
import { useAuthStore } from '../stores/auth';

const resumeMode = defineModel('resumeMode', { type: String, default: 'tailored' });
const supplementPages = defineModel('supplementPages', { type: Number, default: 3 });
const tailorMode = defineModel('tailorMode', { type: String, default: 'balanced' });
const digestEmail = defineModel('digestEmail', { type: String, default: '' });
const contactPhone = defineModel('contactPhone', { type: String, default: '' });
const applicantName = defineModel('applicantName', { type: String, default: '' });

const props = defineProps({
  showResumeMode: { type: Boolean, default: true },
  showJobCount: { type: Boolean, default: false },
  showApplicantContact: { type: Boolean, default: true },
});

const jobCount = defineModel('jobCount', { type: Number, default: 15 });

const profileStore = useProfileStore();
const auth = useAuthStore();

const applyPreview = ref(null);
const loadingPreview = ref(false);

const isTailored = computed(() => resumeMode.value === 'tailored');

const tailorModeLabel = computed(() => {
  if (tailorMode.value === 'high_match') {
    return 'Close match — uses the same terms from the job posting where your experience supports it';
  }
  return 'Balanced — strong match without copying every phrase from the posting';
});

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
    </div>

    <!-- Tailoring options (only when tailored) -->
    <div v-if="isTailored" class="rounded-xl border border-violet-900/30 bg-violet-950/10 p-4">
      <p class="text-sm font-medium text-violet-200">Tailoring options</p>
      <p class="mt-1 text-xs text-slate-500">
        Your resume is reformatted for each job — same sections and credentials, wording matched to the posting.
      </p>

      <div class="mt-4">
        <label class="mb-1 flex items-center justify-between text-sm text-slate-400">
          <span>Target length (pages)</span>
          <span class="font-semibold text-teal-300">{{ supplementPages }} page{{ supplementPages === 1 ? '' : 's' }}</span>
        </label>
        <input v-model.number="supplementPages" type="range" min="1" max="6" step="1" class="w-full accent-teal-500" />
        <p class="mt-1 text-xs text-slate-600">Matches your original resume length when longer — never drops certifications or credentials.</p>
      </div>

      <div class="mt-5 space-y-2">
        <p class="text-sm text-slate-400">How closely to match the job description</p>
        <label
          class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition"
          :class="tailorMode === 'balanced' ? 'border-teal-600/50 bg-teal-950/20' : 'border-slate-800'"
        >
          <input v-model="tailorMode" type="radio" value="balanced" class="mt-1 accent-teal-500" />
          <span>
            <strong class="text-slate-200">Balanced</strong>
            <span class="mt-0.5 block text-xs text-slate-500">Natural wording with strong skill alignment.</span>
          </span>
        </label>
        <label
          class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition"
          :class="tailorMode === 'high_match' ? 'border-teal-600/50 bg-teal-950/20' : 'border-slate-800'"
        >
          <input v-model="tailorMode" type="radio" value="high_match" class="mt-1 accent-teal-500" />
          <span>
            <strong class="text-slate-200">High match</strong>
            <span class="mt-0.5 block text-xs text-slate-500">Uses the employer's wording where it fits your real experience.</span>
          </span>
        </label>
      </div>

      <p class="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
        <strong class="text-slate-300">Active mode:</strong> {{ tailorModeLabel }}
        <span v-if="supplementPages"> · {{ supplementPages }} page{{ supplementPages === 1 ? '' : 's' }}</span>
      </p>
    </div>

    <div v-if="showJobCount">
      <label class="mb-1 block text-sm text-slate-400">How many jobs to apply to</label>
      <select v-model.number="jobCount" class="input w-auto min-w-[12rem]">
        <option :value="10">Top 10 matches</option>
        <option :value="15">Top 15 matches</option>
        <option :value="20">Top 20 matches</option>
        <option :value="25">Top 25 matches</option>
        <option :value="50">Top 50 matches</option>
      </select>
      <p class="mt-1 text-xs text-slate-600">More jobs = more applications. Kits are built when you submit.</p>
    </div>
  </div>
</template>
