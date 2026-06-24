<script setup>
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useProfileStore } from '../stores/profile';
import ApplyWorkflowBanner from '../components/ApplyWorkflowBanner.vue';
import {
  buildLinkedInJobSearchUrl,
  mergeLinkedInSearches,
  openLinkedIn,
} from '../utils/linkedin';
import { appUrl } from '../config';

const profileStore = useProfileStore();
const saving = ref(false);
const message = ref('');
const error = ref('');
const newLabel = ref('');
const newKeywords = ref('');

const profile = computed(() => profileStore.profile || {});
const linkedinProfileUrl = computed(() => profile.value.linkedin || '');
const searches = computed(() => mergeLinkedInSearches(profile.value));

const extensionPath = 'remotematch/chrome-extension';
const profileSetupUrl = computed(() => `${appUrl.replace(/\/$/, '')}/profile`);

async function saveSearches(next) {
  saving.value = true;
  message.value = '';
  error.value = '';
  try {
    await profileStore.save({ linkedinSavedSearches: next });
    message.value = 'Saved searches updated.';
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not save searches';
  } finally {
    saving.value = false;
  }
}

async function addCustomSearch() {
  const keywords = newKeywords.value.trim();
  if (!keywords) return;
  const label = newLabel.value.trim() || keywords;
  const url = buildLinkedInJobSearchUrl(keywords);
  const custom = [...(profile.value.linkedinSavedSearches || [])];
  custom.unshift({
    id: `custom-${Date.now()}`,
    label,
    url,
    createdAt: new Date().toISOString(),
  });
  await saveSearches(custom);
  newLabel.value = '';
  newKeywords.value = '';
}

async function removeSearch(item) {
  if (item.builtin) return;
  const custom = (profile.value.linkedinSavedSearches || []).filter((s) => s.id !== item.id);
  await saveSearches(custom);
}

