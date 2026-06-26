<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';
import { useAuthStore } from '../stores/auth';
import { useProfileStore } from '../stores/profile';

const auth = useAuthStore();
const profileStore = useProfileStore();

const health = ref(null);
const loading = ref(true);
const showDns = ref(false);
const showAdzuna = ref(false);
const registrar = ref('cloudflare');

const openaiKey = ref('');
const openaiSaving = ref(false);
const openaiMsg = ref('');
const openaiError = ref('');

const adzunaAppId = ref('');
const adzunaAppKey = ref('');
const adzunaWhat = ref('platform engineer remote');
const adzunaSaving = ref(false);
const adzunaMsg = ref('');
const adzunaError = ref('');

const items = computed(() => {
  const h = health.value || {};
  const usingSandbox = !(h.emailProduction ?? !(h.emailFrom || '').includes('resend.dev'));
  return [
    {
      id: 'resend',
      label: 'Email delivery (Resend)',
      ok: Boolean(h.emailConfigured),
      hint: h.emailConfigured
        ? usingSandbox
          ? 'Sandbox sender — only delivers to your Resend signup email. Verify domain for production.'
          : `Sending from ${h.emailFrom || 'configured sender'}`
        : 'Add RESEND_API_KEY on Render',
    },
    {
      id: 'domain',
      label: 'Company email domain',
      ok: Boolean(h.emailConfigured && !usingSandbox),
      hint: usingSandbox
        ? 'Verify remotelymatch.app in Resend → use noreply@remotelymatch.app'
        : h.emailFrom || 'Domain sender configured',
    },
    {
      id: 'adzuna',
      label: 'Adzuna job feed',
      ok: Boolean(h.adzunaConfigured),
      hint: h.adzunaConfigured
        ? `Pulling extra listings${h.adzunaAppIdHint ? ` (${h.adzunaAppIdHint})` : ''}`
        : auth.isAdmin
          ? 'Paste Adzuna API keys below (free at developer.adzuna.com)'
          : 'Ask admin to add Adzuna keys in Platform setup',
    },
    {
      id: 'openai',
      label: 'AI tailoring',
      ok: Boolean(h.openaiConfigured),
      hint: h.openaiConfigured
        ? `Model: ${h.openaiModel || 'gpt-4o-mini'}${h.openaiKeyHint ? ` · ${h.openaiKeyHint}` : ''}`
        : 'Paste your OpenAI API key below or add OPENAI_API_KEY on Render',
    },
    {
      id: 'mongo',
      label: 'Database',
      ok: Boolean(h.mongoConnected),
      hint: h.mongoConnected ? 'Connected' : 'MongoDB not connected — data may not persist',
    },
  ];
});

const allCoreReady = computed(() => {
  const h = health.value || {};
  return Boolean(h.emailConfigured && h.mongoConnected && h.openaiConfigured);
});

const needsOpenAi = computed(() => !health.value?.openaiConfigured);
const needsAdzuna = computed(() => auth.isAdmin && !health.value?.adzunaConfigured);

async function load() {
  loading.value = true;
  openaiMsg.value = '';
  openaiError.value = '';
  adzunaMsg.value = '';
  adzunaError.value = '';
  try {
    const { data } = await http.get('/setup/status');
    health.value = data;
  } catch {
    try {
      const { data } = await http.get('/health');
      health.value = data;
    } catch {
      health.value = null;
    }
  } finally {
    loading.value = false;
  }
}

async function saveOpenAiKey() {
  const key = openaiKey.value.trim();
  if (!key) {
    openaiError.value = 'Paste an OpenAI API key (sk-…)';
    return;
  }
  openaiSaving.value = true;
  openaiError.value = '';
  openaiMsg.value = '';
  try {
    await http.post('/profile/me/openai-key', { apiKey: key });
    openaiKey.value = '';
    openaiMsg.value = 'OpenAI connected — resume tailoring is live.';
    await profileStore.fetch().catch(() => {});
    await load();
  } catch (e) {
    openaiError.value = e.response?.data?.message || e.message || 'Could not save key';
  } finally {
    openaiSaving.value = false;
  }
}

