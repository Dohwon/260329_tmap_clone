import { HIGHWAYS } from '../data/highwayData.js'
import { ensureLiveRouteSource, normalizeSearchOption } from '../utils/navigationLogic.js'

const BASE = '/api/tmap'
const ROAD_KEYWORD_PATTERN = /(고속|국도|jc|ic|분기|인터체인지|나들목|휴게소|톨게이트)/i
// 도로명 주소 패턴: "효행로 250", "강남대로 123번길 45" 등
const ROAD_ADDRESS_PATTERN = /[가-힣]+(?:로|길|대로|avenue)\s*\d+/i
const SEARCH_CACHE = new Map()
const SEARCH_CACHE_TTL = 1000 * 60 * 5
const FAST_SEARCH_PLACES = [
  {
    id: 'fast-gangnam-station',
    name: '강남역',
    address: '서울특별시 강남구 강남대로 지하396',
    lat: 37.4979,
    lng: 127.0276,
    category: '지하철역',
    aliases: ['강남역', '강남', '2호선 강남역', '신분당선 강남역'],
  },
  {
    id: 'fast-yanghwa-bridge',
    name: '양화대교',
    address: '서울특별시 영등포구 양화동',
    lat: 37.5435,
    lng: 126.9016,
    category: '교량',
    aliases: ['양화대교', '양화'],
  },
  {
    id: 'fast-olympic-daero',
    name: '올림픽대로',
    address: '서울특별시 강동구 암사동 일대',
    lat: 37.5306,
    lng: 127.1212,
    category: '도시고속화도로',
    aliases: ['올림픽대로', '올림픽'],
  },
  {
    id: 'fast-gangbyeon',
    name: '강변북로',
    address: '서울특별시 마포구 상암동 일대',
    lat: 37.5697,
    lng: 126.8784,
    category: '도시고속화도로',
    aliases: ['강변북로', '강변'],
  },
  {
    id: 'fast-nambu-terminal',
    name: '남부터미널역',
    address: '서울특별시 서초구 효령로 지하289',
    lat: 37.4849,
    lng: 127.0164,
    category: '지하철역',
    aliases: ['남부터미널', '남부터미널역'],
  },
]

const FALLBACK_SEARCH_PLACES = [
  { id: 'place-seoul', name: '서울역', address: '서울특별시 용산구 한강대로 405', lat: 37.5547, lng: 126.9706, category: '교통' },
  { id: 'place-busan', name: '부산역', address: '부산광역시 동구 중앙대로 206', lat: 35.1151, lng: 129.0410, category: '교통' },
  { id: 'place-daejeon', name: '대전시청', address: '대전광역시 서구 둔산로 100', lat: 36.3504, lng: 127.3845, category: '행정' },
  { id: 'place-haeundae', name: '부산 해운대', address: '부산광역시 해운대구 우동', lat: 35.1631, lng: 129.1635, category: '관광' },
  {
    id: 'place-hogye',
    name: '호계동 959-18',
    address: '경기도 안양시 동안구 흥안대로 109번길 26',
    lat: 37.371313340579,
    lng: 126.95700840682,
    category: '주거',
    aliases: ['흥안대로109번길 26', '흥안대로 109번길 26', '호계동 959-10', '호계동 959-18'],
  },
]

const CATEGORY_META = {
  주유소: { key: 'fuel', seeds: ['GS칼텍스', 'SK에너지', 'S-OIL', '현대오일뱅크'] },
  휴게소: { key: 'rest', seeds: ['덕평휴게소', '문막휴게소', '여주휴게소', '안성휴게소'] },
  주차장: { key: 'parking', seeds: ['공영주차장', '환승주차장', '타워주차장', '민영주차장'] },
  카페: { key: 'cafe', seeds: ['스타벅스', '메가커피', '투썸플레이스', '로컬 카페'] },
  음식점: { key: 'restaurant', seeds: ['한식당', '국밥집', '맛집', '기사식당'] },
  병원: { key: 'hospital', seeds: ['종합병원', '정형외과', '내과', '응급의료센터'] },
  편의점: { key: 'convenience', seeds: ['CU', 'GS25', '세븐일레븐', '이마트24'] },
}

