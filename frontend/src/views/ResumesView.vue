<script setup>
import { computed, onMounted, ref } from 'vue';
import http from '../api/http';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const tab = ref('browse');
const resumes = ref([]);
const mine = ref([]);
const loading = ref(true);
const error = ref('');
const success = ref('');
const search = ref('');
const tagFilter = ref('');
const selected = ref(null);
const detail = ref(null);
const saving = ref(false);

const form = ref({
  title: '',
  headline: '',
  targetRole: '',
  content: '',
  skills: '',
  tags: '',
  yearsExperience: 0,
  notes: '',
  public: true,
});

const tags = computed(() => {
  const set = new Set();
  resumes.value.forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
  return [...set].sort();
});

async function loadBrowse() {
  loading.value = true;
  try {
    const { data } = await http.get('/resumes', {
      params: { search: search.value || undefined, tag: tagFilter.value || undefined },
    });
    resumes.value = data;
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not load resumes';
  } finally {
    loading.value = false;
  }
}

async function loadMine() {
  try {
    const { data } = await http.get('/resumes/mine');
    mine.value = data;
  } catch {
    mine.value = [];
  }
}

async function openDetail(r) {
  selected.value = r;
  detail.value = null;
  try {
    const { data } = await http.get(`/resumes/${r.id || r._id}`);
    detail.value = data;
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not load resume';
  }
}

async function copyResume() {
  if (!detail.value) return;
  await navigator.clipboard.writeText(detail.value.content);
  await http.post(`/resumes/${detail.value._id}/copy`);
  success.value = 'Resume copied to clipboard — use as a sample template!';
  setTimeout(() => { success.value = ''; }, 3000);
}

async function submit() {
  saving.value = true;
  error.value = '';
  try {
    await http.post('/resumes', {
      ...form.value,
      skills: form.value.skills.split(',').map((s) => s.trim()).filter(Boolean),
      tags: form.value.tags.split(',').map((s) => s.trim()).filter(Boolean),
    });
    form.value = { title: '', headline: '', targetRole: '', content: '', skills: '', tags: '', yearsExperience: 0, notes: '', public: true };
    success.value = 'Resume shared with the community!';
    tab.value = 'browse';
    await Promise.all([loadBrowse(), loadMine()]);
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not post resume';
  } finally {
    saving.value = false;
  }
}

async function importProfile() {
  saving.value = true;
  error.value = '';
  try {
    await http.post('/resumes/import-profile');
    success.value = 'Imported from your profile!';
    await Promise.all([loadBrowse(), loadMine()]);
    tab.value = 'mine';
  } catch (e) {
    error.value = e.response?.data?.message || 'Import failed — add resume text in Profile first';
  } finally {
    saving.value = false;
  }
}

async function deleteResume(id) {
  if (!confirm('Remove this resume from the community?')) return;
  await http.delete(`/resumes/${id}`);
  selected.value = null;
  detail.value = null;
  await Promise.all([loadBrowse(), loadMine()]);
}

function isOwner(r) {
  const uid = auth.user?.id;
  return (r.userId?._id || r.userId)?.toString() === uid?.toString();
}

