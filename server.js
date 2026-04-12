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
    const keyword = encodeURIComponent('서울역')
    const result = await tmapFetch(
      `/tmap/pois?version=1&searchKeyword=${keyword}&count=1&reqCoordType=WGS84GEO&resCoordType=WGS84GEO`,
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

// TMAP 상세 진단: POI + 경로 API 둘 다 테스트
app.get('/api/meta/tmap-diag', async (req, res) => {
  const report = { key: TMAP_KEY ? `${TMAP_KEY.slice(0, 6)}...` : '미설정', tests: {} }
  if (!TMAP_KEY) {
    return res.json({ ...report, summary: 'API 키 없음 — Railway 환경변수 TMAP_API_KEY 추가 필요' })
  }

  const host = req.headers['host'] || 'localhost'
  const hdrs = { origin: `https://${host}`, referer: `https://${host}/` }

  // 1. POI 검색 (한글 URL 인코딩 필수)
  try {
    const keyword = encodeURIComponent('서울역')
    const r = await tmapFetch(`/tmap/pois?version=1&searchKeyword=${keyword}&count=1&reqCoordType=WGS84GEO&resCoordType=WGS84GEO`, 'GET', hdrs, null)
    let b = {}; try { b = JSON.parse(r.body.toString()) } catch {}
    report.tests.poi = { status: r.status, ok: r.status === 200 && !!b?.searchPoiInfo, errorCode: b?.error?.code ?? null }
  } catch (e) { report.tests.poi = { ok: false, error: e.message } }

  // 2. 경로 API — 4가지 포맷 순차 시도 (어떤 포맷이 동작하는지 확인)
  const routeFormats = [
    // 원래 동작하던 포맷 (08cfcc7) — 최우선
    { label: 'original', body: { startX:'126.9784', startY:'37.5665', endX:'127.0276', endY:'37.4979', endRpFlag:'G', carType:0, detailPosFlag:'2', reqCoordType:'WGS84GEO', resCoordType:'WGS84GEO', searchOption:'00', sort:'index', trafficInfo:'Y' } },
    { label: 'minimal', body: { startX:'126.9784', startY:'37.5665', endX:'127.0276', endY:'37.4979', reqCoordType:'WGS84GEO', resCoordType:'WGS84GEO', searchOption:'00' } },
    { label: '+trafficInfo', body: { startX:'126.9784', startY:'37.5665', endX:'127.0276', endY:'37.4979', reqCoordType:'WGS84GEO', resCoordType:'WGS84GEO', searchOption:'00', trafficInfo:'Y' } },
    { label: 'searchOption_0', body: { startX:'126.9784', startY:'37.5665', endX:'127.0276', endY:'37.4979', reqCoordType:'WGS84GEO', resCoordType:'WGS84GEO', searchOption:'0', trafficInfo:'Y' } },
  ]
  report.tests.routeFormats = {}
  for (const fmt of routeFormats) {
    try {
      const r = await tmapFetch('/tmap/routes?version=1', 'POST', hdrs, JSON.stringify(fmt.body))
      let b = {}; try { b = JSON.parse(r.body.toString()) } catch {}
      const ok = r.status === 200 && !!b?.features?.length
      report.tests.routeFormats[fmt.label] = { status: r.status, ok, errorCode: b?.error?.code ?? b?.error?.errorCode ?? null, errorMsg: b?.error?.message ?? null }
      if (ok) break  // 성공하면 중단
    } catch (e) { report.tests.routeFormats[fmt.label] = { ok: false, error: e.message } }
  }
  const workingFormat = Object.entries(report.tests.routeFormats).find(([, v]) => v.ok)?.[0] ?? null
  report.tests.routes = { ok: !!workingFormat, workingFormat, allResults: report.tests.routeFormats }

  // 3. 다중경유지 API (routeSequential30) — viaPoint 1개 포함
  try {
    const body = JSON.stringify({ startX:'126.978', startY:'37.566', startName:'출발', endX:'127.028', endY:'37.498', endName:'도착', reqCoordType:'WGS84GEO', resCoordType:'WGS84GEO', carType:'0', startTime:new Date().toISOString().slice(0,16).replace(/[-:T]/g,''), viaPoints:[{ viaPointId:'test-0', viaPointName:'서울시청', viaX:'126.9784', viaY:'37.5663', viaTime:'0' }] })
    const r = await tmapFetch('/tmap/routes/routeSequential30?version=1', 'POST', hdrs, body)
    let b = {}; try { b = JSON.parse(r.body.toString()) } catch {}
    report.tests.sequential = { status: r.status, ok: r.status === 200 && !!b?.features?.length, errorCode: b?.error?.code ?? b?.error?.errorCode ?? null, errorMsg: b?.error?.message ?? null }
  } catch (e) { report.tests.sequential = { ok: false, error: e.message } }

  const allOk = report.tests.poi?.ok && report.tests.routes?.ok
  report.summary = allOk
    ? `정상 (POI ✅, 경로 ✅, 다중경유지 ${report.tests.sequential?.ok ? '✅' : '❌ — 이 티어에서 미지원 가능'})`
    : `오류 — POI:${report.tests.poi?.ok?'✅':'❌'} 경로:${report.tests.routes?.ok?'✅':'❌'} / errorCode: ${report.tests.routes?.errorCode ?? report.tests.poi?.errorCode}`

  res.json(report)
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

app.get(['/sw.js', '/registerSW.js', '/workbox-:hash.js'], (_, res) => {
  res.status(404).type('text/plain').send('Not found')
})

app.use((_, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`T맵 서버 실행 중: http://localhost:${PORT}`)
  console.log(`T-map API 키: ${TMAP_KEY ? `설정됨 (${TMAP_KEY.slice(0, 6)}...)` : '미설정'}`)
})