function normalizeSearchText(text) {
  return String(text ?? '').toLowerCase().replace(/[\s\-_/.,]/g, '')
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

function buildRoadSearchPlaces() {
  return HIGHWAYS.flatMap((road) => [
    {
      id: `${road.id}-start`,
      name: road.startName ?? `${road.name} 시점`,
      address: road.startAddress ?? road.startName,
      lat: road.startCoord[0],
      lng: road.startCoord[1],
      category: road.roadClass === 'national' ? '국도' : '고속도로',
      aliases: [`${road.name} 시점`, `${road.shortName} 시점`, road.startName].filter(Boolean),
    },
    {
      id: `${road.id}-end`,
      name: road.endName ?? `${road.name} 종점`,
      address: road.endAddress ?? road.endName,
      lat: road.endCoord[0],
      lng: road.endCoord[1],
      category: road.roadClass === 'national' ? '국도' : '고속도로',
      aliases: [`${road.name} 종점`, `${road.shortName} 종점`, road.endName].filter(Boolean),
    },
    ...(road.majorJunctions ?? []).map((junction) => ({
      id: `${road.id}-${junction.name}`,
      name: junction.name,
      address: `${road.name} ${junction.name}`,
      lat: junction.coord[0],
      lng: junction.coord[1],
      category: '분기점',
      aliases: [junction.name, `${road.name} ${junction.name}`],
    })),
    ...(road.restStops ?? []).map((stop) => ({
      id: stop.id,
      name: stop.name,
      address: `${road.name} ${stop.name}`,
      lat: stop.coord[0],
      lng: stop.coord[1],
      category: stop.type === 'service' ? '휴게소' : '졸음쉼터',
      aliases: [stop.name, `${road.name} ${stop.name}`],
    })),
  ])
}

function normalizePoi(poi) {
  const roadAddress = [poi.roadName, poi.firstBuildNo, poi.secondBuildNo].filter(Boolean).join(' ')
  const jibunAddress = [poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName, poi.legalDong, poi.ri, poi.firstNo, poi.secondNo].filter(Boolean).join(' ')
  return {
    id: poi.id ?? poi.poiid ?? `${poi.name}-${poi.frontLat}-${poi.frontLon}`,
    name: poi.name,
    address: [roadAddress, jibunAddress, poi.detailAddrName, poi.address]
      .filter(Boolean)
      .join(' ') || '',
    lat: parseFloat(poi.frontLat ?? poi.noorLat ?? poi.lat),
    lng: parseFloat(poi.frontLon ?? poi.noorLon ?? poi.lng),
    category: poi.bizCatName ?? poi.upperBizName ?? poi.category ?? '',
  }
}

function sanitizeRouteLabel(label, fallback) {
  return String(label ?? fallback ?? '')
    .replace(/[^\p{L}\p{N}\s()\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40) || fallback
}

function searchFallbackPlaces(keyword, nearLat, nearLng) {
  const normalized = keyword.trim().toLowerCase()
  const compact = normalizeSearchText(normalized)
  const roadPlaces = buildRoadSearchPlaces()
  const fastPool = [...FAST_SEARCH_PLACES, ...FALLBACK_SEARCH_PLACES]
  const basePool = ROAD_KEYWORD_PATTERN.test(keyword) ? [...fastPool, ...roadPlaces] : fastPool

  return basePool
    .filter((place) => {
      const haystack = `${place.name} ${place.address} ${place.category} ${(place.aliases ?? []).join(' ')}`.toLowerCase()
      return normalizeSearchText(haystack).includes(compact)
    })
    .sort((a, b) => {
      const distanceA = nearLat != null && nearLng != null ? haversineKm(nearLat, nearLng, a.lat, a.lng) : 0
      const distanceB = nearLat != null && nearLng != null ? haversineKm(nearLat, nearLng, b.lat, b.lng) : 0
      return distanceA - distanceB
    })
    .slice(0, 15)
}

export function searchInstantPlaceCandidates(keyword, nearLat, nearLng) {
  const trimmedKeyword = String(keyword ?? '').trim()
  if (trimmedKeyword.length < 2) return []
  return searchFallbackPlaces(trimmedKeyword, nearLat, nearLng).slice(0, 10)
}

function getCachedSearch(keyword, nearLat, nearLng) {
  const key = `${normalizeSearchText(keyword)}:${nearLat ?? ''}:${nearLng ?? ''}`
  const cached = SEARCH_CACHE.get(key)
  if (!cached) return null
  if (Date.now() - cached.savedAt > SEARCH_CACHE_TTL) {
    SEARCH_CACHE.delete(key)
    return null
  }
  return cached.results
}

function setCachedSearch(keyword, nearLat, nearLng, results) {
  const key = `${normalizeSearchText(keyword)}:${nearLat ?? ''}:${nearLng ?? ''}`
  SEARCH_CACHE.set(key, { savedAt: Date.now(), results })
}

function mapRoadType(props = {}) {
  if ([4, 5, 6].includes(Number(props.roadType))) return 'highway'
  if (Number(props.roadType) === 7) return 'local'
  if (JUNCTION_TURN_TYPES.has(Number(props.turnType))) return 'junction'
  return 'national'
}

function estimateSegmentSpeedLimit(props = {}, roadType) {
  const raw = Number(props.speed ?? props.speedLimit ?? props.limitSpeed ?? 0)
  if (Number.isFinite(raw) && raw > 0) return raw
  if (roadType === 'highway') return 100
  if (roadType === 'local') return 50
  if (roadType === 'junction') return 80
  return 70
}

function isSyntheticAddress(address) {
  return /(시점|종점|\d+km 지점|현재 위치 기준)/.test(String(address ?? ''))
}

function isSyntheticName(name) {
  return /(시점|종점|선택한 위치|지도 선택|현재 위치)/.test(String(name ?? ''))
}

function buildNearbyFallback(category, lat, lng) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.주유소
  const offsets = [
    [0.0045, 0.0025],
    [0.0072, -0.0031],
    [-0.0040, 0.0046],
    [0.0094, 0.0065],
    [-0.0068, -0.0038],
    [0.0122, 0.0022],
  ]
  return offsets.map(([latOffset, lngOffset], index) => ({
    id: `${meta.key}-${index}`,
    name: `${meta.seeds[index % meta.seeds.length]} ${index + 1}`,
    address: `${category} · 현재 위치 기준 ${(index + 1) * 300}m`,
    lat: lat + latOffset,
    lng: lng + lngOffset,
    category,
    distanceKm: Number((((index + 1) * 0.3)).toFixed(1)),
  }))
}

function buildNearbyRestStopFallback(lat, lng, routePolyline = []) {
  return HIGHWAYS.flatMap((road) =>
    (road.restStops ?? []).map((stop) => {
      const routeDistanceKm = distanceKmToPolyline(stop.coord[0], stop.coord[1], routePolyline)
      const distanceKm = Number(haversineKm(lat, lng, stop.coord[0], stop.coord[1]).toFixed(1))
      return {
        id: stop.id,
        name: stop.name,
        address: `${road.name} · ${stop.type === 'service' ? '휴게소' : '졸음쉼터'}`,
        lat: stop.coord[0],
        lng: stop.coord[1],
        category: stop.type === 'service' ? '휴게소' : '졸음쉼터',
        roadName: road.name,
        kmMarker: stop.km ?? null,
        distanceKm,
        routeDistanceKm,
        isRouteCorridor: routeDistanceKm != null ? routeDistanceKm <= 2.2 : false,
      }
    })
  )
    .sort((a, b) => {
      if (a.isRouteCorridor !== b.isRouteCorridor) return a.isRouteCorridor ? -1 : 1
      if ((a.routeDistanceKm ?? Infinity) !== (b.routeDistanceKm ?? Infinity)) {
        return (a.routeDistanceKm ?? Infinity) - (b.routeDistanceKm ?? Infinity)
      }
      return a.distanceKm - b.distanceKm
    })
    .slice(0, 8)
}

function estimateFuelPrice(poi, index = 0) {
  const name = String(poi?.name ?? '')
  const base = name.includes('S-OIL') ? 1648
    : name.includes('GS') ? 1659
      : name.includes('SK') ? 1665
        : name.includes('현대') ? 1654
          : 1661
  const variation = ((index * 7) % 17) - 8
  return Math.max(1595, base + variation)
}

function distanceKmToPolyline(lat, lng, polyline = []) {
  if (!Array.isArray(polyline) || polyline.length === 0) return null
  let best = Infinity
  for (let index = 0; index < polyline.length; index += 1) {
    const point = polyline[index]
    const distance = haversineKm(lat, lng, point[0], point[1])
    if (distance < best) best = distance
  }
  return Number.isFinite(best) ? Number(best.toFixed(1)) : null
}

function enrichFuelStops(results, routePolyline = []) {
  const sorted = results.map((result, index) => {
    const fuelPrice = Number.isFinite(result.fuelPrice) && result.fuelPrice > 0
      ? result.fuelPrice
      : estimateFuelPrice(result, index)
    const routeDistanceKm = distanceKmToPolyline(result.lat, result.lng, routePolyline)
    return {
      ...result,
      fuelPrice,
      fuelLabel: result.fuelLabel ?? '휘발유',
      priceSource: result.priceSource ?? (Number.isFinite(result.fuelPrice) && result.fuelPrice > 0 ? 'opinet' : 'estimated'),
      routeDistanceKm,
      isRouteCorridor: routeDistanceKm != null ? routeDistanceKm <= 1.5 : false,
    }
  })
  const routeLowest = sorted.filter((item) => item.isRouteCorridor).sort((a, b) => a.fuelPrice - b.fuelPrice)[0] ?? null
  const nearbyLowest = [...sorted].sort((a, b) => a.fuelPrice - b.fuelPrice)[0] ?? null
  return sorted.map((item) => ({
    ...item,
    nearbyLowestFuelPrice: nearbyLowest?.fuelPrice ?? null,
    routeLowestFuelPrice: routeLowest?.fuelPrice ?? nearbyLowest?.fuelPrice ?? null,
  }))
}

async function fetchNearbyFuelFromApi(lat, lng, routePolyline = []) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: '6000',
    productCode: 'B027',
    limit: '8',
  })
  const res = await fetch(`/api/fuel/nearby?${params}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody?.error?.message ?? errorBody?.error?.code ?? `HTTP ${res.status}`)
  }
  const json = await res.json()
  return enrichFuelStops(json.items ?? [], routePolyline)
}

function buildSearchOptionAttempts(option) {
  const raw = String(option ?? '00').trim()
  return [...new Set([raw, normalizeSearchOption(raw)].filter(Boolean))]
}

export async function fetchTmapStatus() {
  try {
    const res = await fetch('/api/meta/tmap-status')
    if (!res.ok) throw new Error('TMAP 상태 조회 실패')
    return await res.json()
  } catch {
    const hasLocalKey = Boolean(import.meta.env.VITE_TMAP_API_KEY || import.meta.env.TMAP_API_KEY)
    return { hasApiKey: hasLocalKey, mode: hasLocalKey ? 'live' : 'simulation' }
  }
}

async function fetchPoiSearch(keyword, nearLat, nearLng, searchtypCd = 'A') {
  const params = new URLSearchParams({
    version: '1',
    searchKeyword: keyword,
    searchType: 'all',
    searchtypCd,
    page: '1',
    resCoordType: 'WGS84GEO',
    reqCoordType: 'WGS84GEO',
    multiPoint: 'N',
    poiGroupYn: 'N',
    count: '20',
    ...(nearLat != null && nearLng != null ? { centerLat: String(nearLat), centerLon: String(nearLng) } : {}),
  })
  const res = await fetch(`${BASE}/pois?${params}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}))
    throw new Error(errJson?.error?.errorMessage ?? errJson?.error?.code ?? `HTTP ${res.status}`)
  }
  const json = await res.json()
  const pois = json?.searchPoiInfo?.pois?.poi ?? []
  return pois.map(normalizePoi).filter((poi) => Number.isFinite(poi.lat) && Number.isFinite(poi.lng))
}

