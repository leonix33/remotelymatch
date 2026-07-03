<script setup>
import { computed, ref, watch } from 'vue';
import http from '../api/http';
import { buildHighlightedHtml } from '../utils/atsHighlight';

const props = defineProps({
  jobId: { type: String, required: true },
  refreshKey: { type: [String, Number], default: '' },
});

const loading = ref(false);
const error = ref('');
const data = ref(null);

const jdHtml = computed(() =>
  buildHighlightedHtml(data.value?.jobDescription, data.value?.breakdown, { side: 'jd' })
);
const resumeHtml = computed(() =>
  buildHighlightedHtml(data.value?.tailoredResumeText, data.value?.breakdown, { side: 'resume' })
);

async function load() {
  if (!props.jobId) return;
  loading.value = true;
  error.value = '';
  try {
    const { data: payload } = await http.get(`/applications/kit/${encodeURIComponent(props.jobId)}/compare`);
    data.value = payload;
  } catch (e) {
    error.value = e.response?.data?.message || 'Could not load job description compare view';
    data.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => [props.jobId, props.refreshKey], load, { immediate: true });
</script>

<template>
  <div class="jd-compare-panel">
    <div class="jd-compare-panel__header">
      <div>
        <p class="jd-compare-panel__title">Job description vs tailored resume</p>
        <p v-if="data?.score != null" class="jd-compare-panel__meta">
          ATS {{ data.score }}%
          <span class="text-slate-500">·</span>
          <span class="jd-highlight-legend"><span class="jd-highlight jd-highlight--green">matched</span></span>
          <span class="jd-highlight-legend"><span class="jd-highlight jd-highlight--yellow">partial</span></span>
          <span class="jd-highlight-legend"><span class="jd-highlight jd-highlight--red">missing in resume</span></span>
        </p>
      </div>
      <div v-if="data" class="jd-compare-stats">
        <span class="ats-pill ats-pill--green">{{ data.green }} matched</span>
        <span class="ats-pill ats-pill--yellow">{{ data.yellow }} partial</span>
        <span class="ats-pill ats-pill--red">{{ data.red }} missing</span>
      </div>
    </div>

    <p v-if="loading" class="jd-compare-loading">Loading compare view…</p>
    <p v-else-if="error" class="jd-compare-error">{{ error }}</p>
    <p v-else-if="!data?.hasKit" class="jd-compare-error">
      No tailored resume yet — run <strong>Polish kit for apply</strong> first.
    </p>

    <div v-else class="jd-compare-split">
      <section class="jd-compare-pane">
        <h5 class="jd-compare-pane__title">Job description</h5>
        <div class="jd-compare-body custom-scrollbar" v-html="jdHtml" />
      </section>
      <section class="jd-compare-pane">
        <h5 class="jd-compare-pane__title">Polished resume</h5>
        <div class="jd-compare-body custom-scrollbar" v-html="resumeHtml" />
      </section>
    </div>
  </div>
</template>
