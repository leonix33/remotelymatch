<script setup>
import { onMounted, ref } from 'vue';
import http from '../api/http';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const users = ref([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');
const form = ref({ name: '', email: '', password: '', role: 'user' });
const resetTarget = ref(null);
const resetPassword = ref('');
const resetSaving = ref(false);
const teamUsage = ref(null);
const upgrading = ref(false);
const deleteTarget = ref(null);
const deleteSaving = ref(false);
const roleSaving = ref('');
const loginUrl = import.meta.env.VITE_APP_URL
  ? `${import.meta.env.VITE_APP_URL.replace(/\/$/, '')}/login`
  : `${window.location.origin}/login`;

async function load() {
  loading.value = true;
  try {
    const [usersRes, usageRes] = await Promise.all([
      http.get('/users'),
      http.get('/team/usage').catch(() => ({ data: null })),
    ]);
    users.value = usersRes.data;
    teamUsage.value = usageRes.data;
  } finally {
    loading.value = false;
  }
}

async function upgradePlan(plan) {
  upgrading.value = true;
  error.value = '';
  try {
    await http.post('/team/upgrade', { plan });
    success.value = `Plan updated to ${plan}`;
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Upgrade failed';
  } finally {
    upgrading.value = false;
  }
}

async function createUser() {
  error.value = '';
  success.value = '';
  saving.value = true;
  try {
    const { data } = await http.post('/users', form.value);
    form.value = { name: '', email: '', password: '', role: 'user' };
    success.value = data.inviteEmailSent
      ? `Invite email sent to ${data.email}. They can log in at ${loginUrl}.`
      : data.inviteEmailError
        ? `Account created for ${data.email}, but the invite email failed: ${data.inviteEmailError}. Share the login URL and password manually.`
        : `Account created for ${data.email}. Email is not configured — share the login URL and password manually.`;
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not create user';
  } finally {
    saving.value = false;
  }
}

async function toggleActive(user) {
  if (isSelf(user)) return;
  error.value = '';
  success.value = '';
  try {
    await http.patch(`/users/${user._id || user.id}`, { active: !user.active });
    success.value = `${user.name} is now ${user.active !== false ? 'disabled' : 'active'}.`;
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not update user';
  }
}

async function changeRole(user, role) {
  const id = userId(user);
  if (isSelf(user) || user.role === role) return;
  roleSaving.value = id;
  error.value = '';
  success.value = '';
  try {
    await http.patch(`/users/${id}`, { role });
    success.value = `${user.name} is now ${role === 'admin' ? 'an admin' : 'a user'}.`;
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not change role';
    await load();
  } finally {
    roleSaving.value = '';
  }
}

function userId(user) {
  return String(user?._id || user?.id || '');
}

function isSelf(user) {
  const currentId = String(auth.user?.id || auth.user?._id || '');
  return userId(user) === currentId;
}

function openDelete(user) {
  deleteTarget.value = user;
  error.value = '';
  success.value = '';
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleteSaving.value = true;
  error.value = '';
  success.value = '';
  try {
    const id = deleteTarget.value._id || deleteTarget.value.id;
    const email = deleteTarget.value.email;
    await http.delete(`/users/${id}`);
    success.value = `Removed ${email}. You can invite them again with the same email.`;
    deleteTarget.value = null;
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not delete user';
  } finally {
    deleteSaving.value = false;
  }
}

function roleClass(role) {
  return role === 'admin' ? 'badge-gold' : 'badge-teal';
}

function openReset(user) {
  resetTarget.value = user;
  resetPassword.value = '';
  error.value = '';
  success.value = '';
}

async function submitReset() {
  if (!resetTarget.value || resetPassword.value.length < 8) return;
  resetSaving.value = true;
  error.value = '';
  success.value = '';
  try {
    const id = resetTarget.value._id || resetTarget.value.id;
    const email = resetTarget.value.email;
    const { data } = await http.post(`/users/${id}/reset-password`, { password: resetPassword.value });
    success.value = data.resetEmailSent
      ? `Password reset email sent to ${email}.`
      : `Password reset for ${email}. Email is not configured — share the new password manually.`;
    resetTarget.value = null;
    resetPassword.value = '';
  } catch (e) {
    error.value = e.response?.data?.message || 'Reset failed';
  } finally {
    resetSaving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold text-slate-100">Team access</h2>
        <p class="mt-1 max-w-xl text-slate-400">
          You are the admin. Invite users who can log in, browse jobs, track applications, and use the AI tools.
        </p>
      </div>
      <div class="card px-4 py-3 text-center">
        <p class="text-2xl font-bold text-teal-300">{{ users.length }}</p>
        <p class="text-xs text-slate-500">team members</p>
        <p v-if="teamUsage?.limits" class="mt-1 text-xs text-slate-600">max {{ teamUsage.limits.members }}</p>
      </div>
    </div>

    <div v-if="teamUsage && !teamUsage.unlimited" class="mt-6 card p-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 class="font-semibold text-slate-200">Team plan · {{ teamUsage.plan }}</h3>
          <p class="text-sm text-slate-500">{{ teamUsage.name }} · resets {{ teamUsage.usageMonth }}</p>
        </div>
        <div class="flex gap-2">
          <button
            class="btn-secondary text-xs"
            :disabled="teamUsage.plan === 'free' || upgrading"
            @click="upgradePlan('free')"
          >
            Free
          </button>
          <button
            class="btn-primary text-xs"
            :disabled="teamUsage.plan === 'pro' || upgrading"
            @click="upgradePlan('pro')"
          >
            Pro
          </button>
        </div>
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg bg-slate-950/50 p-3 text-sm">
          <p class="text-slate-500">Agent runs</p>
          <p class="text-teal-200">{{ teamUsage.usage?.agentRuns || 0 }} / {{ teamUsage.limits?.agentRunsPerMonth }}</p>
        </div>
        <div class="rounded-lg bg-slate-950/50 p-3 text-sm">
          <p class="text-slate-500">AI calls</p>
          <p class="text-teal-200">{{ teamUsage.usage?.aiCalls || 0 }} / {{ teamUsage.limits?.aiCallsPerMonth }}</p>
        </div>
        <div class="rounded-lg bg-slate-950/50 p-3 text-sm">
          <p class="text-slate-500">Approvals</p>
          <p class="text-teal-200">{{ teamUsage.usage?.approvals || 0 }} / {{ teamUsage.limits?.approvalsPerMonth }}</p>
        </div>
      </div>
    </div>

    <p v-if="error && !resetTarget && !deleteTarget" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
    <p v-if="success && !resetTarget && !deleteTarget" class="mt-4 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ success }}</p>

    <div class="mt-8 grid gap-8 xl:grid-cols-2">
      <form class="card p-6" @submit.prevent="createUser">
        <h3 class="font-semibold text-slate-200">Invite a user</h3>
        <p class="mt-1 text-sm text-slate-500">Only admins can create accounts. No public signup.</p>
        <p class="mt-1 text-xs text-slate-600">If email is configured, an invite is sent automatically with login details.</p>

        <div class="mt-6 space-y-4">
          <div>
            <label class="mb-1 block text-sm text-slate-400">Full name</label>
            <input v-model="form.name" required class="input" placeholder="Alex Rivera" />
          </div>
          <div>
            <label class="mb-1 block text-sm text-slate-400">Email</label>
            <input v-model="form.email" type="email" required class="input" placeholder="alex@example.com" />
          </div>
          <div>
            <label class="mb-1 block text-sm text-slate-400">Temporary password</label>
            <input v-model="form.password" type="password" required minlength="8" class="input" placeholder="8+ characters" />
            <p class="mt-1 text-xs text-slate-500">Share this once if invite email is not configured.</p>
          </div>
          <div>
            <label class="mb-1 block text-sm text-slate-400">Role</label>
            <select v-model="form.role" class="input">
              <option value="user">User — jobs, applications, AI tools</option>
              <option value="admin">Admin — full access + invite users</option>
            </select>
          </div>
        </div>

        <button type="submit" class="btn-primary mt-6" :disabled="saving">
          {{ saving ? 'Creating…' : 'Create account' }}
        </button>
      </form>

      <div class="card p-6">
        <h3 class="font-semibold text-slate-200">What each role can do</h3>
        <ul class="mt-4 space-y-3 text-sm text-slate-400">
          <li class="flex gap-3"><span class="badge badge-gold">Admin</span> Invite users, run agent, view all data</li>
          <li class="flex gap-3"><span class="badge badge-teal">User</span> Dashboard, jobs, applications, cover letters</li>
        </ul>
        <div class="mt-6 rounded-xl border border-teal-900/40 bg-slate-950/50 p-4 text-sm text-slate-500">
          <p class="font-medium text-slate-300">Tier 3 — Team plans</p>
          <p class="mt-2">Free: 3 seats, 5 agent runs/mo. Pro: 15 seats, 50 runs. Shared watchlists on Social tab.</p>
          <p class="mt-2">Chrome extension: load <code class="text-teal-400">chrome-extension/</code> unpacked in Chrome.</p>
        </div>
      </div>
    </div>

    <div v-if="loading" class="mt-8 text-slate-400">Loading team…</div>
    <div v-else class="mt-8 card overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-950/50">
          <tr class="border-b border-slate-800 text-slate-400">
            <th class="px-6 py-4">Member</th>
            <th class="px-6 py-4">Role</th>
            <th class="px-6 py-4">Status</th>
            <th class="px-6 py-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u._id || u.id" class="border-b border-slate-800/80">
            <td class="px-6 py-4">
              <p class="font-medium text-slate-200">{{ u.name }}</p>
              <p class="text-slate-500">{{ u.email }}</p>
            </td>
            <td class="px-6 py-4">
              <span class="badge capitalize" :class="roleClass(u.role)">{{ u.role }}</span>
            </td>
            <td class="px-6 py-4">
              <span class="badge" :class="u.active !== false ? 'badge-teal' : 'badge-slate'">
                {{ u.active !== false ? 'Active' : 'Disabled' }}
              </span>
            </td>
            <td class="px-6 py-4 text-right">
              <div v-if="!isSelf(u)" class="flex flex-wrap justify-end gap-2">
                <button
                  v-if="u.role !== 'admin'"
                  class="btn-secondary px-3 py-1.5 text-xs text-amber-200"
                  :disabled="roleSaving === userId(u)"
                  @click="changeRole(u, 'admin')"
                >
                  {{ roleSaving === userId(u) ? 'Saving…' : 'Make admin' }}
                </button>
                <button
                  v-else
                  class="btn-secondary px-3 py-1.5 text-xs"
                  :disabled="roleSaving === userId(u)"
                  @click="changeRole(u, 'user')"
                >
                  {{ roleSaving === userId(u) ? 'Saving…' : 'Make user' }}
                </button>
                <button class="btn-secondary px-3 py-1.5 text-xs" @click="openReset(u)">Reset pwd</button>
                <button class="btn-secondary px-3 py-1.5 text-xs" @click="toggleActive(u)">
                  {{ u.active !== false ? 'Disable' : 'Enable' }}
                </button>
                <button class="btn-secondary px-3 py-1.5 text-xs text-red-300 hover:text-red-200" @click="openDelete(u)">
                  Delete
                </button>
              </div>
              <span v-else class="text-xs text-slate-500">You · {{ u.role }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="resetTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="resetTarget = null"
    >
      <form class="card w-full max-w-md p-6" @submit.prevent="submitReset">
        <h3 class="font-semibold text-slate-200">Reset password</h3>
        <p class="mt-1 text-sm text-slate-500">{{ resetTarget.name }} · {{ resetTarget.email }}</p>
        <input
          v-model="resetPassword"
          type="password"
          required
          minlength="8"
          class="input mt-4"
          placeholder="New temporary password"
        />
        <div class="mt-6 flex gap-3">
          <button type="button" class="btn-secondary flex-1" @click="resetTarget = null">Cancel</button>
          <button type="submit" class="btn-primary flex-1" :disabled="resetSaving">
            {{ resetSaving ? 'Saving…' : 'Reset' }}
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="deleteTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="deleteTarget = null"
    >
      <div class="card w-full max-w-md p-6">
        <h3 class="font-semibold text-slate-200">Delete user?</h3>
        <p class="mt-2 text-sm text-slate-400">
          Remove <strong class="text-slate-200">{{ deleteTarget.name }}</strong> ({{ deleteTarget.email }})?
          Their profile, queue, and activity data will be permanently deleted. You can invite them again later.
        </p>
        <p v-if="error" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
        <div class="mt-6 flex gap-3">
          <button type="button" class="btn-secondary flex-1" @click="deleteTarget = null">Cancel</button>
          <button type="button" class="btn-primary flex-1 bg-red-600 hover:bg-red-500" :disabled="deleteSaving" @click="confirmDelete">
            {{ deleteSaving ? 'Deleting…' : 'Delete user' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