async function saveAdzuna() {
  if (!adzunaAppId.value.trim() || !adzunaAppKey.value.trim()) {
    adzunaError.value = 'App ID and App Key are both required';
    return;
  }
  adzunaSaving.value = true;
  adzunaError.value = '';
  adzunaMsg.value = '';
  try {
    await http.post('/setup/adzuna', {
      appId: adzunaAppId.value.trim(),
      appKey: adzunaAppKey.value.trim(),
      what: adzunaWhat.value.trim() || undefined,
    });
    adzunaAppKey.value = '';
    adzunaMsg.value = 'Adzuna connected — run a job search to pull new listings.';
    await load();
  } catch (e) {
    adzunaError.value = e.response?.data?.message || e.message || 'Could not save Adzuna keys';
  } finally {
    adzunaSaving.value = false;
  }
}

onMounted(load);
defineExpose({ refresh: load });
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-sm font-medium text-slate-200">Platform setup</p>
        <p class="mt-1 text-xs text-slate-500">Resend, Adzuna, AI, and database — needed for apply + follow-up emails</p>
      </div>
      <button type="button" class="btn-secondary px-2 py-1 text-xs" :disabled="loading" @click="load">
        {{ loading ? '…' : 'Refresh' }}
      </button>
    </div>

    <ul class="mt-4 space-y-2">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-start gap-3 rounded-lg border border-slate-800/80 bg-slate-900/40 px-3 py-2 text-sm"
      >
        <span
          class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          :class="item.ok ? 'bg-teal-500/20 text-teal-300' : 'bg-amber-500/15 text-amber-300'"
        >
          {{ item.ok ? '✓' : '!' }}
        </span>
        <span>
          <span class="font-medium text-slate-200">{{ item.label }}</span>
          <span class="mt-0.5 block text-xs text-slate-500">{{ item.hint }}</span>
        </span>
      </li>
    </ul>

    <p v-if="allCoreReady" class="mt-3 text-xs text-teal-400">Core services ready — apply batches will email follow-up digests automatically.</p>

    <div v-if="needsOpenAi" class="mt-4 rounded-lg border border-violet-900/40 bg-violet-950/10 p-4">
      <p class="text-sm font-medium text-slate-200">Connect OpenAI</p>
      <p class="mt-1 text-xs text-slate-500">
        Required for resume tailoring and cover letters.
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" class="text-teal-400 hover:underline">Get a key</a>
        — stored encrypted, never committed to git.
      </p>
      <input
        v-model="openaiKey"
        type="password"
        class="input mt-3 font-mono text-sm"
        placeholder="sk-..."
        autocomplete="off"
      />
      <div class="mt-2 flex flex-wrap gap-2">
        <button type="button" class="btn-primary text-sm" :disabled="openaiSaving" @click="saveOpenAiKey">
          {{ openaiSaving ? 'Connecting…' : 'Connect OpenAI' }}
        </button>
        <RouterLink to="/profile" class="btn-secondary text-sm">More in Profile</RouterLink>
      </div>
      <p v-if="openaiMsg" class="mt-2 text-xs text-teal-300">{{ openaiMsg }}</p>
      <p v-if="openaiError" class="mt-2 text-xs text-red-300">{{ openaiError }}</p>
    </div>

    <div v-if="needsAdzuna" class="mt-4 rounded-lg border border-amber-900/30 bg-amber-950/10 p-4">
      <p class="text-sm font-medium text-slate-200">Connect Adzuna job feed</p>
      <p class="mt-1 text-xs text-slate-500">
        Free API at
        <a href="https://developer.adzuna.com/" target="_blank" rel="noopener" class="text-teal-400 hover:underline">developer.adzuna.com</a>
        — adds hundreds of fresh remote listings on each job search.
      </p>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-xs text-slate-500">App ID</label>
          <input v-model="adzunaAppId" class="input font-mono text-sm" placeholder="e.g. abc12345" />
        </div>
        <div>
          <label class="mb-1 block text-xs text-slate-500">App Key</label>
          <input v-model="adzunaAppKey" type="password" class="input font-mono text-sm" placeholder="App key" autocomplete="off" />
        </div>
      </div>
      <div class="mt-3">
        <label class="mb-1 block text-xs text-slate-500">Search keywords (optional)</label>
        <input v-model="adzunaWhat" class="input text-sm" placeholder="platform engineer remote" />
      </div>
      <button type="button" class="btn-primary mt-3 text-sm" :disabled="adzunaSaving" @click="saveAdzuna">
        {{ adzunaSaving ? 'Saving…' : 'Save Adzuna keys' }}
      </button>
      <p v-if="adzunaMsg" class="mt-2 text-xs text-teal-300">{{ adzunaMsg }}</p>
      <p v-if="adzunaError" class="mt-2 text-xs text-red-300">{{ adzunaError }}</p>
    </div>

    <button
      type="button"
      class="mt-4 text-xs text-teal-400 hover:underline"
      @click="showDns = !showDns"
    >
      {{ showDns ? 'Hide' : 'Show' }} Resend DNS setup (remotelymatch.app)
    </button>

    <button
      v-if="!needsAdzuna"
      type="button"
      class="ml-4 mt-4 text-xs text-slate-500 hover:underline"
      @click="showAdzuna = !showAdzuna"
    >
      {{ showAdzuna ? 'Hide' : 'Show' }} Adzuna setup guide
    </button>

    <div v-if="showDns" class="mt-3 space-y-4 rounded-lg border border-violet-900/30 bg-violet-950/10 p-4 text-xs text-slate-400">
      <p class="text-slate-300">
        <strong>Step 1.</strong>
        <a href="https://resend.com/domains" target="_blank" rel="noopener" class="text-teal-400 hover:underline">Resend → Domains</a>
        → Add <code class="text-violet-300">remotelymatch.app</code>
      </p>
      <p><strong>Step 2.</strong> Resend shows 3 DNS records (SPF, DKIM, optional DMARC). Add them at your registrar:</p>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="r in ['cloudflare', 'namecheap', 'godaddy', 'other']"
          :key="r"
          type="button"
          class="rounded-lg px-2 py-1 capitalize transition"
          :class="registrar === r ? 'bg-teal-500/20 text-teal-200' : 'text-slate-500 hover:bg-slate-800'"
          @click="registrar = r"
        >
          {{ r }}
        </button>
      </div>

      <div v-if="registrar === 'cloudflare'" class="space-y-2 leading-relaxed">
        <p>Cloudflare → <strong>remotelymatch.app</strong> → DNS → Records → Add record for each Resend row:</p>
        <ul class="list-inside list-disc space-y-1">
          <li><strong>TXT</strong> (SPF) — name/host from Resend, paste value exactly</li>
          <li><strong>CNAME</strong> (DKIM) — usually <code>resend._domainkey</code> → target from Resend</li>
          <li>Turn proxy <strong>off</strong> (DNS only / grey cloud) for mail records</li>
        </ul>
      </div>
      <div v-else-if="registrar === 'namecheap'" class="space-y-2 leading-relaxed">
        <p>Namecheap → Domain List → Manage → <strong>Advanced DNS</strong>:</p>
        <ul class="list-inside list-disc space-y-1">
          <li>Add <strong>TXT</strong> record for SPF (host + value from Resend)</li>
          <li>Add <strong>CNAME</strong> for DKIM (<code>resend._domainkey</code>)</li>
          <li>Wait 15–30 min, click Verify in Resend</li>
        </ul>
      </div>
      <div v-else-if="registrar === 'godaddy'" class="space-y-2 leading-relaxed">
        <p>GoDaddy → My Products → DNS → Add:</p>
        <ul class="list-inside list-disc space-y-1">
          <li><strong>TXT</strong> — Type TXT, name from Resend, value from Resend</li>
          <li><strong>CNAME</strong> — Host <code>resend._domainkey</code>, points to Resend target</li>
        </ul>
      </div>
      <div v-else class="leading-relaxed">
        <p>At any registrar: add the exact <strong>TXT</strong> and <strong>CNAME</strong> records Resend displays. Do not edit the values. Verify in Resend when status turns green.</p>
      </div>

      <p class="text-slate-300">
        <strong>Step 3.</strong> Render → Environment →
        <code class="text-violet-300">EMAIL_FROM=RemotelyMatch &lt;noreply@remotelymatch.app&gt;</code>
        → redeploy
      </p>
      <p>
        <strong>Personal email stays separate:</strong> keep your Gmail in Profile for job forms.
        <code>noreply@remotelymatch.app</code> is only the sender for RemotelyMatch digests.
      </p>
      <RouterLink to="/profile" class="inline-block text-teal-400 hover:underline">Profile → email & digest settings</RouterLink>
    </div>

    <div v-if="showAdzuna && !needsAdzuna" class="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-400">
      <p>
        Adzuna keys are saved. Run a job search from the Apply tab to ingest new listings.
        Keys can also be set on Render as <code>ADZUNA_APP_ID</code> and <code>ADZUNA_APP_KEY</code>.
      </p>
    </div>
  </div>
</template>
