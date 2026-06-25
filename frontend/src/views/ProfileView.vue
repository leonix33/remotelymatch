<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import http from '../api/http';
import { useProfileStore } from '../stores/profile';
import { useAuthStore } from '../stores/auth';
import { appUrl } from '../config';
import ResumeUpload from '../components/ResumeUpload.vue';

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
const extApiUrl = ref(appUrl || 'https://remotematch.onrender.com');
const extToken = ref('');
const extCopied = ref('');
const extConnected = ref(false);
const extConnectMsg = ref('');
const exportLoading = ref(false);
const deleteLoading = ref(false);
const deleteError = ref('');
const deletePassword = ref('');

const form = ref({
  displayName: '',
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
});

function loadForm(p) {
  form.value = {
    displayName: p.displayName || '',
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
    a.download = 'remotematch-data-export.json';
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
      type: 'REMOTEMATCH_EXT_CONFIG',
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
  const p = await profileStore.fetch();
  loadForm(p);
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'REMOTEMATCH_EXT_CONFIGURED') {
      extConnected.value = true;
      extConnectMsg.value = 'Extension connected! Open any job page and click the RemoteMatch icon.';
    }
  });
});

async function save() {
  error.value = '';
  success.value = '';
  saving.value = true;
  try {
    await profileStore.save({
      ...form.value,
      targetTitles: form.value.targetTitles.split('\n').filter(Boolean),
      mustHaveSkills: form.value.mustHaveSkills.split('\n').filter(Boolean),
      niceToHaveSkills: form.value.niceToHaveSkills.split('\n').filter(Boolean),
      targetCompanies: form.value.targetCompanies.split('\n').filter(Boolean),
      onboardingComplete: true,
    });
    success.value = 'Profile saved.';
  } catch (e) {
    error.value = e.response?.data?.message || 'Save failed';
  } finally {
    saving.value = false;
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
      currentPassword: pwdForm.value.currentPassword,
      newPassword: pwdForm.value.newPassword,
    });
    pwdForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
    pwdSuccess.value = 'Password updated.';
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
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-slate-100">My profile</h2>
    <p class="mt-1 text-slate-400">Your personal match targets, skills, and resume context</p>

    <form class="card mt-8 space-y-6 p-6" @submit.prevent="save">
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="mb-1 block text-sm text-slate-400">Display name</label>
          <input v-model="form.displayName" required class="input" />
        </div>
        <div>
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
          :merge-skills="true"
          @parsed="() => profileStore.profile && loadForm(profileStore.profile)"
        />
        <textarea v-model="form.resumeText" rows="6" class="input mt-3 text-sm" placeholder="Or paste resume text…" />
        <p v-if="profileStore.extractedSkills.length" class="mt-2 text-xs text-slate-500">
          {{ profileStore.extractedSkills.length }} skills detected from your resume
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm text-slate-400">Minimum match score: {{ form.minMatchScore }}%</label>
        <input v-model.number="form.minMatchScore" type="range" min="40" max="95" class="w-full accent-teal-500" />
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
