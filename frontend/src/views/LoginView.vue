<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

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
    await auth.login(email.value, password.value);
    router.push('/');
  } catch (e) {
    const status = e.response?.status;
    if (status === 404) {
      error.value = 'API not reachable. Wait for Render deploy to finish, then hard-refresh (Cmd+Shift+R).';
    } else if (status === 400) {
      error.value = 'Wrong email or password. Use the ADMIN_EMAIL and ADMIN_PASSWORD from your Render environment.';
    } else {
      error.value = e.response?.data?.message || e.message || 'Login failed';
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-4">
    <div class="card w-full max-w-md p-8">
      <p class="text-xs font-semibold uppercase tracking-widest text-teal-400">Remote</p>
      <h1 class="mt-1 text-2xl font-bold text-amber-300">Match</h1>
      <p class="mt-2 text-sm text-slate-400">Sign in to find and apply to remote jobs</p>

      <form class="mt-8 space-y-4" @submit.prevent="submit">
        <div>
          <label class="mb-1 block text-sm text-slate-400">Email</label>
          <input v-model="email" type="email" required class="input" placeholder="you@example.com" />
        </div>
        <div>
          <label class="mb-1 block text-sm text-slate-400">Password</label>
          <input v-model="password" type="password" required minlength="8" class="input" placeholder="8+ characters" />
        </div>
        <p v-if="error" class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
      <p class="mt-6 text-center text-xs text-slate-500">
        Use the ADMIN_EMAIL and ADMIN_PASSWORD from your Render dashboard (not localhost .env)
      </p>
    </div>
  </div>
</template>
