<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import http from '../api/http';

const now = new Date();
const viewYear = ref(now.getFullYear());
const viewMonth = ref(now.getMonth() + 1);
const events = ref([]);
const upcoming = ref([]);
const loading = ref(true);
const showForm = ref(false);
const saving = ref(false);
const error = ref('');
const selectedDay = ref(null);

const form = ref({
  title: '',
  description: '',
  type: 'interview',
  startDate: '',
  startTime: '09:00',
  allDay: false,
  location: '',
});

const monthLabel = computed(() =>
  new Date(viewYear.value, viewMonth.value - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
);

const weeks = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value - 1, 1);
  const last = new Date(viewYear.value, viewMonth.value, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
});

function eventsOnDay(day) {
  if (!day) return [];
  const dayStart = new Date(viewYear.value, viewMonth.value - 1, day);
  const dayEnd = new Date(viewYear.value, viewMonth.value - 1, day, 23, 59, 59);
  return events.value.filter((e) => {
    const d = new Date(e.startDate);
    return d >= dayStart && d <= dayEnd;
  });
}

function colorClass(c) {
  if (c === 'amber') return 'bg-amber-500/30 text-amber-200';
  if (c === 'slate') return 'bg-slate-600/40 text-slate-300';
  return 'bg-teal-500/30 text-teal-200';
}

function typeIcon(t) {
  if (t === 'conference') return '📅';
  if (t === 'interview') return '🎙';
  if (t === 'deadline') return '⏰';
  if (t === 'application') return '📋';
  return '📌';
}

function prevMonth() {
  if (viewMonth.value === 1) {
    viewMonth.value = 12;
    viewYear.value -= 1;
  } else viewMonth.value -= 1;
}

function nextMonth() {
  if (viewMonth.value === 12) {
    viewMonth.value = 1;
    viewYear.value += 1;
  } else viewMonth.value += 1;
}

function openAdd(day) {
  selectedDay.value = day;
  const m = String(viewMonth.value).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  form.value.startDate = `${viewYear.value}-${m}-${d}`;
  showForm.value = true;
}

async function load() {
  loading.value = true;
  try {
    const [calRes, upRes] = await Promise.all([
      http.get('/calendar', { params: { year: viewYear.value, month: viewMonth.value } }),
      http.get('/calendar/upcoming', { params: { days: 14 } }),
    ]);
    events.value = calRes.data;
    upcoming.value = upRes.data;
  } catch (e) {
    error.value = e.response?.data?.message || 'Calendar requires MongoDB';
    events.value = [];
  } finally {
    loading.value = false;
  }
}

async function addEvent() {
  saving.value = true;
  error.value = '';
  try {
    const start = form.value.allDay
      ? new Date(`${form.value.startDate}T12:00:00`).toISOString()
      : new Date(`${form.value.startDate}T${form.value.startTime}:00`).toISOString();
    await http.post('/calendar', {
      title: form.value.title,
      description: form.value.description,
      type: form.value.type,
      startDate: start,
      allDay: form.value.allDay,
      location: form.value.location,
    });
    showForm.value = false;
    form.value = { title: '', description: '', type: 'interview', startDate: '', startTime: '09:00', allDay: false, location: '' };
    await load();
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not add event';
  } finally {
    saving.value = false;
  }
}

async function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;
  await http.delete(`/calendar/${id}`);
  await load();
}

