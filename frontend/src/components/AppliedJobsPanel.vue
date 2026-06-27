<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

const props = defineProps({
  jobs: { type: Array, default: () => [] },
  companies: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
});

const statusLabel = (status) => {
  const map = {
    submitted: 'Submitted',
    queued: 'Queued',
    prepared: 'Prepared',
    'manual-review': 'Manual',
    'email-apply': 'Email apply',
    'external-apply': 'External',
  };
  return map[status] || status || 'Applied';
};

const statusClass = (status) => {
  if (status === 'submitted') return 'badge-teal';
  if (status === 'queued') return 'badge-gold';
  return 'bg-slate-700 text-slate-300';
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

const companyInitial = (name) => (name || '?').charAt(0).toUpperCase();

const hasData = computed(() => props.jobs.length > 0 || props.companies.length > 0);
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="font-semibold text-slate-200">Jobs applied</h2>
        <p class="mt-1 text-sm text-slate-500">
          {{ total }} application{{ total === 1 ? '' : 's' }}
          <span v-if="companies.length"> · {{ companies.length }} compan{{ companies.length === 1 ? 'y' : 'ies' }}</span>
        </p>
      </div>
      <RouterLink to="/follow-ups" class="text-sm text-teal-400 hover:underline">Follow-ups →</RouterLink>
    </div>

    <div v-if="loading" class="mt-4 text-sm text-slate-500">Loading applications…</div>

    <div v-else-if="!hasData" class="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
      No applications yet — use Start applying above.
    </div>

    <template v-else>
      <div v-if="companies.length" class="mt-5">
        <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Companies</p>
        <div class="flex flex-wrap gap-2">
          <a
            v-for="c in companies"
            :key="`${c.name}-${c.jobId}`"
            :href="c.url || undefined"
            :target="c.url ? '_blank' : undefined"
            rel="noopener"
            class="flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-800/50 py-1 pl-1 pr-3 text-xs text-slate-200 transition hover:border-teal-700/50"
            :title="c.title"
          >
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20 text-[10px] font-bold text-teal-300">
              {{ companyInitial(c.name) }}
            </span>
            {{ c.name }}
          </a>
        </div>
      </div>

      <div v-if="jobs.length" class="mt-5">
        <div class="mobile-applied-cards md:hidden">
          <div v-for="job in jobs" :key="`card-${job.jobId}`" class="mobile-applied-card">
            <div class="flex items-start gap-3">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-teal-300">
                {{ companyInitial(job.company) }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="font-medium text-slate-200">{{ job.company || '—' }}</p>
                <a
                  v-if="job.url"
                  :href="job.url"
                  target="_blank"
                  rel="noopener"
                  class="mt-1 block text-sm text-slate-300 hover:text-teal-300 hover:underline"
                >
                  {{ job.title }}
                </a>
                <p v-else class="mt-1 text-sm text-slate-300">{{ job.title }}</p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <span class="badge text-xs" :class="statusClass(job.status)">{{ statusLabel(job.status) }}</span>
                  <span class="text-xs text-slate-500">{{ formatDate(job.submittedAt || job.lastAttempted) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mobile-table-wrap hidden overflow-x-auto rounded-xl border border-slate-800 md:block">
        <table class="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr class="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
              <th class="px-4 py-3 font-medium">Company</th>
              <th class="px-4 py-3 font-medium">Role</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium">Applied</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="job in jobs"
              :key="job.jobId"
              class="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30"
            >
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-teal-300">
                    {{ companyInitial(job.company) }}
                  </span>
                  <span class="font-medium text-slate-200">{{ job.company || '—' }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-slate-300">
                <a
                  v-if="job.url"
                  :href="job.url"
                  target="_blank"
                  rel="noopener"
                  class="hover:text-teal-300 hover:underline"
                >
                  {{ job.title }}
                </a>
                <span v-else>{{ job.title }}</span>
              </td>
              <td class="px-4 py-3">
                <span class="badge text-xs" :class="statusClass(job.status)">{{ statusLabel(job.status) }}</span>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500">{{ formatDate(job.submittedAt || job.lastAttempted) }}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </template>
  </div>
</template>
