import express from 'express'
import https from 'https'
import fs from 'fs'
import crypto from 'crypto'
import proj4 from 'proj4'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { HIGHWAYS } from './src/data/highwayData.js'

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
const OPINET_KEY = process.env.OPINET_API_KEY || process.env.VITE_OPINET_API_KEY || localEnv.OPINET_API_KEY || localEnv.VITE_OPINET_API_KEY || ''
const MEDICAL_DATA_KEY = process.env.MEDICAL_DATA_API_KEY
  || process.env.DATA_GO_KR_API_KEY
  || process.env.PUBLIC_DATA_API_KEY
  || localEnv.MEDICAL_DATA_API_KEY
  || localEnv.DATA_GO_KR_API_KEY
  || localEnv.PUBLIC_DATA_API_KEY
  || ''
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY
  || process.env.GOOGLE_MAPS_API_KEY
  || localEnv.GOOGLE_PLACES_API_KEY
  || localEnv.GOOGLE_MAPS_API_KEY
  || ''
const GOOGLE_TTS_KEY = process.env.GOOGLE_TTS_API_KEY
  || process.env.GOOGLE_API_KEY
  || localEnv.GOOGLE_TTS_API_KEY
  || localEnv.GOOGLE_API_KEY
  || ''
const ITS_KEY = process.env.ITS_API_KEY
  || localEnv.ITS_API_KEY
  || ''
const GOOGLE_TTS_VOICE = process.env.GOOGLE_TTS_VOICE_NAME
  || localEnv.GOOGLE_TTS_VOICE_NAME
  || 'ko-KR-Chirp3-HD-Despina'
const DEFAULT_RUNTIME_CACHE_ROOT = fs.existsSync('/data')
  ? '/data'
  : join(__dirname, '.runtime-cache')
const TTS_CACHE_DIR = process.env.TTS_CACHE_DIR
  || localEnv.TTS_CACHE_DIR
  || join(DEFAULT_RUNTIME_CACHE_ROOT, 'tts-google')

const WGS84 = 'EPSG:4326'
const KATEC = 'KATEC'
const ACTUAL_META_CACHE = new Map()
const ACTUAL_META_CACHE_TTL_MS = 1000 * 60 * 10
const TMAP_CAMERA_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24

proj4.defs(
  KATEC,
  '+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs'
)

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

function opinetFetch(opinetSubPath, query = {}) {
  return new Promise((resolve, reject) => {
    const path = `/api/${opinetSubPath}?${new URLSearchParams({
      out: 'json',
      certkey: OPINET_KEY,
      ...query,
    }).toString()}`

    const req = https.request(
      { hostname: 'www.opinet.co.kr', path, method: 'GET', headers: { Accept: 'application/json' } },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, rawHeaders: res.headers, body: Buffer.concat(chunks) }))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function publicDataFetch(servicePath, query = {}) {
  return new Promise((resolve, reject) => {
    const path = `${servicePath}?${new URLSearchParams({
      serviceKey: MEDICAL_DATA_KEY,
      ...query,
    }).toString()}`

    const req = https.request(
      { hostname: 'apis.data.go.kr', path, method: 'GET', headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' } },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, rawHeaders: res.headers, body: Buffer.concat(chunks) }))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function googlePlacesFetch(googlePath, method, extraHeaders, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(body, 'utf8') : null
    const headers = {
      Accept: 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
      ...extraHeaders,
    }
    if (bodyBuf) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = bodyBuf.length
    }

    const req = https.request(
      { hostname: 'places.googleapis.com', path: googlePath, method, headers },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, rawHeaders: res.headers, body: Buffer.concat(chunks) }))
      }
    )
    req.on('error', reject)
    if (bodyBuf) req.write(bodyBuf)
    req.end()
  })
}

function googleTtsFetch(path, method, extraHeaders, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(body, 'utf8') : null
    const headers = {
      Accept: 'application/json',
      ...extraHeaders,
    }
    if (bodyBuf) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = bodyBuf.length
    }

    const req = https.request(
      { hostname: 'texttospeech.googleapis.com', path, method, headers },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, rawHeaders: res.headers, body: Buffer.concat(chunks) }))
      }
    )
    req.on('error', reject)
    if (bodyBuf) req.write(bodyBuf)
    req.end()
  })
}

