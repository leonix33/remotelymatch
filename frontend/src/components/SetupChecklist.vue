<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import http from '../api/http';

const health = ref(null);
const loading = ref(true);
const showDns = ref(false);
const registrar = ref('cloudflare');

const items = computed(() => {
  const h = health.value || {};
  const usingSandbox = (h.emailFrom || '').includes('resend.dev');
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
      hint: h.adzunaConfigured ? 'Pulling extra listings on job search' : 'Add ADZUNA_APP_ID and ADZUNA_APP_KEY on Render',
    },
    {
      id: 'openai',
      label: 'AI tailoring',
      ok: Boolean(h.openaiConfigured),
      hint: h.openaiConfigured ? `Model: ${h.openaiModel || 'gpt-4o-mini'}` : 'Add OPENAI_API_KEY on Render or Profile',
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

async function load() {
  loading.value = true;
  try {
    const { data } = await http.get('/health');
    health.value = data;
  } catch {
    health.value = null;
  } finally {
    loading.value = false;
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

    <button
      type="button"
      class="mt-4 text-xs text-teal-400 hover:underline"
      @click="showDns = !showDns"
    >
      {{ showDns ? 'Hide' : 'Show' }} Resend DNS setup (remotelymatch.app)
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
        <code class="text-violet-300">EMAIL_FROM=RemoteMatch &lt;noreply@remotelymatch.app&gt;</code>
        → redeploy
      </p>
      <p>
        <strong>Personal email stays separate:</strong> keep <code>leonix23@gmail.com</code> in Profile for job forms.
        <code>noreply@remotelymatch.app</code> is only the sender for RemoteMatch digests.
      </p>
      <p class="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-500">
        <strong class="text-slate-400">One domain only:</strong> use <code class="text-violet-300">remotelymatch.app</code> in Cloudflare.
        If you also own <code class="text-slate-600">remotematch.app</code> (without “ly”), remove it or redirect it to remotelymatch.app — the app redirects automatically.
      </p>
      <p>
        Adzuna keys:
        <a href="https://developer.adzuna.com/" target="_blank" rel="noopener" class="text-teal-400 hover:underline">developer.adzuna.com</a>
        → register → set <code>ADZUNA_APP_ID</code> + <code>ADZUNA_APP_KEY</code> on Render.
      </p>
      <RouterLink to="/profile" class="inline-block text-teal-400 hover:underline">Profile → email & digest settings</RouterLink>
    </div>
  </div>
</template>
