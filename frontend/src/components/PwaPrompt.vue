<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import { usePushNotifications } from '../composables/usePushNotifications';
import { isIOS, isStandalonePwa, supportsHomeScreenInstall } from '../utils/device';

const deferredPrompt = ref(null);
const showInstall = ref(false);
const showIosHelp = ref(false);
const iosHelpDismissed = ref(false);
const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true });
const { supported, subscribed, error, subscribe } = usePushNotifications();
const showPush = ref(false);

const onIos = computed(() => isIOS());
const installed = computed(() => isStandalonePwa());
const canAddToHome = computed(() => supportsHomeScreenInstall());

function onBeforeInstall(e) {
  e.preventDefault();
  deferredPrompt.value = e;
  showInstall.value = true;
}

async function install() {
  if (!deferredPrompt.value) return;
  deferredPrompt.value.prompt();
  await deferredPrompt.value.userChoice;
  deferredPrompt.value = null;
  showInstall.value = false;
}

function refresh() {
  updateServiceWorker(true);
}

async function enablePush() {
  const ok = await subscribe();
  if (ok) showPush.value = false;
}

function dismissIosHelp() {
  iosHelpDismissed.value = true;
  showIosHelp.value = false;
  try {
    localStorage.setItem('rm-ios-help-dismissed', '1');
  } catch { /* ignore */ }
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', onBeforeInstall);
  try {
    iosHelpDismissed.value = localStorage.getItem('rm-ios-help-dismissed') === '1';
  } catch { /* ignore */ }

  if (onIos.value && !installed.value && !iosHelpDismissed.value) {
    showIosHelp.value = true;
  }

  if (supported.value && Notification.permission === 'default' && installed.value) {
    showPush.value = true;
  }
});
</script>

<template>
  <div class="fixed inset-x-0 z-50 flex flex-col gap-2 px-4 safe-x" style="top: env(safe-area-inset-top, 0);">
    <div
      v-if="needRefresh"
      class="flex items-center justify-between gap-3 rounded-xl border border-teal-700/50 bg-slate-900/95 px-4 py-3 text-sm shadow-lg backdrop-blur"
    >
      <span class="text-slate-200">Update available</span>
      <button class="btn-primary shrink-0 py-1.5 text-sm" @click="refresh">Reload</button>
    </div>

    <div
      v-if="showInstall"
      class="flex items-center justify-between gap-3 rounded-xl border border-amber-700/50 bg-slate-900/95 px-4 py-3 text-sm shadow-lg backdrop-blur"
    >
      <span class="text-slate-200">Install RemoteMatch on your phone</span>
      <button class="btn-primary shrink-0 py-1.5 text-sm" @click="install">Install</button>
    </div>

    <!-- iPhone / iPad Safari — no "Add to Home Screen" in obvious place -->
    <div
      v-if="showIosHelp && onIos && !installed"
      class="rounded-xl border border-sky-800/50 bg-slate-900/95 p-4 text-sm shadow-lg backdrop-blur"
    >
      <div class="flex items-start justify-between gap-2">
        <p class="font-medium text-sky-200">Using iPhone Safari?</p>
        <button type="button" class="shrink-0 text-slate-500 hover:text-slate-300" aria-label="Dismiss" @click="dismissIosHelp">×</button>
      </div>
      <p class="mt-2 text-slate-300 leading-relaxed">
        <strong class="text-slate-200">You do not need to install anything</strong> — log in here in Safari and bookmark this page. The app works in the browser.
      </p>
      <template v-if="canAddToHome">
        <p class="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Optional: icon on home screen</p>
        <ol class="mt-2 list-decimal space-y-2 pl-4 text-slate-400">
          <li>Tap the <strong class="text-slate-300">Share</strong> button
            <span class="text-slate-500">(square with ↑ at the bottom or top of Safari)</span>
          </li>
          <li><strong class="text-slate-300">Scroll down</strong> the menu — on older iPhones it is not in the first row</li>
          <li>Tap <strong class="text-slate-300">Add to Home Screen</strong>
            <span class="text-slate-500">(or Add to Homescreen)</span>
          </li>
          <li>If you still do not see it: tap <strong class="text-slate-300">More …</strong> and turn on Add to Home Screen</li>
        </ol>
        <p class="mt-3 text-xs text-slate-500">
          No Share button? Use <strong class="text-slate-400">Bookmarks → Add Bookmark</strong> and open RemoteMatch from there.
        </p>
      </template>
      <p v-else class="mt-3 text-xs text-slate-500">
        This iPhone version works best in Safari with a bookmark. Tap Share → Add Bookmark.
      </p>
      <button type="button" class="btn-secondary mt-4 w-full text-sm" @click="dismissIosHelp">Got it — use Safari</button>
    </div>

    <div
      v-if="showPush && !subscribed && installed"
      class="flex items-center justify-between gap-3 rounded-xl border border-teal-700/50 bg-slate-900/95 px-4 py-3 text-sm shadow-lg backdrop-blur"
    >
      <span class="text-slate-200">Enable push for job alerts</span>
      <button class="btn-primary shrink-0 py-1.5 text-sm" @click="enablePush">Enable</button>
    </div>
    <p v-if="showPush && !subscribed && installed" class="rounded-xl bg-slate-900/90 px-4 py-2 text-center text-xs text-slate-500">
      Push needs the home-screen app (iOS 16.4+). Older iPhones: use Safari + check the app daily.
    </p>
    <p v-if="error" class="text-center text-xs text-red-300">{{ error }}</p>
  </div>
</template>
