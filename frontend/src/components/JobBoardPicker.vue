<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import http from '../api/http';

const model = defineModel({ type: Object, default: () => ({}) });

const loading = ref(true);
const error = ref('');
const catalog = ref(null);
const search = ref('');
const expanded = ref({});

const categories = computed(() => catalog.value?.categories || []);
const stats = computed(() => catalog.value?.stats || { total: 0, live: 0, planned: 0, manual: 0 });

const enabledCount = computed(() => Object.values(model.value || {}).filter(Boolean).length);

const filteredCategories = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return categories.value;
  return categories.value
    .map((cat) => ({
      ...cat,
      boards: (cat.boards || []).filter(
        (b) => b.name.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q)
      ),
    }))
    .filter((cat) => cat.boards.length);
});

function statusClass(status) {
  if (status === 'live') return 'badge-teal';
  if (status === 'manual') return 'badge-gold';
  return 'badge-slate';
}

function statusLabel(status) {
  if (status === 'live') return 'Live';
  if (status === 'manual') return 'Manual';
  return 'Planned';
}

function toggleBoard(id) {
  model.value = { ...model.value, [id]: !model.value[id] };
}

function selectLive() {
  const next = { ...(catalog.value?.defaultSelections || {}) };
  model.value = next;
}

function selectNone() {
  const next = {};
  for (const cat of categories.value) {
    for (const board of cat.boards || []) next[board.id] = false;
  }
  model.value = next;
}

function toggleCategory(cat, on) {
  const next = { ...model.value };
  for (const board of cat.boards || []) next[board.id] = on;
  model.value = next;
}

function categoryEnabledCount(cat) {
  return (cat.boards || []).filter((b) => model.value[b.id]).length;
}

async function loadCatalog() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await http.get('/jobs/boards/catalog');
    catalog.value = data;
    if (!Object.keys(model.value || {}).length && data.defaultSelections) {
      model.value = { ...data.defaultSelections };
    }
    const open = {};
    for (const cat of data.categories || []) open[cat.id] = cat.id === 'general' || cat.id === 'remote';
    expanded.value = open;
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not load job board catalog';
  } finally {
    loading.value = false;
  }
}

onMounted(loadCatalog);

watch(
  () => catalog.value?.defaultSelections,
  (defaults) => {
    if (defaults && !Object.keys(model.value || {}).length) {
      model.value = { ...defaults };
    }
  }
);
</script>

<template>
  <div class="job-board-picker">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-sm text-slate-400">
          Choose where remotelymatch should look for roles. Live boards are fetched automatically;
          manual boards (e.g. LinkedIn) use your queue and extension.
        </p>
        <p v-if="stats.total" class="mt-1 text-xs text-slate-600">
          {{ stats.total }} boards · {{ stats.live }} live · {{ enabledCount }} selected
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-secondary text-xs" @click="selectLive">All live sources</button>
        <button type="button" class="btn-secondary text-xs" @click="selectNone">Clear all</button>
      </div>
    </div>

    <input
      v-model="search"
      type="search"
      class="input mt-4 text-sm"
      placeholder="Search boards or categories…"
    />

    <p v-if="loading" class="mt-4 text-sm text-slate-500">Loading job board catalog…</p>
    <p v-else-if="error" class="mt-4 text-sm text-red-300">{{ error }}</p>

    <div v-else class="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
      <div
        v-for="cat in filteredCategories"
        :key="cat.id"
        class="rounded-xl border border-slate-800 bg-slate-950/40"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
          @click="expanded[cat.id] = !expanded[cat.id]"
        >
          <span class="font-medium text-slate-200">{{ cat.label }}</span>
          <span class="text-xs text-slate-500">
            {{ categoryEnabledCount(cat) }}/{{ cat.boards.length }}
            <span class="ml-2 text-slate-600">{{ expanded[cat.id] ? '▾' : '▸' }}</span>
          </span>
        </button>
        <div v-show="expanded[cat.id]" class="border-t border-slate-800 px-4 pb-3 pt-2">
          <div class="mb-2 flex gap-2 text-xs">
            <button type="button" class="text-teal-400 hover:underline" @click="toggleCategory(cat, true)">
              Select all
            </button>
            <button type="button" class="text-slate-500 hover:underline" @click="toggleCategory(cat, false)">
              None
            </button>
          </div>
          <ul class="space-y-1.5">
            <li
              v-for="board in cat.boards"
              :key="board.id"
              class="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-900/60"
            >
              <input
                :id="`board-${board.id}`"
                type="checkbox"
                class="mt-1 accent-teal-500"
                :checked="!!model[board.id]"
                @change="toggleBoard(board.id)"
              />
              <label :for="`board-${board.id}`" class="min-w-0 flex-1 cursor-pointer text-sm">
                <span class="text-slate-200">{{ board.name }}</span>
                <span class="ml-2 badge text-[10px]" :class="statusClass(board.status)">{{ statusLabel(board.status) }}</span>
                <span v-if="board.ingestType" class="ml-1 text-[10px] uppercase tracking-wide text-slate-600">{{ board.ingestType }}</span>
                <span v-if="board.notes" class="mt-0.5 block text-xs text-slate-600">{{ board.notes }}</span>
              </label>
              <a
                v-if="board.url"
                :href="board.url"
                target="_blank"
                rel="noopener"
                class="shrink-0 text-xs text-teal-500/80 hover:text-teal-400"
                @click.stop
              >↗</a>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <details v-if="catalog?.ingestGuidance?.length" class="mt-4 text-xs text-slate-600">
      <summary class="cursor-pointer text-slate-500 hover:text-slate-400">Ingestion types we support scaling to</summary>
      <ul class="mt-2 list-disc space-y-1 pl-4">
        <li v-for="(line, i) in catalog.ingestGuidance" :key="i">{{ line }}</li>
      </ul>
    </details>
  </div>
</template>
