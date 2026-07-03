<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../../api/http';

const loading = ref(true);
const error = ref('');
const data = ref(null);
const days = ref(7);
let pollTimer;

const summary = computed(() => data.value?.summary || {});
const users = computed(() => data.value?.users || []);
const loginEvents = computed(() => data.value?.loginEvents || []);
const activityFeed = computed(() => data.value?.activityFeed || []);
const applications = computed(() => data.value?.applications || []);

const kpis = computed(() => [
  { label: 'Total users', value: summary.value.totalUsers ?? 0, tone: 'sky' },
  { label: 'Active users', value: summary.value.activeUsers ?? 0, tone: 'teal' },
  { label: 'Logins today', value: summary.value.loginsToday ?? 0, tone: 'emerald' },
  { label: 'Failed logins', value: summary.value.failedLoginsToday ?? 0, tone: 'red' },
  { label: 'Applies today', value: summary.value.applicationsToday ?? 0, tone: 'violet' },
  { label: 'Actions today', value: summary.value.activitiesToday ?? 0, tone: 'amber' },
]);

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function activityLabel(type = '') {
  return String(type).replace(/_/g, ' ');
}

function activityTone(type = '') {
  if (type.includes('login') || type === 'apply_jobs' || type === 'reapply_job') return 'teal';
  if (type.includes('follow_up')) return 'violet';
  if (type.includes('polish')) return 'amber';
  if (type.includes('reject')) return 'red';
  return 'sky';
}

function activityBadgeClass(type = '') {
  const tone = activityTone(type);
  if (tone === 'red') return 'badge-red';
  if (tone === 'teal') return 'badge-teal';
  if (tone === 'amber') return 'badge-gold';
  if (tone === 'violet') return 'badge-gold';
  return 'badge-slate';
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const { data: payload } = await http.get('/admin/observability', {
      params: { days: days.value, limit: 100 },
    });
    data.value = payload;
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not load observability dashboard';
    data.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  refresh();
  pollTimer = setInterval(refresh, 60000);
});

onUnmounted(() => clearInterval(pollTimer));
</script>

