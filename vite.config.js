import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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
