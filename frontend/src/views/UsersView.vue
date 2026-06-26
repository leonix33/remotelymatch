<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import http from '../api/http';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const users = ref([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');
const form = ref({ name: '', email: '', password: '', role: 'user' });
const manualInvite = ref(null);
const copied = ref('');
const resetTarget = ref(null);
const resetPassword = ref('');
const resetSaving = ref(false);
const teamUsage = ref(null);
const upgrading = ref(false);
const deleteTarget = ref(null);
const deleteSaving = ref(false);
const roleSaving = ref('');
const openMenuId = ref('');
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
  manualInvite.value = null;
  const tempPassword = form.value.password;
  saving.value = true;
  try {
    const { data } = await http.post('/users', form.value);
    form.value = { name: '', email: '', password: '', role: 'user' };
    if (data.inviteEmailSent) {
      success.value = `Invite email sent to ${data.email}. They can log in at ${loginUrl}.`;
    } else if (data.inviteEmailError) {
      manualInvite.value = {
        name: data.name,
        email: data.email,
        password: tempPassword,
        loginUrl: data.loginUrl || loginUrl,
      };
      success.value = `Account created for ${data.email}. Email could not be sent — copy the invite below and send it manually (text, WhatsApp, etc.).`;
    } else {
      manualInvite.value = {
        name: data.name,
        email: data.email,
        password: tempPassword,
        loginUrl: data.loginUrl || loginUrl,
      };
      success.value = `Account created for ${data.email}. Share the login details below manually.`;
    }
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not create user';
  } finally {
    saving.value = false;
  }
}

async function copyText(value, label) {
  await navigator.clipboard.writeText(value);
  copied.value = label;
  setTimeout(() => { copied.value = ''; }, 2000);
}

function inviteMessage(inv) {
  return `You're invited to RemoteMatch!\n\nLog in: ${inv.loginUrl}\nEmail: ${inv.email}\nTemporary password: ${inv.password}\n\nChange your password after first login.`;
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

function toggleMenu(user) {
  const id = userId(user);
  openMenuId.value = openMenuId.value === id ? '' : id;
}

function closeMenu() {
  openMenuId.value = '';
}

function openReset(user) {
  closeMenu();
  resetTarget.value = user;
  resetPassword.value = '';
  error.value = '';
  success.value = '';
}

function handleMenuAction(user, action) {
  closeMenu();
  if (action === 'make-admin') changeRole(user, 'admin');
  else if (action === 'make-user') changeRole(user, 'user');
  else if (action === 'toggle-active') toggleActive(user);
  else if (action === 'delete') openDelete(user);
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

function onDocumentClick(e) {
  if (!e.target.closest('[data-user-menu]')) closeMenu();
}

onMounted(() => {
  load();
  document.addEventListener('click', onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
});
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

    <div v-if="manualInvite" class="mt-4 card border border-amber-800/40 bg-amber-950/20 p-5">
      <h3 class="font-semibold text-amber-200">Manual invite — send to {{ manualInvite.name }}</h3>
      <p class="mt-1 text-sm text-slate-400">
        Resend is in test mode until you verify <strong class="text-slate-300">remotelymatch.app</strong> at
        <a href="https://resend.com/domains" target="_blank" rel="noopener" class="text-teal-400 hover:underline">resend.com/domains</a>.
      </p>
      <div class="mt-4 space-y-3 rounded-xl bg-slate-950/60 p-4 text-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-slate-500">Login URL</span>
          <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="copyText(manualInvite.loginUrl, 'url')">
            {{ copied === 'url' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <code class="block break-all text-teal-300">{{ manualInvite.loginUrl }}</code>
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2">
          <span class="text-slate-500">Email</span>
          <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="copyText(manualInvite.email, 'email')">
            {{ copied === 'email' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <code class="block text-slate-200">{{ manualInvite.email }}</code>
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2">
          <span class="text-slate-500">Temporary password</span>
          <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="copyText(manualInvite.password, 'pass')">
            {{ copied === 'pass' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <code class="block text-amber-200">{{ manualInvite.password }}</code>
      </div>
      <button
        type="button"
        class="btn-primary mt-4"
        @click="copyText(inviteMessage(manualInvite), 'all')"
      >
        {{ copied === 'all' ? 'Copied full message' : 'Copy full invite message' }}
      </button>
    </div>

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
              <div v-if="!isSelf(u)" class="relative inline-block text-left" data-user-menu>
                <button
                  type="button"
                  class="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                  :disabled="roleSaving === userId(u)"
                  @click.stop="toggleMenu(u)"
                >
                  Actions
                  <span class="text-[10px] text-slate-500">▾</span>
                </button>
                <div
                  v-if="openMenuId === userId(u)"
                  class="absolute right-0 z-20 mt-1 min-w-[10.5rem] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl"
                >
                  <button
                    v-if="u.role !== 'admin'"
                    type="button"
                    class="block w-full px-4 py-2 text-left text-xs text-amber-200 hover:bg-slate-800"
                    :disabled="roleSaving === userId(u)"
                    @click="handleMenuAction(u, 'make-admin')"
                  >
                    Make admin
                  </button>
                  <button
                    v-else
                    type="button"
                    class="block w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                    :disabled="roleSaving === userId(u)"
                    @click="handleMenuAction(u, 'make-user')"
                  >
                    Make user
                  </button>
                  <button
                    type="button"
                    class="block w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                    @click="openReset(u)"
                  >
                    Reset password
                  </button>
                  <button
                    type="button"
                    class="block w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                    @click="handleMenuAction(u, 'toggle-active')"
                  >
                    {{ u.active !== false ? 'Disable account' : 'Enable account' }}
                  </button>
                  <div class="my-1 border-t border-slate-800" />
                  <button
                    type="button"
                    class="block w-full px-4 py-2 text-left text-xs text-red-300 hover:bg-red-950/40"
                    @click="handleMenuAction(u, 'delete')"
                  >
                    Delete user
                  </button>
                </div>
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