async function fetchFullAddrGeo(keyword) {
  const params = new URLSearchParams({
    version: '1',
    fullAddr: keyword,
    coordType: 'WGS84GEO',
    addressFlag: 'F00',
    page: '1',
    count: '15',
  })
  const res = await fetch(`${BASE}/geo/fullAddrGeo?${params}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const coordinates = json?.coordinateInfo?.coordinate ?? []
  return coordinates
    .map((item, index) => ({
      id: `fulladdr-${index}-${item.newLat ?? item.lat}`,
      name: item.fullAddress ?? item.roadName ?? keyword,
      address: item.fullAddress ?? keyword,
      lat: parseFloat(item.newLat ?? item.lat),
      lng: parseFloat(item.newLon ?? item.lon),
      category: '주소',
    }))
    .filter((poi) => Number.isFinite(poi.lat) && Number.isFinite(poi.lng))
}

export async function searchPOI(keyword, nearLat, nearLng) {
  const trimmedKeyword = String(keyword ?? '').trim()
  if (trimmedKeyword.length < 2) return []

  const cached = getCachedSearch(trimmedKeyword, nearLat, nearLng)
  if (cached) return cached

  const localFastResults = searchFallbackPlaces(trimmedKeyword, nearLat, nearLng)
  const compactKeyword = normalizeSearchText(trimmedKeyword)
  const exactLocalResults = localFastResults.filter((item) => {
    const fields = [item.name, item.address, ...(item.aliases ?? [])]
      .map((value) => normalizeSearchText(value))
      .filter(Boolean)
    return fields.some((value) => value === compactKeyword || value.startsWith(compactKeyword))
  })

  const hasExactLocalMatch = exactLocalResults.some((item) => {
    const fields = [item.name, ...(item.aliases ?? [])]
      .map((value) => normalizeSearchText(value))
      .filter(Boolean)
    return fields.some((value) => value === compactKeyword)
  })

  if (exactLocalResults.length >= 3 || hasExactLocalMatch || (exactLocalResults.length > 0 && trimmedKeyword.length <= 6)) {
    const fastResults = exactLocalResults.slice(0, 10)
    setCachedSearch(trimmedKeyword, nearLat, nearLng, fastResults)
    return fastResults
  }

  const isRoadAddress = ROAD_ADDRESS_PATTERN.test(trimmedKeyword)
  let results = []

  if (isRoadAddress) {
    // 도로명/지번 주소: fullAddrGeo 우선, POI 병렬 시도
    const [addrResults, poiResults] = await Promise.all([
      fetchFullAddrGeo(trimmedKeyword).catch(() => []),
      fetchPoiSearch(trimmedKeyword, nearLat, nearLng).catch(() => []),
    ])
    const combined = [...addrResults, ...poiResults]
    const unique = combined.filter((item, index, all) =>
      all.findIndex((other) => Math.abs(other.lat - item.lat) < 0.0001 && Math.abs(other.lng - item.lng) < 0.0001) === index
    )
    if (unique.length > 0) results = unique
  } else {
    // 건물명/업체명: POI 검색 (전체 + 업종 병렬)
    const [poiAll, poiBiz] = await Promise.all([
      fetchPoiSearch(trimmedKeyword, nearLat, nearLng, 'A').catch(() => []),
      fetchPoiSearch(trimmedKeyword, nearLat, nearLng, 'B').catch(() => []),
    ])
    // 중복 제거 (id 기준)
    const seen = new Set()
    const combined = [...poiAll, ...poiBiz].filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    if (combined.length > 0) {
      results = combined
    } else {
      // POI 결과 없으면 fullAddrGeo도 시도
      const addrResults = await fetchFullAddrGeo(trimmedKeyword).catch(() => [])
      if (addrResults.length > 0) results = addrResults
    }
  }

  if (results.length === 0) {
    results = localFastResults
  } else if (localFastResults.length > 0) {
    const merged = [...localFastResults, ...results]
    results = merged.filter((item, index, all) =>
      all.findIndex((other) => Math.abs(other.lat - item.lat) < 0.0001 && Math.abs(other.lng - item.lng) < 0.0001) === index
    )
  }

  const finalResults = results.slice(0, 15)
  setCachedSearch(trimmedKeyword, nearLat, nearLng, finalResults)
  return finalResults
}

export async function searchNearbyPOIs(category, lat, lng, options = {}) {
  const routePolyline = options.routePolyline ?? []
  if (category === '주유소') {
    try {
      const liveFuel = await fetchNearbyFuelFromApi(lat, lng, routePolyline)
      if (liveFuel.length > 0) return liveFuel
    } catch {
      // 오피넷 미설정/실패 시 TMAP+추정가 폴백
    }
  }

  if (category === '휴게소') {
    const restStops = buildNearbyRestStopFallback(lat, lng, routePolyline)
    if (restStops.length > 0) return restStops
  }

  const results = await searchPOI(category, lat, lng)
  if (results.length > 0) {
    const enriched = results
      .map((result) => ({
        ...result,
        distanceKm: Number(haversineKm(lat, lng, result.lat, result.lng).toFixed(1)),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
    return category === '주유소' ? enrichFuelStops(enriched, routePolyline) : enriched
  }
  const fallback = buildNearbyFallback(category, lat, lng)
  return category === '주유소' ? enrichFuelStops(fallback, routePolyline) : fallback
}

export async function searchSafetyHazards(lat, lng) {
  const [schools, kindergartens, bumps] = await Promise.all([
    fetchPoiSearch('초등학교', lat, lng, 'A').catch(() => []),
    fetchPoiSearch('유치원', lat, lng, 'A').catch(() => []),
    fetchPoiSearch('방지턱', lat, lng, 'A').catch(() => []),
  ])

  const schoolHazards = [...schools, ...kindergartens]
    .slice(0, 8)
    .map((poi) => ({
      id: `school-${poi.id}`,
      name: poi.name,
      address: poi.address,
      lat: poi.lat,
      lng: poi.lng,
      type: 'school_zone',
      distanceKm: Number(haversineKm(lat, lng, poi.lat, poi.lng).toFixed(1)),
      speedLimit: 30,
      alertText: `${poi.name} 인근 어린이보호구역 주의`,
    }))

  const bumpHazards = bumps
    .slice(0, 6)
    .map((poi) => ({
      id: `bump-${poi.id}`,
      name: poi.name,
      address: poi.address,
      lat: poi.lat,
      lng: poi.lng,
      type: 'speed_bump',
      distanceKm: Number(haversineKm(lat, lng, poi.lat, poi.lng).toFixed(1)),
      speedLimit: null,
      alertText: `${poi.name || '방지턱'} 인근 감속`,
    }))

  return [...schoolHazards, ...bumpHazards]
    .filter((item, index, all) =>
      all.findIndex((other) => other.type === item.type && Math.abs(other.lat - item.lat) < 0.00015 && Math.abs(other.lng - item.lng) < 0.00015) === index
    )
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

export async function fetchRoutes(startLat, startLng, endLat, endLng, preferences = {}) {
  const start = { lat: startLat, lng: startLng, name: '출발' }
  const dest = { lat: endLat, lng: endLng, name: '도착' }
  const { roadType = 'mixed' } = preferences

  // roadType에 따라 기본 탐색 옵션 조정
  // highway_only → 고속 우선을 베이스라인으로, national_road → 국도 포함 우선
  const directOpts = roadType === 'highway_only'
    ? [
        { searchOption: '04', title: '고속도로 우선', tag: '추천', tagColor: 'blue', isBaseline: true },
        { searchOption: '00', title: '추천 경로', tag: '추천경로', tagColor: 'blue' },
      ]
    : roadType === 'national_road'
      ? [
          { searchOption: '00', title: '추천 경로', tag: '추천', tagColor: 'blue', isBaseline: true },
          { searchOption: '10', title: '최단거리', tag: '최단', tagColor: 'orange' },
        ]
      : [
          { searchOption: '00', title: '추천 경로', tag: '추천', tagColor: 'blue', isBaseline: true },
          { searchOption: '04', title: '고속도로 우선', tag: '고속', tagColor: 'blue' },
        ]
  const directResults = await Promise.allSettled(
    directOpts.map((opt) => fetchSingleRoute(startLat, startLng, endLat, endLng, opt))
  )
  const routes = directResults
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => ({ ...r.value, source: 'live' }))

  if (routes.length === 0) {
    const failed = directResults.find((r) => r.status === 'rejected')
    throw failed?.reason ?? new Error('경로를 찾을 수 없습니다')
  }

  // Step 2: 기본 경로의 IC/JC 분기점을 경유지로 삼아 실제로 다른 경로 생성
  const baseRoute = routes[0]
  const junctions = baseRoute?.junctions ?? []

  if (junctions.length >= 2) {
    // 1/3 지점 분기점 경유 → 다른 경로 강제
    const viaA = junctions[Math.floor(junctions.length * 0.35)]
    // 2/3 지점 분기점 경유 → 또 다른 경로
    const viaB = junctions[Math.floor(junctions.length * 0.65)]

    const viaResults = await Promise.allSettled([
      fetchRouteByWaypoints(start, dest, [viaA], {
        id: `route-via-a`,
        searchOption: '00',
        title: `${viaA.name} 경유`,
        tag: `${viaA.name}`,
        tagColor: 'green',
      }),
      junctions.length >= 4
        ? fetchRouteByWaypoints(start, dest, [viaB], {
            id: `route-via-b`,
            searchOption: '00',
            title: `${viaB.name} 경유`,
            tag: `${viaB.name}`,
            tagColor: 'orange',
          })
        : Promise.reject(new Error('skip')),
    ])

    for (const r of viaResults) {
      if (r.status === 'fulfilled' && r.value) {
        routes.push({ ...r.value, source: 'live' })
      }
    }
  }

  // 중복 제거: ETA가 2분 미만 차이이고 거리도 1km 미만 차이면 같은 경로로 간주
  return routes.filter((route, index, all) =>
    all.findIndex((other) =>
      Math.abs(other.eta - route.eta) < 2 && Math.abs((other.distance ?? 0) - (route.distance ?? 0)) < 1
    ) === index
  )
}

export async function fetchRouteByWaypoints(start, destination, wayPoints = [], option = {}) {
  const startTime = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  let lastMessage = 'TMAP 경유 경로 응답 실패'

  for (const searchOption of buildSearchOptionAttempts(option.searchOption ?? '00')) {
    const body = {
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      startName: sanitizeRouteLabel(start.name, '출발'),
      startX: String(start.lng),
      startY: String(start.lat),
      startTime,
      endName: sanitizeRouteLabel(destination.name, '도착'),
      endX: String(destination.lng),
      endY: String(destination.lat),
      searchOption,
      carType: '0',
      viaPoints: wayPoints.map((point, index) => ({
        viaPointId: point.id ?? `via-${index}`,
        viaPointName: sanitizeRouteLabel(point.name, `경유지 ${index + 1}`),
        viaX: String(point.lng),
        viaY: String(point.lat),
        viaTime: String(point.viaTime ?? 0),
      })),
    }

    const res = await fetch(`${BASE}/routes/routeSequential30?version=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const json = await res.json()
      return parseRouteResponse(json, { ...option, searchOption })
    }

    try {
      const json = await res.json()
      lastMessage = json?.error?.errorMessage ?? json?.error?.code ?? json?.error?.message ?? `TMAP HTTP ${res.status}`
    } catch {
      lastMessage = `TMAP HTTP ${res.status}`
    }
  }

  throw new Error(lastMessage)
}

