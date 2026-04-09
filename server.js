import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

function readEnvFile(filename) {
  const filepath = join(__dirname, filename)
  if (!fs.existsSync(filepath)) return {}

  return fs.readFileSync(filepath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .reduce((acc, line) => {
      const [key, ...rest] = line.split('=')
      acc[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '')
      return acc
    }, {})
}

const localEnv = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local'),
}

const TMAP_KEY = process.env.TMAP_API_KEY || process.env.VITE_TMAP_API_KEY || localEnv.TMAP_API_KEY || localEnv.VITE_TMAP_API_KEY || ''

app.get('/api/meta/tmap-status', (_, res) => {
  res.json({
    hasApiKey: Boolean(TMAP_KEY),
    mode: TMAP_KEY ? 'live' : 'simulation',
  })
})

app.use('/api/tmap', createProxyMiddleware({
  target: 'https://apis.openapi.sk.com',
  changeOrigin: true,
  pathRewrite: { '^/api/tmap': '/tmap' },
  on: {
    proxyReq: (proxyReq, req) => {
      // Web SDK 키는 브라우저의 Origin 헤더로 도메인 검증 → 브라우저가 보낸 Origin/Referer를 TMAP에 그대로 전달
      if (TMAP_KEY) proxyReq.setHeader('appKey', TMAP_KEY)
      const origin = req.headers['origin'] || req.headers['referer']
      if (origin) {
        try {
          const url = new URL(origin)
          proxyReq.setHeader('origin', url.origin)
          proxyReq.setHeader('referer', origin)
        } catch {
          proxyReq.setHeader('origin', origin)
        }
      }
    },
  },
}))

app.use(express.static(join(__dirname, 'dist')))

app.use((_, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`T맵 서버 실행 중: http://localhost:${PORT}`)
  console.log(`T-map API 키: ${TMAP_KEY ? '설정됨' : '미설정 (시뮬레이션 모드)'}`)
})
