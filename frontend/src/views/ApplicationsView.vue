<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';
import ApplyWorkflowBanner from '../components/ApplyWorkflowBanner.vue';

const apps = ref([]);
const loading = ref(true);
const error = ref('');
const statusFilter = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = statusFilter.value ? { status: statusFilter.value } : {};
    const { data } = await http.get('/applications', { params });
    apps.value = data;
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not load applications. Try refreshing.';
    apps.value = [];
  } finally {
    loading.value = false;
  }
}

function statusClass(s) {
  if (s === 'submitted') return 'badge-teal';
  if (s === 'bot-blocked') return 'badge-red';
  return 'badge-slate';
}

onMounted(load);
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-slate-100">Applications</h2>
    <p class="mt-1 text-slate-400">Track what the agent submitted after you approved jobs in your queue.</p>

    <ApplyWorkflowBanner class="mt-6" />

    <div class="mt-6 flex flex-wrap items-center gap-3">
      <select v-model="statusFilter" class="input w-auto" @change="load">
        <option value="">All statuses</option>
        <option value="submitted">Submitted</option>
        <option value="bot-blocked">Bot blocked</option>
        <option value="manual-review">Manual review</option>
        <option value="email-apply">Email apply</option>
        <option value="external-apply">External apply</option>
      </select>
      <RouterLink to="/approvals" class="btn-secondary text-sm">Apply queue</RouterLink>
      <RouterLink to="/calendar" class="btn-secondary text-sm">Schedule follow-up</RouterLink>
    </div>

    <p v-if="error" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>

    <div v-if="loading" class="mt-8 text-slate-400">Loading applications…</div>
    <div v-else class="mt-6 overflow-x-auto">
      <table v-if="apps.length" class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-slate-700 text-slate-400">
            <th class="py-3 pr-4">Title</th>
            <th class="py-3 pr-4">Job board</th>
            <th class="py-3 pr-4">Company</th>
            <th class="py-3 pr-4">Status</th>
            <th class="py-3 pr-4">Attempts</th>
            <th class="py-3">Last tried</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="app in apps" :key="app.jobId || app._id" class="border-b border-slate-800">
            <td class="py-3 pr-4">
              <p class="font-medium text-slate-200">{{ app.title }}</p>
              <p class="text-xs text-slate-500">
                {{ app.company || 'Unknown company' }} · {{ app.source || 'Unknown board' }}
              </p>
              <a v-if="app.applyUrl || app.jobUrl" :href="app.applyUrl || app.jobUrl" target="_blank" class="text-xs text-teal-400 hover:underline">Open →</a>
            </td>
            <td class="py-3 pr-4 text-slate-400">{{ app.source || '—' }}</td>
            <td class="py-3 pr-4 text-slate-400">{{ app.company || '—' }}</td>
            <td class="py-3 pr-4">
              <RouterLink to="/calendar" class="badge hover:opacity-80" :class="statusClass(app.status)">
                {{ app.status }} · follow up
              </RouterLink>
            </td>
            <td class="py-3 pr-4 text-slate-400">{{ app.attempts || 0 }}</td>
            <td class="py-3 text-slate-500">{{ app.lastAttempted || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="rounded-xl border border-dashed border-slate-700 bg-slate-800/30 p-8 text-center">
        <p class="font-medium text-slate-300">No applications yet</p>
        <p class="mt-2 text-sm text-slate-500">
          Approve jobs in your apply queue, then run Apply Approved. Status updates will show here.
        </p>
        <div class="mt-4 flex flex-wrap justify-center gap-3">
          <RouterLink to="/approvals" class="btn-primary text-sm">Open apply queue</RouterLink>
          <RouterLink to="/jobs" class="btn-secondary text-sm">Browse jobs</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
