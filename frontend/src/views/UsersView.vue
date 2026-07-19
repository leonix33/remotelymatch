<script setup>
import { computed, onMounted, ref } from 'vue';
import http from '../api/http';
import { useAuthStore } from '../stores/auth';
import PasswordInput from '../components/PasswordInput.vue';
import { TEAM_MAILBOX } from '../constants/domain';
import { canChangeRole, canManageUser, isSuperAdminRole, roleLabel } from '../utils/roles';

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
const testEmailResendId = ref('');
const testEmailDeliveryStatus = ref('');
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
    manualInvite.value = {
      name: data.name,
      email: data.email,
      password: tempPassword,
      loginUrl: data.loginUrl || loginUrl,
      emailSent: Boolean(data.inviteEmailSent),
    };
    if (data.inviteEmailSent) {
      success.value = `Invite email sent to ${data.email}. Use the share buttons below if they don’t see it (Yahoo/iCloud often filter new senders).`;
    } else if (data.inviteEmailError) {
      success.value = `Account created for ${data.email}. Email could not be sent — share the login details below (WhatsApp, Gmail, or text).`;
    } else {
      success.value = `Account created for ${data.email}. Share the login details below.`;
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

function shareInviteViaGmail(inv) {
  const subject = encodeURIComponent("You're invited to remotelymatch");
  const body = encodeURIComponent(inviteMessage(inv));
  const to = encodeURIComponent(inv.email);
  window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`, '_blank', 'noopener');
}

function shareInviteViaWhatsApp(inv) {
  window.open(`https://wa.me/?text=${encodeURIComponent(inviteMessage(inv))}`, '_blank', 'noopener');
}

async function toggleActive(user) {
  if (isSelf(user) || !canManageUser(auth.user?.role, user)) return;
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
  if (isSelf(user) || user.role === role || !canChangeRole(auth.user?.role, user)) return;
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
  if (role === 'superadmin') return 'badge-gold';
  return role === 'admin' ? 'badge-teal' : 'badge-slate';
}

function roleDisplay(role) {
  return roleLabel(role);
}

function userIsProtected(user) {
  return isSuperAdminRole(user?.role);
}

function canOpenManage(user) {
  return !isSelf(user) && canManageUser(auth.user?.role, user);
}

const filteredUsers = computed(() => {
  const q = userSearch.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter(
    (u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  );
});

const seatsMax = computed(() => teamUsage.value?.limits?.members ?? null);
const teamMemberCount = computed(() => {
  if (teamUsage.value?.members != null) return teamUsage.value.members;
  return users.value.filter((u) => u.active !== false).length;
});
const atSeatLimit = computed(() => seatsMax.value != null && teamMemberCount.value >= seatsMax.value);

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

function openInviteForm() {
  showInviteForm.value = true;
  if (!form.value.password) generatePassword();
}

function toggleInviteForm() {
  showInviteForm.value = !showInviteForm.value;
  if (showInviteForm.value && !form.value.password) generatePassword();
}

async function sendDeliveryTest() {
  const to = testEmailTo.value.trim();
  testEmailMsg.value = '';
  testEmailError.value = '';
  testEmailResendId.value = '';
  testEmailDeliveryStatus.value = '';
  if (!to) {
    testEmailError.value = 'Enter an email address to test.';
    return;
  }
  testEmailSending.value = true;
  try {
    const { data } = await http.post('/setup/test-email', { to });
    testEmailResendId.value = data.provider === 'resend' ? data.id || '' : '';
    testEmailDeliveryStatus.value = data.provider || data.deliveryStatus?.status || '';
    testEmailMsg.value = data.message || `Test email sent to ${to}. Check inbox, Junk, and Spam.`;
    if (data.deliveryNote) {
      testEmailMsg.value += ` ${data.deliveryNote}`;
    }
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
  if (!id || isSelf(user) || !canManageUser(auth.user?.role, user)) return;
  closeMenu();
  loginEmailSending.value = id;
  error.value = '';
  success.value = '';
  manualInvite.value = null;
  const password = randomPassword();
  try {
    const { data } = await http.post(`/users/${id}/reset-password`, { password });
    manualInvite.value = {
      name: data.name || user.name,
      email: data.email,
      password,
      loginUrl: data.loginUrl || loginUrl,
      emailSent: Boolean(data.resetEmailSent),
    };
    if (data.resetEmailSent) {
      success.value = `Login email sent to ${data.email}. Share below if they don’t see it.`;
    } else {
      success.value = `Email could not reach ${data.email}. Share the login details below (WhatsApp, Gmail, or text).`;
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
  if (!canManageUser(auth.user?.role, user)) return;
  closeMenu();
  resetTarget.value = user;
  resetPassword.value = '';
  error.value = '';
  success.value = '';
}

function handleMenuAction(user, action) {
  if (action === 'edit-application-name') {
    if (!isSelf(user) && !canManageUser(auth.user?.role, user)) return;
  } else if (!canManageUser(auth.user?.role, user)) {
    return;
  }
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
    manualInvite.value = {
      name: data.name || target.name,
      email: data.email,
      password: tempPassword,
      loginUrl: data.loginUrl || loginUrl,
      emailSent: Boolean(data.resetEmailSent),
    };
    if (data.resetEmailSent) {
      success.value = `Password reset email sent to ${data.email}. Share below if they don’t see it.`;
    } else {
      success.value = `Password reset for ${data.email}. Share the new login details below.`;
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
        <p class="text-2xl font-bold text-teal-300">{{ teamMemberCount }}<span v-if="seatsMax" class="text-lg text-slate-500"> / {{ seatsMax }}</span></p>
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
      <h3 class="font-semibold text-amber-200">
        {{ manualInvite.emailSent ? 'Share login details' : 'Manual invite' }} — {{ manualInvite.name }}
      </h3>
      <p class="mt-1 text-sm text-slate-400">
        <template v-if="manualInvite.emailSent">
          We emailed <strong class="text-slate-300">{{ manualInvite.email }}</strong>. If nothing arrives, use WhatsApp or Gmail below — Yahoo and iCloud often filter automated mail.
        </template>
        <template v-else>
          Email could not be delivered automatically. Copy or share the details below.
        </template>
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
      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          class="btn-primary"
          @click="copyText(inviteMessage(manualInvite), 'all')"
        >
          {{ copied === 'all' ? 'Copied full message' : 'Copy full message' }}
        </button>
        <button type="button" class="btn-secondary" @click="shareInviteViaGmail(manualInvite)">
          Open in Gmail
        </button>
        <button type="button" class="btn-secondary" @click="shareInviteViaWhatsApp(manualInvite)">
          Share on WhatsApp
        </button>
      </div>
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
          @click="openInviteForm"
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
        Seat limit reached ({{ teamMemberCount }}/{{ seatsMax }}). Upgrade your plan or remove a member before inviting someone new.
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
                <span class="badge" :class="roleClass(u.role)">{{ roleDisplay(u.role) }}</span>
                <span class="badge" :class="u.active !== false ? 'badge-teal' : 'badge-slate'">
                  {{ u.active !== false ? 'Can log in' : 'Blocked' }}
                </span>
              </div>
            </div>
          </div>
          <div v-if="canOpenManage(u)" class="mt-4 grid grid-cols-2 gap-2">
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
              <span class="badge" :class="roleClass(u.role)">{{ roleDisplay(u.role) }}</span>
            </td>
            <td class="px-6 py-4">
              <span class="badge" :class="u.active !== false ? 'badge-teal' : 'badge-slate'">
                {{ u.active !== false ? 'Can log in' : 'Blocked' }}
              </span>
            </td>
            <td class="px-6 py-4 text-right">
              <div v-if="canOpenManage(u)" class="flex justify-end gap-2">
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
              <span v-else-if="isSelf(u)" class="text-xs text-slate-500">Your account</span>
              <span v-else-if="userIsProtected(u)" class="text-xs text-amber-300/90">Protected</span>
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
        Resend works today (may land in Junk on iCloud/Yahoo). <strong class="text-slate-400">Best deliverability:</strong> Google Workspace SMTP as primary — Resend stays as fallback.
      </p>
      <div v-if="emailDiagnostics" class="mt-3 flex flex-wrap gap-2 text-xs">
        <span class="badge" :class="emailDiagnostics.emailDeliveryReady ? 'badge-teal' : 'badge-slate'">
          {{ emailDiagnostics.emailDeliveryReady ? 'Email ready' : 'Email not ready' }}
        </span>
        <span
          v-if="emailDiagnostics.emailProviders?.includes('resend') && emailDiagnostics.emailDomainStatus === 'verified'"
          class="badge badge-teal"
        >
          Resend · {{ emailDiagnostics.emailDomain }}
        </span>
        <span v-if="emailDiagnostics.gmailSmtpConfigured" class="badge badge-teal">
          Workspace SMTP
        </span>
        <span
          v-else-if="emailDiagnostics.emailDeliveryReady && emailDiagnostics.emailProviders?.includes('resend')"
          class="badge badge-gold"
        >
          Resend only — add Gmail for inbox delivery
        </span>
        <span v-else class="badge badge-slate">Workspace SMTP not set</span>
        <span v-if="emailDiagnostics.teamEmail || emailDiagnostics.emailFrom" class="text-slate-500">
          Sender: {{ emailDiagnostics.teamEmail || emailDiagnostics.emailFrom }}
        </span>
      </div>
      <p
        v-if="emailDiagnostics?.emailDeliveryReady && !emailDiagnostics.gmailSmtpConfigured && emailDiagnostics.emailProviders?.includes('resend')"
        class="mt-2 text-xs text-slate-500"
      >
        Resend is fine for Gmail recipients. For <strong class="text-slate-400">iCloud and Yahoo</strong>, set up Google Workspace below — the app sends via Gmail SMTP first, then falls back to Resend.
      </p>
      <div
        v-if="emailDiagnostics?.gmailSmtpConfigured && emailDiagnostics.gmailUsesTeamMailbox === false"
        class="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-amber-100/90"
      >
        <strong class="text-amber-200">Sender mismatch:</strong>
        set <code class="text-amber-200">GMAIL_SMTP_USER</code> to
        <code class="text-amber-200">{{ emailDiagnostics.teamEmail || TEAM_MAILBOX }}</code>
        so outbound mail matches your domain.
      </div>
      <details class="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm">
        <summary class="cursor-pointer font-medium text-teal-300">
          Set up {{ TEAM_MAILBOX }} (Google Workspace)
        </summary>
        <ol class="mt-4 list-decimal space-y-3 pl-5 text-slate-400">
          <li>
            Go to
            <a href="https://workspace.google.com" target="_blank" rel="noopener" class="text-teal-400 hover:underline">workspace.google.com</a>
            → <strong class="text-slate-300">Get started</strong> → use domain
            <code class="text-slate-300">remotelymatch.app</code>.
          </li>
          <li>
            Verify the domain (Google gives you a TXT record — add it in Cloudflare or your registrar DNS).
          </li>
          <li>
            Create the mailbox <code class="text-slate-300">{{ TEAM_MAILBOX }}</code> (Business Starter is enough).
          </li>
          <li>
            Sign in as <code class="text-slate-300">{{ TEAM_MAILBOX }}</code> → Google Account → Security →
            <strong class="text-slate-300">2-Step Verification</strong> → <strong class="text-slate-300">App passwords</strong> → create one for Mail.
          </li>
          <li>
            In <strong class="text-slate-300">Render</strong> → Environment, add:
            <ul class="mt-2 list-inside list-disc space-y-1 text-xs">
              <li><code>GMAIL_SMTP_USER</code> = <code>{{ TEAM_MAILBOX }}</code></li>
              <li><code>GMAIL_SMTP_PASS</code> = the App Password (no spaces)</li>
              <li><code>EMAIL_FROM</code> = <code>remotelymatch &lt;{{ TEAM_MAILBOX }}&gt;</code></li>
            </ul>
            Redeploy, then run a test below.
          </li>
          <li>
            <strong class="text-slate-300">Forward replies to your personal Gmail (optional):</strong>
            in Workspace Admin → Apps → Google Workspace → Gmail → Routing → add a rule to forward
            <code class="text-slate-300">{{ TEAM_MAILBOX }}</code> → <code class="text-slate-300">leonix23@gmail.com</code>.
            <em class="text-slate-500">Do not also use Cloudflare Email Routing for the same address — pick one.</em>
          </li>
        </ol>
        <p class="mt-4 text-xs text-slate-500">
          Resend stays as fallback if Workspace SMTP fails. Keep <code>remotelymatch.app</code> verified in
          <a href="https://resend.com/domains" target="_blank" rel="noopener" class="text-teal-400 hover:underline">Resend Domains</a>
          (sending DNS only — DKIM/SPF). Google Workspace adds separate MX records for receiving mail at
          <code>{{ TEAM_MAILBOX }}</code>; both can coexist in Cloudflare.
        </p>
      </details>
      <p v-if="emailDiagnostics?.emailDomainError" class="mt-2 text-xs text-amber-300">{{ emailDiagnostics.emailDomainError }}</p>
      <div class="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          v-model="testEmailTo"
          type="email"
          class="input flex-1"
          placeholder="e.g. your personal Gmail"
          autocomplete="off"
        />
        <button type="button" class="btn-secondary shrink-0 text-sm" @click="testEmailTo = auth.user?.email || ''">
          Use my login email
        </button>
        <button type="button" class="btn-primary shrink-0" :disabled="testEmailSending" @click="sendDeliveryTest">
          {{ testEmailSending ? 'Sending…' : 'Send test email' }}
        </button>
      </div>
      <p v-if="testEmailMsg" class="mt-3 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{{ testEmailMsg }}</p>
      <p v-if="testEmailResendId" class="mt-2 text-xs text-slate-500">
        Resend ID: <code class="text-slate-400">{{ testEmailResendId }}</code>
        <span v-if="testEmailDeliveryStatus"> · Status: <strong class="text-slate-300">{{ testEmailDeliveryStatus }}</strong></span>
        —
        <a href="https://resend.com/emails" target="_blank" rel="noopener" class="text-teal-400 hover:underline">Resend dashboard</a>
      </p>
      <p v-else-if="testEmailDeliveryStatus === 'gmail'" class="mt-2 text-xs text-slate-500">
        Sent via Gmail SMTP — no Resend tracking for this message.
      </p>
      <div class="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-amber-100/90">
        <strong class="text-amber-200">Why weekly pulse arrived but a test might not:</strong>
        weekly pulse goes to your <strong>login email</strong> (the account you signed in with). If you test a
        <strong>different address</strong>, open that inbox — check <strong>Spam</strong> and <strong>Promotions</strong> in Gmail.
      </div>
      <p v-if="testEmailError" class="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ testEmailError }}</p>
      <div class="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-500">
        <p class="font-medium text-slate-400">If Gmail works but iCloud / Yahoo does not</p>
        <ul class="mt-2 list-inside list-disc space-y-1">
          <li>Check <strong class="text-slate-400">Junk</strong> and <strong class="text-slate-400">Trash</strong> — Apple and Yahoo filter new domains aggressively.</li>
          <li>Wait 10–15 minutes; delivery is often delayed.</li>
          <li>In iCloud Mail: Settings → Rules — make sure nothing auto-deletes mail from new senders.</li>
          <li>Open <a href="https://resend.com/emails" target="_blank" rel="noopener" class="text-teal-400 hover:underline">resend.com/emails</a> — if status is <strong class="text-slate-400">Bounced</strong>, the address provider rejected it.</li>
          <li>If Resend shows <strong class="text-slate-400">Delivered</strong> but nothing in inbox, it is in Junk — or share login details manually via WhatsApp/text.</li>
        </ul>
      </div>
    </div>

    <div class="mt-10 border-t border-slate-800/80 pt-8">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 text-left"
        @click="toggleInviteForm"
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
              <span class="badge" :class="roleClass(menuUser.role)">{{ roleDisplay(menuUser.role) }}</span>
              <span class="badge" :class="menuUser.active !== false ? 'badge-teal' : 'badge-slate'">
                {{ menuUser.active !== false ? 'Can log in' : 'Blocked' }}
              </span>
            </div>
          </div>
        </div>

        <p v-if="userIsProtected(menuUser) && !auth.isSuperAdmin" class="mt-4 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100/90">
          Super admin accounts can only be managed by the platform owner.
        </p>

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
          v-if="canManageUser(auth.user?.role, menuUser)"
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
        <button
          v-if="canManageUser(auth.user?.role, menuUser)"
          type="button"
          class="team-manage-action"
          @click="openReset(menuUser)"
        >
          <span class="team-manage-action-title">Reset password</span>
          <span class="team-manage-action-hint">Choose the password yourself, then email it to them</span>
        </button>
        <button
          v-if="canChangeRole(auth.user?.role, menuUser) && menuUser.role !== 'admin' && menuUser.role !== 'superadmin'"
          type="button"
          class="team-manage-action"
          :disabled="roleSaving === userId(menuUser)"
          @click="handleMenuAction(menuUser, 'make-admin')"
        >
          <span class="team-manage-action-title">Make admin</span>
          <span class="team-manage-action-hint">Can invite users and manage the team</span>
        </button>
        <button
          v-else-if="canChangeRole(auth.user?.role, menuUser) && menuUser.role === 'admin'"
          type="button"
          class="team-manage-action"
          :disabled="roleSaving === userId(menuUser)"
          @click="handleMenuAction(menuUser, 'make-user')"
        >
          <span class="team-manage-action-title">Make regular user</span>
          <span class="team-manage-action-hint">Remove team admin permissions</span>
        </button>
        <button
          v-if="canManageUser(auth.user?.role, menuUser)"
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
          v-if="canManageUser(auth.user?.role, menuUser)"
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