<template>
  <div v-if="loading && !data" class="py-16 text-center text-slate-400">Loading observability…</div>

  <div v-else class="space-y-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-slate-400">
        Who logs in, who uses the app, and what gets applied — last {{ summary.windowDays || days }} days
      </p>
      <div class="flex items-center gap-2">
        <select v-model.number="days" class="input text-sm" @change="refresh">
          <option :value="1">Last 24h window</option>
          <option :value="7">Last 7 days</option>
          <option :value="30">Last 30 days</option>
        </select>
        <button type="button" class="btn-secondary text-sm" @click="refresh">Refresh</button>
      </div>
    </div>

    <p v-if="error" class="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">{{ error }}</p>
    <p v-if="data?.mongoRequired" class="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
      MongoDB is required for user observability. Set <code class="text-amber-100">MONGODB_URI</code> on production.
    </p>

    <div class="monitor-kpi-grid">
      <div
        v-for="kpi in kpis"
        :key="kpi.label"
        class="monitor-kpi-card"
        :class="`monitor-kpi-${kpi.tone}`"
      >
        <div class="monitor-kpi-ring">
          <span class="monitor-kpi-value">{{ kpi.value }}</span>
        </div>
        <p class="monitor-kpi-label">{{ kpi.label }}</p>
      </div>
    </div>

    <section class="card p-5">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-slate-100">Users</h2>
        <RouterLink to="/users" class="text-sm text-teal-400 hover:underline">Manage team →</RouterLink>
      </div>
      <div class="mt-4 overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="pb-2 pr-4">User</th>
              <th class="pb-2 pr-4">Role</th>
              <th class="pb-2 pr-4">Last login</th>
              <th class="pb-2 pr-4">Logins</th>
              <th class="pb-2 pr-4">Applications</th>
              <th class="pb-2">Last activity</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-t border-slate-800/80 text-slate-300">
              <td class="py-3 pr-4">
                <p class="font-medium text-slate-100">{{ user.name }}</p>
                <p class="text-xs text-slate-500">{{ user.email }}</p>
              </td>
              <td class="py-3 pr-4">
                <span class="badge" :class="user.role === 'admin' ? 'badge-gold' : 'badge-slate'">{{ user.role }}</span>
                <span v-if="!user.active" class="ml-1 badge badge-red text-[10px]">disabled</span>
              </td>
              <td class="py-3 pr-4 text-xs">
                <p>{{ formatTime(user.lastLoginAt) }}</p>
                <p v-if="user.lastLoginMethod" class="text-slate-500">{{ user.lastLoginMethod }}</p>
              </td>
              <td class="py-3 pr-4">{{ user.loginCount || 0 }}</td>
              <td class="py-3 pr-4">{{ user.applicationCount || 0 }}</td>
              <td class="py-3 text-xs">
                <p>{{ formatTime(user.lastActivityAt) }}</p>
                <p v-if="user.lastActivitySummary" class="text-slate-500">{{ user.lastActivitySummary }}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="grid gap-6 xl:grid-cols-2">
      <section class="card p-5">
        <h2 class="text-lg font-semibold text-slate-100">Login events</h2>
        <ul class="mt-4 space-y-3">
          <li
            v-for="event in loginEvents"
            :key="event.id"
            class="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3 text-sm"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="font-medium text-slate-200">{{ event.userName || event.email }}</p>
              <span class="badge text-[10px]" :class="event.success ? 'badge-teal' : 'badge-red'">
                {{ event.success ? 'success' : 'failed' }}
              </span>
            </div>
            <p class="mt-1 text-xs text-slate-500">
              {{ formatTime(event.occurredAt) }} · {{ event.method }} · {{ event.email }}
            </p>
            <p v-if="event.reason && !event.success" class="mt-1 text-xs text-red-300">{{ event.reason }}</p>
          </li>
          <li v-if="!loginEvents.length" class="text-sm text-slate-500">No login events in this window yet.</li>
        </ul>
      </section>

      <section class="card p-5">
        <h2 class="text-lg font-semibold text-slate-100">Activity feed</h2>
        <ul class="mt-4 space-y-3">
          <li
            v-for="item in activityFeed"
            :key="item.id"
            class="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3 text-sm"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="font-medium text-slate-200">{{ item.userName || item.email }}</p>
              <span class="badge text-[10px]" :class="activityBadgeClass(item.type)">
                {{ activityLabel(item.type) }}
              </span>
            </div>
            <p class="mt-1 text-slate-300">{{ item.summary }}</p>
            <p class="mt-1 text-xs text-slate-500">{{ formatTime(item.occurredAt) }}</p>
          </li>
          <li v-if="!activityFeed.length" class="text-sm text-slate-500">No tracked activity yet — events appear after logins, approvals, applies, polish, and follow-up sends.</li>
        </ul>
      </section>
    </div>

    <section class="card p-5">
      <h2 class="text-lg font-semibold text-slate-100">Applications by user</h2>
      <ul class="mt-4 space-y-3">
        <li
          v-for="app in applications"
          :key="app.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3 text-sm"
        >
          <div>
            <p class="font-medium text-slate-200">{{ app.title }} · {{ app.company }}</p>
            <p class="text-xs text-slate-500">{{ app.userName || app.email }} · {{ app.source || 'source unknown' }}</p>
          </div>
          <div class="text-right text-xs text-slate-400">
            <p class="badge badge-slate text-[10px]">{{ app.status }}</p>
            <p class="mt-1">{{ formatTime(app.lastAttempted || app.submittedAt) }}</p>
          </div>
        </li>
        <li v-if="!applications.length" class="text-sm text-slate-500">No applications recorded in this window.</li>
      </ul>
    </section>
  </div>
</template>
