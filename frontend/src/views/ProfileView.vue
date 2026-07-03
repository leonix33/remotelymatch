<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import http from '../api/http';
import { useProfileStore } from '../stores/profile';
import { useAuthStore } from '../stores/auth';
import { appUrl } from '../config';
import ResumeUpload from '../components/ResumeUpload.vue';
import ResumePreview from '../components/ResumePreview.vue';
import TailorApplySettings from '../components/TailorApplySettings.vue';
import { useProfileAutosave } from '../composables/useProfileAutosave';
import {
  biometricLabel,
  fetchPasskeyStatus,
  registerPasskey,
  removePasskeys,
  supportsBiometricLogin,
} from '../composables/usePasskey';

const router = useRouter();
const profileStore = useProfileStore();
const auth = useAuthStore();
const saving = ref(false);
const error = ref('');
const success = ref('');
const pwdSaving = ref(false);
const pwdError = ref('');
const pwdSuccess = ref('');
const pwdForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
const extLoading = ref(false);
const extApiUrl = ref(appUrl || 'https://remotelymatch.app');
const extToken = ref('');
const extCopied = ref('');
const extConnected = ref(false);
const extConnectMsg = ref('');
const exportLoading = ref(false);
const deleteLoading = ref(false);
const deleteError = ref('');
const deletePassword = ref('');
const openaiKey = ref('');
const openaiSaving = ref(false);
const openaiTesting = ref(false);
const openaiMsg = ref('');
const openaiError = ref('');
const hunterKey = ref('');
const hunterSaving = ref(false);
const hunterMsg = ref('');
const hunterError = ref('');
const apolloKey = ref('');
const apolloSaving = ref(false);
const apolloMsg = ref('');
const apolloError = ref('');
const aiStatus = ref(null);
const { saveState, schedule } = useProfileAutosave();
const autosaveEnabled = ref(false);
const passkeyEnabled = ref(false);
const passkeyLoading = ref(false);
const passkeyMsg = ref('');
const passkeyError = ref('');
const canUsePasskey = ref(false);
const bioLabel = biometricLabel();

const form = ref({
  displayName: '',
  applicantName: '',
  headline: '',
  bio: '',
  linkedin: '',
  github: '',
  portfolio: '',
  targetTitles: '',
  mustHaveSkills: '',
  niceToHaveSkills: '',
  targetCompanies: '',
  resumeText: '',
  minMatchScore: 60,
  tailorResumeOnApply: false,
  autoApplyEnabled: false,
  defaultApplyResumeMode: 'base',
  digestEmail: '',
  emailDigestEnabled: true,
  applySummaryEmailsEnabled: true,
  followUpRemindersEnabled: true,
  contactPhone: '',
  defaultSupplementPages: 3,
  defaultTailorMode: 'balanced',
});

function loadForm(p) {
  form.value = {
    displayName: p.displayName || '',
    applicantName: p.applicantName || p.displayName || auth.user?.name || '',
    headline: p.headline || '',
    bio: p.bio || '',
    linkedin: p.linkedin || '',
    github: p.github || '',
    portfolio: p.portfolio || '',
    targetTitles: (p.targetTitles || []).join('\n'),
    mustHaveSkills: (p.mustHaveSkills || []).join('\n'),
    niceToHaveSkills: (p.niceToHaveSkills || []).join('\n'),
    targetCompanies: (p.targetCompanies || []).join('\n'),
    resumeText: p.resumeText || '',
    minMatchScore: p.minMatchScore || 60,
    tailorResumeOnApply: Boolean(p.tailorResumeOnApply),
    autoApplyEnabled: p.autoApplyEnabled === true,
    defaultApplyResumeMode: p.defaultApplyResumeMode === 'tailored' ? 'tailored' : 'base',
    digestEmail: p.digestEmail || '',
    emailDigestEnabled: p.emailDigestEnabled !== false,
    applySummaryEmailsEnabled: p.applySummaryEmailsEnabled !== false,
    followUpRemindersEnabled: p.followUpRemindersEnabled !== false,
    contactPhone: p.contactPhone || '',
    defaultSupplementPages: p.defaultSupplementPages || 3,
    defaultTailorMode: p.defaultTailorMode === 'high_match' ? 'high_match' : 'balanced',
  };
}

