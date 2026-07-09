<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../../api/http';

const loading = ref(true);
const refreshing = ref(false);
const error = ref('');
const data = ref(null);
const days = ref(7);
let pollTimer;

const OBS_TIMEOUT_MS = 20000;

const summary = computed(() => data.value?.summary || {});
const users = computed(() => data.value?.users || []);
const loginEvents = computed(() => data.value?.loginEvents || []);
const activityFeed = computed(() => data.value?.activityFeed || []);
const applications = computed(() => data.value?.applications || []);
const applicationsExpanded = ref({});
const loginExpanded = ref({});
const activityExpanded = ref({});

const hasAnyData = computed(
  () =>
    users.value.length > 0 ||
    loginEvents.value.length > 0 ||
    activityFeed.value.length > 0 ||
    applications.value.length > 0
);

const kpis = computed(() => [
  { label: 'Total users', value: summary.value.totalUsers ?? 0, tone: 'sky' },
  { label: 'Active users', value: summary.value.activeUsers ?? 0, tone: 'teal' },
  { label: 'Logins today', value: summary.value.loginsToday ?? 0, tone: 'emerald' },
  { label: 'Failed logins', value: summary.value.failedLoginsToday ?? 0, tone: 'red' },
  { label: 'Applies today', value: summary.value.applicationsToday ?? 0, tone: 'violet' },
  { label: 'Actions today', value: summary.value.activitiesToday ?? 0, tone: 'amber' },
]);

function groupEventsByUser(items, { nameKey = 'userName', emailKey = 'email', userIdKey = 'userId', timeKey = 'occurredAt' } = {}) {
  const groups = new Map();
  for (const item of items || []) {
    const key = item[userIdKey] || item[emailKey] || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        userId: key,
        userName: item[nameKey] || item[emailKey] || 'Unknown',
        email: item[emailKey] || '',
        items: [],
      });
    }
    groups.get(key).items.push(item);
  }
  return [...groups.values()]
    .map((group) => {
      const sorted = [...group.items].sort(
        (a, b) => new Date(b[timeKey] || 0) - new Date(a[timeKey] || 0)
      );
      return { ...group, items: sorted, latestAt: sorted[0]?.[timeKey] || null };
    })
    .sort((a, b) => new Date(b.latestAt || 0) - new Date(a.latestAt || 0));
}

const loginEventsByUser = computed(() => groupEventsByUser(loginEvents.value));
const activityByUser = computed(() => groupEventsByUser(activityFeed.value));

const applicationsByUser = computed(() => {
  const groups = new Map();
  for (const app of applications.value) {
    const key = app.userId || app.email || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        userId: key,
        userName: app.userName || app.email || 'Unknown',
        email: app.email || '',
        apps: [],
      });
    }
    groups.get(key).apps.push(app);
  }
  return [...groups.values()]
    .map((group) => {
      const apps = [...group.apps].sort(
        (a, b) =>
          new Date(b.lastAttempted || b.submittedAt || 0) - new Date(a.lastAttempted || a.submittedAt || 0)
      );
      const latestAt = apps[0]?.lastAttempted || apps[0]?.submittedAt || null;
      return { ...group, apps, latestAt };
    })
    .sort((a, b) => new Date(b.latestAt || 0) - new Date(a.latestAt || 0));
});

const totalApplicationCount = computed(() => applications.value.length);

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function activityLabel(type = '') {
  return String(type).replace(/_/g, ' ');
}

function activityTone(type = '') {
  if (type === 'page_view') return 'sky';
  if (type.includes('generate')) return 'emerald';
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
  if (tone === 'emerald') return 'badge-teal';
  return 'badge-slate';
}

function formatJobLine(app) {
  const title = String(app.title || '').trim();
  const company = String(app.company || '').trim();
  if (title && company && title !== company) return `${title} · ${company}`;
  return title || company || 'Unknown role';
}

function isAppsExpanded(userId) {
  return Boolean(applicationsExpanded.value[userId]);
}

function toggleApps(userId) {
  applicationsExpanded.value = {
    ...applicationsExpanded.value,
    [userId]: !applicationsExpanded.value[userId],
  };
}

function isLoginExpanded(userId) {
  return Boolean(loginExpanded.value[userId]);
}

