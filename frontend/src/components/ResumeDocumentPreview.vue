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

            <article v-else-if="row.type === 'job-block'" class="resume-job-block">
              <div class="resume-job-block-top">
                <h3 class="resume-job-block-title">{{ row.title }}</h3>
                <span v-if="row.dates" class="resume-job-block-dates">{{ row.dates }}</span>
              </div>
              <p v-if="row.company" class="resume-job-block-company">{{ row.company }}</p>
              <div v-if="row.tags?.length" class="resume-job-block-tags">
                <span v-for="(tag, tidx) in row.tags" :key="tidx" class="resume-job-tag">{{ tag }}</span>
              </div>
            </article>

            <p v-else-if="row.type === 'job-header'" class="resume-job-header">
              <span class="resume-job-title">{{ row.text }}</span>
            </p>

            <p v-else-if="row.type === 'date'" class="resume-date-line">{{ row.text }}</p>

            <p v-else-if="row.type === 'pipe-line'" class="resume-pipe-line">{{ row.text }}</p>

            <ul
              v-else-if="row.type === 'bullet'"
              class="resume-bullet-list"
              :class="{ 'resume-bullet-nested': row.indent > 2 }"
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
