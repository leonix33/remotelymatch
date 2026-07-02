<script setup>
import JobScoreBadges from './JobScoreBadges.vue';
import KitReadinessBadges from './KitReadinessBadges.vue';
import { isKitReadyToApply } from '../utils/kitReadiness';

const props = defineProps({
  job: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  copied: { type: String, default: '' },
  generating: { type: Boolean, default: false },
  polishing: { type: Boolean, default: false },
  reapplying: { type: Boolean, default: false },
  kitError: { type: String, default: '' },
  polishMsg: { type: String, default: '' },
  actionMsg: { type: String, default: '' },
});

const emit = defineEmits([
  'select',
  'mark-done',
  'copy',
  'open-job',
  'enrich',
  'generate',
  'polish',
  'reapply',
]);

const canReapply = (job) => isKitReadyToApply(job.kit);

function mailtoLink(kit) {
  const to = kit?.emailTo || kit?.recipient?.email || '';
  const subject = encodeURIComponent(kit?.emailSubject || '');
  const body = encodeURIComponent(kit?.emailBody || '');
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}
</script>

<template>
  <article
    class="follow-up-card"
    :class="{ 'follow-up-card--selected': selected, 'follow-up-card--due': job.followUpDue }"
  >
    <button type="button" class="follow-up-card__select" @click="emit('select', job)">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1 text-left">
          <div class="flex flex-wrap items-center gap-2">
            <span v-if="job.followUpDue" class="follow-up-badge follow-up-badge--due">Follow up today</span>
            <span v-else-if="job.followUpUpcoming" class="follow-up-badge follow-up-badge--soon">Day {{ job.schedule?.daysUntil }} reminder</span>
            <span v-else-if="job.followUpCompleted" class="follow-up-badge follow-up-badge--done">Completed</span>
            <span v-if="job.ats?.score != null" class="text-xs text-slate-500">ATS {{ job.ats.score }}%</span>
          </div>
          <h3 class="mt-2 text-lg font-semibold text-slate-100">{{ job.title }}</h3>
          <p class="text-sm text-teal-300/90">{{ job.company }}</p>
          <p class="mt-1 text-xs text-slate-500">Applied {{ formatDate(job.appliedAt) }} · {{ job.daysSinceApply ?? 0 }}d ago</p>
          <p v-if="!job.hasFollowUpKit && !generating" class="mt-1 text-xs text-amber-300/90">No follow-up kit yet — expand to generate</p>
          <p v-if="generating" class="mt-1 text-xs text-teal-300">Generating follow-up kit…</p>
          <div class="mt-2">
            <JobScoreBadges :job="job" />
          </div>
        </div>
      </div>
    </button>

    <div v-if="selected" class="follow-up-card__detail border-t border-slate-800/80 p-4 sm:p-5">
      <section class="follow-up-section mb-5">
        <h4 class="follow-up-section__title">Application kit</h4>
        <p class="mt-1 text-xs text-slate-500">
          Polish your tailored resume for this role, refresh the follow-up email, then reapply if the posting allows it.
        </p>
        <div class="mt-2">
          <KitReadinessBadges :kit="job.kit" />
        </div>
        <p v-if="polishMsg" class="mt-2 text-xs text-teal-300">{{ polishMsg }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="btn-secondary text-xs"
            :disabled="polishing || generating"
            @click.stop="emit('polish', job)"
          >
            {{ polishing ? 'Polishing…' : 'Polish kit for apply' }}
          </button>
          <button
            v-if="canReapply(job)"
            type="button"
            class="btn-primary text-xs"
            :disabled="reapplying || polishing || generating"
            @click.stop="emit('reapply', job)"
          >
            {{ reapplying ? 'Reapplying…' : 'Reapply with tailored resume' }}
          </button>
        </div>
        <p v-if="actionMsg" class="mt-2 text-xs text-slate-400">{{ actionMsg }}</p>
      </section>

      <div v-if="kitError" class="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
        {{ kitError }}
      </div>

      <div v-if="!job.followUpKit && !generating">
        <p class="text-sm text-slate-400">Follow-up kit not generated yet for this role.</p>
        <button
          type="button"
          class="btn-primary mt-3 text-sm"
          :disabled="generating"
          @click.stop="emit('generate', job)"
        >
          Generate follow-up kit
        </button>
      </div>

      <div v-else-if="generating && !job.followUpKit" class="text-sm text-slate-400">
        Building email draft, contacts, and call script…
      </div>

      <div v-else-if="job.followUpKit" class="grid gap-5 lg:grid-cols-2">
        <section class="follow-up-section lg:col-span-2 flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs text-slate-500">Follow-up kit ready</p>
          <button
            type="button"
            class="btn-secondary text-xs"
            :disabled="generating"
            @click.stop="emit('generate', job, true)"
          >
            {{ generating ? 'Regenerating…' : 'Regenerate follow-up kit' }}
          </button>
        </section>

        <section class="follow-up-section">
          <h4 class="follow-up-section__title">Contacts</h4>
          <p v-if="job.followUpKit.companyPhone" class="mt-2 text-sm text-slate-300">
            Company:
            <a :href="`tel:${job.followUpKit.companyPhone}`" class="text-teal-300 hover:underline">{{ job.followUpKit.companyPhone }}</a>
          </p>
          <p v-if="job.followUpKit.applicantPhone" class="mt-1 text-sm text-slate-400">
            Your number:
            <a :href="`tel:${job.followUpKit.applicantPhone}`" class="text-teal-300 hover:underline">{{ job.followUpKit.applicantPhone }}</a>
          </p>
          <ul v-if="job.followUpKit.contacts?.enrichmentProviders?.length" class="mt-2 flex flex-wrap gap-1">
            <li
              v-for="provider in job.followUpKit.contacts.enrichmentProviders"
              :key="provider"
              class="badge badge-teal text-[10px] capitalize"
            >
              {{ provider }} verified
            </li>
          </ul>
          <ul class="mt-3 space-y-2 text-sm">
            <li
              v-for="(c, i) in job.followUpKit.contacts?.verifiedContacts || []"
              :key="`v-${i}`"
              class="rounded-lg border border-teal-900/40 bg-teal-950/20 px-3 py-2"
            >
              <p class="font-medium text-slate-200">{{ c.name || 'Contact' }}</p>
              <p class="text-xs text-slate-400">{{ c.role }} · {{ c.source }}</p>
              <p v-if="c.email" class="mt-1 text-teal-300">{{ c.email }}</p>
              <p v-if="c.phone" class="text-xs text-slate-400">{{ c.phone }}</p>
              <span v-if="c.verified" class="mt-1 inline-block text-xs text-teal-400">Verified</span>
            </li>
            <li
              v-for="(e, i) in job.followUpKit.contacts?.emails || []"
              :key="`e-${i}`"
              class="text-slate-300"
            >{{ e.email }} <span class="text-slate-500">({{ e.role }})</span></li>
          </ul>
          <div class="mt-3 flex flex-wrap gap-2">
            <a
              v-if="job.followUpKit.contacts?.linkedInSearchUrl"
              :href="job.followUpKit.contacts.linkedInSearchUrl"
              target="_blank"
              rel="noopener"
              class="btn-secondary text-xs"
              @click.stop
            >Find on LinkedIn</a>
            <button type="button" class="btn-secondary text-xs" @click.stop="emit('enrich', job)">Refresh contacts (Hunter/Apollo)</button>
          </div>
        </section>

        <section class="follow-up-section">
          <h4 class="follow-up-section__title">Pre-drafted follow-up email</h4>
          <p class="mt-1 text-xs text-slate-500">To: {{ job.followUpKit.emailTo || job.followUpKit.recipient?.email || 'Find contact above' }}</p>
          <p class="text-xs font-medium text-slate-400">Subject: {{ job.followUpKit.emailSubject }}</p>
          <pre class="follow-up-draft mt-3">{{ job.followUpKit.emailBody }}</pre>
          <div class="mt-3 flex flex-wrap gap-2">
            <a
              v-if="job.followUpKit.emailTo || job.followUpKit.recipient?.email"
              :href="mailtoLink(job.followUpKit)"
              class="btn-primary text-xs"
              @click.stop
            >Send email</a>
            <button type="button" class="btn-secondary text-xs" @click.stop="emit('copy', job.followUpKit.emailBody, 'email')">
              {{ copied === 'email' ? 'Copied' : 'Copy email' }}
            </button>
          </div>
        </section>

        <section class="follow-up-section lg:col-span-2">
          <h4 class="follow-up-section__title">LinkedIn & call script</h4>
          <pre class="follow-up-draft mt-2">{{ job.followUpKit.linkedInMessage }}</pre>
          <button type="button" class="btn-secondary mt-2 text-xs" @click.stop="emit('copy', job.followUpKit.linkedInMessage, 'li')">
            {{ copied === 'li' ? 'Copied' : 'Copy LinkedIn' }}
          </button>
          <pre class="follow-up-draft mt-4">{{ job.followUpKit.callScript }}</pre>
          <button type="button" class="btn-secondary mt-2 text-xs" @click.stop="emit('copy', job.followUpKit.callScript, 'call')">
            {{ copied === 'call' ? 'Copied' : 'Copy call script' }}
          </button>
        </section>
      </div>

      <div v-if="job.followUpKit" class="mt-5 flex flex-wrap gap-2 border-t border-slate-800/80 pt-4">
        <button type="button" class="btn-secondary text-sm" @click.stop="emit('open-job', job)">Open job posting</button>
        <button
          v-if="!job.followUpCompleted"
          type="button"
          class="btn-primary text-sm"
          @click.stop="emit('mark-done', job)"
        >Mark followed up</button>
      </div>
    </div>
  </article>
</template>
