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
const applicationsExpanded = ref({});
const loginExpanded = ref({});
const activityExpanded = ref({});

function groupEventsByUser(items, { nameKey = 'userName', emailKey = 'email', userIdKey = 'userId', timeKey = 'occurredAt' } = {}) {
  const groups = new Map();
  for (const item of items) {
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

function isUserAppsExpanded(userId) {
  return isGroupExpanded(applicationsExpanded, userId);
}

function toggleUserApps(userId) {
  toggleGroup(applicationsExpanded, userId);
}

function expandAllApplications() {
  expandAllGroups(applicationsExpanded, applicationsByUser.value);
}

function collapseAllApplications() {
  collapseAllGroups(applicationsExpanded);
}

function isGroupExpanded(store, userId) {
  return Boolean(store.value[userId]);
}

function toggleGroup(store, userId) {
  store.value = { ...store.value, [userId]: !store.value[userId] };
}

function expandAllGroups(store, groups) {
  const next = {};
  for (const group of groups) next[group.userId] = true;
  store.value = next;
}

function collapseAllGroups(store) {
  store.value = {};
}

function loginFailedCount(group) {
  return group.items.filter((event) => !event.success).length;
}

function activityTypeSummary(group) {
  const types = new Set(group.items.map((item) => item.type));
  if (types.size === 1) return activityLabel([...types][0]);
  return `${group.items.length} actions`;
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
                <span class="badge" :class="user.role === 'admin' ? 'badge-gold' : 'badge-slate'">{{ user.role }}</span>
                <span v-if="!user.active" class="ml-1 badge badge-red text-[10px]">disabled</span>
              </td>
              <td class="py-3 pr-4 text-xs">
                <p>{{ formatTime(user.lastLoginAt) }}</p>
                <p v-if="user.lastLoginMethod" class="text-slate-500">{{ user.lastLoginMethod }}</p>
                <p v-else-if="!user.lastLoginAt" class="text-slate-500">log in again to record</p>
              </td>
              <td class="py-3 pr-4 text-xs">
                <p>{{ formatTime(user.lastSeenAt || user.lastActivityAt) }}</p>
                <p v-if="!user.lastLoginAt && (user.lastSeenAt || user.lastActivityAt)" class="text-slate-500">active session</p>
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
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-slate-100">Login events</h2>
            <p class="mt-1 text-xs text-slate-500">
              {{ loginEventsByUser.length }} {{ loginEventsByUser.length === 1 ? 'user' : 'users' }}
              · {{ loginEvents.length }} events
            </p>
          </div>
          <div v-if="loginEventsByUser.length" class="flex items-center gap-2">
            <button type="button" class="btn-secondary text-xs" @click="expandAllGroups(loginExpanded, loginEventsByUser)">Expand</button>
            <button type="button" class="btn-secondary text-xs" @click="collapseAllGroups(loginExpanded)">Collapse</button>
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
              @click="toggleGroup(loginExpanded, group.userId)"
            >
              <div class="min-w-0">
                <p class="font-medium text-slate-200">{{ group.userName }}</p>
                <p class="text-xs text-slate-500">{{ group.email }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-2 text-right text-xs text-slate-400">
                <span class="badge badge-slate text-[10px]">{{ group.items.length }} events</span>
                <span v-if="loginFailedCount(group)" class="badge badge-red text-[10px]">{{ loginFailedCount(group) }} failed</span>
                <span class="text-slate-500">{{ formatTime(group.latestAt) }}</span>
                <span class="text-slate-500">{{ isGroupExpanded(loginExpanded, group.userId) ? '▾' : '▸' }}</span>
              </div>
            </button>
            <ul v-show="isGroupExpanded(loginExpanded, group.userId)" class="space-y-2 border-t border-slate-800 px-3 py-3">
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

      <section class="card p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-slate-100">Activity feed</h2>
            <p class="mt-1 text-xs text-slate-500">
              {{ activityByUser.length }} {{ activityByUser.length === 1 ? 'user' : 'users' }}
              · {{ activityFeed.length }} actions
            </p>
          </div>
          <div v-if="activityByUser.length" class="flex items-center gap-2">
            <button type="button" class="btn-secondary text-xs" @click="expandAllGroups(activityExpanded, activityByUser)">Expand</button>
            <button type="button" class="btn-secondary text-xs" @click="collapseAllGroups(activityExpanded)">Collapse</button>
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
              @click="toggleGroup(activityExpanded, group.userId)"
            >
              <div class="min-w-0">
                <p class="font-medium text-slate-200">{{ group.userName }}</p>
                <p class="text-xs text-slate-500">{{ group.email }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-2 text-right text-xs text-slate-400">
                <span class="badge badge-slate text-[10px]">{{ group.items.length }} actions</span>
                <span class="text-slate-500">{{ activityTypeSummary(group) }}</span>
                <span class="text-slate-500">{{ formatTime(group.latestAt) }}</span>
                <span class="text-slate-500">{{ isGroupExpanded(activityExpanded, group.userId) ? '▾' : '▸' }}</span>
              </div>
            </button>
            <ul v-show="isGroupExpanded(activityExpanded, group.userId)" class="space-y-2 border-t border-slate-800 px-3 py-3">
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
          <li v-if="!activityByUser.length" class="text-sm text-slate-500">No tracked activity yet — events appear after logins, page views, kit generation, approvals, applies, polish, and follow-up sends.</li>
        </ul>
      </section>
    </div>

    <section class="card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-slate-100">Applications by user</h2>
          <p class="mt-1 text-xs text-slate-500">
            {{ applicationsByUser.length }} {{ applicationsByUser.length === 1 ? 'user' : 'users' }}
            · {{ totalApplicationCount }} applications
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
            @click="toggleUserApps(group.userId)"
          >
            <div class="min-w-0">
              <p class="font-medium text-slate-200">{{ group.userName }}</p>
              <p class="text-xs text-slate-500">{{ group.email }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-3 text-right text-xs text-slate-400">
              <span class="badge badge-slate text-[10px]">{{ group.apps.length }} applied</span>
              <span class="text-slate-500">Latest {{ formatTime(group.latestAt) }}</span>
              <span class="text-slate-500">{{ isUserAppsExpanded(group.userId) ? '▾' : '▸' }}</span>
            </div>
          </button>

          <ul v-show="isUserAppsExpanded(group.userId)" class="space-y-2 border-t border-slate-800 px-3 py-3">
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
  </div>
</template>
