import express from 'express'
import https from 'https'
import fs from 'fs'
import proj4 from 'proj4'
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
const GOOGLE_TTS_VOICE = process.env.GOOGLE_TTS_VOICE_NAME
  || localEnv.GOOGLE_TTS_VOICE_NAME
  || 'ko-KR-Chirp3-HD-Despina'

const WGS84 = 'EPSG:4326'
const KATEC = 'KATEC'

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

function withQuery(path, query = {}) {
  const params = new URLSearchParams(query)
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
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

app.post('/api/tts/google', express.json({ limit: '256kb' }), async (req, res) => {
  if (!GOOGLE_TTS_KEY) return res.status(204).end()

  const text = String(req.body?.text ?? '').trim()
  if (!text) return res.status(400).json({ error: { code: 'EMPTY_TEXT', message: 'text가 비어 있습니다.' } })

  const voiceName = String(req.body?.voiceName ?? GOOGLE_TTS_VOICE).trim() || GOOGLE_TTS_VOICE
  const languageCode = String(req.body?.languageCode ?? (voiceName.split('-').slice(0, 2).join('-') || 'ko-KR'))
  const speakingRate = Number.isFinite(Number(req.body?.speakingRate)) ? Number(req.body.speakingRate) : 1.02

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

    return res
      .set('Content-Type', 'audio/mpeg')
      .set('Cache-Control', 'public, max-age=86400')
      .send(Buffer.from(parsed.audioContent, 'base64'))
  } catch (error) {
    return res.status(502).json({ error: { code: 'GOOGLE_TTS_PROXY_ERROR', message: error.message } })
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
