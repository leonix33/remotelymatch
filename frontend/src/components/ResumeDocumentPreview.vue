<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { parseResumeForDisplay, parseResumeHeader, splitContactParts, isSkillsTagline } from '../utils/resumeDocument';
import ResumeDocumentRow from './ResumeDocumentRow.vue';

const props = defineProps({
  text: { type: String, default: '' },
  scale: { type: String, default: 'fit' }, // fit | full
  compact: { type: Boolean, default: false },
});

const shellRef = ref(null);
const pageRef = ref(null);
const pageScale = ref(1);
const scaledHeight = ref('auto');
let resizeObserver = null;

const doc = computed(() => parseResumeForDisplay(props.text));
const header = computed(() => parseResumeHeader(doc.value.headerLines));
const contactParts = computed(() => {
  const parts = [];
  for (const line of header.value.contact) {
    parts.push(...splitContactParts(line));
  }
  return parts;
});

function groupExperienceRows(lines) {
  const groups = [];
  let jobEntry = null;

  for (const row of lines) {
    if (row.type === 'job-block' || row.type === 'job-header') {
      if (jobEntry) groups.push(jobEntry);
      jobEntry = { kind: 'job-entry', rows: [row] };
    } else if (jobEntry) {
      jobEntry.rows.push(row);
    } else {
      groups.push({ kind: 'flat', rows: [row] });
    }
  }

  if (jobEntry) groups.push(jobEntry);
  return groups;
}

function getSectionRowGroups(section) {
  if (section.key === 'experience') return groupExperienceRows(section.lines);
  return [{ kind: 'flat', rows: section.lines }];
}

function taglineClass(line, index) {
  if (index > 0 || isSkillsTagline(line)) return 'resume-tagline resume-tagline-skills';
  return 'resume-tagline';
}

function sectionHeadingClass(heading, style) {
  if (style === 'ALL_CAPS' || /^[A-Z][A-Z\s/&\-]{2,}$/.test(heading)) {
    return 'resume-section-title-caps';
  }
  return 'resume-section-title';
}

function updatePageScale() {
  const shell = shellRef.value;
  const page = pageRef.value;
  if (!shell || !page || props.scale === 'full') {
    pageScale.value = 1;
    scaledHeight.value = 'auto';
    return;
  }

  const available = shell.clientWidth;
  const natural = page.offsetWidth;
  if (!available || !natural) {
    pageScale.value = 1;
    scaledHeight.value = 'auto';
    return;
  }

  const nextScale = Math.min(1, available / natural);
  pageScale.value = nextScale;
  scaledHeight.value = `${page.offsetHeight * nextScale}px`;
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => updatePageScale());
  if (shellRef.value) resizeObserver.observe(shellRef.value);
  updatePageScale();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

watch(
  () => [props.text, props.scale, doc.value.sections.length],
  () => {
    requestAnimationFrame(updatePageScale);
  }
);
</script>

<template>
  <div
    ref="shellRef"
    class="resume-doc-shell"
    :class="[
      scale === 'fit' ? 'resume-doc-shell-fit' : '',
      scale === 'full' ? 'resume-doc-shell-full' : '',
      compact ? 'resume-doc-shell-compact' : '',
    ]"
  >
    <div class="resume-doc-scale-host" :style="{ height: scaledHeight }">
      <div
        ref="pageRef"
        class="resume-page resume-template-pro"
        :style="scale === 'fit' ? { transform: `scale(${pageScale})`, transformOrigin: 'top left' } : undefined"
        role="document"
        aria-label="Resume preview"
      >
      <header v-if="header.name || header.taglines.length || header.contact.length" class="resume-header-block">
        <h1 class="resume-name">{{ header.name }}</h1>
        <p v-for="(tag, idx) in header.taglines" :key="idx" :class="taglineClass(tag, idx)">
          {{ tag }}
        </p>
        <div v-if="contactParts.length" class="resume-contact-row">
          <span v-for="(part, pidx) in contactParts" :key="pidx" class="resume-contact-item">{{ part }}</span>
        </div>
      </header>

      <section
        v-for="(section, sidx) in doc.sections"
        :key="`${section.key}-${sidx}`"
        class="resume-section"
        :class="{
          'resume-section-credentials': section.immutable,
          [`resume-section-${section.key}`]: Boolean(section.key),
        }"
      >
        <h2
          v-if="section.heading"
          :class="sectionHeadingClass(section.heading, doc.headingStyle)"
        >
          {{ section.heading }}
        </h2>

        <div
          class="resume-section-body"
          :class="{
            'resume-section-body-skills': section.key === 'skills',
            'resume-section-body-tools': section.key === 'tools',
            'resume-section-body-education': section.key === 'education',
            'resume-section-body-certs': section.key === 'certifications' || section.key === 'credentials',
          }"
        >
          <template v-for="(group, gidx) in getSectionRowGroups(section)" :key="gidx">
            <div v-if="group.kind === 'job-entry'" class="resume-job-entry">
              <ResumeDocumentRow v-for="(row, ridx) in group.rows" :key="ridx" :row="row" />
            </div>
            <template v-else>
              <ResumeDocumentRow v-for="(row, ridx) in group.rows" :key="ridx" :row="row" />
            </template>
          </template>
        </div>
      </section>

      <p v-if="!doc.sections.length && text" class="resume-fallback">{{ text }}</p>
      </div>
    </div>
  </div>
</template>
