import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import https from 'https'
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

// 진단 엔드포인트: TMAP API 직접 테스트 (서버→TMAP 간 연결 확인)
app.get('/api/meta/tmap-diag', (req, res) => {
  if (!TMAP_KEY) {
    return res.json({ ok: false, reason: 'TMAP_API_KEY 환경변수 미설정', key: '' })
  }

  const origin = req.headers['origin'] || req.headers['referer'] || `https://${req.headers['host']}`
  const body = JSON.stringify({
    startX: '126.9783882', startY: '37.5666103',
    endX: '129.0756416', endY: '35.1795543',
    reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
    searchOption: '0', carType: 0,
  })

  const options = {
    hostname: 'apis.openapi.sk.com',
    path: '/tmap/routes?version=1',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'appKey': TMAP_KEY,
      'origin': origin,
      'referer': origin,
      'Content-Length': Buffer.byteLength(body),
    },
  }

  const request = https.request(options, (response) => {
    let data = ''
    response.on('data', (chunk) => { data += chunk })
    response.on('end', () => {
      let parsed = {}
      try { parsed = JSON.parse(data) } catch { parsed = { raw: data.slice(0, 300) } }
      res.json({
        ok: response.statusCode === 200,
        status: response.statusCode,
        keyPreview: TMAP_KEY ? `${TMAP_KEY.slice(0, 6)}...` : '없음',
        originSent: origin,
        body: parsed,
      })
    })
  })
  request.on('error', (err) => res.json({ ok: false, reason: err.message }))
  request.write(body)
  request.end()
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
