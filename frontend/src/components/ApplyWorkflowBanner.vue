<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="rounded-xl border border-teal-900/40 bg-slate-900/50 p-4">
    <p class="text-sm font-medium text-slate-200">Your path to interviews</p>
    <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
      <RouterLink to="/" class="rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-teal-300 hover:bg-slate-800">
        1. Upload &amp; apply
      </RouterLink>
      <span class="text-slate-600">→</span>
      <RouterLink to="/approvals" class="rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-teal-300 hover:bg-slate-800">
        2. Queue — polish
      </RouterLink>
      <span class="text-slate-600">→</span>
      <RouterLink to="/follow-ups" class="rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-violet-300 hover:bg-slate-800">
        3. Follow-ups
      </RouterLink>
    </div>
    <p class="mt-3 text-xs text-slate-500">
      Auto apply gets you out the door fast. Use Queue to polish resumes to 95% ATS, then Follow-ups to reach recruiters.
    </p>
  </div>
</template>
