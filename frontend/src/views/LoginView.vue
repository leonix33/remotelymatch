<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useProfileStore } from '../stores/profile';
import http from '../api/http';
import AppLogo from '../components/AppLogo.vue';
import PasswordInput from '../components/PasswordInput.vue';
import { brand } from '../brand';
import {
  biometricLabel,
  loginWithPasskey,
  rememberLoginEmail,
  recalledLoginEmail,
  supportsBiometricLogin,
} from '../composables/usePasskey';
import {
  devAutoLoginEnabled,
  recalledDevCredentials,
  rememberDevCredentials,
  resolveDevCredentials,
  shouldPersistDevCredentials,
} from '../utils/devAuth';

const email = ref('');
const password = ref('');
const resetCode = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const info = ref('');
const loading = ref(false);
const bioLoading = ref(false);
const mode = ref('login');
const forgotStep = ref(1);
const resetToken = ref('');
const showBiometric = ref(false);
const bioLabel = computed(() => biometricLabel());
const isLocalDev = computed(() => shouldPersistDevCredentials());

const pageSubtitle = computed(() => {
  if (mode.value === 'forgot') return 'Reset your password';
  if (mode.value === 'reset') return 'Choose a new password';
  return 'Sign in to your account';
});

watch([email, password], ([e, p]) => {
  if (!shouldPersistDevCredentials()) return;
  const trimmedEmail = String(e || '').trim();
  if (trimmedEmail && String(p || '').length >= 8) {
    rememberLoginEmail(trimmedEmail);
    rememberDevCredentials(trimmedEmail, p);
  }
});

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const profileStore = useProfileStore();

function syncModeFromRoute() {
  const token = typeof route.query.reset === 'string' ? route.query.reset : '';
  if (token) {
    resetToken.value = token;
    mode.value = 'reset';
    info.value = 'Choose a new password for your account.';
    return;
  }
  if (route.path === '/forgot-password') {
    mode.value = 'forgot';
    return;
  }
  if (route.path === '/login' && mode.value === 'forgot') {
    return;
  }
  mode.value = 'login';
}

async function afterAuth() {
  if (!profileStore.profile?.onboardingComplete) {
    await router.push('/onboarding');
  } else {
    await router.push('/');
  }
}

onMounted(async () => {
  syncModeFromRoute();
  email.value = recalledLoginEmail();
  if (mode.value === 'forgot' || mode.value === 'reset') {
    showBiometric.value = false;
    return;
  }
  const devCreds = recalledDevCredentials();
  if (devCreds?.email) email.value = devCreds.email;
  if (devCreds?.password) password.value = devCreds.password;
  if (devAutoLoginEnabled() && resolveDevCredentials() && auth.accessToken) {
    await afterAuth();
    return;
  }
  if (devAutoLoginEnabled() && resolveDevCredentials() && !auth.accessToken) {
    loading.value = true;
    try {
      const creds = resolveDevCredentials();
      await auth.login(creds.email, creds.password);
      rememberLoginEmail(creds.email);
      rememberDevCredentials(creds.email, creds.password);
      await afterAuth();
      return;
    } catch (e) {
      error.value = e.response?.data?.message || e.message || 'Dev auto-login failed';
    } finally {
      loading.value = false;
    }
  }
  showBiometric.value = await supportsBiometricLogin();
});

watch(() => route.path, (path) => {
  if (path === '/forgot-password') {
    mode.value = 'forgot';
    return;
  }
  if (path === '/login' && mode.value === 'forgot') {
    return;
  }
  syncModeFromRoute();
});

async function submitLogin() {
  error.value = '';
  info.value = '';
  loading.value = true;
  try {
    await auth.login(email.value.trim(), password.value);
    rememberLoginEmail(email.value);
    rememberDevCredentials(email.value, password.value);
    await afterAuth();
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.message || e.message || 'Login failed';
    if (status === 404) {
      error.value = 'API not reachable. Wait for deploy to finish, then hard-refresh.';
    } else {
      error.value = msg;
    }
  } finally {
    loading.value = false;
  }
}

