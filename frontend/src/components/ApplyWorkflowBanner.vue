<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="rounded-xl border border-teal-900/40 bg-slate-900/50 p-4">
    <p class="text-sm font-medium text-slate-200">Approve → apply</p>
    <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
      <RouterLink to="/" class="rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-teal-300 hover:bg-slate-800">
        1. Matches — Approve &amp; apply
      </RouterLink>
      <span class="text-slate-600">→</span>
      <RouterLink to="/approvals" class="rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-teal-300 hover:bg-slate-800">
        2. Queue — batch apply approved
      </RouterLink>
      <span class="text-slate-600">→</span>
      <RouterLink to="/follow-ups" class="rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-violet-300 hover:bg-slate-800">
        3. Follow-ups
      </RouterLink>
    </div>
    <p class="mt-3 text-xs text-slate-500">
      Approving alone no longer leaves jobs stuck — use <strong class="text-slate-400">Apply immediately after approve</strong> in Queue, or
      <strong class="text-slate-400">Apply N approved</strong> on the dashboard.
    </p>
  </div>
</template>
