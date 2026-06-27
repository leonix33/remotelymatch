<script setup>
import { computed } from 'vue';
import { useAppShare } from '../composables/useAppShare';
import { usePwaInstall } from '../composables/usePwaInstall';
import { brand, appName } from '../brand';
import { isIOS, isMobileDevice, supportsHomeScreenInstall } from '../utils/device';

const {
  showPanel,
  copyMessage,
  shareUrl,
  canNativeShare,
  closePanel,
  copyLink,
  shareLink,
} = useAppShare();

const {
  installed,
  installMode,
  canOneClickInstall,
  showInstallOffer,
  installing,
  installApp,
  openSheet,
} = usePwaInstall();

const displayName = computed(() => appName || brand.name || 'remotelymatch');
const showInstallSection = computed(() => showInstallOffer.value && !installed.value);

function close() {
  closePanel();
}

async function onInstallClick() {
  if (canOneClickInstall.value) {
    await installApp();
    return;
  }
  closePanel();
  openSheet(true);
}

function focusInstall() {
  closePanel();
  openSheet(true);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="showPanel"
      class="share-install-overlay"
      role="dialog"
      aria-labelledby="share-install-title"
      aria-modal="true"
      @click.self="close"
    >
      <div class="share-install-sheet safe-bottom">
        <div class="share-install-handle" aria-hidden="true" />
        <button type="button" class="share-install-close" aria-label="Close" @click="close">×</button>

        <h2 id="share-install-title" class="share-install-title">{{ displayName }}</h2>
        <p class="share-install-subtitle">
          Install the app or share the URL — no account needed.
        </p>

        <!-- Share -->
        <section class="share-install-section">
          <p class="share-install-section-label">Share URL</p>
          <div class="share-install-url-box">
            <code class="share-install-url">{{ shareUrl }}</code>
          </div>
          <div class="share-install-actions-row">
            <button type="button" class="btn-primary flex-1" @click="copyLink">
              {{ copyMessage || 'Copy link' }}
            </button>
            <button
              v-if="canNativeShare"
              type="button"
              class="btn-secondary flex-1"
              @click="shareLink"
            >
              Share…
            </button>
          </div>
          <p v-if="copyMessage" class="share-install-feedback">{{ copyMessage }}</p>
        </section>

        <!-- Install (mobile / not yet installed) -->
        <section v-if="showInstallSection" class="share-install-section">
          <p class="share-install-section-label">Install {{ displayName }}</p>

          <button
            v-if="canOneClickInstall"
            type="button"
            class="btn-primary w-full"
            :disabled="installing"
            @click="onInstallClick"
          >
            {{ installing ? 'Installing…' : 'Install app' }}
          </button>

          <template v-else-if="installMode === 'ios'">
            <p class="share-install-copy">
              In Safari: tap <span class="share-install-pill">Share</span> →
              <span class="share-install-pill">Add to Home Screen</span>
            </p>
            <button v-if="isIOS() && supportsHomeScreenInstall()" type="button" class="btn-secondary w-full" @click="focusInstall">
              Show step-by-step
            </button>
          </template>

          <template v-else-if="installMode === 'android' || installMode === 'in-app'">
            <p class="share-install-copy">
              <template v-if="installMode === 'in-app'">
                Open in Chrome or Safari first, then install.
              </template>
              <template v-else>
                Chrome menu <span class="share-install-pill">⋮</span> →
                <span class="share-install-pill">Install app</span>
              </template>
            </p>
            <button type="button" class="btn-secondary w-full" @click="focusInstall">
              Show step-by-step
            </button>
          </template>
        </section>

        <section v-else-if="installed" class="share-install-section">
          <p class="share-install-installed">✓ App installed — you’re using the home-screen version.</p>
        </section>

        <section v-else-if="!isMobileDevice()" class="share-install-section">
          <p class="share-install-copy text-sm text-slate-500">
            On your phone, open the copied link in Safari or Chrome to install the app.
          </p>
        </section>

        <button type="button" class="btn-secondary mt-4 w-full" @click="close">Done</button>
      </div>
    </div>
  </Teleport>
</template>
