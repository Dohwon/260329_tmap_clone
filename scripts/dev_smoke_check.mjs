const DEFAULT_BASE_URL = 'https://260329tmapclone-development.up.railway.app'
const baseUrl = String(process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')

function log(status, label, detail = '') {
  const suffix = detail ? ` - ${detail}` : ''
  console.log(`${status} ${label}${suffix}`)
}

async function request(path, options = {}, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') || ''
    const body = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '')
    return { ok: response.ok, status: response.status, body, contentType }
  } finally {
    clearTimeout(timer)
  }
}

const checks = [
  {
    label: 'root html',
    required: true,
    run: async () => {
      const res = await request('/')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!String(res.body).includes('<!doctype html>') && !String(res.body).includes('<html')) {
        throw new Error('html body missing')
      }
      return 'index served'
    },
  },
  {
    label: 'tmap status',
    required: true,
    run: async () => {
      const res = await request('/api/meta/tmap-status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!res.body || typeof res.body !== 'object') throw new Error('json missing')
      if (res.body.hasApiKey !== true) throw new Error(res.body.lastError || 'TMAP key unavailable')
      return `mode=${res.body.mode}`
    },
  },
  {
    label: 'route corridor',
    required: true,
    run: async () => {
      const res = await request('/api/road/corridor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: 'smoke-route',
          polyline: [
            [37.5665, 126.9780],
            [37.5671, 126.9851],
            [37.5704, 126.9921],
          ],
          progressKm: 0.1,
          radiusM: 260,
          includeLayers: ['laneCenter', 'connector', 'rampShape', 'roadBoundary'],
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const layerKeys = Object.keys(res.body?.layers ?? {})
      if (layerKeys.length === 0) throw new Error('layers missing')
      return `layers=${layerKeys.join(',')}`
    },
  },
  {
    label: 'tmap diag',
    required: false,
    run: async () => {
      const res = await request('/api/meta/tmap-diag')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return `summary=${res.body?.summary ?? 'ok'}`
    },
  },
  {
    label: 'google tts',
    required: false,
    run: async () => {
      const res = await request('/api/tts/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '스모크 테스트입니다.' }),
      })
      if (res.status === 204) return 'disabled'
      if (res.status === 200) return 'audio'
      if (res.status === 502 || res.status === 503) return `fallback-status=${res.status}`
      throw new Error(`HTTP ${res.status}`)
    },
  },
]

let requiredFailures = 0

console.log(`SMOKE baseUrl=${baseUrl}`)

for (const check of checks) {
  try {
    const detail = await check.run()
    log('PASS', check.label, detail)
  } catch (error) {
    if (check.required) {
      requiredFailures += 1
      log('FAIL', check.label, error instanceof Error ? error.message : String(error))
    } else {
      log('WARN', check.label, error instanceof Error ? error.message : String(error))
    }
  }
}

console.log('INFO manual-checks - simulator button, map rendering, navigation start flow are still visual checks')

if (requiredFailures > 0) {
  process.exitCode = 1
}