function formatEventTime(e) {
  const d = new Date(e.startDate);
  if (e.allDay) return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

onMounted(load);
watch([viewYear, viewMonth], load);
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-slate-100">Calendar</h2>
    <p class="mt-1 text-slate-400">Interviews, deadlines, conferences, and personal reminders — all in one place</p>

    <p v-if="error" class="mt-4 text-sm text-red-300">{{ error }}</p>

    <div class="mt-6 grid gap-6 xl:grid-cols-3">
      <div class="card overflow-hidden xl:col-span-2">
        <div class="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <button class="btn-secondary px-3 py-1 text-sm" @click="prevMonth">←</button>
          <h3 class="font-semibold text-slate-200">{{ monthLabel }}</h3>
          <button class="btn-secondary px-3 py-1 text-sm" @click="nextMonth">→</button>
        </div>

        <div class="grid grid-cols-7 border-b border-slate-800/60 text-center text-xs text-slate-500">
          <div v-for="d in ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']" :key="d" class="py-2">{{ d }}</div>
        </div>

        <div v-if="loading" class="p-8 text-center text-slate-400">Loading…</div>
        <div v-else>
          <div v-for="(week, wi) in weeks" :key="wi" class="grid grid-cols-7 border-b border-slate-800/40 min-h-[72px]">
            <div
              v-for="(day, di) in week"
              :key="di"
              class="border-r border-slate-800/40 p-1 last:border-r-0"
              :class="day ? 'cursor-pointer hover:bg-slate-900/50' : ''"
              @click="day && openAdd(day)"
            >
              <p v-if="day" class="text-xs text-slate-400">{{ day }}</p>
              <div v-for="ev in eventsOnDay(day).slice(0, 2)" :key="ev.id" class="mt-0.5 truncate rounded px-1 text-[10px]" :class="colorClass(ev.color)">
                {{ typeIcon(ev.type) }} {{ ev.title }}
              </div>
              <p v-if="day && eventsOnDay(day).length > 2" class="text-[9px] text-slate-600">+{{ eventsOnDay(day).length - 2 }} more</p>
            </div>
          </div>
        </div>
        <p class="p-3 text-xs text-slate-500">Click a day to add an interview, deadline, or reminder. Conferences auto-sync from Events.</p>
      </div>

      <div class="space-y-4">
        <div class="card p-4">
          <h3 class="font-semibold text-slate-200">Next 14 days</h3>
          <div class="mt-3 space-y-2">
            <div v-for="e in upcoming" :key="e.id" class="rounded-lg bg-slate-900/50 p-3 text-sm">
              <div class="flex items-start justify-between gap-2">
                <p class="font-medium text-slate-200">{{ typeIcon(e.type) }} {{ e.title }}</p>
                <button
                  v-if="!e.readOnly"
                  class="text-xs text-red-400"
                  @click="deleteEvent(e.id)"
                >×</button>
              </div>
              <p class="text-xs text-slate-500">{{ formatEventTime(e) }}</p>
              <p v-if="e.location" class="text-xs text-slate-600">{{ e.location }}</p>
              <a v-if="e.url" :href="e.url" target="_blank" rel="noopener" class="text-xs text-teal-400 hover:underline">Details →</a>
            </div>
            <p v-if="!upcoming.length" class="text-sm text-slate-500">Nothing scheduled yet.</p>
          </div>
        </div>

        <div class="card p-4 text-sm text-slate-500">
          <p class="font-medium text-slate-300">Legend</p>
          <ul class="mt-2 space-y-1">
            <li>📅 Conferences (from Events page)</li>
            <li>🎙 Interviews you add</li>
            <li>⏰ Application deadlines</li>
            <li>📋 Apply follow-ups</li>
          </ul>
        </div>
      </div>
    </div>

    <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showForm = false">
      <form class="card w-full max-w-md space-y-4 p-6" @submit.prevent="addEvent">
        <h3 class="font-semibold text-slate-200">Add event — {{ form.startDate }}</h3>
        <input v-model="form.title" required class="input" placeholder="Title" />
        <select v-model="form.type" class="input">
          <option value="interview">Interview</option>
          <option value="deadline">Deadline</option>
          <option value="application">Application follow-up</option>
          <option value="reminder">Reminder</option>
          <option value="personal">Personal</option>
        </select>
        <label class="flex items-center gap-2 text-sm text-slate-400">
          <input v-model="form.allDay" type="checkbox" /> All day
        </label>
        <input v-if="!form.allDay" v-model="form.startTime" type="time" class="input" />
        <input v-model="form.location" class="input" placeholder="Location or Zoom link" />
        <textarea v-model="form.description" rows="2" class="input text-sm" placeholder="Notes" />
        <div class="flex gap-2">
          <button type="button" class="btn-secondary flex-1" @click="showForm = false">Cancel</button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">Save</button>
        </div>
      </form>
    </div>
  </div>
</template>
