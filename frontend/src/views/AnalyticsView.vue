<script setup>
import { onMounted, ref } from 'vue';
import http from '../api/http';

const stats = ref(null);
const loading = ref(true);

onMounted(async () => {
  try {
    const { data } = await http.get('/analytics/summary');
    stats.value = data;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold">Analytics</h2>
    <p class="mt-1 text-slate-400">Business view of your job search pipeline</p>

    <div v-if="loading" class="mt-8 text-slate-400">Loading…</div>
    <template v-else-if="stats">
      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div class="card p-5" v-for="item in [
          { label: 'Total Jobs', value: stats.totalJobs, color: 'text-teal-300' },
          { label: 'Applications', value: stats.totalApplications, color: 'text-amber-300' },
          { label: 'Submitted', value: stats.submitted, color: 'text-teal-300' },
          { label: 'Bot Blocked', value: stats.botBlocked, color: 'text-red-300' },
          { label: 'Manual Review', value: stats.manualReview, color: 'text-slate-300' },
          { label: 'Cover Letters', value: stats.generations, color: 'text-amber-300' },
        ]" :key="item.label">
          <p class="text-sm text-slate-400">{{ item.label }}</p>
          <p class="mt-1 text-3xl font-bold" :class="item.color">{{ item.value }}</p>
        </div>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-2">
        <div class="card p-6">
          <h3 class="font-semibold">Matches by job board</h3>
          <div class="mt-4 space-y-3">
            <div v-for="(count, board) in stats.byJobBoard" :key="board" class="flex items-center gap-3">
              <div class="h-2 flex-1 rounded-full bg-slate-800">
                <div class="h-2 rounded-full bg-teal-500" :style="{ width: `${Math.min(100, (count / stats.totalJobs) * 100)}%` }" />
              </div>
              <span class="w-36 truncate text-sm text-slate-400" :title="board">{{ board }}</span>
              <span class="badge badge-teal">{{ count }}</span>
            </div>
          </div>
        </div>
        <div class="card p-6">
          <h3 class="font-semibold">Applications by job board</h3>
          <div class="mt-4 space-y-3">
            <div
              v-for="(count, board) in stats.byApplicationSource"
              :key="`app-${board}`"
              class="flex items-center gap-3"
            >
              <div class="h-2 flex-1 rounded-full bg-slate-800">
                <div class="h-2 rounded-full bg-amber-400" :style="{ width: `${Math.min(100, (count / Math.max(stats.totalApplications, 1)) * 100)}%` }" />
              </div>
              <span class="w-36 truncate text-sm text-slate-400" :title="board">{{ board }}</span>
              <span class="badge badge-gold">{{ count }}</span>
            </div>
            <p v-if="!stats.totalApplications" class="text-sm text-slate-500">No applications yet.</p>
          </div>
        </div>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-2">
        <div class="card p-6">
          <h3 class="font-semibold">Queue by section</h3>
          <div class="mt-4 space-y-3">
            <div v-for="(count, key) in stats.bySection" :key="key" class="flex items-center gap-3">
              <div class="h-2 flex-1 rounded-full bg-slate-800">
                <div class="h-2 rounded-full bg-teal-500" :style="{ width: `${Math.min(100, (count / stats.totalJobs) * 100)}%` }" />
              </div>
              <span class="w-28 text-sm text-slate-400">{{ key }}</span>
              <span class="badge badge-teal">{{ count }}</span>
            </div>
          </div>
        </div>
        <div class="card p-6">
          <h3 class="font-semibold">Applications by status</h3>
          <div class="mt-4 space-y-3">
            <div v-for="(count, status) in stats.byStatus" :key="status" class="flex items-center gap-3">
              <div class="h-2 flex-1 rounded-full bg-slate-800">
                <div class="h-2 rounded-full bg-amber-400" :style="{ width: `${Math.min(100, (count / stats.totalApplications) * 100)}%` }" />
              </div>
              <span class="w-28 truncate text-sm text-slate-400">{{ status }}</span>
              <span class="badge badge-gold">{{ count }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
