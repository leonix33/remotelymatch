export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/** Rough iOS major version from user agent, or null */
export function iosMajorVersion() {
  if (!isIOS()) return null;
  const m = navigator.userAgent.match(/OS (\d+)[_.]/);
  return m ? Number(m[1]) : null;
}

export function supportsHomeScreenInstall() {
  const v = iosMajorVersion();
  if (v === null) return true;
  return v >= 7;
}