onMounted(async () => {
  await Promise.all([loadBrowse(), loadMine()]);
});
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold text-slate-100">Community resumes</h2>
        <p class="mt-1 max-w-xl text-slate-400">
          Share your resume as a sample. Browse teammates' formats for DevOps, SRE, cloud, and platform roles.
        </p>
      </div>
      <div class="card px-4 py-3 text-center">
        <p class="text-2xl font-bold text-teal-300">{{ resumes.length }}</p>
        <p class="text-xs text-slate-500">public samples</p>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap gap-2">
      <button
        v-for="t in ['browse', 'post', 'mine']"
        :key="t"
        class="rounded-xl px-4 py-2 text-sm capitalize transition"
        :class="tab === t ? 'bg-teal-500/20 text-teal-200' : 'text-slate-400 hover:bg-slate-800/60'"
        @click="tab = t"
      >
        {{ t === 'browse' ? 'Browse samples' : t === 'post' ? 'Share yours' : 'My resumes' }}
      </button>
    </div>

    <p v-if="error" class="mt-4 text-sm text-red-300">{{ error }}</p>
    <p v-if="success" class="mt-4 text-sm text-teal-300">{{ success }}</p>

    <div v-if="tab === 'browse'" class="mt-6">
      <div class="flex flex-wrap gap-3">
        <input v-model="search" class="input max-w-xs" placeholder="Search role, skills…" @keyup.enter="loadBrowse" />
        <select v-model="tagFilter" class="input w-auto" @change="loadBrowse">
          <option value="">All tags</option>
          <option v-for="t in tags" :key="t" :value="t">{{ t }}</option>
        </select>
        <button class="btn-secondary" @click="loadBrowse">Search</button>
      </div>

      <div v-if="loading" class="mt-8 text-slate-400">Loading…</div>
      <div v-else class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <button
          v-for="r in resumes"
          :key="r.id"
          class="card p-4 text-left transition hover:border-teal-700/50"
          @click="openDetail(r)"
        >
          <div class="flex items-start justify-between gap-2">
            <p class="font-semibold text-slate-200">{{ r.title }}</p>
            <span v-if="r.featured" class="badge badge-gold text-[10px]">Featured</span>
          </div>
          <p class="mt-1 text-sm text-teal-400">{{ r.userName }}</p>
          <p class="mt-1 text-sm text-slate-500">{{ r.targetRole || r.headline }}</p>
          <p class="mt-2 line-clamp-2 text-xs text-slate-500">{{ r.preview }}</p>
          <div class="mt-3 flex flex-wrap gap-1">
            <span v-for="s in (r.skills || []).slice(0, 4)" :key="s" class="badge badge-slate text-[10px]">{{ s }}</span>
          </div>
          <p class="mt-2 text-[10px] text-slate-600">{{ r.views }} views · {{ r.copies }} copies</p>
        </button>
      </div>
      <p v-if="!loading && !resumes.length" class="mt-6 text-slate-500">No resumes yet. Be the first to share!</p>
    </div>

    <form v-else-if="tab === 'post'" class="card mt-6 max-w-2xl space-y-4 p-6" @submit.prevent="submit">
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-secondary text-sm" :disabled="saving" @click="importProfile">
          Import from my profile
        </button>
      </div>
      <input v-model="form.title" required class="input" placeholder="Resume title e.g. Senior DevOps Resume 2026" />
      <input v-model="form.headline" class="input" placeholder="Headline" />
      <input v-model="form.targetRole" class="input" placeholder="Target role e.g. Staff SRE" />
      <textarea v-model="form.content" required rows="12" class="input font-mono text-sm" placeholder="Paste full resume text…" />
      <input v-model="form.skills" class="input" placeholder="Skills (comma-separated)" />
      <input v-model="form.tags" class="input" placeholder="Tags e.g. devops, kubernetes, aws" />
      <input v-model.number="form.yearsExperience" type="number" min="0" class="input w-32" placeholder="Years" />
      <textarea v-model="form.notes" rows="2" class="input text-sm" placeholder="Notes for viewers (optional)" />
      <label class="flex items-center gap-2 text-sm text-slate-400">
        <input v-model="form.public" type="checkbox" /> Visible to all community members
      </label>
      <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Posting…' : 'Share with community' }}</button>
    </form>

    <div v-else-if="tab === 'mine'" class="mt-6 space-y-3">
      <div v-for="r in mine" :key="r._id" class="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p class="font-medium text-slate-200">{{ r.title }}</p>
          <p class="text-sm text-slate-500">{{ r.views }} views · {{ r.copies }} copies · {{ r.public ? 'Public' : 'Private' }}</p>
        </div>
        <div class="flex gap-2">
          <button class="btn-secondary text-xs" @click="openDetail(r)">View</button>
          <button class="btn-secondary text-xs" @click="deleteResume(r._id)">Delete</button>
        </div>
      </div>
      <p v-if="!mine.length" class="text-slate-500">You haven't shared a resume yet.</p>
    </div>

    <div v-if="selected" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="selected = null">
      <div class="card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
        <div class="border-b border-slate-800 p-4">
          <h3 class="font-semibold text-slate-100">{{ detail?.title || selected.title }}</h3>
          <p class="text-sm text-teal-400">{{ detail?.userName || selected.userName }}</p>
          <p v-if="detail?.headline" class="text-sm text-slate-500">{{ detail.headline }}</p>
        </div>
        <pre class="flex-1 overflow-y-auto p-4 whitespace-pre-wrap text-sm text-slate-300">{{ detail?.content || 'Loading…' }}</pre>
        <div class="flex flex-wrap gap-2 border-t border-slate-800 p-4">
          <button class="btn-primary" :disabled="!detail" @click="copyResume">Copy as sample</button>
          <button v-if="detail && isOwner(detail)" class="btn-secondary" @click="deleteResume(detail._id)">Delete</button>
          <button class="btn-secondary" @click="selected = null; detail = null">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>
