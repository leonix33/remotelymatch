<script setup>
defineProps({
  row: { type: Object, required: true },
});
</script>

<template>
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

  <div v-else-if="row.type === 'skill-category'" class="resume-skill-category">
    <p class="resume-skill-category-label">{{ row.label }}</p>
    <div class="resume-skill-chips">
      <span v-for="(item, sidx) in row.items" :key="sidx" class="resume-skill-chip">{{ item }}</span>
      <span v-if="row.overflow" class="resume-skill-chip resume-skill-chip-more">+{{ row.overflow }} more</span>
    </div>
  </div>

  <div v-else-if="row.type === 'tools-grid'" class="resume-tools-block">
    <p v-if="row.label" class="resume-skill-category-label">{{ row.label }}</p>
    <div class="resume-skill-chips resume-tools-chips">
      <span v-for="(item, tidx) in row.items" :key="tidx" class="resume-tool-chip">{{ item }}</span>
    </div>
  </div>

  <div v-else-if="row.type === 'education-block'" class="resume-education-block">
    <div class="resume-education-icon" aria-hidden="true">🎓</div>
    <div class="resume-education-content">
      <p class="resume-education-degree">{{ row.degree }}</p>
      <p class="resume-education-school">{{ row.school }}</p>
    </div>
  </div>

  <div v-else-if="row.type === 'cert-group'" class="resume-cert-group">
    <p class="resume-cert-group-label">{{ row.label }}</p>
    <div class="resume-cert-chips">
      <span v-for="(item, cidx) in row.items" :key="cidx" class="resume-cert-chip">{{ item }}</span>
    </div>
  </div>

  <div v-else-if="row.type === 'cert-item'" class="resume-cert-chips">
    <span class="resume-cert-chip">{{ row.text }}</span>
  </div>

  <ul
    v-else-if="row.type === 'bullet'"
    class="resume-bullet-list"
    :class="{ 'resume-bullet-nested': row.indent > 2 }"
  >
    <li class="resume-bullet-item">{{ row.text }}</li>
  </ul>

  <p v-else class="resume-body-line">{{ row.text }}</p>
</template>
