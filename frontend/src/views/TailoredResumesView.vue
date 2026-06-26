<script setup>
import { computed, onMounted, ref } from 'vue';
import http from '../api/http';
import ApplicationKitPanel from '../components/ApplicationKitPanel.vue';

const kits = ref([]);
const loading = ref(true);
const error = ref('');
const kitJob = ref(null);
const kitOpen = ref(false);
const filter = ref('all');

const filtered = computed(() => {
  let list = kits.value;
  if (filter.value === 'use') list = list.filter((k) => k.useForApply);
  if (filter.value === 'skip') list = list.filter((k) => !k.useForApply);
  if (filter.value === 'applied') list = list.filter((k) => k.applied);
  if (filter.value === 'pending') list = list.filter((k) => !k.applied);
  return list;
});

function statusBadge(kit) {
  if (kit.applied || kit.applicationStatus === 'submitted') {
    return { label: 'Applied', cls: 'bg-teal-500/15 text-teal-300' };
  }
  if (kit.approvalStatus === 'approved') {
    return { label: 'Approved · not applied', cls: 'bg-amber-500/10 text-amber-300' };
  }
  if (kit.applicationStatus) {
    return { label: kit.applicationStatus.replace(/-/g, ' '), cls: 'bg-slate-800 text-slate-400' };
  }
  return { label: 'Not applied', cls: 'bg-slate-800 text-slate-500' };
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await http.get('/applications/kits');
    kits.value = data;
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not load tailored resumes';
    kits.value = [];
  } finally {
    loading.value = false;
  }
}

function openKit(kit) {
  kitJob.value = {
    jobId: kit.jobId,
    title: kit.jobTitle,
    company: kit.company,
    url: kit.jobUrl,
  };
  kitOpen.value = true;
}

async function toggleUse(kit) {
  try {
    await http.patch(`/applications/kit/${encodeURIComponent(kit.jobId)}/preference`, {
      useForApply: !kit.useForApply,
    });
    kit.useForApply = !kit.useForApply;
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not update preference';
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function onKitUpdated() {
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-slate-100">Tailored resumes</h2>
    <p class="mt-1 max-w-2xl text-slate-400">
      Tailored resumes for jobs you approved with tailoring enabled. Review each version, choose whether to use it when
      applying, or re-tailor for a specific role.
    </p>

    <div class="mt-6 flex flex-wrap items-center gap-3">
      <button
        v-for="tab in [
          { id: 'all', label: 'All' },
          { id: 'pending', label: 'Not applied' },
          { id: 'applied', label: 'Applied' },
          { id: 'use', label: 'Using on apply' },
          { id: 'skip', label: 'Base only' },
        ]"
        :key="tab.id"
        type="button"
        class="rounded-xl px-4 py-2 text-sm capitalize transition"
        :class="filter === tab.id ? 'bg-teal-500/20 text-teal-200' : 'text-slate-400 hover:bg-slate-800/60'"
        @click="filter = tab.id"
      >
        {{ tab.label }}
      </button>
      <button type="button" class="btn-secondary text-sm" :disabled="loading" @click="load">Refresh</button>
      <router-link to="/approvals" class="btn-secondary text-sm">Apply queue</router-link>
    </div>

    <p v-if="error" class="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>

    <div v-if="loading" class="mt-8 text-slate-400">Loading tailored resumes…</div>

    <div v-else-if="!filtered.length" class="card mt-8 p-8 text-center">
      <p class="font-medium text-slate-300">No tailored resumes yet</p>
      <p class="mt-2 text-sm text-slate-500">
        Approve jobs with “Tailor resume on approve” enabled, or open Application kit from the apply queue.
      </p>
      <router-link to="/approvals" class="btn-primary mt-4 inline-block text-sm">Go to apply queue</router-link>
    </div>

    <div v-else class="mt-6 space-y-3">
      <article
        v-for="kit in filtered"
        :key="kit.jobId"
        class="card p-4 transition hover:border-teal-700/40"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-semibold text-slate-100">{{ kit.jobTitle }}</h3>
            <p class="text-sm text-slate-400">{{ kit.company }}</p>
            <p class="mt-2 text-xs text-slate-500">
              {{ kit.pageCount }} pages
              · Generated {{ formatDate(kit.generatedAt) }}
            </p>
          </div>
          <div class="flex flex-col items-end gap-2">
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="statusBadge(kit).cls">
              {{ statusBadge(kit).label }}
            </span>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-medium"
              :class="kit.useForApply ? 'bg-teal-500/15 text-teal-300' : 'bg-slate-800 text-slate-400'"
            >
              {{ kit.useForApply ? 'Using on apply' : 'Base only' }}
            </span>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                class="accent-teal-500"
                :checked="kit.useForApply"
                @change="toggleUse(kit)"
              />
              Use tailored kit
            </label>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-primary text-xs" @click="openKit(kit)">View & re-tailor</button>
          <a v-if="kit.jobUrl" :href="kit.jobUrl" target="_blank" rel="noopener" class="btn-secondary text-xs">Job posting</a>
        </div>
      </article>
    </div>

    <ApplicationKitPanel
      v-if="kitJob"
      :job="kitJob"
      :open="kitOpen"
      @close="kitOpen = false"
      @updated="onKitUpdated"
    />
  </div>
</template>