function toggleLogin(userId) {
  loginExpanded.value = { ...loginExpanded.value, [userId]: !loginExpanded.value[userId] };
}

function isActivityExpanded(userId) {
  return Boolean(activityExpanded.value[userId]);
}

function toggleActivity(userId) {
  activityExpanded.value = {
    ...activityExpanded.value,
    [userId]: !activityExpanded.value[userId],
  };
}

function expandAllLogin() {
  const next = {};
  for (const group of loginEventsByUser.value) next[group.userId] = true;
  loginExpanded.value = next;
}

function expandAllActivity() {
  const next = {};
  for (const group of activityByUser.value) next[group.userId] = true;
  activityExpanded.value = next;
}

function expandAllApplications() {
  const next = {};
  for (const group of applicationsByUser.value) next[group.userId] = true;
  applicationsExpanded.value = next;
}

function loginFailedCount(group) {
  return group.items.filter((event) => !event.success).length;
}

function activityTypeSummary(group) {
  const types = new Set(group.items.map((item) => item.type));
  if (types.size === 1) return activityLabel([...types][0]);
  return `${group.items.length} actions`;
}

function collapseAllLogin() {
  loginExpanded.value = {};
}

function collapseAllActivity() {
  activityExpanded.value = {};
}

function collapseAllApplications() {
  applicationsExpanded.value = {};
}

