<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import http from '../api/http';

const route = useRoute();
const outcomes = ref([]);
const insights = ref(null);
const loading = ref(true);
const saving = ref(false);
const form = ref({
  jobId: '',
  title: '',
  company: '',
  stage: 'applied',
  matchPct: 0,
  notes: '',
});

function applyRoutePrefill() {
  const { jobId, title, company } = route.query;
  if (jobId || title || company) {
    form.value.jobId = String(jobId || '');
    form.value.title = String(title || '');
    form.value.company = String(company || '');
  }
}

async function load() {
  loading.value = true;
  try {
    const [listRes, insightRes] = await Promise.all([
      http.get('/outcomes'),
      http.get('/outcomes/insights'),
    ]);
    outcomes.value = listRes.data;
    insights.value = insightRes.data;
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    await http.post('/outcomes', form.value);
    form.value = { jobId: '', title: '', company: '', stage: 'applied', matchPct: 0, notes: '' };
    await load();
  } finally {
    saving.value = false;
  }
}

const stages = ['applied', 'screen', 'onsite', 'offer', 'rejected', 'withdrawn'];

onMounted(() => {
  applyRoutePrefill();
  load();
});
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-slate-100">Outcome tracking</h2>
    <p class="mt-1 text-slate-400">
      Log replies and interviews — your callback scores and match rankings improve as we learn what works for you.
    </p>

    <div v-if="insights" class="mt-6 card p-6">
      <h3 class="text-sm font-semibold text-slate-300">Learning loop</h3>
      <div class="mt-3 grid gap-4 sm:grid-cols-4">
        <div><p class="text-sm text-slate-500">Tracked</p><p class="text-2xl font-bold text-teal-300">{{ insights.stats?.total }}</p></div>
        <div><p class="text-sm text-slate-500">Offers</p><p class="text-2xl font-bold text-amber-300">{{ insights.stats?.offers }}</p></div>
        <div><p class="text-sm text-slate-500">Onsites</p><p class="text-2xl font-bold text-teal-300">{{ insights.stats?.onsites }}</p></div>
        <div><p class="text-sm text-slate-500">Offer rate</p><p class="text-2xl font-bold text-slate-200">{{ insights.conversionRate }}%</p></div>
      </div>
      <pre class="mt-4 whitespace-pre-wrap text-sm text-teal-200">{{ insights.aiInsight }}</pre>
    </div>

    <form class="card mt-8 grid gap-4 p-6 md:grid-cols-2" @submit.prevent="save">
      <h3 class="font-semibold text-slate-200 md:col-span-2">Log an outcome</h3>
      <input v-model="form.jobId" class="input" placeholder="Job ID (optional)" />
      <input v-model="form.company" required class="input" placeholder="Company" />
      <input v-model="form.title" class="input md:col-span-2" placeholder="Role title" />
      <select v-model="form.stage" class="input">
        <option v-for="s in stages" :key="s" :value="s">{{ s }}</option>
      </select>
      <input v-model.number="form.matchPct" type="number" min="0" max="100" class="input" placeholder="Match %" />
      <textarea v-model="form.notes" class="input md:col-span-2" rows="2" placeholder="Notes — what worked, what to improve" />
      <button type="submit" class="btn-primary md:col-span-2" :disabled="saving">{{ saving ? 'Saving…' : 'Save outcome' }}</button>
    </form>

    <div v-if="loading" class="mt-8 text-slate-400">Loading…</div>
    <div v-else class="mt-8 space-y-2">
      <div v-for="o in outcomes" :key="o._id" class="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
        <div>
          <p class="font-medium text-slate-200">{{ o.title || o.jobId }} @ {{ o.company }}</p>
          <p class="text-slate-500">{{ o.notes }}</p>
        </div>
        <span class="badge badge-teal">{{ o.stage }}</span>
      </div>
      <p v-if="!outcomes.length" class="text-slate-500">No outcomes logged yet.</p>
    </div>
  </div>
</template>
