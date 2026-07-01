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
    viewBox="0 0 512 512"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :class="className"
    role="img"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="rm-logo-bg" x1="64" y1="48" x2="448" y2="464" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0f172a" />
        <stop offset="1" stop-color="#134e4a" />
      </linearGradient>
      <linearGradient id="rm-logo-glow" x1="160" y1="120" x2="360" y2="392" gradientUnits="userSpaceOnUse">
        <stop stop-color="#14b8a6" />
        <stop offset="1" stop-color="#2dd4bf" />
      </linearGradient>
      <linearGradient id="rm-logo-gold" x1="200" y1="180" x2="312" y2="340" gradientUnits="userSpaceOnUse">
        <stop stop-color="#fbbf24" />
        <stop offset="1" stop-color="#f59e0b" />
      </linearGradient>
      <radialGradient id="rm-logo-iris" cx="256" cy="248" r="120" gradientUnits="userSpaceOnUse">
        <stop stop-color="#134e4a" />
        <stop offset="1" stop-color="#0f172a" />
      </radialGradient>
    </defs>

    <!-- App tile -->
    <rect width="512" height="512" rx="112" fill="url(#rm-logo-bg)" />

    <!-- Chakra aura rings (kept from original) -->
    <circle cx="256" cy="256" r="168" stroke="url(#rm-logo-glow)" stroke-width="6" opacity="0.32" />
    <circle cx="256" cy="256" r="138" stroke="url(#rm-logo-glow)" stroke-width="5" opacity="0.22" />

    <!-- Targeting crosshair twist — remote job lock-on -->
    <path
      d="M256 136 L256 376 M136 256 L376 256"
      stroke="#14b8a6"
      stroke-width="4"
      opacity="0.18"
      stroke-linecap="round"
    />

    <!-- Sharingan iris -->
    <circle cx="256" cy="256" r="118" fill="url(#rm-logo-iris)" stroke="url(#rm-logo-glow)" stroke-width="7" />
    <circle cx="256" cy="256" r="102" stroke="url(#rm-logo-glow)" stroke-width="2" opacity="0.35" />

    <!-- Three tomoe — classic 120° layout, teal instead of red -->
    <g transform="translate(256 256)">
      <g transform="rotate(0) translate(0 -62)">
        <path
          d="M 0 12 C -18 8 -24 -8 -14 -20 C -4 -30 14 -24 18 -10 C 20 2 10 14 0 12 Z"
          fill="url(#rm-logo-glow)"
        />
      </g>
      <g transform="rotate(120) translate(0 -62)">
        <path
          d="M 0 12 C -18 8 -24 -8 -14 -20 C -4 -30 14 -24 18 -10 C 20 2 10 14 0 12 Z"
          fill="url(#rm-logo-glow)"
        />
      </g>
      <g transform="rotate(240) translate(0 -62)">
        <path
          d="M 0 12 C -18 8 -24 -8 -14 -20 C -4 -30 14 -24 18 -10 C 20 2 10 14 0 12 Z"
          fill="url(#rm-logo-glow)"
        />
      </g>

      <!-- Inner pupil ring -->
      <circle r="40" fill="#0f172a" stroke="url(#rm-logo-glow)" stroke-width="5" opacity="0.9" />

      <!-- Gold center twist — activated eye / match lock (original accent kept) -->
      <circle r="20" fill="url(#rm-logo-gold)" />
      <circle r="9" fill="#0f172a" />
      <circle r="4" fill="url(#rm-logo-glow)" />
    </g>

    <!-- Subtle outer tomoe orbit hint -->
    <circle cx="256" cy="256" r="62" stroke="url(#rm-logo-glow)" stroke-width="1.5" opacity="0.2" stroke-dasharray="6 10" />
  </svg>
</template>
