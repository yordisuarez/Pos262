import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  const hmrEnabled = process.env.DISABLE_HMR !== 'true';

  return {
    base: './',
    plugins: [
      {
        name: 'safe-pwa-dev-sw',
        apply: 'serve' as const,
        enforce: 'pre' as const,
        load(id: string) {
          if (id !== '\0/@vite-plugin-pwa/pwa-entry-point-loaded') {
            return null;
          }
          const fallbackCode = `
function fallbackRegisterDevSW() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./dev-sw.js?dev-sw', { scope: './', type: 'classic' })
      .catch(() => {});
  }
}`;
          if (!hmrEnabled) {
            return `${fallbackCode}
export default function registerDevSW() {
  fallbackRegisterDevSW();
}
`;
          }
          return `${fallbackCode}
if (import.meta.hot) {
  import.meta.hot.on('vite-plugin-pwa:register-sw', ({ mode, inlinePath, registerPath, scope, swType = 'classic' }) => {
    if (mode == 'inline') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(inlinePath, { scope, type: swType }).catch(() => {});
      }
    } else {
      const registerSW = document.createElement('script');
      registerSW.setAttribute('id', 'vite-plugin-pwa:register-sw');
      if (mode === 'script-defer') registerSW.setAttribute('defer', 'defer');
      registerSW.setAttribute('src', registerPath);
      document.head.appendChild(registerSW);
    }
  });
}
export default function registerDevSW() {
  if (!import.meta.hot) {
    fallbackRegisterDevSW();
    return;
  }
  try {
    Promise.resolve(import.meta.hot.send('vite-pwa-plugin:dev-ready')).catch(fallbackRegisterDevSW);
  } catch {
    fallbackRegisterDevSW();
  }
}
`;
        },
      },
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: './',
          name: 'Pos 262',
          short_name: 'Pos 262',
          description: 'Punto de venta web offline-first multi-moneda ($ / Bs) para comercios.',
          theme_color: '#0f172a',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'any',
          start_url: './',
          scope: './',
          lang: 'es',
          icons: [
            {
              src: './pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build' as const,
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: hmrEnabled,
      watch: hmrEnabled ? {} : null,
    },
  };
});
