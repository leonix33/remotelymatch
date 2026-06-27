<script setup>
import { useAppShare } from '../composables/useAppShare';
import { appName } from '../brand';

const { openPanel } = useAppShare();
</script>

<template>
  <button
    type="button"
    class="share-install-tab safe-top"
    :aria-label="`Install ${appName} or share URL`"
    :title="`Install ${appName} · Share URL`"
    @click="openPanel"
  >
    <span class="share-install-tab-icon" aria-hidden="true">📲</span>
    <span class="share-install-tab-text">Install</span>
    <span class="share-install-tab-text share-install-tab-text-sub">Share URL</span>
  </button>
</template>