function itsFetch(servicePath, query = {}) {
  return new Promise((resolve, reject) => {
    const path = `${servicePath}?${new URLSearchParams({
      apiKey: ITS_KEY,
      getType: 'json',
      ...query,
    }).toString()}`

    const req = https.request(
      { hostname: 'openapi.its.go.kr', port: 9443, path, method: 'GET', headers: { Accept: 'application/json' } },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, rawHeaders: res.headers, body: Buffer.concat(chunks) }))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function publicStandardDataFetch(servicePath, query = {}) {
  return new Promise((resolve, reject) => {
    const path = `${servicePath}?${new URLSearchParams({
      serviceKey: MEDICAL_DATA_KEY,
      type: 'json',
      ...query,
    }).toString()}`

    const req = https.request(
      { hostname: 'api.data.go.kr', path, method: 'GET', headers: { Accept: 'application/json' } },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, rawHeaders: res.headers, body: Buffer.concat(chunks) }))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function withQuery(path, query = {}) {
  const params = new URLSearchParams(query)
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function normalizeTtsText(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim()
}

function buildTtsCacheKey({ text = '', voiceName = '', languageCode = '', speakingRate = 1 }) {
  const normalizedText = normalizeTtsText(text)
  const normalizedVoiceName = String(voiceName).trim()
  const normalizedLanguageCode = String(languageCode).trim()
  const normalizedRate = Number.isFinite(Number(speakingRate)) ? Number(speakingRate).toFixed(2) : '1.00'
  return crypto.createHash('sha1')
    .update(JSON.stringify({
      text: normalizedText,
      voiceName: normalizedVoiceName,
      languageCode: normalizedLanguageCode,
      speakingRate: normalizedRate,
    }))
    .digest('hex')
}

function getTtsCacheFilePath(cacheKey) {
  ensureDirSync(TTS_CACHE_DIR)
  return join(TTS_CACHE_DIR, `${cacheKey}.mp3`)
}

function readCachedTtsBuffer(cacheKey) {
  try {
    const filepath = getTtsCacheFilePath(cacheKey)
    if (!fs.existsSync(filepath)) return null
    const stats = fs.statSync(filepath)
    if (!stats.isFile() || stats.size <= 0) return null
    return fs.readFileSync(filepath)
  } catch {
    return null
  }
}

function writeCachedTtsBuffer(cacheKey, buffer) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return
    const filepath = getTtsCacheFilePath(cacheKey)
    fs.writeFileSync(filepath, buffer)
  } catch (error) {
    console.warn('[Google TTS cache] write failed:', error.message)
  }
}

function summarizeTmapBody(rawBody = null) {
  if (!rawBody) return null
  try {
    const parsed = JSON.parse(rawBody)
    return {
      startX: parsed.startX ?? null,
      startY: parsed.startY ?? null,
      endX: parsed.endX ?? null,
      endY: parsed.endY ?? null,
      searchOption: parsed.searchOption ?? null,
      viaPointCount: Array.isArray(parsed.viaPoints) ? parsed.viaPoints.length : 0,
    }
  } catch {
    return null
  }
}

function buildEmptyPoiResponse() {
  return {
    searchPoiInfo: {
      totalCount: '0',
      count: '0',
      page: '1',
      pois: {
        poi: [],
      },
    },
  }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function normalizeCoordPair(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return null
  const lat = Number(coord[0])
  const lng = Number(coord[1])
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null
}

function normalizeRoadQueryText(value = '') {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/고속도로|국도|지방도|도시고속|자동차전용도로/g, '')
    .replace(/[()\-_/.,]/g, '')
}

function normalizePolyline(polyline = []) {
  return (polyline ?? [])
    .map((point) => normalizeCoordPair(point))
    .filter(Boolean)
}

function samplePolyline(polyline = [], limit = 160) {
  if (!Array.isArray(polyline) || polyline.length <= limit) return polyline
  return Array.from({ length: limit }, (_, index) => {
    const ratio = index / Math.max(1, limit - 1)
    return polyline[Math.min(polyline.length - 1, Math.round((polyline.length - 1) * ratio))]
  })
}

function distanceKmToPolyline(lat, lng, polyline = []) {
  if (!Array.isArray(polyline) || polyline.length === 0) return null
  let best = Infinity
  for (const point of polyline) {
    if (!Array.isArray(point) || point.length < 2) continue
    const distance = haversineKm(lat, lng, point[0], point[1])
    if (distance < best) best = distance
  }
  return Number.isFinite(best) ? best : null
}

function getPolylineBounds(polyline = [], paddingDeg = 0.08) {
  const normalized = normalizePolyline(polyline)
  if (normalized.length === 0) return null
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  for (const point of normalized) {
    minLat = Math.min(minLat, point[0])
    maxLat = Math.max(maxLat, point[0])
    minLng = Math.min(minLng, point[1])
    maxLng = Math.max(maxLng, point[1])
  }

  return {
    minLat: Number((minLat - paddingDeg).toFixed(6)),
    maxLat: Number((maxLat + paddingDeg).toFixed(6)),
    minLng: Number((minLng - paddingDeg).toFixed(6)),
    maxLng: Number((maxLng + paddingDeg).toFixed(6)),
  }
}

function buildNearbyBounds(lat, lng, radiusKm = 8) {
  const safeRadiusKm = Math.max(1, Number(radiusKm) || 8)
  const latDelta = safeRadiusKm / 111
  const lngDelta = safeRadiusKm / Math.max(20, 111 * Math.cos((Number(lat) * Math.PI) / 180))
  return {
    minLat: Number((lat - latDelta).toFixed(6)),
    maxLat: Number((lat + latDelta).toFixed(6)),
    minLng: Number((lng - lngDelta).toFixed(6)),
    maxLng: Number((lng + lngDelta).toFixed(6)),
  }
}

function getRuntimeCache(cacheKey, ttlMs = ACTUAL_META_CACHE_TTL_MS) {
  const entry = ACTUAL_META_CACHE.get(cacheKey)
  if (!entry) return null
  if (Date.now() - entry.savedAt > ttlMs) {
    ACTUAL_META_CACHE.delete(cacheKey)
    return null
  }
  return entry.value
}

function setRuntimeCache(cacheKey, value) {
  ACTUAL_META_CACHE.set(cacheKey, { savedAt: Date.now(), value })
  return value
}

function extractResponseItems(parsed = null) {
  if (!parsed || typeof parsed !== 'object') return []
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed.items)) return parsed.items
  if (Array.isArray(parsed.items?.item)) return parsed.items.item
  if (Array.isArray(parsed.body?.items)) return parsed.body.items
  if (Array.isArray(parsed.body?.items?.item)) return parsed.body.items.item
  if (Array.isArray(parsed.response?.body?.items)) return parsed.response.body.items
  if (Array.isArray(parsed.response?.body?.items?.item)) return parsed.response.body.items.item
  return []
}

function buildRoadQueryCandidates(roads = []) {
  const explicit = (roads ?? [])
    .map((road) => ({
      name: String(road?.name ?? '').trim(),
      number: String(road?.number ?? '').trim(),
      roadClass: String(road?.roadClass ?? '').trim(),
    }))
    .filter((road) => road.name || road.number)

  if (explicit.length > 0) {
    return explicit.slice(0, 4)
  }

  return HIGHWAYS.slice(0, 4).map((road) => ({
    name: road.name,
    number: road.number,
    roadClass: road.roadClass,
  }))
}

function matchesRoadQuery(item = {}, query = {}) {
  const haystack = normalizeRoadQueryText([
    item.roadRouteNm,
    item.roadName,
    item.rdnmadr,
    item.lnmadr,
    item.itlpc,
    item.message,
  ].filter(Boolean).join(' '))
  const routeName = normalizeRoadQueryText(query?.name)
  const routeNumber = String(query?.number ?? '').trim()
  if (routeName && haystack.includes(routeName)) return true
  if (routeNumber && String(item?.roadRouteNo ?? item?.roadNo ?? '').trim() === routeNumber) return true
  return !routeName && !routeNumber
}

