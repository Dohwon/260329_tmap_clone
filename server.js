import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000
const TMAP_KEY = process.env.VITE_TMAP_API_KEY || ''

// T-map API 프록시 — 브라우저 CORS 우회, API 키 서버에서 주입
app.use('/api/tmap', createProxyMiddleware({
  target: 'https://apis.openapi.sk.com',
  changeOrigin: true,
  pathRewrite: { '^/api/tmap': '/tmap' },
  on: {
    proxyReq: (proxyReq, req) => {
      // API 키를 서버에서 주입 (클라이언트에 노출 안 됨)
      proxyReq.setHeader('appKey', TMAP_KEY)
      // 쿼리에 appKey가 있으면 제거 (중복 방지)
      const url = new URL('https://dummy' + req.url)
      url.searchParams.delete('appKey')
      proxyReq.path = proxyReq.path.replace(/([?&])appKey=[^&]*/g, '')
        .replace(/[?&]$/, '')
    },
  },
}))

// 빌드된 정적 파일 서빙
app.use(express.static(join(__dirname, 'dist')))

// SPA 라우팅 — 모든 경로를 index.html로
app.use((_, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`T맵 서버 실행 중: http://localhost:${PORT}`)
  console.log(`T-map API 키: ${TMAP_KEY ? '설정됨' : '미설정 (시뮬레이션 모드)'}`)
})