async function submitBiometric() {
  error.value = '';
  info.value = '';
  if (!email.value.trim()) {
    error.value = 'Enter your email above, then use Face ID.';
    return;
  }
  bioLoading.value = true;
  try {
    const data = await loginWithPasskey(email.value);
    await auth.loginWithPasskey(data);
    await afterAuth();
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      error.value = `${bioLabel.value} was cancelled. Try again or use your password.`;
    } else {
      error.value = e.response?.data?.message || e.message || `${bioLabel.value} sign-in failed`;
    }
  } finally {
    bioLoading.value = false;
  }
}

async function finishPasswordReset(message, savedPassword) {
  info.value = message || 'Password updated. Sign in with your new password.';
  error.value = '';
  password.value = savedPassword || '';
  mode.value = 'login';
  forgotStep.value = 1;
  resetCode.value = '';
  newPassword.value = '';
  confirmPassword.value = '';
  resetToken.value = '';
  await router.replace({ path: '/login' });
}

async function submitForgot() {
  error.value = '';
  info.value = '';
  loading.value = true;
  try {
    const { data } = await http.post('/auth/forgot-password', { email: email.value.trim() });
    if (data.emailSent === false && !data.devResetCode) {
      error.value = data.message;
      return;
    }
    if (data.devResetCode) {
      resetCode.value = data.devResetCode;
    }
    info.value = data.message || 'Check your email for a 6-digit reset code.';
    forgotStep.value = 2;
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not send reset code';
  } finally {
    loading.value = false;
  }
}

async function submitResetWithCode() {
  error.value = '';
  info.value = '';
  if (newPassword.value.trim() !== confirmPassword.value.trim()) {
    error.value = 'Passwords do not match';
    return;
  }
  loading.value = true;
  try {
    const savedPassword = newPassword.value.trim();
    const { data } = await http.post('/auth/reset-password-code', {
      email: email.value.trim(),
      code: resetCode.value.trim(),
      newPassword: savedPassword,
    });
    await finishPasswordReset(data.message, savedPassword);
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not reset password';
  } finally {
    loading.value = false;
  }
}

async function submitReset() {
  error.value = '';
  info.value = '';
  if (newPassword.value.trim() !== confirmPassword.value.trim()) {
    error.value = 'Passwords do not match';
    return;
  }
  loading.value = true;
  try {
    const savedPassword = newPassword.value.trim();
    const { data } = await http.post('/auth/reset-password', {
      token: resetToken.value,
      newPassword: savedPassword,
    });
    await finishPasswordReset(data.message, savedPassword);
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not reset password';
  } finally {
    loading.value = false;
  }
}

async function resendCode() {
  error.value = '';
  await submitForgot();
}

function goForgot() {
  error.value = '';
  info.value = '';
  forgotStep.value = 1;
  auth.logout();
  mode.value = 'forgot';
}

function goLogin() {
  error.value = '';
  info.value = '';
  forgotStep.value = 1;
  mode.value = 'login';
  if (route.path === '/forgot-password') {
    router.replace('/login').catch(() => {});
  }
}
</script>