function normalizePublicCameraItem(item = {}) {
  const lat = Number(item.latitude)
  const lng = Number(item.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const roadRouteNm = String(item.roadRouteNm ?? '').trim()
  const roadRouteNo = String(item.roadRouteNo ?? '').trim()
  const regltSe = String(item.regltSe ?? '').trim()
  const sectionLength = Number(item.ovrspdRegltSctnLt)
  const speedLimit = Number(item.lmttVe)
  const isSection = /구간/.test(regltSe) || /구간/.test(String(item.regltSctnLcSe ?? ''))

  return {
    id: item.mnlssRegltCameraManageNo ?? `public-camera-${lat}-${lng}`,
    coord: [lat, lng],
    type: isSection ? 'section_start' : 'fixed',
    speedLimit: Number.isFinite(speedLimit) && speedLimit > 0 ? speedLimit : null,
    sectionLength: Number.isFinite(sectionLength) && sectionLength > 0 ? sectionLength : null,
    label: isSection ? '공공 구간단속' : '공공 지점단속',
    roadName: roadRouteNm || item.rdnmadr || '',
    roadNo: roadRouteNo || '',
    address: item.rdnmadr || item.lnmadr || '',
    enforcementType: regltSe || null,
    source: 'public-master-camera',
  }
}

function normalizeItsEventItem(item = {}) {
  const lat = Number(item.coordY)
  const lng = Number(item.coordX)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    id: item.eventId ?? `${item.linkId ?? 'event'}-${lat}-${lng}-${item.startDate ?? ''}`,
    lat,
    lng,
    coord: [lat, lng],
    eventType: item.eventType ?? '기타돌발',
    eventDetailType: item.eventDetailType ?? '',
    roadName: item.roadName ?? '',
    roadNo: item.roadNo ?? '',
    roadDrcType: item.roadDrcType ?? '',
    message: item.message ?? '',
    lanesBlockType: item.lanesBlockType ?? '',
    lanesBlocked: item.lanesBlocked ?? '',
    startDate: item.startDate ?? null,
    endDate: item.endDate ?? null,
    source: 'its-event',
  }
}

async function fetchPublicMasterCameras({ roads = [], polyline = [] } = {}) {
  if (!MEDICAL_DATA_KEY) return []

  const normalizedPolyline = samplePolyline(normalizePolyline(polyline), 180)
  const queries = buildRoadQueryCandidates(roads)
  if (queries.length === 0) return []

  const cacheKey = JSON.stringify({
    type: 'public-master-cameras',
    roads: queries.map((query) => `${query.name}:${query.number}:${query.roadClass}`),
    polyline: normalizedPolyline.slice(0, 40),
  })
  const cached = getRuntimeCache(cacheKey)
  if (cached) return cached

  const collected = []
  for (const query of queries) {
    const requestQuery = {
      pageNo: '1',
      numOfRows: '200',
      type: 'json',
    }
    if (query.name) requestQuery.roadRouteNm = query.name
    if (query.number) requestQuery.roadRouteNo = query.number

    try {
      const response = await publicStandardDataFetch('/openapi/tn_pubr_public_unmanned_traffic_camera_api', requestQuery)
      const parsed = parseJsonBuffer(response.body)
      const items = extractResponseItems(parsed)
      const normalized = items
        .map(normalizePublicCameraItem)
        .filter(Boolean)
        .filter((item) => matchesRoadQuery(item, query))
        .filter((item) => {
          const distance = distanceKmToPolyline(item.coord[0], item.coord[1], normalizedPolyline)
          return distance != null && distance <= 0.7
        })

      collected.push(...normalized)
    } catch {
      // 다음 도로 계속
    }
  }

  const deduped = collected.filter((item, index, all) =>
    all.findIndex((other) =>
      other.id === item.id ||
      haversineKm(other.coord[0], other.coord[1], item.coord[0], item.coord[1]) <= 0.05
    ) === index
  )

  return setRuntimeCache(cacheKey, deduped.slice(0, 180))
}

async function fetchItsRoadEvents({ bounds = null, roads = [] } = {}) {
  if (!ITS_KEY || !bounds) return []

  const queries = buildRoadQueryCandidates(roads)
  const cacheKey = JSON.stringify({
    type: 'its-events',
    bounds,
    roads: queries.map((query) => `${query.name}:${query.number}:${query.roadClass}`),
  })
  const cached = getRuntimeCache(cacheKey, 1000 * 60 * 3)
  if (cached) return cached

  try {
    const response = await itsFetch('/eventInfo', {
      type: 'all',
      eventType: 'all',
      minX: String(bounds.minLng),
      maxX: String(bounds.maxLng),
      minY: String(bounds.minLat),
      maxY: String(bounds.maxLat),
    })
    const parsed = parseJsonBuffer(response.body)
    const items = extractResponseItems(parsed)
    const normalized = items
      .map(normalizeItsEventItem)
      .filter(Boolean)
      .filter((item) => queries.some((query) => matchesRoadQuery(item, query)))
    return setRuntimeCache(cacheKey, normalized.slice(0, 120))
  } catch {
    return []
  }
}

async function buildRoadActualMeta({ roads = [], polyline = [], nearbyCenter = null, nearbyRadiusKm = 8 } = {}) {
  const normalizedPolyline = samplePolyline(normalizePolyline(polyline), 220)
  const bounds = normalizedPolyline.length > 0
    ? getPolylineBounds(normalizedPolyline, 0.08)
    : (nearbyCenter && Number.isFinite(nearbyCenter.lat) && Number.isFinite(nearbyCenter.lng)
      ? buildNearbyBounds(nearbyCenter.lat, nearbyCenter.lng, nearbyRadiusKm)
      : null)

  const [cameras, events] = await Promise.all([
    normalizedPolyline.length > 1
      ? fetchPublicMasterCameras({ roads, polyline: normalizedPolyline })
      : Promise.resolve([]),
    fetchItsRoadEvents({ bounds, roads }),
  ])

  const filteredEvents = events.filter((event) => {
    if (normalizedPolyline.length > 1) {
      const distance = distanceKmToPolyline(event.lat, event.lng, normalizedPolyline)
      return distance != null && distance <= 1.2
    }
    if (nearbyCenter && Number.isFinite(nearbyCenter.lat) && Number.isFinite(nearbyCenter.lng)) {
      return haversineKm(nearbyCenter.lat, nearbyCenter.lng, event.lat, event.lng) <= nearbyRadiusKm
    }
    return true
  })

  return {
    cameras,
    events: filteredEvents.slice(0, 40),
    coverage: {
      cameraSource: MEDICAL_DATA_KEY ? 'public-master' : 'unavailable',
      eventSource: ITS_KEY ? 'its-live' : 'unavailable',
      cameraTtlHours: TMAP_CAMERA_CACHE_MAX_AGE_MS / (1000 * 60 * 60),
    },
  }
}

