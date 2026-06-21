<script setup>
import { RouterLink } from 'vue-router';
import AppLogo from '../components/AppLogo.vue';
import { brand, displayDomain } from '../brand';

const stats = [
  { value: '1,500+', label: 'Remote roles tracked' },
  { value: '100%', label: 'Match-first apply flow' },
  { value: 'Team', label: 'Invite-only squads' },
];
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-200">
    <div class="pointer-events-none fixed inset-0 overflow-hidden">
      <div class="absolute -left-32 top-0 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
      <div class="absolute -right-32 top-40 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
    </div>

    <header class="safe-top relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <AppLogo size="md" />
      <div class="flex items-center gap-3">
        <span class="hidden text-xs text-slate-500 sm:inline">{{ displayDomain() }}</span>
        <RouterLink to="/login" class="btn-primary">Sign in</RouterLink>
      </div>
    </header>

    <main class="relative mx-auto max-w-6xl px-6 pb-20">
      <section class="mt-12 text-center lg:mt-20">
        <p class="text-sm font-medium uppercase tracking-widest text-teal-400">{{ brand.heroEyebrow }}</p>
        <h1 class="mt-4 text-4xl font-bold leading-tight text-slate-50 md:text-6xl">
          {{ brand.heroTitle }}
        </h1>
        <p class="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          {{ brand.heroSubtitle }}
        </p>
        <div class="mt-10 flex flex-wrap justify-center gap-4">
          <RouterLink to="/login" class="btn-primary px-8 py-3 text-base">Sign in to your queue</RouterLink>
          <a href="#features" class="btn-secondary px-8 py-3 text-base">See how it works</a>
        </div>
      </section>

      <section class="mt-16 grid gap-4 sm:grid-cols-3">
        <div v-for="s in stats" :key="s.label" class="card p-6 text-center">
          <p class="text-3xl font-bold text-teal-300">{{ s.value }}</p>
          <p class="mt-1 text-sm text-slate-500">{{ s.label }}</p>
        </div>
      </section>

      <section id="features" class="mt-24 grid gap-6 md:grid-cols-3">
        <div class="card p-6">
          <p class="text-2xl">🎯</p>
          <h3 class="mt-3 font-semibold text-teal-200">Personal match scores</h3>
          <p class="mt-2 text-sm text-slate-400">Jobs re-ranked to your skills, titles, and targets — not a generic feed.</p>
        </div>
        <div class="card p-6">
          <p class="text-2xl">✓</p>
          <h3 class="mt-3 font-semibold text-teal-200">Approval queue</h3>
          <p class="mt-2 text-sm text-slate-400">Review high-match roles. Agent only applies what you approve.</p>
        </div>
        <div class="card p-6">
          <p class="text-2xl">🧩</p>
          <h3 class="mt-3 font-semibold text-teal-200">Chrome extension</h3>
          <p class="mt-2 text-sm text-slate-400">Queue any job page from your browser straight into Apply Queue.</p>
        </div>
        <div class="card p-6">
          <p class="text-2xl">🧠</p>
          <h3 class="mt-3 font-semibold text-teal-200">AI intelligence</h3>
          <p class="mt-2 text-sm text-slate-400">Match copilot, interview simulator, salary oracle, market pulse.</p>
        </div>
        <div class="card p-6">
          <p class="text-2xl">🤝</p>
          <h3 class="mt-3 font-semibold text-teal-200">Apply squads</h3>
          <p class="mt-2 text-sm text-slate-400">Coordinate with teammates, share resumes, prep interviews together.</p>
        </div>
        <div class="card p-6">
          <p class="text-2xl">📈</p>
          <h3 class="mt-3 font-semibold text-teal-200">Outcome learning</h3>
          <p class="mt-2 text-sm text-slate-400">Track what converts — interviews, offers, and referral intros.</p>
        </div>
      </section>

      <section class="mt-24 card p-8 text-center md:p-12">
        <h2 class="text-2xl font-bold text-slate-100">Built for serious remote job seekers</h2>
        <p class="mx-auto mt-3 max-w-xl text-slate-400">
          Invite-only teams. Admin controls access. No public signup noise — built for DevOps, SRE, cloud, and platform engineers who want control before auto-apply.
        </p>
        <RouterLink to="/login" class="btn-primary mt-8 inline-block">Sign in to {{ brand.name }}</RouterLink>
        <p class="mt-4 text-xs text-slate-600">Need access? Contact {{ brand.supportEmail }}</p>
      </section>
    </main>

    <footer class="relative border-t border-slate-800 py-8 text-center text-sm text-slate-600">
      {{ brand.name }} · {{ displayDomain() }}
    </footer>
  </div>
</template>
