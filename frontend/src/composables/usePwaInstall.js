import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getInstallMode, isMobileDevice, isStandalonePwa } from '../utils/device';

const DISMISS_KEY = 'rm-pwa-install-dismissed';
const DISMISS_MS = 5 * 24 * 60 * 60 * 1000;

const deferredPrompt = ref(null);
const showSheet = ref(false);
const installing = ref(false);
const installOutcome = ref('');
let openTimer = null;
let beforeInstallHandler = null;
let listenersBound = false;

function readDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const { at } = JSON.parse(raw);
    return Date.now() - Number(at) < DISMISS_MS;
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ at: Date.now() }));
  } catch {
    /* ignore */
  }
}

function isAuthPage() {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  return (
    (path === '/login' && (params.get('forgot') === '1' || params.has('reset'))) ||
    path === '/welcome'
  );
}

function bindInstallListeners() {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;

  beforeInstallHandler = (e) => {
    e.preventDefault();
    deferredPrompt.value = e;
    if (!readDismissed() && !isStandalonePwa() && !isAuthPage()) {
      showSheet.value = true;
    }
  };
  window.addEventListener('beforeinstallprompt', beforeInstallHandler);

  if (!isStandalonePwa() && isMobileDevice() && !readDismissed() && !isAuthPage()) {
    openTimer = window.setTimeout(() => {
      if (!isStandalonePwa() && !readDismissed() && isMobileDevice() && !isAuthPage()) {
        showSheet.value = true;
      }
    }, 1200);
  }
}

export function usePwaInstall() {
  const installed = computed(() => isStandalonePwa());
  const installMode = computed(() => getInstallMode());
  const canOneClickInstall = computed(() => Boolean(deferredPrompt.value));

  const showInstallOffer = computed(() => {
    if (installed.value) return false;
    if (installMode.value === 'in-app') return true;
    if (isMobileDevice()) return true;
    return installMode.value === 'ios' || installMode.value === 'android';
  });

  function openSheet(force = false) {
    if (installed.value) return;
    if (force || showInstallOffer.value || isMobileDevice()) {
      showSheet.value = true;
    }
  }

  function dismissSheet() {
    showSheet.value = false;
    writeDismissed();
  }

  async function installApp() {
    if (!deferredPrompt.value) return false;
    installing.value = true;
    installOutcome.value = '';
    try {
      await deferredPrompt.value.prompt();
      const { outcome } = await deferredPrompt.value.userChoice;
      installOutcome.value = outcome;
      if (outcome === 'accepted') {
        deferredPrompt.value = null;
        showSheet.value = false;
        writeDismissed();
        return true;
      }
      return false;
    } catch {
      installOutcome.value = 'error';
      return false;
    } finally {
      installing.value = false;
    }
  }

  onMounted(bindInstallListeners);

  onUnmounted(() => {
    /* singleton listeners stay bound for app lifetime */
  });

  return {
    showSheet,
    installed,
    installMode,
    canOneClickInstall,
    showInstallOffer,
    installing,
    installOutcome,
    openSheet,
    dismissSheet,
    installApp,
  };
}