function parseJsonBuffer(buffer) {
  try {
    return JSON.parse(buffer.toString())
  } catch {
    return null
  }
}

function decodeXmlEntities(value = '') {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .trim()
}

function extractXmlItems(xml = '') {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1])
}

function extractXmlTag(xml = '', tag = '') {
  const match = String(xml).match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? decodeXmlEntities(match[1]) : ''
}

function wgs84ToKatec(lat, lng) {
  const [x, y] = proj4(WGS84, KATEC, [Number(lng), Number(lat)])
  return { x, y }
}

function katecToWgs84(x, y) {
  const [lng, lat] = proj4(KATEC, WGS84, [Number(x), Number(y)])
  return { lat, lng }
}

function mapBrand(brandCode) {
  const brandMap = {
    SKE: 'SK에너지',
    GSC: 'GS칼텍스',
    SOL: 'S-OIL',
    HDO: 'HD현대오일뱅크',
    RTO: '알뜰주유소',
    RTX: '고속도로 알뜰주유소',
    NHO: '농협 알뜰주유소',
    ETC: '자가상표',
    E1G: 'E1',
    SKG: 'SK가스',
  }
  return brandMap[String(brandCode ?? '').toUpperCase()] ?? brandCode ?? ''
}

function normalizeFuelText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/주식회사|㈜|\(주\)|\s+/g, '')
    .replace(/[-_/.,]/g, '')
}

function buildFuelSearchHaystack(row) {
  return normalizeFuelText([
    row?.OS_NM,
    row?.name,
    row?.VAN_ADR,
    row?.NEW_ADR,
    row?.address,
    mapBrand(row?.POLL_DIV_CO ?? row?.POLL_DIV_CD),
  ].filter(Boolean).join(' '))
}

function normalizeOpinetStation(row) {
  if (!row) return null
  const x = row.GIS_X_COOR ?? row.GIS_X
  const y = row.GIS_Y_COOR ?? row.GIS_Y
  if (!x || !y) return null

  const { lat, lng } = katecToWgs84(x, y)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const price = Number(row.PRICE ?? row.price ?? 0)
  return {
    id: row.UNI_ID ?? row.ID ?? `fuel-${lat}-${lng}`,
    name: row.OS_NM ?? row.name ?? '주유소',
    brand: mapBrand(row.POLL_DIV_CO ?? row.POLL_DIV_CD),
    address: row.VAN_ADR ?? row.NEW_ADR ?? row.address ?? '',
    lat,
    lng,
    fuelPrice: Number.isFinite(price) && price > 0 ? price : null,
    fuelLabel: '휘발유',
    priceSource: Number.isFinite(price) && price > 0 ? 'opinet' : 'unknown',
    distanceKm: row.DISTANCE != null ? Number((Number(row.DISTANCE) / 1000).toFixed(1)) : null,
  }
}

function normalizeMedicalText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/주식회사|의료법인|의료재단|학교법인|사회복지법인|사단법인|재단법인|\(의\)|\(재\)|㈜/g, '')
    .replace(/[()\[\]\s\-_/.,]/g, '')
}

function normalizeRestaurantText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/주식회사|㈜|\(주\)|본점|직영점|점\b/g, '')
    .replace(/[()\[\]\s\-_/.,]/g, '')
}

function getAddressRegion(address = '') {
  const parts = String(address ?? '').trim().split(/\s+/).filter(Boolean)
  return {
    sido: parts[0] ?? '',
    sigungu: parts[1] ?? '',
  }
}

function formatDutyTime(value = '') {
  const compact = String(value ?? '').replace(/[^\d]/g, '')
  if (compact.length < 3) return null
  const raw = compact.length === 3 ? `0${compact}` : compact.slice(0, 4)
  const hour = Number(raw.slice(0, 2))
  const minute = Number(raw.slice(2, 4))
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (hour > 24 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function getKstNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
}

function getTodayDutyMeta(item = {}) {
  const now = getKstNow()
  const weekdayMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 0: 7 }
  const dutyIndex = weekdayMap[now.getDay()] ?? 1
  const startRaw = item[`dutyTime${dutyIndex}s`]
  const endRaw = item[`dutyTime${dutyIndex}c`]
  const start = formatDutyTime(startRaw)
  const end = formatDutyTime(endRaw)
  const todayHoursLabel = start && end ? `${start}~${end}` : null
  const nowMinutes = (now.getHours() * 60) + now.getMinutes()
  const startMinutes = start ? (Number(start.slice(0, 2)) * 60) + Number(start.slice(3, 5)) : null
  const endMinutes = end ? (Number(end.slice(0, 2)) * 60) + Number(end.slice(3, 5)) : null
  const isOpenNow = startMinutes != null && endMinutes != null && nowMinutes >= startMinutes && nowMinutes <= endMinutes
  const saturdayOpen = Boolean(formatDutyTime(item.dutyTime6s) && formatDutyTime(item.dutyTime6c))
  const sundayOpen = Boolean(formatDutyTime(item.dutyTime7s) && formatDutyTime(item.dutyTime7c))
  return {
    todayHoursLabel,
    isOpenNow,
    saturdayOpen,
    sundayOpen,
  }
}