<template>
  <div class="flex min-h-screen min-h-dvh items-center justify-center safe-top safe-bottom safe-x p-4">
    <div class="card w-full max-w-md p-6 sm:p-8">
      <AppLogo size="lg" :show-tagline="false" />
      <p class="mt-4 text-sm text-slate-400">{{ pageSubtitle }}</p>

      <!-- Login -->
      <form v-if="mode === 'login'" class="mt-8 space-y-4" @submit.prevent="submitLogin">
        <div>
          <label class="mb-1 block text-sm text-slate-400">Email</label>
          <input
            v-model="email"
            type="email"
            required
            class="input"
            placeholder="you@example.com"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm text-slate-400">Password</label>
          <PasswordInput
            v-model="password"
            required
            :minlength="8"
            placeholder="8+ characters"
            autocomplete="current-password"
          />
        </div>
        <p v-if="isLocalDev" class="text-xs text-slate-500">
          Local dev — credentials are saved on this machine for auto sign-in.
        </p>
        <p v-if="error" class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
        <p v-if="info" class="rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ info }}</p>
        <button type="submit" class="btn-primary w-full" :disabled="loading || bioLoading">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
        <button
          v-if="showBiometric"
          type="button"
          class="btn-secondary w-full flex items-center justify-center gap-2"
          :disabled="loading || bioLoading"
          @click="submitBiometric"
        >
          <span aria-hidden="true">{{ bioLabel === 'Face ID' ? '🔐' : '👆' }}</span>
          {{ bioLoading ? `Checking ${bioLabel}…` : `Sign in with ${bioLabel}` }}
        </button>
        <p v-if="showBiometric" class="text-center text-xs text-slate-500">
          Set up {{ bioLabel }} in Profile after your first password sign-in.
        </p>
      </form>

      <div v-if="mode === 'login'" class="mt-4">
        <a
          href="/forgot-password"
          class="btn-secondary block w-full min-h-[44px] text-center leading-[44px] no-underline"
          @click.prevent="goForgot"
        >
          Forgot password?
        </a>
      </div>

      <!-- Forgot password -->
      <div v-else-if="mode === 'forgot'" class="mt-8 space-y-4">
        <form v-if="forgotStep === 1" class="space-y-4" @submit.prevent="submitForgot">
          <p class="text-sm text-slate-500">
            Enter your email and we'll send a <strong class="text-slate-300">6-digit code</strong> to reset your password.
          </p>
          <div>
            <label class="mb-1 block text-sm text-slate-400">Email</label>
            <input v-model="email" type="email" required class="input" placeholder="you@example.com" autocomplete="username" />
          </div>
          <p v-if="error" class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
          <button type="submit" class="btn-primary w-full" :disabled="loading">
            {{ loading ? 'Sending…' : 'Send reset code' }}
          </button>
        </form>

        <form v-else class="space-y-4" @submit.prevent="submitResetWithCode">
          <p v-if="info" class="rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ info }}</p>
          <div>
            <label class="mb-1 block text-sm text-slate-400">6-digit code from email</label>
            <input
              v-model="resetCode"
              type="text"
              inputmode="numeric"
              pattern="[0-9]{6}"
              maxlength="6"
              required
              class="input text-center text-lg tracking-[0.35em]"
              placeholder="000000"
              autocomplete="one-time-code"
            />
          </div>
          <PasswordInput v-model="newPassword" required :minlength="8" placeholder="New password (8+ chars)" autocomplete="new-password" />
          <PasswordInput v-model="confirmPassword" required :minlength="8" placeholder="Confirm new password" autocomplete="new-password" />
          <p v-if="error" class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
          <button type="submit" class="btn-primary w-full" :disabled="loading">
            {{ loading ? 'Saving…' : 'Save new password' }}
          </button>
          <button type="button" class="btn-secondary w-full" :disabled="loading" @click="resendCode">
            Resend code
          </button>
        </form>

        <button type="button" class="btn-secondary w-full" @click="goLogin">Back to sign in</button>
        <p class="text-center text-xs text-slate-500">
          No email? Check spam, or contact
          <a :href="`mailto:${brand.supportEmail}`" class="text-teal-400 hover:underline">{{ brand.supportEmail }}</a>
        </p>
      </div>

      <!-- New password from email link -->
      <form v-else class="mt-8 space-y-4" @submit.prevent="submitReset">
        <PasswordInput v-model="newPassword" required :minlength="8" placeholder="New password (8+ chars)" autocomplete="new-password" />
        <PasswordInput v-model="confirmPassword" required :minlength="8" placeholder="Confirm new password" autocomplete="new-password" />
        <p v-if="error" class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
        <p v-if="info && !error" class="rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ info }}</p>
        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Saving…' : 'Save new password' }}
        </button>
        <button type="button" class="btn-secondary w-full" @click="goLogin">Back to sign in</button>
      </form>

      <p v-if="mode === 'login'" class="mt-6 text-center text-xs text-slate-500">Invite-only access · Admin creates accounts</p>
      <p class="mt-3 text-center text-xs text-slate-600">
        Tap <strong class="text-teal-400">Install · Share URL</strong> on the right to add remotelymatch or copy the link.
      </p>
      <p class="mt-3 text-center text-xs text-slate-600">
        <RouterLink to="/privacy" class="text-teal-500 hover:underline">Privacy</RouterLink>
        ·
        <RouterLink to="/terms" class="text-teal-500 hover:underline">Terms</RouterLink>
      </p>
      <p class="mt-3 text-center text-sm">
        <RouterLink to="/welcome" class="text-teal-400 hover:underline">← Back to home</RouterLink>
      </p>
    </div>
  </div>
</template>