async function refresh() {
  const isFirstLoad = !data.value;
  if (isFirstLoad) loading.value = true;
  else refreshing.value = true;
  error.value = '';
  try {
    const { data: payload } = await http.get('/admin/observability', {
      params: { days: days.value, limit: 100 },
      timeout: OBS_TIMEOUT_MS,
    });
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid observability response');
    }
    data.value = payload;
  } catch (e) {
    const status = e.response?.status;
    if (status === 403) {
      error.value = 'Admin access required — log out and back in with an admin account.';
    } else if (status === 401) {
      error.value = 'Session expired — please log in again.';
    } else if (e.code === 'ECONNABORTED') {
      error.value = 'Request timed out — MongoDB may be slow. Try Refresh.';
    } else {
      error.value =
        e.response?.data?.message || e.message || 'Could not load observability dashboard';
    }
    if (isFirstLoad) data.value = null;
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

onMounted(() => {
  refresh();
  pollTimer = setInterval(refresh, 60000);
});

onUnmounted(() => clearInterval(pollTimer));
</script>

<template>
  <div class="monitor-who min-h-[24rem] space-y-6">
    <div class="monitor-panel">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="monitor-section-title">Who</h2>
          <p class="monitor-section-desc">
            Logins, activity, and applications — last {{ summary.windowDays || days }} days
            <span v-if="data?.generatedAt" class="text-slate-600"> · updated {{ formatTime(data.generatedAt) }}</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <select v-model.number="days" class="input text-sm" @change="refresh">
            <option :value="1">Last 24h</option>
            <option :value="7">Last 7 days</option>
            <option :value="30">Last 30 days</option>
          </select>
          <button type="button" class="btn-secondary text-sm" :disabled="loading || refreshing" @click="refresh">
            {{ refreshing ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="monitor-panel py-12 text-center text-slate-400">
      Loading observability…
    </div>

    <template v-else>
      <p v-if="error" class="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
        {{ error }}
      </p>

      <p v-if="data?.mongoRequired" class="rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
        MongoDB is required for user observability. Set <code class="text-amber-100">MONGODB_URI</code> on production.
      </p>

      <p
        v-if="!error && !data?.mongoRequired && !hasAnyData"
        class="monitor-panel text-sm text-slate-400"
      >
        No events in this window yet. Data appears after users log in, browse the app, apply to jobs, polish kits, or send follow-ups.
        <span class="mt-2 block text-slate-500">Tip: log out and log back in once to record your first login event.</span>
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

      <section class="monitor-panel">
        <div class="flex items-center justify-between gap-3">
          <h2 class="monitor-section-title">Users</h2>
          <RouterLink to="/users" class="text-sm text-teal-400 hover:underline">Manage team →</RouterLink>
        </div>
        <div class="mt-4 overflow-x-auto mobile-table-wrap">
          <table class="min-w-full text-left text-sm">
            <thead class="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="pb-2 pr-4">User</th>
                <th class="pb-2 pr-4">Role</th>
                <th class="pb-2 pr-4">Last login</th>
                <th class="pb-2 pr-4">Last seen</th>
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
                  <span class="badge" :class="user.role === 'superadmin' ? 'badge-gold' : user.role === 'admin' ? 'badge-teal' : 'badge-slate'">
                    {{ user.role === 'superadmin' ? 'Super admin' : user.role }}
                  </span>
                  <span v-if="!user.active" class="ml-1 badge badge-red text-[10px]">disabled</span>
                </td>
                <td class="py-3 pr-4 text-xs">
                  <p>{{ formatTime(user.lastLoginAt) }}</p>
                  <p v-if="user.lastLoginMethod" class="text-slate-500">{{ user.lastLoginMethod }}</p>
                  <p v-else-if="!user.lastLoginAt" class="text-slate-500">log in again to record</p>
                </td>
                <td class="py-3 pr-4 text-xs">
                  <p>{{ formatTime(user.lastSeenAt || user.lastActivityAt) }}</p>
                </td>
                <td class="py-3 pr-4">{{ user.loginCount || 0 }}</td>
                <td class="py-3 pr-4">{{ user.applicationCount || 0 }}</td>
                <td class="py-3 text-xs">
                  <p>{{ formatTime(user.lastActivityAt) }}</p>
                  <p v-if="user.lastActivitySummary" class="text-slate-500">{{ user.lastActivitySummary }}</p>
                </td>
              </tr>
              <tr v-if="!users.length">
                <td colspan="7" class="py-6 text-center text-sm text-slate-500">No users found.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="grid gap-6 xl:grid-cols-2">
        <section class="monitor-panel">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="monitor-section-title">Login events</h2>
              <p class="mt-1 text-xs text-slate-500">
                {{ loginEventsByUser.length }} users · {{ loginEvents.length }} events
              </p>
            </div>
            <div v-if="loginEventsByUser.length" class="flex items-center gap-2">
              <button type="button" class="btn-secondary text-xs" @click="expandAllLogin">Expand</button>
              <button type="button" class="btn-secondary text-xs" @click="collapseAllLogin">Collapse</button>
            </div>
          </div>
          <ul class="mt-4 space-y-3">
            <li
              v-for="group in loginEventsByUser"
              :key="group.userId"
              class="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40"
            >
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm transition hover:bg-slate-900/50"
                @click="toggleLogin(group.userId)"
              >
                <div class="min-w-0">
                  <p class="font-medium text-slate-200">{{ group.userName }}</p>
                  <p class="text-xs text-slate-500">{{ group.email }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-2 text-right text-xs text-slate-400">
                  <span class="badge badge-slate text-[10px]">{{ group.items.length }} events</span>
                  <span v-if="loginFailedCount(group)" class="badge badge-red text-[10px]">{{ loginFailedCount(group) }} failed</span>
                  <span class="text-slate-500">{{ formatTime(group.latestAt) }}</span>
                  <span class="text-slate-500">{{ isLoginExpanded(group.userId) ? '▾' : '▸' }}</span>
                </div>
              </button>
              <ul v-show="isLoginExpanded(group.userId)" class="space-y-2 border-t border-slate-800 px-3 py-3">
                <li
                  v-for="event in group.items"
                  :key="event.id"
                  class="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2.5 text-sm"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="text-xs text-slate-500">{{ formatTime(event.occurredAt) }} · {{ event.method }}</p>
                    <span class="badge text-[10px]" :class="event.success ? 'badge-teal' : 'badge-red'">
                      {{ event.success ? 'success' : 'failed' }}
                    </span>
                  </div>
                  <p v-if="event.reason && !event.success" class="mt-1 text-xs text-red-300">{{ event.reason }}</p>
                </li>
              </ul>
            </li>
            <li v-if="!loginEventsByUser.length" class="text-sm text-slate-500">No login events in this window yet.</li>
          </ul>
        </section>

        <section class="monitor-panel">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="monitor-section-title">Activity feed</h2>
              <p class="mt-1 text-xs text-slate-500">
                {{ activityByUser.length }} users · {{ activityFeed.length }} actions
              </p>
            </div>
            <div v-if="activityByUser.length" class="flex items-center gap-2">
              <button type="button" class="btn-secondary text-xs" @click="expandAllActivity">Expand</button>
              <button type="button" class="btn-secondary text-xs" @click="collapseAllActivity">Collapse</button>
            </div>
          </div>
          <ul class="mt-4 space-y-3">
            <li
              v-for="group in activityByUser"
              :key="group.userId"
              class="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40"
            >
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm transition hover:bg-slate-900/50"
                @click="toggleActivity(group.userId)"
              >
                <div class="min-w-0">
                  <p class="font-medium text-slate-200">{{ group.userName }}</p>
                  <p class="text-xs text-slate-500">{{ group.email }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-2 text-right text-xs text-slate-400">
                  <span class="badge badge-slate text-[10px]">{{ group.items.length }} actions</span>
                  <span class="text-slate-500">{{ activityTypeSummary(group) }}</span>
                  <span class="text-slate-500">{{ formatTime(group.latestAt) }}</span>
                  <span class="text-slate-500">{{ isActivityExpanded(group.userId) ? '▾' : '▸' }}</span>
                </div>
              </button>
              <ul v-show="isActivityExpanded(group.userId)" class="space-y-2 border-t border-slate-800 px-3 py-3">
                <li
                  v-for="item in group.items"
                  :key="item.id"
                  class="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2.5 text-sm"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="font-medium text-slate-200">{{ item.summary }}</p>
                    <span class="badge text-[10px]" :class="activityBadgeClass(item.type)">
                      {{ activityLabel(item.type) }}
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-slate-500">{{ formatTime(item.occurredAt) }}</p>
                </li>
              </ul>
            </li>
            <li v-if="!activityByUser.length" class="text-sm text-slate-500">
              No tracked activity yet — page views, kit generation, approvals, applies, polish, and follow-ups appear here.
            </li>
          </ul>
        </section>
      </div>

      <section class="monitor-panel">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="monitor-section-title">Applications by user</h2>
            <p class="mt-1 text-xs text-slate-500">
              {{ applicationsByUser.length }} users · {{ totalApplicationCount }} applications
            </p>
          </div>
          <div v-if="applicationsByUser.length" class="flex items-center gap-2">
            <button type="button" class="btn-secondary text-xs" @click="expandAllApplications">Expand</button>
            <button type="button" class="btn-secondary text-xs" @click="collapseAllApplications">Collapse</button>
          </div>
        </div>

        <ul class="mt-4 space-y-3">
          <li
            v-for="group in applicationsByUser"
            :key="group.userId"
            class="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm transition hover:bg-slate-900/50"
              @click="toggleApps(group.userId)"
            >
              <div class="min-w-0">
                <p class="font-medium text-slate-200">{{ group.userName }}</p>
                <p class="text-xs text-slate-500">{{ group.email }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-3 text-right text-xs text-slate-400">
                <span class="badge badge-slate text-[10px]">{{ group.apps.length }} applied</span>
                <span class="text-slate-500">Latest {{ formatTime(group.latestAt) }}</span>
                <span class="text-slate-500">{{ isAppsExpanded(group.userId) ? '▾' : '▸' }}</span>
              </div>
            </button>

            <ul v-show="isAppsExpanded(group.userId)" class="space-y-2 border-t border-slate-800 px-3 py-3">
              <li
                v-for="app in group.apps"
                :key="app.id"
                class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2.5 text-sm"
              >
                <div class="min-w-0">
                  <p class="font-medium text-slate-200">{{ formatJobLine(app) }}</p>
                  <p class="text-xs text-slate-500">{{ app.source || 'source unknown' }}</p>
                </div>
                <div class="text-right text-xs text-slate-400">
                  <p class="badge badge-slate text-[10px]">{{ app.status }}</p>
                  <p class="mt-1">{{ formatTime(app.lastAttempted || app.submittedAt) }}</p>
                </div>
              </li>
            </ul>
          </li>
          <li v-if="!applicationsByUser.length" class="text-sm text-slate-500">No applications recorded in this window.</li>
        </ul>
      </section>
    </template>
  </div>
</template>