function normalizeMedicalItem(itemXml = '') {
  const dutyName = extractXmlTag(itemXml, 'dutyName')
  const dutyAddr = extractXmlTag(itemXml, 'dutyAddr')
  const dutyTel1 = extractXmlTag(itemXml, 'dutyTel1')
  const wgs84Lat = Number(extractXmlTag(itemXml, 'wgs84Lat') || extractXmlTag(itemXml, 'lat'))
  const wgs84Lon = Number(extractXmlTag(itemXml, 'wgs84Lon') || extractXmlTag(itemXml, 'lon'))
  const raw = {
    hpid: extractXmlTag(itemXml, 'hpid'),
    dutyName,
    dutyAddr,
    dutyTel1,
    dutyDivNam: extractXmlTag(itemXml, 'dutyDivNam') || extractXmlTag(itemXml, 'dutyDivName'),
    dutyWeekendAt: extractXmlTag(itemXml, 'dutyWeekendAt'),
    dutyTime1s: extractXmlTag(itemXml, 'dutyTime1s'),
    dutyTime1c: extractXmlTag(itemXml, 'dutyTime1c'),
    dutyTime2s: extractXmlTag(itemXml, 'dutyTime2s'),
    dutyTime2c: extractXmlTag(itemXml, 'dutyTime2c'),
    dutyTime3s: extractXmlTag(itemXml, 'dutyTime3s'),
    dutyTime3c: extractXmlTag(itemXml, 'dutyTime3c'),
    dutyTime4s: extractXmlTag(itemXml, 'dutyTime4s'),
    dutyTime4c: extractXmlTag(itemXml, 'dutyTime4c'),
    dutyTime5s: extractXmlTag(itemXml, 'dutyTime5s'),
    dutyTime5c: extractXmlTag(itemXml, 'dutyTime5c'),
    dutyTime6s: extractXmlTag(itemXml, 'dutyTime6s'),
    dutyTime6c: extractXmlTag(itemXml, 'dutyTime6c'),
    dutyTime7s: extractXmlTag(itemXml, 'dutyTime7s'),
    dutyTime7c: extractXmlTag(itemXml, 'dutyTime7c'),
    dutyTime8s: extractXmlTag(itemXml, 'dutyTime8s'),
    dutyTime8c: extractXmlTag(itemXml, 'dutyTime8c'),
    wgs84Lat: Number.isFinite(wgs84Lat) ? wgs84Lat : null,
    wgs84Lon: Number.isFinite(wgs84Lon) ? wgs84Lon : null,
  }
  return {
    ...raw,
    ...getTodayDutyMeta(raw),
  }
}

function scoreMedicalMatch(source = {}, candidate = {}) {
  const sourceName = normalizeMedicalText(source.name)
  const sourceAddress = normalizeMedicalText(source.address)
  const candidateName = normalizeMedicalText(candidate.dutyName)
  const candidateAddress = normalizeMedicalText(candidate.dutyAddr)
  let score = 0

  if (sourceName && candidateName) {
    if (sourceName === candidateName) score += 120
    else if (candidateName.includes(sourceName) || sourceName.includes(candidateName)) score += 80
  }

  if (sourceAddress && candidateAddress) {
    if (sourceAddress === candidateAddress) score += 120
    else if (candidateAddress.includes(sourceAddress) || sourceAddress.includes(candidateAddress)) score += 70
    else {
      const { sido, sigungu } = getAddressRegion(source.address)
      if (candidate.dutyAddr.includes(sido)) score += 12
      if (candidate.dutyAddr.includes(sigungu)) score += 18
    }
  }

  if (Number.isFinite(source.lat) && Number.isFinite(source.lng) && Number.isFinite(candidate.wgs84Lat) && Number.isFinite(candidate.wgs84Lon)) {
    const distanceKm = Math.hypot((candidate.wgs84Lat - source.lat) * 110, (candidate.wgs84Lon - source.lng) * 88)
    score += Math.max(0, 40 - (distanceKm * 80))
  }

  return score
}

async function fetchHospitalHoursByQuery({ name = '', address = '', lat = null, lng = null }) {
  const { sido, sigungu } = getAddressRegion(address)
  const queryAttempts = [
    { Q0: sido, Q1: sigungu, QN: name, pageNo: '1', numOfRows: '8', ORD: 'NAME' },
    { Q0: sido, QN: name, pageNo: '1', numOfRows: '8', ORD: 'NAME' },
    { QN: name, pageNo: '1', numOfRows: '8', ORD: 'NAME' },
  ]

  for (const query of queryAttempts) {
    const sanitized = Object.fromEntries(Object.entries(query).filter(([, value]) => String(value ?? '').trim()))
    if (!sanitized.QN) continue

    const result = await publicDataFetch('/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire', sanitized)
    const xml = result.body.toString()
    if (result.status !== 200) continue
    const items = extractXmlItems(xml).map((itemXml) => normalizeMedicalItem(itemXml))
    if (items.length === 0) continue

    const best = items
      .map((item) => ({ ...item, _score: scoreMedicalMatch({ name, address, lat, lng }, item) }))
      .sort((a, b) => b._score - a._score)[0] ?? null

    if (best && best._score >= 60) {
      return best
    }
  }

  return null
}

function scoreRestaurantMatch(source = {}, candidate = {}) {
  const sourceName = normalizeRestaurantText(source.name)
  const sourceAddress = normalizeRestaurantText(source.address)
  const candidateName = normalizeRestaurantText(candidate.displayName)
  const candidateAddress = normalizeRestaurantText(candidate.formattedAddress)
  let score = 0

  if (sourceName && candidateName) {
    if (sourceName === candidateName) score += 120
    else if (candidateName.includes(sourceName) || sourceName.includes(candidateName)) score += 80
  }

  if (sourceAddress && candidateAddress) {
    if (candidateAddress.includes(sourceAddress) || sourceAddress.includes(candidateAddress)) score += 70
  }

  if (
    Number.isFinite(source.lat) &&
    Number.isFinite(source.lng) &&
    Number.isFinite(candidate.lat) &&
    Number.isFinite(candidate.lng)
  ) {
    const distanceKm = Math.hypot((candidate.lat - source.lat) * 110, (candidate.lng - source.lng) * 88)
    score += Math.max(0, 35 - (distanceKm * 25))
  }

  return score
}

