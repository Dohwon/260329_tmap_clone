import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tmapKey = env.TMAP_API_KEY || env.VITE_TMAP_API_KEY || ''

  return {
    plugins: [
      react(),
      {
        name: 'tmap-meta-endpoint',
        configureServer(server) {
          server.middlewares.use('/api/meta/tmap-status', (_, res) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              hasApiKey: Boolean(tmapKey),
              mode: tmapKey ? 'live' : 'simulation',
            }))
          })
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
        manifest: {
          name: 'T맵 드라이버',
          short_name: 'T맵',
          description: '장거리 드라이버를 위한 경로 안내',
          theme_color: '#0064FF',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
    server: {
      proxy: {
        '/api/tmap': {
          target: 'https://apis.openapi.sk.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/tmap/, '/tmap'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (tmapKey) proxyReq.setHeader('appKey', tmapKey)
            })
          },
        },
      },
    },
  }
})
