<script setup>
import { ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import AppLogo from '../components/AppLogo.vue';
import { brand } from '../brand';

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(email.value.trim(), password.value);
    router.push('/');
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.message || e.message || 'Login failed';
    if (status === 404) {
      error.value = 'API not reachable. Wait for deploy to finish, then hard-refresh.';
    } else if (status === 403) {
      error.value = msg;
    } else if (status === 401 || status === 400) {
      error.value = msg;
    } else {
      error.value = msg;
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen min-h-dvh items-center justify-center safe-top safe-bottom safe-x p-4">
    <div class="card w-full max-w-md p-6 sm:p-8">
      <AppLogo size="lg" />
      <p class="mt-4 text-sm text-slate-400">{{ brand.tagline }}</p>

      <form class="mt-8 space-y-4" @submit.prevent="submit">
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
          <input
            v-model="password"
            type="password"
            required
            minlength="8"
            class="input"
            placeholder="8+ characters"
            autocomplete="current-password"
          />
        </div>
        <p v-if="error" class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
      <p class="mt-6 text-center text-xs text-slate-500">Invite-only access · Admin creates accounts</p>
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