export async function fetchDirectRoute(startLat, startLng, endLat, endLng, option = {}) {
  return fetchSingleRoute(startLat, startLng, endLat, endLng, { searchOption: '00', ...option })
}

export async function snapToNearestRoad(lat, lng) {
  const params = new URLSearchParams({
    version: '1',
    lat: String(lat),
    lon: String(lng),
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
  })
  try {
    const res = await fetch(`${BASE}/road/nearestRoad?${params}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const json = await res.json()
    const coord = json?.resultData?.coordinate
    if (!coord) return null
    return { lat: parseFloat(coord.lat), lng: parseFloat(coord.lon) }
  } catch {
    return null
  }
}

async function fetchSingleRoute(startLat, startLng, endLat, endLng, option) {
  let lastMessage = 'TMAP 경로 응답 실패'
  for (const searchOption of buildSearchOptionAttempts(option.searchOption)) {
    const bodies = [
      {
        startX: String(startLng),
        startY: String(startLat),
        endX: String(endLng),
        endY: String(endLat),
        endRpFlag: 'G',
        carType: 0,
        detailPosFlag: '2',
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption,
        sort: 'index',
        trafficInfo: 'Y',
      },
      {
        startX: String(startLng),
        startY: String(startLat),
        endX: String(endLng),
        endY: String(endLat),
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption,
      },
    ]

    for (const body of bodies) {
      const res = await fetch(`${BASE}/routes?version=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const json = await res.json()
        return parseRouteResponse(json, { ...option, searchOption })
      }

      try {
        const json = await res.json()
        lastMessage = json?.error?.errorMessage ?? json?.error?.code ?? json?.error?.message ?? `TMAP HTTP ${res.status}`
      } catch {
        lastMessage = `TMAP HTTP ${res.status}`
      }
    }
  }

  throw new Error(lastMessage)
}