async function fetchRestaurantMetaByQuery({ name = '', address = '', lat = null, lng = null }) {
  if (!GOOGLE_PLACES_KEY || !name) return null

  const textQueries = [
    [name, address].filter(Boolean).join(' ').trim(),
    String(name).trim(),
  ].filter(Boolean)

  for (const textQuery of textQueries) {
    const body = {
      textQuery,
      languageCode: 'ko',
      maxResultCount: 3,
      ...(Number.isFinite(lat) && Number.isFinite(lng)
        ? {
            locationBias: {
              circle: {
                center: { latitude: Number(lat), longitude: Number(lng) },
                radius: 5000,
              },
            },
          }
        : {}),
    }

    const result = await googlePlacesFetch(
      '/v1/places:searchText',
      'POST',
      {
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.currentOpeningHours,places.regularOpeningHours,places.googleMapsUri,places.location',
      },
      JSON.stringify(body)
    )

    const parsed = parseJsonBuffer(result.body)
    if (result.status !== 200 || !Array.isArray(parsed?.places) || parsed.places.length === 0) continue

    const best = parsed.places
      .map((place) => ({
        placeId: place.id ?? null,
        displayName: place.displayName?.text ?? '',
        formattedAddress: place.formattedAddress ?? '',
        rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
        userRatingCount: Number.isFinite(Number(place.userRatingCount)) ? Number(place.userRatingCount) : null,
        openNow: typeof place.currentOpeningHours?.openNow === 'boolean'
          ? place.currentOpeningHours.openNow
          : typeof place.regularOpeningHours?.openNow === 'boolean'
            ? place.regularOpeningHours.openNow
            : null,
        googleMapsUri: place.googleMapsUri ?? null,
        lat: Number(place.location?.latitude),
        lng: Number(place.location?.longitude),
      }))
      .map((candidate) => ({
        ...candidate,
        _score: scoreRestaurantMatch({ name, address, lat, lng }, candidate),
      }))
      .sort((a, b) => b._score - a._score)[0] ?? null

    if (best && best._score >= 55) {
      return {
        ...best,
        source: 'google-places',
      }
    }
  }

  return null
}

async function fetchNearbyFuelStations({ lat, lng, radius = 5000, productCode = 'B027', limit = 8, keyword = '' }) {
  const { x, y } = wgs84ToKatec(lat, lng)
  const result = await opinetFetch('aroundAll.do', {
    x: String(Math.round(x)),
    y: String(Math.round(y)),
    radius: String(Math.max(1000, Math.min(5000, Number(radius ?? 5000)))),
    prodcd: productCode,
    sort: '1',
  })

  const parsed = parseJsonBuffer(result.body)
  if (result.status !== 200 || !parsed?.RESULT) {
    const error = new Error(parsed?.RESULT?.ERRCD || parsed?.RESULT?.ERR_MSG || '오피넷 응답을 처리하지 못했습니다.')
    error.status = result.status ?? 502
    error.payload = parsed
    throw error
  }

  const stations = (parsed.RESULT?.OIL ?? [])
    .map(normalizeOpinetStation)
    .filter(Boolean)

  const compactKeyword = normalizeFuelText(keyword)
  const filtered = compactKeyword
    ? stations.filter((station) => buildFuelSearchHaystack(station).includes(compactKeyword))
    : stations

  return {
    source: 'opinet',
    productCode,
    radius: Math.max(1000, Math.min(5000, Number(radius ?? 5000))),
    items: (filtered.length > 0 ? filtered : stations).slice(0, limit),
  }
}

app.get('/api/fuel/nearby', async (req, res) => {
  if (!OPINET_KEY) {
    return res.status(503).json({ error: { code: 'NO_OPINET_KEY', message: 'OPINET_API_KEY 환경변수 미설정' } })
  }

  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const radius = Math.max(1000, Math.min(5000, Number(req.query.radius ?? 5000)))
  const productCode = String(req.query.productCode ?? 'B027')
  const limit = Math.max(1, Math.min(12, Number(req.query.limit ?? 8)))
  const keyword = String(req.query.keyword ?? '')

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: { code: 'INVALID_COORD', message: 'lat/lng가 필요합니다.' } })
  }

  try {
    const payload = await fetchNearbyFuelStations({
      lat,
      lng,
      radius,
      productCode,
      limit,
      keyword,
    })
    return res.json(payload)
  } catch (error) {
    return res.status(error.status ?? 502).json(error.payload ?? { error: { code: 'OPINET_PROXY_ERROR', message: error.message } })
  }
})

app.post('/api/fuel/rest-prices', express.json({ limit: '1mb' }), async (req, res) => {
  if (!OPINET_KEY) {
    return res.status(503).json({ error: { code: 'NO_OPINET_KEY', message: 'OPINET_API_KEY 환경변수 미설정' } })
  }

  const stops = Array.isArray(req.body?.stops) ? req.body.stops.slice(0, 4) : []
  const productCode = String(req.body?.productCode ?? 'B027')
  if (stops.length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_STOPS', message: 'stops 배열이 필요합니다.' } })
  }

  try {
    const items = await Promise.all(stops.map(async (stop) => {
      const lat = Number(stop?.lat)
      const lng = Number(stop?.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

      const payload = await fetchNearbyFuelStations({
        lat,
        lng,
        radius: 2500,
        productCode,
        limit: 6,
        keyword: stop?.name ?? '',
      }).catch(() => ({ items: [] }))

      const normalizedStopName = normalizeFuelText(stop?.name)
      const best = (payload.items ?? [])
        .map((station) => {
          const distanceKm = Number.isFinite(station.distanceKm)
            ? station.distanceKm
            : Math.hypot((station.lat - lat) * 110, (station.lng - lng) * 88)
          const text = normalizeFuelText(`${station.name} ${station.address} ${station.brand}`)
          const nameMatch = normalizedStopName && (text.includes(normalizedStopName) || normalizedStopName.includes(normalizeFuelText(station.name)))
          const roadMatch = /휴게소|졸음쉼터|고속도로/.test(`${station.name} ${station.address}`)
          const score = (nameMatch ? 80 : 0) + (roadMatch ? 35 : 0) - (distanceKm * 18)
          return { ...station, matchScore: score }
        })
        .sort((a, b) => b.matchScore - a.matchScore)[0] ?? null

      return {
        stopId: stop.id ?? `${lat}-${lng}`,
        stopName: stop.name ?? '휴게소',
        lat,
        lng,
        station: best && Number(best.distanceKm) <= 3 ? best : null,
      }
    }))

    return res.json({
      source: 'opinet',
      productCode,
      items: items.filter(Boolean),
    })
  } catch (error) {
    return res.status(502).json({ error: { code: 'OPINET_REST_PRICE_ERROR', message: error.message } })
  }
})

async function handleHospitalHoursRequest(items = [], res) {
  if (!MEDICAL_DATA_KEY) {
    return res.status(503).json({ error: { code: 'NO_MEDICAL_DATA_KEY', message: 'DATA_GO_KR_API_KEY 환경변수 미설정' } })
  }

  if (items.length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_ITEMS', message: 'items 배열이 필요합니다.' } })
  }

  try {
    const results = await Promise.all(items.map(async (item) => {
      const match = await fetchHospitalHoursByQuery({
        name: item?.name,
        address: item?.address,
        lat: Number(item?.lat),
        lng: Number(item?.lng),
      }).catch(() => null)

      return {
        sourceId: item?.id ?? null,
        hospital: match ? {
          hpid: match.hpid,
          dutyName: match.dutyName,
          dutyAddr: match.dutyAddr,
          dutyTel1: match.dutyTel1,
          dutyDivNam: match.dutyDivNam,
          todayHoursLabel: match.todayHoursLabel,
          isOpenNow: match.isOpenNow,
          saturdayOpen: match.saturdayOpen,
          sundayOpen: match.sundayOpen,
          dutyWeekendAt: match.dutyWeekendAt,
          source: 'public-medical-data',
        } : null,
      }
    }))

    return res.json({
      source: 'public-medical-data',
      items: results,
    })
  } catch (error) {
    return res.status(502).json({ error: { code: 'MEDICAL_PROXY_ERROR', message: error.message } })
  }
}

async function handleRestaurantRatingsRequest(items = [], res) {
  if (!GOOGLE_PLACES_KEY) {
    return res.status(503).json({ error: { code: 'NO_GOOGLE_PLACES_KEY', message: 'GOOGLE_PLACES_API_KEY 환경변수 미설정' } })
  }

  if (items.length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_ITEMS', message: 'items 배열이 필요합니다.' } })
  }

  try {
    const results = await Promise.all(items.map(async (item) => {
      const match = await fetchRestaurantMetaByQuery({
        name: item?.name,
        address: item?.address,
        lat: Number(item?.lat),
        lng: Number(item?.lng),
      }).catch(() => null)

      return {
        sourceId: item?.id ?? null,
        restaurant: match ? {
          placeId: match.placeId,
          displayName: match.displayName,
          formattedAddress: match.formattedAddress,
          rating: match.rating,
          userRatingCount: match.userRatingCount,
          openNow: match.openNow,
          googleMapsUri: match.googleMapsUri,
          source: match.source,
        } : null,
      }
    }))

    return res.json({
      source: 'google-places',
      items: results,
    })
  } catch (error) {
    return res.status(502).json({ error: { code: 'GOOGLE_PLACES_PROXY_ERROR', message: error.message } })
  }
}

app.get('/api/medical/hospital-hours', async (req, res) => {
  let items = []
  try {
    items = JSON.parse(String(req.query.items ?? '[]'))
  } catch {
    items = []
  }
  return handleHospitalHoursRequest(Array.isArray(items) ? items.slice(0, 8) : [], res)
})

app.post('/api/medical/hospital-hours', express.json({ limit: '1mb' }), async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 8) : []
  return handleHospitalHoursRequest(items, res)
})

