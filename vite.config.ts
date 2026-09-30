/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// The app is served from https://unterkraehe.github.io/BandOrganizer/ (R-CODE-09).
const BASE = '/BandOrganizer/';

export default defineConfig({
  base: BASE,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        // App name also lives in src/locales/de/common.json (R-I18N-07).
        name: 'Overload App',
        short_name: 'Overload App',
        description: 'Songs, Termine, Setlists und Chat für die Band',
        lang: 'de',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#0E0E10',
        theme_color: '#0E0E10',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The OAuth callback must always come from the network.
        navigateFallbackDenylist: [/callback\.html/],
        // push notifications: handlers live in public/push-sw.js (F6 §4.5)
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    alias: { 'virtual:pwa-register/react': fileURLToPath(new URL('./src/test/pwaRegisterMock.ts', import.meta.url)) },
    css: false,
  },
});