// TMAP pointType=N 이면서 start/end가 아닌 안내 포인트는 가능한 한 모두 배너 후보로 유지한다.
const JUNCTION_TURN_TYPES = new Set([125, 126, 127, 128, 129, 130])

function parseRouteResponse(json, option) {
  const features = json?.features ?? []
  if (!features.length) return null

  const summary = json?.properties ?? features[0]?.properties ?? {}
  const polyline = []
  let highwayDist = 0
  let nationalDist = 0
  let localDist = 0
  let mergeCount = 0
  const junctions = [] // 실제 IC/JC 분기점
  const maneuvers = [] // 일반 좌회전/우회전 포함 실제 안내 포인트
  const liveSegmentStats = []
  let accumulatedDist = 0
  let currentRoadName = ''  // 현재 통과 중인 도로명
  let currentRoadNo = ''    // 현재 도로번호

  for (let fi = 0; fi < features.length; fi++) {
    const feature = features[fi]
    if (feature.geometry?.type === 'LineString') {
      for (const coord of feature.geometry.coordinates) {
        polyline.push([coord[1], coord[0]])
      }
      const props = feature.properties ?? {}
      const dist = props.distance ?? 0
      // 도로명 업데이트 (있으면)
      if (props.roadName) currentRoadName = props.roadName
      if (props.roadNo) currentRoadNo = props.roadNo

      const positions = feature.geometry.coordinates.map((coord) => [coord[1], coord[0]])
      const roadType = mapRoadType(props)
      const speedLimit = estimateSegmentSpeedLimit(props, roadType)
      const averageSpeed = Math.max(
        roadType === 'local' ? 25 : 35,
        Math.round((Number(props.speed) || speedLimit) * (props.traffic === '0' ? 0.95 : props.traffic === '1' ? 0.82 : props.traffic === '2' ? 0.66 : 0.55))
      )

      if (positions.length > 1) {
        const startPoint = positions[0]
        const endPoint = positions[positions.length - 1]
        liveSegmentStats.push({
          id: `live-segment-${liveSegmentStats.length}`,
          name: currentRoadName || props.description || (roadType === 'highway' ? '고속도로 본선' : roadType === 'local' ? '일반도로' : '국도 구간'),
          positions,
          roadType,
          speedLimit,
          averageSpeed,
          congestionScore: averageSpeed < speedLimit * 0.6 ? 3 : averageSpeed < speedLimit * 0.8 ? 2 : 1,
          center: [
            (startPoint[0] + endPoint[0]) / 2,
            (startPoint[1] + endPoint[1]) / 2,
          ],
        })
      }

      if ([4, 5, 6].includes(props.roadType)) highwayDist += dist
      else if (props.roadType === 7) localDist += dist
      else nationalDist += dist

      // LineString turnType으로도 분기점 추출 가능
      if (JUNCTION_TURN_TYPES.has(props.turnType)) {
        mergeCount += 1
        const firstCoord = feature.geometry.coordinates[0]
        if (firstCoord) {
          // 다음 LineString 피처의 도로명 = 이 분기점 이후 도로
          const nextFeature = features.slice(fi + 1).find(f => f.geometry?.type === 'LineString')
          const afterRoadName = nextFeature?.properties?.roadName ?? currentRoadName
          const afterRoadNo = nextFeature?.properties?.roadNo ?? currentRoadNo
          const afterRoadType = [4, 5, 6].includes(props.roadType) ? 'highway' : 'national'
          junctions.push({
            id: `jct-${junctions.length}`,
            name: props.description ?? props.name ?? `분기점 ${junctions.length + 1}`,
            lat: firstCoord[1],
            lng: firstCoord[0],
            turnType: props.turnType,
            distanceFromStart: Math.round(accumulatedDist / 100) / 10, // km
            afterRoadType,
            afterRoadName: afterRoadName
              ? (afterRoadNo ? `${afterRoadName} (${afterRoadNo}호선)` : afterRoadName)
              : (afterRoadType === 'highway' ? '고속도로' : '국도'),
          })
        }
      }
      accumulatedDist += dist
    } else if (feature.geometry?.type === 'Point') {
      // Point 피처(전환점) 에서 분기점 정보 보완
      const props = feature.properties ?? {}
      const turnType = Number(props.turnType)
      const isGuidePoint = props.pointType === 'N' && ![200, 201].includes(turnType)
      if (isGuidePoint && (props.name || props.description || props.nextRoadName)) {
        const [lng, lat] = feature.geometry.coordinates
        const nextFeature = features.slice(fi + 1).find(f => f.geometry?.type === 'LineString')
        const afterRoadName = nextFeature?.properties?.roadName ?? ''
        const afterRoadNo = nextFeature?.properties?.roadNo ?? ''
        const afterRoadType = [4, 5, 6].includes(nextFeature?.properties?.roadType)
          ? 'highway' : 'national'
        const maneuver = {
          id: `man-${maneuvers.length}`,
          name: props.name ?? props.description ?? `안내 ${maneuvers.length + 1}`,
          lat,
          lng,
          turnType,
          distanceFromStart: Math.round((props.totalDistance ?? accumulatedDist) / 100) / 10,
          afterRoadType,
          instructionText: props.description ?? '',
          laneHint: props.guideLane ?? props.laneInfo ?? props.lane ?? props.guideInfo ?? '',
          nextRoadName: props.nextRoadName ?? '',
          afterRoadName: afterRoadName
            ? (afterRoadNo ? `${afterRoadName} (${afterRoadNo}호선)` : afterRoadName)
            : (afterRoadType === 'highway' ? '고속도로' : '국도'),
        }
        const isDupManeuver = maneuvers.some((item) => Math.abs(item.lat - lat) < 0.0002 && Math.abs(item.lng - lng) < 0.0002)
        if (!isDupManeuver) {
          maneuvers.push(maneuver)
        }
        if (JUNCTION_TURN_TYPES.has(Number(props.turnType))) {
          const isDupJunction = junctions.some((item) => Math.abs(item.lat - lat) < 0.0002 && Math.abs(item.lng - lng) < 0.0002)
          if (!isDupJunction) {
            mergeCount += 1
            junctions.push({
              ...maneuver,
              id: `jct-${junctions.length}`,
            })
          }
        }
      }
    }
  }

  const totalDistance = summary.totalDistance ?? highwayDist + nationalDist + localDist
  const totalTime = summary.totalTime ?? 0
  const trafficTime = summary.trafficTime ?? 0
  const totalFare = summary.totalFare ?? 0
  const totalDist = highwayDist + nationalDist + localDist || totalDistance
  const highwayRatio = Math.round((highwayDist / totalDist) * 100) || 0
  const nationalRoadRatio = Math.round((nationalDist / totalDist) * 100) || 0
  const localRoadRatio = Math.max(0, 100 - highwayRatio - nationalRoadRatio)
  const congestionScore = trafficTime / Math.max(totalTime, 1) > 0.3 ? 3 : trafficTime / Math.max(totalTime, 1) > 0.1 ? 2 : 1
  const averageSpeed = totalTime > 0
    ? Math.max(25, Math.round((totalDistance / totalTime) * 3.6))
    : (highwayRatio >= 70 ? 86 : highwayRatio >= 40 ? 68 : 52)
  const dominantSpeedLimit = highwayRatio >= 75 ? 110 : highwayRatio >= 45 ? 100 : 80

  // TMAP safetyFacilityList에서 실제 카메라 위치 추출
  const safetyList = summary.safetyFacilityList ?? []
  const cameras = []
  for (let i = 0; i < safetyList.length; i++) {
    const cam = safetyList[i]
    const isSection = String(cam.type) === '2'
    const lat = parseFloat(cam.lat ?? cam.noorLat ?? cam.startLat)
    const lng = parseFloat(cam.lon ?? cam.noorLon ?? cam.startLon)
    if (!isFinite(lat) || !isFinite(lng)) continue
    const base = {
      id: `cam-${i}`,
      coord: [lat, lng],
      type: isSection ? 'section_start' : 'fixed',
      speedLimit: parseInt(cam.speed ?? cam.speedLimit ?? 100, 10),
      label: isSection ? '구간단속' : '지점단속',
    }
    cameras.push(base)
    if (isSection && cam.endLat) {
      base.endCoord = [parseFloat(cam.endLat), parseFloat(cam.endLon)]
      base.sectionLength = parseFloat(cam.distance ?? '5')
      cameras.push({
        ...base,
        id: `cam-${i}-end`,
        coord: base.endCoord,
        type: 'section_end',
        label: '구간단속 종료',
      })
    }
  }

  // 실제 카메라 기반 집계 (없으면 거리 기반 추정)
  const totalKm = totalDistance / 1000
  const hwKm = highwayDist / 1000
  const fixedCameraCount = cameras.filter(c => c.type === 'fixed').length
    || Math.max(1, Math.round(hwKm / 6 + (totalKm - hwKm) / 12))
  const sectionCameraCount = cameras.filter(c => c.type === 'section_start').length
    || (highwayRatio >= 40 ? Math.max(1, Math.round(hwKm / 25)) : 0)

  const segmentStats = liveSegmentStats.length > 0
    ? liveSegmentStats
    : []

  return ensureLiveRouteSource({
    id: option.id ?? `route-${option.searchOption}`,
    title: option.title,
    explanation: buildExplanation(highwayRatio, mergeCount, congestionScore, option.isBaseline),
    eta: Math.ceil(totalTime / 60),
    distance: Math.round(totalDistance / 100) / 10,
    highwayRatio,
    nationalRoadRatio,
    localRoadRatio,
    mergeCount,
    maneuvers,
    congestionScore,
    congestionLabel: ['', '원활', '서행', '정체'][congestionScore],
    fixedCameraCount,
    sectionCameraCount,
    sectionEnforcementDistance: highwayRatio >= 60 ? 6 : 0,
    dominantSpeedLimit,
    maxSpeedLimit: dominantSpeedLimit,
    averageSpeed,
    tollFee: totalFare,
    recommended: option.isBaseline === true || option.searchOption === '2',
    tag: option.tag,
    tagColor: option.tagColor,
    routeColor: option.isBaseline === true ? '#0064FF' : '#8E8E93',
    isBaseline: option.isBaseline === true,
    polyline,
    segmentStats,
    junctions, // 실제 IC/JC 분기점 목록
    cameras,   // 실제 과속카메라 위치 (TMAP safetyFacilityList 기반)
  })
}

