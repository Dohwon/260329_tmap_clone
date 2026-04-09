import express from 'express'
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

// Node.js https로 TMAP에 직접 요청 (http-proxy-middleware 없이)
function tmapFetch(tmapSubPath, method, extraHeaders, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(body, 'utf8') : null
    const headers = {
      'Accept': 'application/json',
      'appKey': TMAP_KEY,
      ...extraHeaders,
    }
    if (bodyBuf) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = bodyBuf.length
    }

    const req = https.request(
      { hostname: 'apis.openapi.sk.com', path: tmapSubPath, method, headers },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, rawHeaders: res.headers, body: Buffer.concat(chunks) }))
      }
    )
    req.on('error', reject)
    if (bodyBuf) req.write(bodyBuf)
    req.end()
  })
}

// TMAP API 상태 + 빠른 진단
app.get('/api/meta/tmap-status', async (req, res) => {
  if (!TMAP_KEY) {
    return res.json({ hasApiKey: false, mode: 'simulation', lastError: 'TMAP_API_KEY 환경변수 미설정' })
  }
  try {
    const host = req.headers['host'] || 'localhost'
    const result = await tmapFetch(
      '/tmap/pois?version=1&searchKeyword=서울역&count=1&reqCoordType=WGS84GEO&resCoordType=WGS84GEO',
      'GET',
      { origin: `https://${host}`, referer: `https://${host}/` },
      null
    )
    let parsed = {}
    try { parsed = JSON.parse(result.body.toString()) } catch { /* noop */ }

    if (result.status === 200 && parsed?.searchPoiInfo) {
      return res.json({ hasApiKey: true, mode: 'live' })
    }
    const errCode = parsed?.error?.code || parsed?.error?.errorCode || parsed?.error?.message || `HTTP ${result.status}`
    return res.json({ hasApiKey: true, mode: 'simulation', lastError: errCode, _diag: { status: result.status, body: parsed } })
  } catch (err) {
    return res.json({ hasApiKey: true, mode: 'simulation', lastError: err.message })
  }
})

// TMAP API 프록시 (GET + POST 모두 처리)
// app.use 방식 → Express 4/5 모두 호환, req.url = 마운트 이후 경로+쿼리
app.use('/api/tmap', express.json({ limit: '2mb' }), async (req, res) => {
  if (!TMAP_KEY) {
    return res.status(503).json({ error: { code: 'NO_KEY', message: 'TMAP_API_KEY 환경변수 미설정' } })
  }

  const host = req.headers['host'] || 'localhost'
  const origin = req.headers['origin'] || `https://${host}`
  const referer = req.headers['referer'] || `https://${host}/`

  // req.url 은 /tmap/ 다음 경로+쿼리스트링 (ex: /routes?version=1)
  const tmapPath = '/tmap' + req.url

  const body = (req.method === 'POST' && req.body) ? JSON.stringify(req.body) : null

  console.log(`[TMAP proxy] ${req.method} ${tmapPath}`)

  try {
    const result = await tmapFetch(tmapPath, req.method, { origin, referer }, body)
    console.log(`[TMAP proxy] → ${result.status}`)
    res.status(result.status)
    res.set('Content-Type', result.rawHeaders['content-type'] || 'application/json')
    res.send(result.body)
  } catch (err) {
    console.error('[TMAP proxy] error:', err.message)
    res.status(502).json({ error: { code: 'PROXY_ERROR', message: err.message } })
  }
})

app.use(express.static(join(__dirname, 'dist')))

app.use((_, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`T맵 서버 실행 중: http://localhost:${PORT}`)
  console.log(`T-map API 키: ${TMAP_KEY ? `설정됨 (${TMAP_KEY.slice(0, 6)}...)` : '미설정'}`)
})
