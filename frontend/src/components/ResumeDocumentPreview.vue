<script setup>
import { computed } from 'vue';
import { parseResumeForDisplay, parseResumeHeader, splitContactParts, isSkillsTagline } from '../utils/resumeDocument';

const props = defineProps({
  text: { type: String, default: '' },
  scale: { type: String, default: 'fit' }, // fit | full
  compact: { type: Boolean, default: false },
});

const doc = computed(() => parseResumeForDisplay(props.text));
const header = computed(() => parseResumeHeader(doc.value.headerLines));
const contactParts = computed(() => {
  const parts = [];
  for (const line of header.value.contact) {
    parts.push(...splitContactParts(line));
  }
  return parts;
});

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

function jobHeaderParts(text) {
  if (text.includes('|')) {
    const [left, right] = text.split('|').map((s) => s.trim());
    return { title: left, meta: right };
  }
  if (/\s—\s/.test(text)) {
    const [left, right] = text.split(/\s—\s/).map((s) => s.trim());
    return { title: left, meta: right };
  }
  return { title: text, meta: '' };
}
</script>

<template>
  <div
    class="resume-doc-shell"
    :class="[
      scale === 'full' ? 'resume-doc-shell-full' : '',
      compact ? 'resume-doc-shell-compact' : '',
    ]"
  >
    <div class="resume-page resume-template-pro" role="document" aria-label="Resume preview">
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

        <div class="resume-section-body">
          <template v-for="(row, ridx) in section.lines" :key="ridx">
            <div v-if="row.type === 'spacer'" class="resume-spacer" />

            <p v-else-if="row.type === 'job-header'" class="resume-job-header">
              <span class="resume-job-title">{{ jobHeaderParts(row.text).title }}</span>
              <span v-if="jobHeaderParts(row.text).meta" class="resume-job-meta">
                {{ jobHeaderParts(row.text).meta }}
              </span>
            </p>

            <p v-else-if="row.type === 'date'" class="resume-date-line">{{ row.text }}</p>

            <p v-else-if="row.type === 'pipe-line'" class="resume-pipe-line">{{ row.text }}</p>

            <ul
              v-else-if="row.type === 'bullet'"
              class="resume-bullet-list"
              :class="{
                'resume-bullet-nested': row.indent > 2,
                'resume-skill-list': row.skill,
              }"
            >
              <li class="resume-bullet-item">{{ row.text }}</li>
            </ul>

            <p v-else class="resume-body-line">{{ row.text }}</p>
          </template>
        </div>
      </section>

      <p v-if="!doc.sections.length && text" class="resume-fallback">{{ text }}</p>
    </div>
  </div>
</template>