app.get('/api/meta/hospital-hours', async (req, res) => {
  let items = []
  try {
    items = JSON.parse(String(req.query.items ?? '[]'))
  } catch {
    items = []
  }
  return handleHospitalHoursRequest(Array.isArray(items) ? items.slice(0, 8) : [], res)
})

// TMAP API 상태 + 빠른 진단
app.post('/api/meta/tmap-status', express.json({ limit: '1mb' }), async (req, res) => {
  const meta = String(req.body?.meta ?? '')
  if (meta === 'restaurantRatings') {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 12) : []
    return handleRestaurantRatingsRequest(items, res)
  }
  return res.status(400).json({ error: { code: 'INVALID_META', message: '지원하지 않는 meta 요청입니다.' } })
})

app.get('/api/meta/tmap-status', async (req, res) => {
  if (String(req.query.meta ?? '') === 'hospitalHours') {
    let items = []
    try {
      items = JSON.parse(String(req.query.items ?? '[]'))
    } catch {
      items = []
    }
    return handleHospitalHoursRequest(Array.isArray(items) ? items.slice(0, 8) : [], res)
  }
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

app.get('/api/road/events/nearby', async (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const radiusKm = Math.max(1, Math.min(30, Number(req.query.radiusKm ?? req.query.radius ?? 8)))

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: { code: 'INVALID_COORD', message: 'lat/lng가 필요합니다.' } })
  }

  try {
    const meta = await buildRoadActualMeta({
      roads: [],
      polyline: [],
      nearbyCenter: { lat, lng },
      nearbyRadiusKm: radiusKm,
    })
    return res.json({
      source: meta.coverage.eventSource,
      radiusKm,
      items: meta.events,
    })
  } catch (error) {
    return res.status(502).json({ error: { code: 'ROAD_EVENT_PROXY_ERROR', message: error.message } })
  }
})