async function exportData() {
  exportLoading.value = true;
  try {
    const { data } = await http.get('/auth/export-data');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'remotelymatch-data-export.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not export data';
  } finally {
    exportLoading.value = false;
  }
}

async function deleteAccount() {
  deleteError.value = '';
  if (!deletePassword.value) {
    deleteError.value = 'Enter your password to confirm deletion';
    return;
  }
  if (!confirm('Delete your account permanently? This removes your profile, queue, and calendar data.')) return;
  deleteLoading.value = true;
  try {
    await http.delete('/auth/account', { data: { password: deletePassword.value } });
    auth.logout();
    profileStore.reset();
    router.push('/login');
  } catch (e) {
    deleteError.value = e.response?.data?.message || 'Could not delete account';
  } finally {
    deleteLoading.value = false;
  }
}

async function connectExtension() {
  extConnectMsg.value = '';
  extConnected.value = false;
  await loadExtensionToken();
  const apiBase = (typeof window !== 'undefined' ? window.location.origin : extApiUrl.value).replace(/\/$/, '');
  extApiUrl.value = apiBase;
  window.postMessage(
    {
      type: 'REMOTELYMATCH_EXT_CONFIG',
      apiBase,
      accessToken: extToken.value,
    },
    window.location.origin
  );
  setTimeout(() => {
    if (!extConnected.value) {
      extConnectMsg.value =
        'Extension not detected. Reload this page (⌘⇧R), then click Connect again — or paste API URL + token into extension Settings (right-click extension icon → Options).';
    }
  }, 1500);
}

onMounted(async () => {
  if (!profileStore.loaded) {
    profileStore.hydrateFromCache();
  }
  const p = await profileStore.fetch();
  loadForm(p);
  autosaveEnabled.value = true;
  await loadAiStatus();
  await loadPasskeyStatus();
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'REMOTELYMATCH_EXT_CONFIGURED' || e.data?.type === 'REMOTEMATCH_EXT_CONFIGURED') {
      extConnected.value = true;
      extConnectMsg.value = 'Extension connected! Open any job page and click the remotelymatch icon.';
    }
  });
});

function profilePayload() {
  return {
    ...form.value,
    targetTitles: form.value.targetTitles.split('\n').filter(Boolean),
    mustHaveSkills: form.value.mustHaveSkills.split('\n').filter(Boolean),
    niceToHaveSkills: form.value.niceToHaveSkills.split('\n').filter(Boolean),
    targetCompanies: form.value.targetCompanies.split('\n').filter(Boolean),
    onboardingComplete: profileStore.profile?.onboardingComplete ?? true,
  };
}

watch(form, () => {
  if (!autosaveEnabled.value || !profileStore.loaded) return;
  schedule(profilePayload);
}, { deep: true });

