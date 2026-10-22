import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// In development, Vite proxies /api to the backend (Spring Boot on port 8080 by default).
// Override the target with: VITE_API_PROXY_TARGET=http://host:port npm run dev
export default defineConfig(({ mode }) => {
  const apiProxyTarget = loadEnv(mode, '.', 'VITE_').VITE_API_PROXY_TARGET || 'http://localhost:8080'
  return {
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Fichaje Braja',
          short_name: 'Braja',
          description: 'Registro de ingreso, egreso y pausas de Braja.',
          theme_color: '#12372a',
          background_color: '#f5f7f4',
          display: 'standalone',
          lang: 'es-AR',
          start_url: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
          ]
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        },
        devOptions: { enabled: false }
      })
    ],
    server: { host: '0.0.0.0', proxy: { '/api': apiProxyTarget } },
  }
})