app.post('/api/road/actual-meta', express.json({ limit: '1mb' }), async (req, res) => {
  const routes = Array.isArray(req.body?.routes) ? req.body.routes.slice(0, 3) : []
  if (routes.length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_ROUTES', message: 'routes 배열이 필요합니다.' } })
  }

  try {
    const items = await Promise.all(routes.map(async (route) => {
      const polyline = normalizePolyline(route?.polyline)
      const roads = Array.isArray(route?.roads) ? route.roads.slice(0, 6) : []
      const meta = await buildRoadActualMeta({ roads, polyline })
      return {
        routeId: route?.routeId ?? null,
        cameras: meta.cameras,
        events: meta.events,
        coverage: meta.coverage,
      }
    }))

    return res.json({
      items,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return res.status(502).json({ error: { code: 'ROAD_ACTUAL_META_ERROR', message: error.message } })
  }
})

app.post('/api/tts/google', express.json({ limit: '256kb' }), async (req, res) => {
  if (!GOOGLE_TTS_KEY) return res.status(204).end()

  const text = normalizeTtsText(req.body?.text ?? '')
  if (!text) return res.status(400).json({ error: { code: 'EMPTY_TEXT', message: 'text가 비어 있습니다.' } })

  const voiceName = String(req.body?.voiceName ?? GOOGLE_TTS_VOICE).trim() || GOOGLE_TTS_VOICE
  const languageCode = String(req.body?.languageCode ?? (voiceName.split('-').slice(0, 2).join('-') || 'ko-KR'))
  const speakingRate = Number.isFinite(Number(req.body?.speakingRate)) ? Number(req.body.speakingRate) : 1.02
  const cacheKey = buildTtsCacheKey({ text, voiceName, languageCode, speakingRate })
  const cachedBuffer = readCachedTtsBuffer(cacheKey)

  if (cachedBuffer) {
    return res
      .set('Content-Type', 'audio/mpeg')
      .set('Cache-Control', 'public, max-age=31536000, immutable')
      .set('X-TTS-Cache', 'HIT')
      .send(cachedBuffer)
  }

  try {
    const result = await googleTtsFetch(
      withQuery('/v1/text:synthesize', { key: GOOGLE_TTS_KEY }),
      'POST',
      {},
      JSON.stringify({
        input: { text: text.slice(0, 500) },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: 'MP3', speakingRate },
      })
    )

    const parsed = parseJsonBuffer(result.body)
    if (result.status !== 200 || !parsed?.audioContent) {
      return res.status(result.status || 502).json({
        error: {
          code: 'GOOGLE_TTS_FAILED',
          message: parsed?.error?.message ?? `HTTP ${result.status}`,
        },
      })
    }

    const audioBuffer = Buffer.from(parsed.audioContent, 'base64')
    writeCachedTtsBuffer(cacheKey, audioBuffer)

    return res
      .set('Content-Type', 'audio/mpeg')
      .set('Cache-Control', 'public, max-age=31536000, immutable')
      .set('X-TTS-Cache', 'MISS')
      .send(audioBuffer)
  } catch (error) {
    return res.status(502).json({ error: { code: 'GOOGLE_TTS_PROXY_ERROR', message: error.message } })
  }
})

app.get('/api/tmap/road/nearestRoad', async (req, res, next) => {
  if (!TMAP_KEY) {
    return res.status(503).json({ error: { code: 'NO_KEY', message: 'TMAP_API_KEY 환경변수 미설정' } })
  }

  const host = req.headers['host'] || 'localhost'
  const origin = req.headers['origin'] || `https://${host}`
  const referer = req.headers['referer'] || `https://${host}/`
  const query = new URLSearchParams(req.query).toString()
  const tmapPath = `/tmap/road/nearestRoad${query ? `?${query}` : ''}`

  try {
    const result = await tmapFetch(tmapPath, 'GET', { origin, referer }, null)
    if (Number(result.status) >= 400) {
      let parsed = null
      try { parsed = JSON.parse(result.body.toString()) } catch { /* noop */ }
      console.warn('[TMAP nearestRoad] fallback to null coordinate', {
        status: result.status,
        errorCode: parsed?.error?.code ?? parsed?.error?.errorCode ?? null,
        errorMessage: parsed?.error?.message ?? parsed?.error?.errorMessage ?? null,
      })
      return res.status(200).json({ resultData: { coordinate: null }, fallback: 'nearest-road-disabled' })
    }
    res.status(result.status)
    res.set('Content-Type', result.rawHeaders['content-type'] || 'application/json')
    return res.send(result.body)
  } catch (error) {
    return next(error)
  }
})

app.get('/api/tmap/pois', async (req, res, next) => {
  const searchKeyword = String(req.query.searchKeyword ?? '')
  const shouldAbsorbBroadCategory400 = ['음식점', '맛집', '주유소', '휴게소', '주차장', '병원', '초등학교', '유치원', '방지턱'].includes(searchKeyword)

  if (!TMAP_KEY) {
    return res.status(503).json({ error: { code: 'NO_KEY', message: 'TMAP_API_KEY 환경변수 미설정' } })
  }

  const host = req.headers['host'] || 'localhost'
  const origin = req.headers['origin'] || `https://${host}`
  const referer = req.headers['referer'] || `https://${host}/`
  const query = new URLSearchParams(req.query).toString()
  const tmapPath = `/tmap/pois${query ? `?${query}` : ''}`

  try {
    const result = await tmapFetch(tmapPath, 'GET', { origin, referer }, null)
    if (shouldAbsorbBroadCategory400 && Number(result.status) >= 400) {
      let parsed = null
      try { parsed = JSON.parse(result.body.toString()) } catch { /* noop */ }
      console.warn('[TMAP pois] fallback to empty response', {
        status: result.status,
        searchKeyword,
        errorCode: parsed?.error?.code ?? parsed?.error?.errorCode ?? null,
        errorMessage: parsed?.error?.message ?? parsed?.error?.errorMessage ?? null,
      })
      return res.status(200).json(buildEmptyPoiResponse())
    }
    res.status(result.status)
    res.set('Content-Type', result.rawHeaders['content-type'] || 'application/json')
    return res.send(result.body)
  } catch (error) {
    return next(error)
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
  const shouldTrace = tmapPath.includes('/routes') || tmapPath.includes('/nearestRoad')
  const bodySummary = shouldTrace ? summarizeTmapBody(body) : null

  console.log(`[TMAP proxy] ${req.method} ${tmapPath}`)
  if (bodySummary) {
    console.log('[TMAP proxy] body:', bodySummary)
  }

  try {
    const result = await tmapFetch(tmapPath, req.method, { origin, referer }, body)
    console.log(`[TMAP proxy] → ${result.status}`)
    if (tmapPath.includes('/road/nearestRoad') && Number(result.status) === 403) {
      let parsed = null
      try { parsed = JSON.parse(result.body.toString()) } catch { /* noop */ }
      const errorCode = parsed?.error?.code ?? parsed?.error?.errorCode ?? null
      if (errorCode === 'MISSING_AUTHENTICATION_TOKEN') {
        return res.status(200).json({ resultData: { coordinate: null }, fallback: 'nearest-road-disabled' })
      }
    }
    if (tmapPath.includes('/pois') && Number(result.status) === 400) {
      const url = new URL(`https://dummy.local${tmapPath}`)
      const searchKeyword = String(url.searchParams.get('searchKeyword') ?? '')
      if (['음식점', '맛집', '주유소', '휴게소', '주차장', '병원', '초등학교', '유치원', '방지턱'].includes(searchKeyword)) {
        return res.status(200).json(buildEmptyPoiResponse())
      }
    }
    if (shouldTrace && [400, 403, 429].includes(Number(result.status))) {
      let parsed = null
      try { parsed = JSON.parse(result.body.toString()) } catch { /* noop */ }
      console.warn('[TMAP proxy] traced error:', {
        status: result.status,
        path: tmapPath,
        body: bodySummary,
        errorCode: parsed?.error?.code ?? parsed?.error?.errorCode ?? null,
        errorMessage: parsed?.error?.message ?? parsed?.error?.errorMessage ?? null,
      })
    }
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