function buildExplanation(highwayRatio, mergeCount, congestionScore, isBaseline) {
  const parts = []
  if (isBaseline) parts.push('TMAP 기준')
  parts.push(highwayRatio >= 70 ? '고속도로 중심' : highwayRatio >= 40 ? '고속+국도 혼합' : '국도 위주')
  parts.push(mergeCount <= 4 ? '합류 단순' : `합류 ${mergeCount}회`)
  parts.push(congestionScore === 3 ? '정체 구간 포함' : congestionScore === 2 ? '서행 구간 있음' : '흐름 양호')
  return parts.join(' · ')
}

function isCoordString(str) {
  return /^-?\d{1,3}\.\d+[,\s]+-?\d{1,3}\.\d+$/.test((str ?? '').trim())
}

export async function reverseGeocode(lat, lng) {
  const params = new URLSearchParams({
    version: '1',
    lat: String(lat),
    lon: String(lng),
    coordType: 'WGS84GEO',
    addressType: 'A04',
    newAddressExtend: 'Y',
  })
  try {
    const res = await fetch(`${BASE}/geo/reversegeocoding?${params}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error('역지오코딩 실패')
    const json = await res.json()
    const addressInfo = json?.addressInfo ?? {}
    // 법정동+지번 우선 (예: 호계동 959-18)
    const legalDong = addressInfo.legalDong || addressInfo.lowerAddrName || ''
    const bunji = addressInfo.bunji || addressInfo.firstNo
      ? [addressInfo.firstNo, addressInfo.secondNo].filter(Boolean).join('-')
      : ''
    const jibunAddr = [legalDong, bunji].filter(Boolean).join(' ')
    // 좌표 문자열처럼 보이면 무시
    const candidates = [addressInfo.bunjiAddress, jibunAddr, addressInfo.fullAddress, addressInfo.roadAddress]
    const addr = candidates.find((c) => c && !isCoordString(c))
    return addr || null
  } catch {
    // fallback: 가장 가까운 알려진 장소
    const nearest = [...FALLBACK_SEARCH_PLACES].sort(
      (a, b) => haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng)
    )[0]
    return nearest?.name ?? nearest?.address ?? null
  }
}

export async function enrichDestinationTarget(target) {
  if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return target

  const next = { ...target }
  const shouldResolveAddress = !next.address || isSyntheticAddress(next.address)
  if (shouldResolveAddress) {
    const resolvedAddress = await reverseGeocode(next.lat, next.lng).catch(() => null)
    if (resolvedAddress) {
      next.address = resolvedAddress
      if (!next.name || isSyntheticName(next.name)) {
        next.name = resolvedAddress
      }
    }
  }

  if (!next.name) {
    next.name = next.address || '선택한 위치'
  }

  return next
}