async function save() {
  error.value = '';
  success.value = '';
  saving.value = true;
  try {
    await profileStore.save(profilePayload());
    success.value = 'Profile saved.';
  } catch (e) {
    error.value = e.response?.data?.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function loadPasskeyStatus() {
  canUsePasskey.value = await supportsBiometricLogin();
  if (!canUsePasskey.value) return;
  try {
    const status = await fetchPasskeyStatus();
    passkeyEnabled.value = Boolean(status.enabled);
  } catch {
    passkeyEnabled.value = false;
  }
}

async function enablePasskey() {
  passkeyError.value = '';
  passkeyMsg.value = '';
  passkeyLoading.value = true;
  try {
    const result = await registerPasskey(bioLabel === 'Face ID' ? 'iPhone Face ID' : 'This phone');
    passkeyEnabled.value = true;
    passkeyMsg.value = result.message || `${bioLabel} sign-in enabled.`;
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      passkeyError.value = `${bioLabel} setup was cancelled.`;
    } else {
      const msg = e.response?.data?.message || e.message || `Could not enable ${bioLabel}`;
      if (/rp id.*invalid/i.test(msg)) {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        passkeyError.value =
          `${msg} Open https://remotelymatch.app in Safari (not ${host || 'this URL'}) and reinstall the app from there.`;
      } else {
        passkeyError.value = msg;
      }
    }
  } finally {
    passkeyLoading.value = false;
  }
}

async function disablePasskey() {
  if (!confirm(`Remove ${bioLabel} sign-in from this account?`)) return;
  passkeyLoading.value = true;
  passkeyError.value = '';
  try {
    await removePasskeys();
    passkeyEnabled.value = false;
    passkeyMsg.value = `${bioLabel} sign-in removed.`;
  } catch (e) {
    passkeyError.value = e.response?.data?.message || 'Could not remove passkey';
  } finally {
    passkeyLoading.value = false;
  }
}

async function changePassword() {
  pwdError.value = '';
  pwdSuccess.value = '';
  if (pwdForm.value.newPassword !== pwdForm.value.confirmPassword) {
    pwdError.value = 'New passwords do not match';
    return;
  }
  pwdSaving.value = true;
  try {
    await http.post('/auth/change-password', {
      currentPassword: pwdForm.value.currentPassword.trim(),
      newPassword: pwdForm.value.newPassword.trim(),
    });
    pwdForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
    pwdSuccess.value =
      'Password updated. Sign in on your phone with the new password — clear autofill or type it manually.';
  } catch (e) {
    pwdError.value = e.response?.data?.message || 'Could not change password';
  } finally {
    pwdSaving.value = false;
  }
}

async function loadExtensionToken() {
  extLoading.value = true;
  try {
    const { data } = await http.post('/auth/extension-token');
    const origin = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';
    const onApp =
      /^https:\/\/(www\.)?(remotelymatch|remotematch)\.app$/i.test(origin) ||
      origin.includes('remotelymatch.app') ||
      origin.includes('remotematch.onrender.com') ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    extApiUrl.value = onApp ? origin : (data.apiUrl || origin);
    extToken.value = data.accessToken;
  } finally {
    extLoading.value = false;
  }
}

async function copyExt(value, label) {
  await navigator.clipboard.writeText(value);
  extCopied.value = label;
  setTimeout(() => { extCopied.value = ''; }, 2000);
}

async function loadAiStatus() {
  try {
    const { data } = await http.get('/ai/status');
    aiStatus.value = data;
  } catch {
    aiStatus.value = null;
  }
}

async function saveOpenAiKey() {
  openaiError.value = '';
  openaiMsg.value = '';
  if (!openaiKey.value.trim()) {
    openaiError.value = 'Paste your OpenAI API key (starts with sk-)';
    return;
  }
  openaiSaving.value = true;
  try {
    const { data } = await http.post('/profile/me/openai-key', { apiKey: openaiKey.value.trim() });
    openaiKey.value = '';
    openaiMsg.value = data.message || 'OpenAI connected — live AI is enabled.';
    await profileStore.fetch();
    await loadAiStatus();
  } catch (e) {
    openaiError.value = e.response?.data?.message || 'Could not save API key';
  } finally {
    openaiSaving.value = false;
  }
}

async function testOpenAiKey() {
  openaiError.value = '';
  openaiMsg.value = '';
  openaiTesting.value = true;
  try {
    const { data } = await http.post('/profile/me/openai-key/test');
    openaiMsg.value = `Connection OK — model ${data.model}, reply: ${data.reply}`;
  } catch (e) {
    openaiError.value = e.response?.data?.message || 'Connection test failed';
  } finally {
    openaiTesting.value = false;
  }
}

async function removeOpenAiKey() {
  if (!confirm('Remove your OpenAI API key from remotelymatch?')) return;
  openaiError.value = '';
  openaiMsg.value = '';
  try {
    await http.delete('/profile/me/openai-key');
    openaiMsg.value = 'API key removed.';
    await profileStore.fetch();
    await loadAiStatus();
  } catch (e) {
    openaiError.value = e.response?.data?.message || 'Could not remove key';
  }
}

async function saveHunterKey() {
  hunterError.value = '';
  hunterMsg.value = '';
  if (!hunterKey.value.trim()) {
    hunterError.value = 'Paste your Hunter.io API key';
    return;
  }
  hunterSaving.value = true;
  try {
    const { data } = await http.post('/profile/me/hunter-key', { apiKey: hunterKey.value.trim() });
    hunterKey.value = '';
    hunterMsg.value = data.message || 'Hunter.io connected.';
    await profileStore.fetch();
  } catch (e) {
    hunterError.value = e.response?.data?.message || 'Could not save Hunter key';
  } finally {
    hunterSaving.value = false;
  }
}

async function removeHunterKey() {
  if (!confirm('Remove your Hunter.io API key?')) return;
  hunterError.value = '';
  hunterMsg.value = '';
  try {
    await http.delete('/profile/me/hunter-key');
    hunterMsg.value = 'Hunter.io key removed.';
    await profileStore.fetch();
  } catch (e) {
    hunterError.value = e.response?.data?.message || 'Could not remove key';
  }
}

async function saveApolloKey() {
  apolloError.value = '';
  apolloMsg.value = '';
  if (!apolloKey.value.trim()) {
    apolloError.value = 'Paste your Apollo API key';
    return;
  }
  apolloSaving.value = true;
  try {
    const { data } = await http.post('/profile/me/apollo-key', { apiKey: apolloKey.value.trim() });
    apolloKey.value = '';
    apolloMsg.value = data.message || 'Apollo connected.';
    await profileStore.fetch();
  } catch (e) {
    apolloError.value = e.response?.data?.message || 'Could not save Apollo key';
  } finally {
    apolloSaving.value = false;
  }
}

async function removeApolloKey() {
  if (!confirm('Remove your Apollo API key?')) return;
  apolloError.value = '';
  apolloMsg.value = '';
  try {
    await http.delete('/profile/me/apollo-key');
    apolloMsg.value = 'Apollo key removed.';
    await profileStore.fetch();
  } catch (e) {
    apolloError.value = e.response?.data?.message || 'Could not remove key';
  }
}
</script>

<template>
  <div>
    <h2 class="page-title text-2xl font-bold text-slate-100">My profile</h2>
    <p class="page-subtitle mt-1 text-slate-400">Your name, resume, and how you want to apply — saved automatically.</p>
    <p v-if="saveState === 'saving'" class="mt-1 text-xs text-slate-500">Saving…</p>
    <p v-else-if="saveState === 'saved'" class="mt-1 text-xs text-teal-400">Saved</p>

    <form class="card mt-8 space-y-6 p-6" @submit.prevent="save">
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="mb-1 block text-sm text-slate-400">Name on applications</label>
          <input
            v-model="form.applicantName"
            required
            class="input"
            placeholder="Full name employers and recruiters will see"
          />
          <p class="mt-1 text-xs text-slate-600">Used on job forms, tailored resumes, and cover letters.</p>
        </div>
        <div>
          <label class="mb-1 block text-sm text-slate-400">Display name in app</label>
          <input v-model="form.displayName" class="input" placeholder="Optional — how we greet you here" />
        </div>
        <div class="md:col-span-2">
          <label class="mb-1 block text-sm text-slate-400">Headline</label>
          <input v-model="form.headline" class="input" placeholder="Platform Engineer | Azure | Databricks | Terraform" />
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <input v-model="form.linkedin" class="input" placeholder="https://linkedin.com/in/your-profile" />
        <input v-model="form.github" class="input" placeholder="https://github.com/your-username" />
        <input v-model="form.portfolio" class="input" placeholder="https://your-portfolio.com" />
      </div>

      <div>
        <label class="mb-1 block text-sm text-slate-400">Target job titles (one per line)</label>
        <textarea v-model="form.targetTitles" rows="5" class="input font-mono text-sm" />
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="mb-1 block text-sm text-slate-400">Must-have skills</label>
          <textarea v-model="form.mustHaveSkills" rows="5" class="input font-mono text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-sm text-slate-400">Nice-to-have skills</label>
          <textarea v-model="form.niceToHaveSkills" rows="5" class="input font-mono text-sm" />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-sm text-slate-400">Target companies (optional)</label>
        <textarea v-model="form.targetCompanies" rows="3" class="input font-mono text-sm" />
      </div>

      <div>
        <label class="mb-1 block text-sm text-slate-400">Resume</label>
        <ResumeUpload
          v-model="form.resumeText"
          :apply-to-profile="true"
          :merge-skills="false"
          :show-preview="false"
          @parsed="() => profileStore.profile && loadForm(profileStore.profile)"
        />
        <textarea v-model="form.resumeText" rows="6" class="input mt-3 text-sm" placeholder="Or paste resume text…" />
        <ResumePreview
          class="mt-4"
          :resume-text="form.resumeText"
          :score="profileStore.resumeScore"
          :skills="profileStore.extractedSkills"
        />
      </div>

      <div>
        <label class="mb-1 block text-sm text-slate-400">Minimum match score: {{ form.minMatchScore }}%</label>
        <input v-model.number="form.minMatchScore" type="range" min="50" max="95" class="w-full accent-teal-500" />
        <p class="mt-1 text-xs text-slate-500">60%+ recommended — only strong-fit roles enter your queue.</p>
      </div>

      <div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h3 class="font-semibold text-slate-200">Application quality</h3>
        <p class="mt-1 text-sm text-slate-500">
          When enabled, approving a job creates a <strong class="text-slate-400">tailored resume</strong>
          for that role — same layout as your original, with all credentials kept and wording matched to the posting.
        </p>
        <label class="mt-3 flex cursor-pointer items-start gap-3 text-sm text-slate-300">
          <input v-model="form.tailorResumeOnApply" type="checkbox" class="mt-0.5 accent-teal-500" />
          <span>
            <strong class="text-slate-200">Tailor resume when I approve jobs</strong>
            <span class="mt-1 block text-slate-500">
              Off by default. You can still generate a kit manually per job from the apply queue.
            </span>
          </span>
        </label>
        <label class="mt-4 flex cursor-pointer items-start gap-3 text-sm text-slate-300">
          <input v-model="form.autoApplyEnabled" type="checkbox" class="mt-0.5 accent-teal-500" />
          <span>
            <strong class="text-slate-200">Auto apply</strong>
            <span class="mt-1 block text-slate-500">
              When on, Start applying submits applications. When off, jobs are approved and resumes prepared for your review first.
            </span>
          </span>
        </label>
        <label class="mt-4 block text-sm text-slate-400">Resume on apply</label>
        <div class="mt-2 space-y-2 text-sm text-slate-300">
          <label class="flex cursor-pointer items-center gap-2">
            <input v-model="form.defaultApplyResumeMode" type="radio" value="base" class="accent-teal-500" />
            Base resume only
          </label>
          <label class="flex cursor-pointer items-center gap-2">
            <input v-model="form.defaultApplyResumeMode" type="radio" value="tailored" class="accent-teal-500" />
            Tailored resume per job
          </label>
        </div>
      </div>

      <div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h3 class="font-semibold text-slate-200">Email & follow-ups</h3>
        <p class="mt-1 text-sm text-slate-500">
          Get a digest of your best-fit submitted applications and reminders for high-priority follow-ups.
        </p>
        <div class="mt-4">
          <label class="mb-1 block text-sm text-slate-400">Personal email (on applications & digests)</label>
          <input
            v-model="form.digestEmail"
            type="email"
            class="input"
            placeholder="leonix23@gmail.com"
          />
          <p class="mt-1 text-xs text-slate-600">Used on tailored resumes, cover letters, and ATS forms — not the app/system email.</p>
        </div>
        <div class="mt-4">
          <label class="mb-1 block text-sm text-slate-400">Phone (optional, for application forms)</label>
          <input v-model="form.contactPhone" type="tel" class="input" placeholder="+1 555 123 4567" />
        </div>
        <label class="mt-4 flex cursor-pointer items-start gap-3 text-sm text-slate-300">
          <input v-model="form.applySummaryEmailsEnabled" type="checkbox" class="mt-0.5 accent-teal-500" />
          <span>
            <strong class="text-slate-200">Email me when I apply</strong>
            <span class="mt-1 block text-slate-500">
              After each apply batch, send roles, companies, match scores, and follow-up tips to your personal email above.
            </span>
          </span>
        </label>
        <label class="mt-3 flex cursor-pointer items-start gap-3 text-sm text-slate-300">
          <input v-model="form.emailDigestEnabled" type="checkbox" class="mt-0.5 accent-teal-500" />
          <span>
            <strong class="text-slate-200">Send weekly application digest</strong>
            <span class="mt-1 block text-slate-500">Best-fit jobs you have applied to, plus follow-ups due (from Follow-ups page).</span>
          </span>
        </label>
        <label class="mt-3 flex cursor-pointer items-start gap-3 text-sm text-slate-300">
          <input v-model="form.followUpRemindersEnabled" type="checkbox" class="mt-0.5 accent-teal-500" />
          <span>
            <strong class="text-slate-200">In-app follow-up reminders</strong>
            <span class="mt-1 block text-slate-500">Notifications when applications are 3–7 days old with no reply logged.</span>
          </span>
        </label>
        <router-link to="/follow-ups" class="mt-4 inline-block text-sm text-teal-400 hover:underline">
          Open traction trace & send digest →
        </router-link>
      </div>

      <div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h3 class="font-semibold text-slate-200">Default tailoring</h3>
        <p class="mt-1 text-sm text-slate-500">Defaults for new application kits — override per job in My Queue.</p>
        <TailorApplySettings
          v-model:resume-mode="form.defaultApplyResumeMode"
          v-model:supplement-pages="form.defaultSupplementPages"
          v-model:tailor-mode="form.defaultTailorMode"
          v-model:auto-apply="form.autoApplyEnabled"
          v-model:digest-email="form.digestEmail"
          v-model:contact-phone="form.contactPhone"
          v-model:applicant-name="form.applicantName"
          :apply-summary-emails-enabled="form.applySummaryEmailsEnabled"
          class="mt-4"
          :show-resume-mode="false"
          :show-applicant-contact="false"
        />
        <router-link to="/tailored-resumes" class="mt-4 inline-block text-sm text-teal-400 hover:underline">
          View all tailored resumes →
        </router-link>
      </div>

      <div class="rounded-xl border border-violet-900/40 bg-gradient-to-br from-slate-950/80 to-violet-950/20 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-slate-200">AI Integration</h3>
            <p class="mt-1 text-sm text-slate-500">
              Connect your OpenAI account for live coaching, resume tailoring, cover letters, interview practice, and intel.
            </p>
          </div>
          <span
            class="badge"
            :class="profileStore.profile?.openaiConnected || aiStatus?.configured ? 'badge-teal' : 'badge-gold'"
          >
            {{ profileStore.profile?.openaiConnected || aiStatus?.configured ? 'Live AI' : 'Demo mode' }}
          </span>
        </div>

        <p v-if="profileStore.profile?.openaiKeyHint" class="mt-3 text-sm text-slate-400">
          Connected key: <code class="text-violet-300">{{ profileStore.profile.openaiKeyHint }}</code>
          <span v-if="profileStore.profile?.openaiKeySource === 'server'" class="text-slate-600"> (server)</span>
        </p>
        <p v-if="aiStatus?.model" class="mt-1 text-xs text-slate-600">Model: {{ aiStatus.model }}</p>

        <ul class="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
          <li v-for="feature in (aiStatus?.features || ['AI Coach', 'Resume kits', 'Cover letters', 'Interview prep'])" :key="feature">
            ✓ {{ feature }}
          </li>
        </ul>

        <div class="mt-4">
          <label class="mb-1 block text-sm text-slate-400">OpenAI API key</label>
          <input
            v-model="openaiKey"
            type="password"
            class="input font-mono text-sm"
            placeholder="sk-..."
            autocomplete="off"
          />
          <p class="mt-1 text-xs text-slate-600">
            Get a key at
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" class="text-teal-400 hover:underline">platform.openai.com/api-keys</a>.
            Stored encrypted — never shared or committed to git.
          </p>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="btn-primary" :disabled="openaiSaving" @click="saveOpenAiKey">
            {{ openaiSaving ? 'Connecting…' : 'Connect OpenAI' }}
          </button>
          <button
            v-if="profileStore.profile?.openaiConnected"
            type="button"
            class="btn-secondary"
            :disabled="openaiTesting"
            @click="testOpenAiKey"
          >
            {{ openaiTesting ? 'Testing…' : 'Test connection' }}
          </button>
          <button
            v-if="profileStore.profile?.openaiKeySource === 'user'"
            type="button"
            class="btn-secondary text-red-300"
            @click="removeOpenAiKey"
          >
            Remove key
          </button>
        </div>
        <p v-if="openaiMsg" class="mt-3 text-sm text-teal-300">{{ openaiMsg }}</p>
        <p v-if="openaiError" class="mt-3 text-sm text-red-300">{{ openaiError }}</p>
      </div>

      <div class="rounded-xl border border-sky-900/40 bg-gradient-to-br from-slate-950/80 to-sky-950/20 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-slate-200">Recruiter contact lookup</h3>
            <p class="mt-1 text-sm text-slate-500">
              Optional — enrich follow-up kits with verified hiring manager emails from Hunter.io and Apollo.
            </p>
          </div>
          <span
            class="badge"
            :class="profileStore.profile?.hunterConfigured || profileStore.profile?.apolloConfigured ? 'badge-teal' : 'badge-gold'"
          >
            {{ profileStore.profile?.hunterConfigured || profileStore.profile?.apolloConfigured ? 'Enrichment on' : 'JD-only contacts' }}
          </span>
        </div>

        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label class="mb-1 block text-sm text-slate-400">Hunter.io API key</label>
            <input
              v-model="hunterKey"
              type="password"
              class="input font-mono text-sm"
              placeholder="hunter_..."
              autocomplete="off"
            />
            <p v-if="profileStore.profile?.hunterKeyHint" class="mt-1 text-xs text-slate-500">
              Connected: <code class="text-sky-300">{{ profileStore.profile.hunterKeyHint }}</code>
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button type="button" class="btn-primary text-sm" :disabled="hunterSaving" @click="saveHunterKey">
                {{ hunterSaving ? 'Saving…' : 'Save Hunter key' }}
              </button>
              <button
                v-if="profileStore.profile?.hunterKeySource === 'user'"
                type="button"
                class="btn-secondary text-sm text-red-300"
                @click="removeHunterKey"
              >
                Remove
              </button>
            </div>
          </div>
          <div>
            <label class="mb-1 block text-sm text-slate-400">Apollo API key</label>
            <input
              v-model="apolloKey"
              type="password"
              class="input font-mono text-sm"
              placeholder="apollo_..."
              autocomplete="off"
            />
            <p v-if="profileStore.profile?.apolloKeyHint" class="mt-1 text-xs text-slate-500">
              Connected: <code class="text-sky-300">{{ profileStore.profile.apolloKeyHint }}</code>
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button type="button" class="btn-primary text-sm" :disabled="apolloSaving" @click="saveApolloKey">
                {{ apolloSaving ? 'Saving…' : 'Save Apollo key' }}
              </button>
              <button
                v-if="profileStore.profile?.apolloKeySource === 'user'"
                type="button"
                class="btn-secondary text-sm text-red-300"
                @click="removeApolloKey"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
        <p class="mt-3 text-xs text-slate-600">
          Keys are encrypted at rest. Server-wide keys in Render env also work if you skip this.
        </p>
        <p v-if="hunterMsg" class="mt-3 text-sm text-teal-300">{{ hunterMsg }}</p>
        <p v-if="hunterError" class="mt-1 text-sm text-red-300">{{ hunterError }}</p>
        <p v-if="apolloMsg" class="mt-1 text-sm text-teal-300">{{ apolloMsg }}</p>
        <p v-if="apolloError" class="mt-1 text-sm text-red-300">{{ apolloError }}</p>
      </div>

      <p v-if="error" class="text-sm text-red-300">{{ error }}</p>
      <p v-if="success" class="text-sm text-teal-300">{{ success }}</p>
      <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save profile' }}</button>
    </form>

    <div class="card mt-8 space-y-4 p-6">
      <h3 class="font-semibold text-slate-200">Chrome extension setup</h3>
      <p class="text-sm text-slate-500">
        Load the extension from <code class="text-teal-400">chrome-extension/</code> in Chrome →
        <code class="text-teal-400">chrome://extensions</code> → Load unpacked. Then copy these two values into extension Settings.
      </p>
      <button type="button" class="btn-primary" :disabled="extLoading" @click="loadExtensionToken">
        {{ extLoading ? 'Generating…' : 'Get extension token (valid 90 days)' }}
      </button>
      <button type="button" class="btn-secondary" :disabled="extLoading" @click="connectExtension">
        Connect extension automatically
      </button>
      <p v-if="extConnectMsg" class="text-sm" :class="extConnected ? 'text-teal-300' : 'text-amber-300'">{{ extConnectMsg }}</p>
      <div v-if="extToken" class="space-y-3 rounded-xl bg-slate-950/50 p-4 text-sm">
        <div>
          <p class="text-slate-500">API base URL</p>
          <div class="mt-1 flex gap-2">
            <input :value="extApiUrl" readonly class="input flex-1 font-mono text-xs" />
            <button type="button" class="btn-secondary shrink-0 text-xs" @click="copyExt(extApiUrl, 'url')">
              {{ extCopied === 'url' ? 'Copied' : 'Copy' }}
            </button>
          </div>
        </div>
        <div>
          <p class="text-slate-500">Access token</p>
          <div class="mt-1 flex gap-2">
            <input :value="extToken" readonly class="input flex-1 font-mono text-xs" />
            <button type="button" class="btn-secondary shrink-0 text-xs" @click="copyExt(extToken, 'token')">
              {{ extCopied === 'token' ? 'Copied' : 'Copy' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="canUsePasskey" class="card mt-8 space-y-4 p-6">
      <h3 class="font-semibold text-slate-200">{{ bioLabel }} sign-in</h3>
      <p class="text-sm text-slate-500">
        Use {{ bioLabel }} on this phone for faster sign-in. You still need your password the first time on each device.
      </p>
      <p v-if="passkeyEnabled" class="text-sm text-teal-300">✓ {{ bioLabel }} is enabled for your account.</p>
      <p v-if="passkeyMsg" class="text-sm text-teal-300">{{ passkeyMsg }}</p>
      <p v-if="passkeyError" class="text-sm text-red-300">{{ passkeyError }}</p>
      <button
        v-if="!passkeyEnabled"
        type="button"
        class="btn-primary"
        :disabled="passkeyLoading"
        @click="enablePasskey"
      >
        {{ passkeyLoading ? 'Setting up…' : `Enable ${bioLabel}` }}
      </button>
      <button
        v-else
        type="button"
        class="btn-secondary"
        :disabled="passkeyLoading"
        @click="disablePasskey"
      >
        Remove {{ bioLabel }}
      </button>
    </div>

    <form class="card mt-8 space-y-4 p-6" @submit.prevent="changePassword">
      <h3 class="font-semibold text-slate-200">Change password</h3>
      <p class="text-sm text-slate-500">Update your login password. Requires MongoDB on the server.</p>
      <input v-model="pwdForm.currentPassword" type="password" required minlength="8" class="input" placeholder="Current password" />
      <input v-model="pwdForm.newPassword" type="password" required minlength="8" class="input" placeholder="New password (8+ chars)" />
      <input v-model="pwdForm.confirmPassword" type="password" required minlength="8" class="input" placeholder="Confirm new password" />
      <p v-if="pwdError" class="text-sm text-red-300">{{ pwdError }}</p>
      <p v-if="pwdSuccess" class="text-sm text-teal-300">{{ pwdSuccess }}</p>
      <button type="submit" class="btn-secondary" :disabled="pwdSaving">{{ pwdSaving ? 'Updating…' : 'Update password' }}</button>
    </form>

    <div class="card mt-8 space-y-4 p-6">
      <h3 class="font-semibold text-slate-200">Your data</h3>
      <p class="text-sm text-slate-500">
        Export a copy of your profile, apply queue, and calendar events. You can also permanently delete your account.
      </p>
      <div class="flex flex-wrap gap-3">
        <button type="button" class="btn-secondary" :disabled="exportLoading" @click="exportData">
          {{ exportLoading ? 'Preparing…' : 'Export my data' }}
        </button>
      </div>
      <div class="border-t border-slate-800 pt-4">
        <p class="text-sm font-medium text-red-300">Delete account</p>
        <p class="mt-1 text-xs text-slate-500">This cannot be undone. Your profile, queue, and calendar data will be removed.</p>
        <input v-model="deletePassword" type="password" class="input mt-3" placeholder="Confirm with your password" />
        <p v-if="deleteError" class="mt-2 text-sm text-red-300">{{ deleteError }}</p>
        <button type="button" class="btn-secondary mt-3 border-red-800 text-red-300" :disabled="deleteLoading" @click="deleteAccount">
          {{ deleteLoading ? 'Deleting…' : 'Delete my account' }}
        </button>
      </div>
      <p class="text-xs text-slate-600">
        <router-link to="/privacy" class="text-teal-500 hover:underline">Privacy Policy</router-link>
        ·
        <router-link to="/terms" class="text-teal-500 hover:underline">Terms of Use</router-link>
      </p>
    </div>
  </div>
</template>