function openSearch(item) {
  openLinkedIn(item.url);
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-slate-100">LinkedIn workflow</h2>
    <p class="mt-1 max-w-2xl text-slate-400">
      Discover roles on LinkedIn yourself, queue them in RemoteMatch, then let the agent apply on ATS boards.
      No bots — your account stays safe.
    </p>

    <ApplyWorkflowBanner class="mt-6" />

    <div class="mt-6 grid gap-4 lg:grid-cols-3">
      <div class="card p-5 lg:col-span-2">
        <h3 class="font-semibold text-teal-200">How it works</h3>
        <ol class="mt-4 space-y-3 text-sm text-slate-300">
          <li class="flex gap-3">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-300">1</span>
            <span>Open a saved search below (desktop or LinkedIn mobile app).</span>
          </li>
          <li class="flex gap-3">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-300">2</span>
            <span>On a job you like, use the <strong class="text-slate-200">RemoteMatch Chrome extension</strong> → Send to Apply Queue.</span>
          </li>
          <li class="flex gap-3">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-300">3</span>
            <span>
              In
              <RouterLink to="/approvals" class="text-teal-400 hover:underline">Apply Queue</RouterLink>,
              approve the job. If it links to Greenhouse/Lever/Ashby, the agent can apply.
            </span>
          </li>
          <li class="flex gap-3">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-300">4</span>
            <span>
              Track results in
              <RouterLink to="/applications" class="text-teal-400 hover:underline">Applications</RouterLink>
              and
              <RouterLink to="/analytics" class="text-teal-400 hover:underline">Analytics</RouterLink>
              (by job board).
            </span>
          </li>
        </ol>
      </div>

      <div class="card p-5">
        <h3 class="font-semibold text-slate-200">Your LinkedIn profile</h3>
        <p class="mt-2 text-sm text-slate-400">Used when filling application forms.</p>
        <a
          v-if="linkedinProfileUrl"
          :href="linkedinProfileUrl"
          target="_blank"
          rel="noopener"
          class="btn-secondary mt-4 inline-block w-full text-center text-sm"
        >
          Open your LinkedIn →
        </a>
        <RouterLink v-else to="/profile" class="btn-secondary mt-4 inline-block w-full text-center text-sm">
          Add LinkedIn URL in Profile
        </RouterLink>
      </div>
    </div>

    <div class="mt-8 card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold text-slate-200">Saved job searches</h3>
          <p class="mt-1 text-sm text-slate-500">One tap opens LinkedIn with remote US filters.</p>
        </div>
        <a
          href="https://www.linkedin.com/jobs/"
          target="_blank"
          rel="noopener"
          class="btn-secondary text-sm"
        >
          LinkedIn Jobs home
        </a>
      </div>

      <div class="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          v-for="item in searches"
          :key="item.id"
          type="button"
          class="flex items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/40 px-4 py-3 text-left text-sm transition hover:border-teal-700/60 hover:bg-slate-800/60"
          @click="openSearch(item)"
        >
          <span class="text-slate-200">{{ item.label }}</span>
          <span class="shrink-0 text-teal-400">Open →</span>
        </button>
      </div>

      <div v-if="profile.linkedinSavedSearches?.length" class="mt-4 space-y-2">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Your custom searches</p>
        <div
          v-for="item in profile.linkedinSavedSearches"
          :key="item.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/40 px-3 py-2 text-sm"
        >
          <span class="text-slate-300">{{ item.label }}</span>
          <div class="flex gap-2">
            <button type="button" class="text-teal-400 hover:underline" @click="openSearch(item)">Open</button>
            <button type="button" class="text-slate-500 hover:text-red-300" @click="removeSearch(item)">Remove</button>
          </div>
        </div>
      </div>

      <div class="mt-6 border-t border-slate-800 pt-5">
        <p class="text-sm font-medium text-slate-300">Add a custom search</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <input v-model="newLabel" class="input max-w-xs text-sm" placeholder="Label (optional)" />
          <input v-model="newKeywords" class="input min-w-[200px] flex-1 text-sm" placeholder="Keywords e.g. databricks engineer remote" />
          <button class="btn-primary text-sm" :disabled="saving || !newKeywords.trim()" @click="addCustomSearch">
            Save search
          </button>
        </div>
      </div>

      <p v-if="message" class="mt-3 text-sm text-teal-300">{{ message }}</p>
      <p v-if="error" class="mt-3 text-sm text-red-300">{{ error }}</p>
    </div>

    <div class="mt-8 grid gap-4 md:grid-cols-2">
      <div class="card p-5">
        <h3 class="font-semibold text-slate-200">Chrome extension</h3>
        <p class="mt-2 text-sm text-slate-400">
          Queue LinkedIn (or any) job page into RemoteMatch while you browse.
        </p>
        <ol class="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-400">
          <li>Chrome → <code class="text-xs text-slate-300">chrome://extensions</code> → Developer mode → Load unpacked</li>
          <li>Select folder: <code class="break-all text-xs text-teal-300/90">{{ extensionPath }}</code></li>
          <li>
            Open
            <RouterLink :to="'/profile'" class="text-teal-400 hover:underline">Profile</RouterLink>
            → copy API token for the extension
          </li>
          <li>On a LinkedIn job posting, click the extension → <strong class="text-slate-300">Send to queue</strong></li>
        </ol>
      </div>

      <div class="card p-5">
        <h3 class="font-semibold text-slate-200">On your phone</h3>
        <p class="mt-2 text-sm text-slate-400">
          Install RemoteMatch as a PWA, then use LinkedIn’s app for discovery.
        </p>
        <ul class="mt-4 space-y-2 text-sm text-slate-400">
          <li>• Tap a saved search above — opens LinkedIn in browser</li>
          <li>• Share job link to yourself → open on desktop → extension queue</li>
          <li>• Or copy job URL into Apply Queue via Profile extension token on desktop</li>
        </ul>
        <p class="mt-4 text-xs text-slate-500">
          Setup URL for extension:
          <span class="text-slate-400">{{ profileSetupUrl }}</span>
        </p>
      </div>
    </div>

    <div class="mt-6 rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-sm text-amber-100/90">
      <strong class="text-amber-200">Why we don’t auto-scrape LinkedIn:</strong>
      Automated login and Easy Apply violate LinkedIn’s terms and trigger account restrictions.
      Your agent still runs 14+ other job boards unattended — use LinkedIn as your human discovery channel.
    </div>
  </div>
</template>
