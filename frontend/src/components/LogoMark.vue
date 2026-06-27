<script setup>
defineProps({
  size: { type: [Number, String], default: 40 },
  className: { type: String, default: '' },
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :class="className"
    role="img"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="rm-logo-bg" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0f172a" />
        <stop offset="1" stop-color="#134e4a" />
      </linearGradient>
      <linearGradient id="rm-logo-teal" x1="18" y1="16" x2="46" y2="48" gradientUnits="userSpaceOnUse">
        <stop stop-color="#2dd4bf" />
        <stop offset="1" stop-color="#14b8a6" />
      </linearGradient>
      <linearGradient id="rm-logo-gold" x1="34" y1="28" x2="50" y2="44" gradientUnits="userSpaceOnUse">
        <stop stop-color="#fde68a" />
        <stop offset="1" stop-color="#f59e0b" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="16" fill="url(#rm-logo-bg)" />
    <path
      d="M32 14c-9.9 0-18 8.1-18 18 0 4.2 1.4 8 3.8 11.1"
      stroke="url(#rm-logo-teal)"
      stroke-width="3"
      stroke-linecap="round"
    />
    <path
      d="M32 14c9.9 0 18 8.1 18 18 0 4.2-1.4 8-3.8 11.1"
      stroke="url(#rm-logo-teal)"
      stroke-width="3"
      stroke-linecap="round"
      opacity="0.9"
    />
    <ellipse cx="32" cy="32" rx="18" ry="7.5" stroke="url(#rm-logo-teal)" stroke-width="2.5" opacity="0.45" />
    <path
      d="M22 36c4.5 5.5 15.5 5.5 20 0"
      stroke="url(#rm-logo-gold)"
      stroke-width="3.5"
      stroke-linecap="round"
    />
    <circle cx="32" cy="36" r="4.5" fill="url(#rm-logo-gold)" />
  </svg>
</template>
