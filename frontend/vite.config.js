import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appUrl = env.VITE_APP_URL || 'https://remotelymatch.app';
  const appName = env.VITE_APP_NAME || 'RemoteMatch';

  return {
    plugins: [
      vue(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'offline.html'],
        manifest: {
          id: appUrl,
          name: appName,
          short_name: appName,
          description: 'Find, match, and apply to remote DevOps & SRE jobs — mobile-ready dashboard',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          display_override: ['standalone', 'browser'],
          orientation: 'any',
          scope: '/',
          start_url: '/',
          categories: ['business', 'productivity'],
        icons: [
          { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        },
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/],
          globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
          importScripts: ['push-listener.js'],
          runtimeCaching: [
            {
              urlPattern: /^\/api\/.*/i,
              handler: 'NetworkOnly',
            },
          ],
        },
        devOptions: { enabled: true },
      }),
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:5100',
        '/socket.io': { target: 'http://localhost:5100', ws: true },
      },
    },
  };
});
