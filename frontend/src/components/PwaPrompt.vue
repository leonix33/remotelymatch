<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import { usePushNotifications } from '../composables/usePushNotifications';
import { usePwaInstall } from '../composables/usePwaInstall';
import { brand, appName } from '../brand';
import { isIOS, isStandalonePwa, supportsHomeScreenInstall } from '../utils/device';

const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true });
const { supported, subscribed, error, subscribe } = usePushNotifications();
const {
  showSheet,
  installed,
  installMode,
  canOneClickInstall,
  installing,
  dismissSheet,
  installApp,
} = usePwaInstall();

const showPush = ref(false);
const displayName = computed(() => appName || brand.name || 'remotelymatch');

function refresh() {
  updateServiceWorker(true);
}

async function enablePush() {
  const ok = await subscribe();
  if (ok) showPush.value = false;
}

async function onInstallClick() {
  if (canOneClickInstall.value) {
    await installApp();
  }
}

onMounted(() => {
  if (supported.value && Notification.permission === 'default' && isStandalonePwa()) {
    showPush.value = true;
  }
});
</script>

<template>
  <div
    v-if="needRefresh || (showPush && !subscribed && installed)"
    class="mobile-pwa-banners fixed inset-x-0 z-50 flex flex-col gap-2 px-4 safe-x lg:top-0"
    style="top: env(safe-area-inset-top, 0);"
  >
    <div
      v-if="needRefresh"
      class="flex items-center justify-between gap-3 rounded-xl border border-teal-700/50 bg-slate-900/95 px-4 py-3 text-sm shadow-lg backdrop-blur"
    >
      <span class="text-slate-200">Update available</span>
      <button class="btn-primary shrink-0 py-1.5 text-sm" @click="refresh">Reload</button>
    </div>

    <div
      v-if="showPush && !subscribed && installed"
      class="flex items-center justify-between gap-3 rounded-xl border border-teal-700/50 bg-slate-900/95 px-4 py-3 text-sm shadow-lg backdrop-blur"
    >
      <span class="text-slate-200">Enable push for job alerts</span>
      <button class="btn-primary shrink-0 py-1.5 text-sm" @click="enablePush">Enable</button>
    </div>
    <p v-if="error" class="text-center text-xs text-red-300">{{ error }}</p>
  </div>

  <!-- Auto install guide (opened from tab or first visit) -->
  <Teleport to="body">
    <div
      v-if="showSheet && !installed"
      class="pwa-install-overlay"
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-modal="true"
      @click.self="dismissSheet"
    >
      <div class="pwa-install-sheet safe-bottom">
        <div class="pwa-install-handle" aria-hidden="true" />
        <button type="button" class="pwa-install-close" aria-label="Not now" @click="dismissSheet">×</button>

        <div class="pwa-install-hero">
          <img src="/icons/icon-192.png" alt="" class="pwa-install-icon" width="72" height="72" />
          <div class="min-w-0 flex-1">
            <h2 id="pwa-install-title" class="pwa-install-title">Get the {{ displayName }} app</h2>
            <p class="pwa-install-subtitle">One tap on your home screen — faster apply, queue, and follow-ups.</p>
          </div>
        </div>

        <template v-if="canOneClickInstall">
          <button
            type="button"
            class="btn-primary pwa-install-cta"
            :disabled="installing"
            @click="onInstallClick"
          >
            {{ installing ? 'Installing…' : 'Install app' }}
          </button>
          <p class="pwa-install-hint">Adds an icon to your home screen. No app store needed.</p>
        </template>

        <template v-else-if="installMode === 'in-app'">
          <p class="pwa-install-copy">
            Open this page in <strong>Chrome</strong> or <strong>Safari</strong> to install the app.
          </p>
          <ol class="pwa-install-steps">
            <li>Tap the <strong>⋯</strong> or <strong>menu</strong> at the top of this screen</li>
            <li>Choose <strong>Open in browser</strong> or <strong>Open in Safari</strong></li>
            <li>Then tap <strong>Install app</strong> when prompted</li>
          </ol>
        </template>

        <template v-else-if="installMode === 'ios'">
          <p class="pwa-install-copy">
            <template v-if="isIOS() && supportsHomeScreenInstall()">
              Add {{ displayName }} to your home screen — works like a native app.
            </template>
            <template v-else>
              Bookmark this page in Safari for quick access.
            </template>
          </p>
          <ol v-if="supportsHomeScreenInstall()" class="pwa-install-steps">
            <li>
              Tap <span class="pwa-install-pill">Share</span>
              <span class="text-slate-500"> (square with ↑ at the bottom of Safari)</span>
            </li>
            <li>Scroll down and tap <span class="pwa-install-pill">Add to Home Screen</span></li>
            <li>Tap <strong>Add</strong> in the top corner</li>
          </ol>
          <ol v-else class="pwa-install-steps">
            <li>Tap <span class="pwa-install-pill">Share</span> → <strong>Add Bookmark</strong></li>
            <li>Open {{ displayName }} from your bookmarks anytime</li>
          </ol>
          <p class="pwa-install-hint">On older iPhones, “Add to Home Screen” is below the first row in the Share menu.</p>
        </template>

        <template v-else-if="installMode === 'android'">
          <p class="pwa-install-copy">Add {{ displayName }} to your home screen from the browser menu.</p>
          <ol class="pwa-install-steps">
            <li>Tap the <span class="pwa-install-pill">⋮</span> menu (top right in Chrome)</li>
            <li>
              Tap <span class="pwa-install-pill">Install app</span>
              or <span class="pwa-install-pill">Add to Home screen</span>
            </li>
            <li>Confirm <strong>Install</strong></li>
          </ol>
          <p class="pwa-install-hint">Samsung Internet: Menu → Add page to → Home screen.</p>
        </template>

        <div class="pwa-install-actions">
          <button v-if="canOneClickInstall" type="button" class="btn-secondary w-full" @click="dismissSheet">
            Not now
          </button>
          <button v-else type="button" class="btn-primary pwa-install-cta" @click="dismissSheet">
            Got it — continue in browser
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
