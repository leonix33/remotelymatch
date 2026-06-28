<script setup>
import { computed, onMounted, ref } from 'vue';
import http from '../api/http';
import { useAuthStore } from '../stores/auth';
import PasswordInput from '../components/PasswordInput.vue';

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
const nameEditTarget = ref(null);
const nameEditValue = ref('');
const nameEditSaving = ref(false);
const menuUser = ref(null);
const userSearch = ref('');
const showInviteForm = ref(false);
const testEmailTo = ref('');
const testEmailSending = ref(false);
const testEmailMsg = ref('');
const testEmailError = ref('');
const emailDiagnostics = ref(null);
const loginEmailSending = ref('');
const loginUrl = import.meta.env.VITE_APP_URL
  ? `${import.meta.env.VITE_APP_URL.replace(/\/$/, '')}/login`
  : `${window.location.origin}/login`;

async function load() {
  loading.value = true;
  try {
    const [usersRes, usageRes, setupRes] = await Promise.all([
      http.get('/users'),
      http.get('/team/usage').catch(() => ({ data: null })),
      http.get('/setup/status').catch(() => ({ data: null })),
    ]);
    users.value = usersRes.data;
    teamUsage.value = usageRes.data;
    emailDiagnostics.value = setupRes.data;
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
  return `You're invited to remotelymatch!\n\nLog in: ${inv.loginUrl}\nEmail: ${inv.email}\nTemporary password: ${inv.password}\n\nChange your password after first login.`;
}

async function toggleActive(user) {
  if (isSelf(user)) return;
  error.value = '';
  success.value = '';
  try {
    await http.patch(`/users/${user._id || user.id}`, { active: !user.active });
    success.value = `${user.name} is now ${user.active !== false ? 'blocked from logging in' : 'able to log in again'}.`;
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

function applicationNameFor(user) {
  return user.applicantName?.trim() || user.displayName?.trim() || user.name || '';
}

function openNameEdit(user) {
  closeMenu();
  nameEditTarget.value = user;
  nameEditValue.value = applicationNameFor(user);
  error.value = '';
  success.value = '';
}

async function submitNameEdit() {
  if (!nameEditTarget.value || nameEditValue.value.trim().length < 2) return;
  nameEditSaving.value = true;
  error.value = '';
  success.value = '';
  try {
    const id = userId(nameEditTarget.value);
    const { data } = await http.patch(`/users/${id}`, {
      applicantName: nameEditValue.value.trim(),
    });
    success.value = `Application name updated for ${nameEditTarget.value.email}.`;
    nameEditTarget.value = null;
    nameEditValue.value = '';
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not update application name';
  } finally {
    nameEditSaving.value = false;
  }
}

function roleClass(role) {
  return role === 'admin' ? 'badge-gold' : 'badge-teal';
}

const filteredUsers = computed(() => {
  const q = userSearch.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter(
    (u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  );
});

const seatsMax = computed(() => teamUsage.value?.limits?.members ?? null);
const atSeatLimit = computed(() => seatsMax.value != null && users.value.length >= seatsMax.value);

function userInitials(name) {
  return (name || '?')
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function randomPassword() {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < 12; i += 1) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

function generatePassword() {
  form.value.password = randomPassword();
}

async function sendDeliveryTest() {
  const to = testEmailTo.value.trim();
  testEmailMsg.value = '';
  testEmailError.value = '';
  if (!to) {
    testEmailError.value = 'Enter an email address to test.';
    return;
  }
  testEmailSending.value = true;
  try {
    const { data } = await http.post('/setup/test-email', { to });
    testEmailMsg.value = data.message || `Test email sent to ${to}. Ask them to check inbox and spam.`;
    if (data.diagnostics) emailDiagnostics.value = { ...emailDiagnostics.value, ...data.diagnostics };
  } catch (e) {
    testEmailError.value =
      e.response?.data?.message || e.response?.data?.reason || e.message || 'Test email failed';
    if (e.response?.data?.diagnostics) {
      emailDiagnostics.value = { ...emailDiagnostics.value, ...e.response.data.diagnostics };
    }
  } finally {
    testEmailSending.value = false;
  }
}

function prefillEmailTest(email) {
  testEmailTo.value = email || '';
  testEmailMsg.value = '';
  testEmailError.value = '';
  document.getElementById('team-email-test')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function sendLoginEmail(user) {
  const id = userId(user);
  if (!id || isSelf(user)) return;
  closeMenu();
  loginEmailSending.value = id;
  error.value = '';
  success.value = '';
  manualInvite.value = null;
  const password = randomPassword();
  try {
    const { data } = await http.post(`/users/${id}/reset-password`, { password });
    if (data.resetEmailSent) {
      success.value = `Login email sent to ${data.email} with a new temporary password.`;
    } else {
      manualInvite.value = {
        name: data.name || user.name,
        email: data.email,
        password,
        loginUrl: data.loginUrl || loginUrl,
      };
      success.value = `Email could not reach ${data.email}. Copy the login details below and send manually (WhatsApp, text, etc.).`;
    }
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not send login email';
  } finally {
    loginEmailSending.value = '';
  }
}

function openActions(user) {
  menuUser.value = user;
}

function closeMenu() {
  menuUser.value = null;
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
  if (action === 'edit-application-name') openNameEdit(user);
  else if (action === 'make-admin') changeRole(user, 'admin');
  else if (action === 'make-user') changeRole(user, 'user');
  else if (action === 'toggle-active') toggleActive(user);
  else if (action === 'delete') openDelete(user);
}

async function submitReset() {
  if (!resetTarget.value || resetPassword.value.length < 8) return;
  resetSaving.value = true;
  error.value = '';
  success.value = '';
  manualInvite.value = null;
  const tempPassword = resetPassword.value.trim();
  const target = resetTarget.value;
  try {
    const id = target._id || target.id;
    const { data } = await http.post(`/users/${id}/reset-password`, { password: tempPassword });
    resetTarget.value = null;
    resetPassword.value = '';
    if (data.resetEmailSent) {
      success.value = `Password reset email sent to ${data.email}.`;
    } else {
      manualInvite.value = {
        name: data.name || target.name,
        email: data.email,
        password: tempPassword,
        loginUrl: data.loginUrl || loginUrl,
      };
      success.value = `Password reset for ${data.email}. Copy the new login details below and send to them.`;
    }
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Reset failed';
  } finally {
    resetSaving.value = false;
  }
}

onMounted(() => {
  load();
});
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="page-title text-2xl font-bold text-slate-100">Manage your team</h2>
        <p class="page-subtitle mt-1 max-w-xl text-slate-400">
          Invite people, reset passwords, change roles, or remove access. You control who can use remotelymatch.
        </p>
      </div>
      <div class="card px-4 py-3 text-center">
        <p class="text-2xl font-bold text-teal-300">{{ users.length }}<span v-if="seatsMax" class="text-lg text-slate-500"> / {{ seatsMax }}</span></p>
        <p class="text-xs text-slate-500">seats used</p>
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

    <div v-if="loading" class="mt-8 text-slate-400">Loading team…</div>
    <div v-else class="mt-8">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-slate-200">Team members</h3>
          <p class="text-sm text-slate-500">Tap <strong class="font-medium text-slate-400">Manage</strong> on anyone to reset password, change role, or remove them.</p>
        </div>
        <button
          type="button"
          class="btn-primary text-sm"
          :disabled="atSeatLimit"
          @click="showInviteForm = true"
        >
          + Invite someone
        </button>
      </div>

      <div v-if="users.length > 3" class="mt-4">
        <input
          v-model="userSearch"
          type="search"
          class="input max-w-md"
          placeholder="Search by name or email…"
          autocomplete="off"
        />
      </div>

      <p v-if="atSeatLimit" class="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
        Seat limit reached ({{ seatsMax }}). Upgrade your plan or remove a member before inviting someone new.
      </p>

      <p v-if="userSearch && !filteredUsers.length" class="mt-4 text-sm text-slate-500">No members match “{{ userSearch }}”.</p>

      <div class="mobile-applied-cards mt-4 md:hidden">
        <div v-for="u in filteredUsers" :key="`card-${u._id || u.id}`" class="team-member-card mobile-applied-card">
          <div class="flex items-start gap-3">
            <div class="team-member-avatar" aria-hidden="true">{{ userInitials(u.name) }}</div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium text-slate-200">{{ u.name }}</p>
                <span v-if="isSelf(u)" class="text-xs text-slate-500">(you)</span>
              </div>
              <p class="text-sm text-slate-500">{{ u.email }}</p>
              <p v-if="applicationNameFor(u) !== u.name" class="mt-1 text-xs text-slate-600">
                Applies as <span class="text-slate-400">{{ applicationNameFor(u) }}</span>
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <span class="badge capitalize" :class="roleClass(u.role)">{{ u.role }}</span>
                <span class="badge" :class="u.active !== false ? 'badge-teal' : 'badge-slate'">
                  {{ u.active !== false ? 'Can log in' : 'Blocked' }}
                </span>
              </div>
            </div>
          </div>
          <div v-if="!isSelf(u)" class="mt-4 grid grid-cols-2 gap-2">
            <button type="button" class="btn-secondary text-sm" @click="openReset(u)">Reset password</button>
            <button
              type="button"
              class="btn-primary text-sm"
              :disabled="roleSaving === userId(u)"
              @click="openActions(u)"
            >
              Manage
            </button>
          </div>
        </div>
      </div>

      <div class="card mt-4 hidden md:block">
      <div class="team-table-scroll max-h-[min(65vh,36rem)] overflow-x-auto overflow-y-auto mobile-table-wrap">
      <table class="w-full text-left text-sm">
        <thead class="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm">
          <tr class="border-b border-slate-800 text-slate-400">
            <th class="px-6 py-4">Member</th>
            <th class="px-6 py-4">Role</th>
            <th class="px-6 py-4">Access</th>
            <th class="px-6 py-4 text-right">Manage</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filteredUsers" :key="u._id || u.id" class="border-b border-slate-800/80">
            <td class="px-6 py-4">
              <div class="flex items-center gap-3">
                <div class="team-member-avatar team-member-avatar--sm" aria-hidden="true">{{ userInitials(u.name) }}</div>
                <div>
                  <p class="font-medium text-slate-200">
                    {{ u.name }}
                    <span v-if="isSelf(u)" class="text-xs font-normal text-slate-500">(you)</span>
                  </p>
                  <p class="text-slate-500">{{ u.email }}</p>
                  <p v-if="applicationNameFor(u) !== u.name" class="mt-0.5 text-xs text-slate-600">
                    Applies as <span class="text-slate-400">{{ applicationNameFor(u) }}</span>
                  </p>
                </div>
              </div>
            </td>
            <td class="px-6 py-4">
              <span class="badge capitalize" :class="roleClass(u.role)">{{ u.role }}</span>
            </td>
            <td class="px-6 py-4">
              <span class="badge" :class="u.active !== false ? 'badge-teal' : 'badge-slate'">
                {{ u.active !== false ? 'Can log in' : 'Blocked' }}
              </span>
            </td>
            <td class="px-6 py-4 text-right">
              <div v-if="!isSelf(u)" class="flex justify-end gap-2">
                <button type="button" class="btn-secondary px-3 py-1.5 text-xs" @click="openReset(u)">
                  Reset password
                </button>
                <button
                  type="button"
                  class="btn-primary px-3 py-1.5 text-xs"
                  :disabled="roleSaving === userId(u)"
                  @click="openActions(u)"
                >
                  Manage
                </button>
              </div>
              <span v-else class="text-xs text-slate-500">Your account</span>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      </div>
    </div>

    <div id="team-email-test" class="mt-10 card p-6">
      <h3 class="font-semibold text-slate-200">Test email delivery</h3>
      <p class="mt-1 text-sm text-slate-500">
        Send a test message to any address — yours, a teammate’s, or Yahoo/Gmail — to confirm they can receive mail from remotelymatch.
      </p>
      <div v-if="emailDiagnostics" class="mt-3 flex flex-wrap gap-2 text-xs">
        <span class="badge" :class="emailDiagnostics.emailDeliveryReady ? 'badge-teal' : 'badge-slate'">
          {{ emailDiagnostics.emailDeliveryReady ? 'Email ready' : 'Email not ready' }}
        </span>
        <span v-if="emailDiagnostics.emailFrom" class="text-slate-500">From: {{ emailDiagnostics.emailFrom }}</span>
      </div>
      <p v-if="emailDiagnostics?.emailDomainError" class="mt-2 text-xs text-amber-300">{{ emailDiagnostics.emailDomainError }}</p>
      <div class="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          v-model="testEmailTo"
          type="email"
          class="input flex-1"
          placeholder="e.g. ebenezerawosanya@yahoo.com"
          autocomplete="off"
        />
        <button type="button" class="btn-primary shrink-0" :disabled="testEmailSending" @click="sendDeliveryTest">
          {{ testEmailSending ? 'Sending…' : 'Send test email' }}
        </button>
      </div>
      <p v-if="testEmailMsg" class="mt-3 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ testEmailMsg }}</p>
      <p v-if="testEmailError" class="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ testEmailError }}</p>
      <p class="mt-3 text-xs text-slate-600">Yahoo and Hotmail often filter new senders — check spam/bulk folders. If the test arrives but invites do not, use <strong class="text-slate-500">Send login email</strong> on the member.</p>
    </div>

    <div class="mt-10 border-t border-slate-800/80 pt-8">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 text-left"
        @click="showInviteForm = !showInviteForm"
      >
        <div>
          <h3 class="text-lg font-semibold text-slate-200">Invite someone new</h3>
          <p class="text-sm text-slate-500">Create an account and send login details by email.</p>
        </div>
        <span class="text-slate-500">{{ showInviteForm ? '▴' : '▾' }}</span>
      </button>

      <div v-show="showInviteForm" class="mt-6 grid gap-8 xl:grid-cols-2">
      <form class="card p-6" @submit.prevent="createUser">
        <h3 class="font-semibold text-slate-200">New team member</h3>
        <p class="mt-1 text-sm text-slate-500">They’ll get an email with a login link and temporary password when email is configured.</p>

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
            <div class="flex gap-2">
              <PasswordInput v-model="form.password" class="flex-1" required :minlength="8" placeholder="8+ characters" />
              <button type="button" class="btn-secondary shrink-0 px-3 text-sm" @click="generatePassword">Generate</button>
            </div>
            <p class="mt-1 text-xs text-slate-500">Copy and send via WhatsApp or text if the invite email doesn’t arrive.</p>
          </div>
          <div>
            <label class="mb-1 block text-sm text-slate-400">Role</label>
            <select v-model="form.role" class="input">
              <option value="user">User — jobs, applications, AI tools</option>
              <option value="admin">Admin — can invite and manage team</option>
            </select>
          </div>
        </div>

        <button type="submit" class="btn-primary mt-6 w-full sm:w-auto" :disabled="saving || atSeatLimit">
          {{ saving ? 'Creating…' : 'Create account & send invite' }}
        </button>
      </form>

      <div class="card p-6">
        <h3 class="font-semibold text-slate-200">Role guide</h3>
        <ul class="mt-4 space-y-3 text-sm text-slate-400">
          <li class="flex gap-3"><span class="badge badge-gold">Admin</span> Invite users, manage team, run agent, full access</li>
          <li class="flex gap-3"><span class="badge badge-teal">User</span> Jobs, applications, resumes, AI tools — no team admin</li>
        </ul>
        <div class="mt-6 rounded-xl border border-teal-900/40 bg-slate-950/50 p-4 text-sm text-slate-500">
          <p class="font-medium text-slate-300">Quick tips</p>
          <ul class="mt-2 list-inside list-disc space-y-1">
            <li>Use <strong class="text-slate-400">Reset password</strong> if someone can’t log in.</li>
            <li>Use <strong class="text-slate-400">Blocked</strong> to pause access without deleting their data.</li>
            <li>Delete only when you want to remove them completely — you can re-invite later.</li>
          </ul>
        </div>
      </div>
      </div>
    </div>

    <div
      v-if="nameEditTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 mobile-modal-sheet"
      @click.self="nameEditTarget = null"
    >
      <form class="card w-full max-w-md p-6" @submit.prevent="submitNameEdit">
        <h3 class="font-semibold text-slate-200">Application name</h3>
        <p class="mt-1 text-sm text-slate-500">
          {{ nameEditTarget.name }} · {{ nameEditTarget.email }}
        </p>
        <p class="mt-2 text-xs text-slate-600">
          This is the name employers and recruiters see on job forms and tailored resumes.
        </p>
        <input
          v-model="nameEditValue"
          type="text"
          required
          minlength="2"
          class="input mt-4"
          placeholder="Full legal name"
        />
        <div class="mt-6 flex gap-3">
          <button type="button" class="btn-secondary flex-1" @click="nameEditTarget = null">Cancel</button>
          <button type="submit" class="btn-primary flex-1" :disabled="nameEditSaving">
            {{ nameEditSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="resetTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 mobile-modal-sheet"
      @click.self="resetTarget = null"
    >
      <form class="card w-full max-w-md p-6" @submit.prevent="submitReset">
        <h3 class="font-semibold text-slate-200">Reset password</h3>
        <p class="mt-1 text-sm text-slate-500">{{ resetTarget.name }} · {{ resetTarget.email }}</p>
        <p class="mt-2 text-xs text-amber-300/90">Sets a new password immediately. User must be <strong>Active</strong> to log in.</p>
        <PasswordInput
          v-model="resetPassword"
          class="mt-4"
          required
          :minlength="8"
          placeholder="New temporary password"
        />
        <div class="mt-3 flex justify-end">
          <button type="button" class="text-xs text-teal-400 hover:underline" @click="resetPassword = randomPassword()">
            Generate password
          </button>
        </div>
        <div class="mt-6 flex gap-3">
          <button type="button" class="btn-secondary flex-1" @click="resetTarget = null">Cancel</button>
          <button type="submit" class="btn-primary flex-1" :disabled="resetSaving">
            {{ resetSaving ? 'Saving…' : 'Reset' }}
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="menuUser"
      class="team-actions-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-actions-title"
      @click.self="closeMenu"
      @keydown.escape="closeMenu"
    >
      <div class="team-actions-sheet card w-full max-w-md p-5 sm:rounded-2xl sm:p-6" @click.stop>
        <div class="flex items-start gap-3">
          <div class="team-member-avatar" aria-hidden="true">{{ userInitials(menuUser.name) }}</div>
          <div class="min-w-0 flex-1">
            <h3 id="team-actions-title" class="font-semibold text-slate-200">{{ menuUser.name }}</h3>
            <p class="text-sm text-slate-500">{{ menuUser.email }}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <span class="badge capitalize" :class="roleClass(menuUser.role)">{{ menuUser.role }}</span>
              <span class="badge" :class="menuUser.active !== false ? 'badge-teal' : 'badge-slate'">
                {{ menuUser.active !== false ? 'Can log in' : 'Blocked' }}
              </span>
            </div>
          </div>
        </div>

        <p class="team-manage-section-label mt-6">Profile</p>
        <button
          type="button"
          class="team-manage-action"
          @click="handleMenuAction(menuUser, 'edit-application-name')"
        >
          <span class="team-manage-action-title">Edit application name</span>
          <span class="team-manage-action-hint">Name shown on job applications and resumes</span>
        </button>

        <p class="team-manage-section-label mt-6">Access</p>
        <button
          type="button"
          class="team-manage-action"
          :disabled="loginEmailSending === userId(menuUser)"
          @click="sendLoginEmail(menuUser)"
        >
          <span class="team-manage-action-title">Send login email</span>
          <span class="team-manage-action-hint">New temporary password + invite-style email (use if they never got the invite)</span>
        </button>
        <button type="button" class="team-manage-action" @click="prefillEmailTest(menuUser.email)">
          <span class="team-manage-action-title">Test delivery to this address</span>
          <span class="team-manage-action-hint">Send a test email to {{ menuUser.email }} and scroll to the test section</span>
        </button>
        <button type="button" class="team-manage-action" @click="openReset(menuUser)">
          <span class="team-manage-action-title">Reset password</span>
          <span class="team-manage-action-hint">Choose the password yourself, then email it to them</span>
        </button>
        <button
          v-if="menuUser.role !== 'admin'"
          type="button"
          class="team-manage-action"
          :disabled="roleSaving === userId(menuUser)"
          @click="handleMenuAction(menuUser, 'make-admin')"
        >
          <span class="team-manage-action-title">Make admin</span>
          <span class="team-manage-action-hint">Can invite users and manage the team</span>
        </button>
        <button
          v-else
          type="button"
          class="team-manage-action"
          :disabled="roleSaving === userId(menuUser)"
          @click="handleMenuAction(menuUser, 'make-user')"
        >
          <span class="team-manage-action-title">Make regular user</span>
          <span class="team-manage-action-hint">Remove team admin permissions</span>
        </button>
        <button
          type="button"
          class="team-manage-action"
          @click="handleMenuAction(menuUser, 'toggle-active')"
        >
          <span class="team-manage-action-title">{{ menuUser.active !== false ? 'Block login' : 'Restore access' }}</span>
          <span class="team-manage-action-hint">
            {{ menuUser.active !== false ? 'They cannot sign in until you restore access' : 'Let them log in again' }}
          </span>
        </button>

        <p class="team-manage-section-label mt-5 text-red-400/80">Danger zone</p>
        <button
          type="button"
          class="team-manage-action team-manage-action--danger"
          @click="handleMenuAction(menuUser, 'delete')"
        >
          <span class="team-manage-action-title">Delete user</span>
          <span class="team-manage-action-hint">Permanently remove their account and data</span>
        </button>

        <button type="button" class="btn-secondary mt-5 w-full" @click="closeMenu">Done</button>
      </div>
    </div>

    <div
      v-if="deleteTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 mobile-modal-sheet"
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
