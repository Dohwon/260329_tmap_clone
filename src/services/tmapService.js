import { HIGHWAYS } from '../data/highwayData'

const BASE = '/api/tmap'
const ROAD_KEYWORD_PATTERN = /(고속|국도|jc|ic|분기|인터체인지|나들목|휴게소|톨게이트)/i

const FALLBACK_SEARCH_PLACES = [
  { id: 'place-seoul', name: '서울역', address: '서울특별시 용산구 한강대로 405', lat: 37.5547, lng: 126.9706, category: '교통' },
  { id: 'place-busan', name: '부산역', address: '부산광역시 동구 중앙대로 206', lat: 35.1151, lng: 129.0410, category: '교통' },
  { id: 'place-daejeon', name: '대전시청', address: '대전광역시 서구 둔산로 100', lat: 36.3504, lng: 127.3845, category: '행정' },
  { id: 'place-haeundae', name: '부산 해운대', address: '부산광역시 해운대구 우동', lat: 35.1631, lng: 129.1635, category: '관광' },
  {
    id: 'place-hogye',
    name: '호계동 959-10',
    address: '경기도 안양시 동안구 흥안대로 109번길 26',
    lat: 37.371313340579,
    lng: 126.95700840682,
    category: '주거',
    aliases: ['흥안대로109번길 26', '흥안대로 109번길 26', '호계동 959-10', '호계동 959-18'],
  },
]

const CATEGORY_META = {
  주유소: { key: 'fuel', seeds: ['GS칼텍스', 'SK에너지', 'S-OIL', '현대오일뱅크'] },
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
      name: `${road.name} 시점`,
      address: road.startName,
      lat: road.startCoord[0],
      lng: road.startCoord[1],
      category: '고속도로',
    },
    {
      id: `${road.id}-end`,
      name: `${road.name} 종점`,
      address: road.endName,
      lat: road.endCoord[0],
      lng: road.endCoord[1],
      category: '고속도로',
    },
    ...road.majorJunctions.map((junction) => ({
      id: `${road.id}-${junction.name}`,
      name: junction.name,
      address: `${road.name} ${junction.name}`,
      lat: junction.coord[0],
      lng: junction.coord[1],
      category: '분기점',
    })),
  ])
}

function normalizePoi(poi) {
  return {
    id: poi.id ?? poi.poiid ?? `${poi.name}-${poi.frontLat}-${poi.frontLon}`,
    name: poi.name,
    address: [poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName, poi.detailAddrName]
      .filter(Boolean)
      .join(' ') || poi.address || '',
    lat: parseFloat(poi.frontLat ?? poi.noorLat ?? poi.lat),
    lng: parseFloat(poi.frontLon ?? poi.noorLon ?? poi.lng),
    category: poi.bizCatName ?? poi.upperBizName ?? poi.category ?? '',
  }
}

function searchFallbackPlaces(keyword, nearLat, nearLng) {
  const normalized = keyword.trim().toLowerCase()
  const compact = normalizeSearchText(normalized)
  const roadPlaces = buildRoadSearchPlaces()
  const basePool = ROAD_KEYWORD_PATTERN.test(keyword) ? [...FALLBACK_SEARCH_PLACES, ...roadPlaces] : FALLBACK_SEARCH_PLACES

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

export async function searchPOI(keyword, nearLat, nearLng) {
  const params = new URLSearchParams({
    version: '1',
    searchKeyword: keyword,
    resCoordType: 'WGS84GEO',
    reqCoordType: 'WGS84GEO',
    count: '15',
    ...(nearLat != null && nearLng != null ? { centerLat: String(nearLat), centerLon: String(nearLng) } : {}),
  })

  try {
    const res = await fetch(`${BASE}/pois?${params}`)
    if (!res.ok) throw new Error('POI 검색 실패')
    const json = await res.json()
    const pois = json?.searchPoiInfo?.pois?.poi ?? []
    const normalized = pois.map(normalizePoi).filter((poi) => Number.isFinite(poi.lat) && Number.isFinite(poi.lng))
    if (normalized.length > 0) return normalized
  } catch {
    // fallback below
  }

  return searchFallbackPlaces(keyword, nearLat, nearLng)
}

export async function searchNearbyPOIs(category, lat, lng) {
  const results = await searchPOI(category, lat, lng)
  if (results.length > 0) {
    return results
      .map((result) => ({
        ...result,
        distanceKm: Number(haversineKm(lat, lng, result.lat, result.lng).toFixed(1)),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
  }
  return buildNearbyFallback(category, lat, lng)
}

function getRouteOptions({ allowNarrowRoads = false } = {}) {
  return [
    {
      searchOption: allowNarrowRoads ? '0' : '3',
      title: allowNarrowRoads ? '추천경로' : '쉬운길',
      tag: allowNarrowRoads ? '추천' : '쉬운길',
      tagColor: 'green',
      isBaseline: true,
    },
    { searchOption: '2', title: '빠른 도로', tag: '빠른', tagColor: 'blue' },
    { searchOption: '4', title: '고속도로 중심', tag: '고속우선', tagColor: 'blue' },
    { searchOption: '10', title: '최단거리', tag: '최단', tagColor: 'orange' },
  ]
}

export async function fetchRoutes(startLat, startLng, endLat, endLng, preferences = {}) {
  const routeOptions = getRouteOptions(preferences)
  const results = await Promise.allSettled(
    routeOptions.map((option) => fetchSingleRoute(startLat, startLng, endLat, endLng, option))
  )

  const routes = results
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => ({ ...result.value, source: 'live' }))

  if (routes.length === 0) {
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }

  return routes.filter((route, index, all) => all.findIndex((item) => Math.abs(item.eta - route.eta) < 5) === index)
}

async function fetchSingleRoute(startLat, startLng, endLat, endLng, option) {
  const body = {
    startX: String(startLng),
    startY: String(startLat),
    endX: String(endLng),
    endY: String(endLat),
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    searchOption: option.searchOption,
    trafficInfo: 'Y',
  }

  const res = await fetch(`${BASE}/routes?version=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let message = `TMAP HTTP ${res.status}`
    try {
      const json = await res.json()
      message = json?.error?.code || json?.error?.message || message
    } catch {
      // noop
    }
    throw new Error(message)
  }

  const json = await res.json()
  return parseRouteResponse(json, option)
}

function parseRouteResponse(json, option) {
  const features = json?.features ?? []
  if (!features.length) return null

  const summary = features[0]?.properties ?? {}
  const polyline = []
  let highwayDist = 0
  let nationalDist = 0
  let mergeCount = 0

  for (const feature of features) {
    if (feature.geometry?.type !== 'LineString') continue
    for (const coord of feature.geometry.coordinates) {
      polyline.push([coord[1], coord[0]])
    }
    const props = feature.properties ?? {}
    if ([4, 5, 6].includes(props.roadType)) highwayDist += props.distance ?? 0
    else nationalDist += props.distance ?? 0
    if (props.turnType === 14 || props.description?.includes('합류')) mergeCount += 1
  }

  const totalDistance = summary.totalDistance ?? highwayDist + nationalDist
  const totalTime = summary.totalTime ?? 0
  const trafficTime = summary.trafficTime ?? 0
  const totalFare = summary.totalFare ?? 0
  const totalDist = highwayDist + nationalDist || totalDistance
  const highwayRatio = Math.round((highwayDist / totalDist) * 100) || 0
  const nationalRoadRatio = 100 - highwayRatio
  const congestionScore = trafficTime / Math.max(totalTime, 1) > 0.3 ? 3 : trafficTime / Math.max(totalTime, 1) > 0.1 ? 2 : 1

  return {
    id: `route-${option.searchOption}`,
    title: option.title,
    explanation: buildExplanation(highwayRatio, mergeCount, congestionScore, option.isBaseline),
    eta: Math.ceil(totalTime / 60),
    distance: Math.round(totalDistance / 100) / 10,
    highwayRatio,
    nationalRoadRatio,
    mergeCount,
    congestionScore,
    congestionLabel: ['', '원활', '서행', '정체'][congestionScore],
    fixedCameraCount: Math.max(1, Math.round(highwayRatio / 25)),
    sectionCameraCount: highwayRatio >= 60 ? 1 : 0,
    sectionEnforcementDistance: highwayRatio >= 60 ? 6 : 0,
    dominantSpeedLimit: highwayRatio >= 60 ? 100 : 80,
    tollFee: totalFare,
    recommended: option.isBaseline === true || option.searchOption === '2',
    tag: option.tag,
    tagColor: option.tagColor,
    routeColor: option.isBaseline === true ? '#0064FF' : '#8E8E93',
    isBaseline: option.isBaseline === true,
    polyline,
  }
}

function buildExplanation(highwayRatio, mergeCount, congestionScore, isBaseline) {
  const parts = []
  if (isBaseline) parts.push('TMAP 기준')
  parts.push(highwayRatio >= 70 ? '고속도로 중심' : highwayRatio >= 40 ? '고속+국도 혼합' : '국도 위주')
  parts.push(mergeCount <= 4 ? '합류 단순' : `합류 ${mergeCount}회`)
  parts.push(congestionScore === 3 ? '정체 구간 포함' : congestionScore === 2 ? '서행 구간 있음' : '흐름 양호')
  return parts.join(' · ')
}

export async function reverseGeocode(lat, lng) {
  const params = new URLSearchParams({
    version: '1',
    lat: String(lat),
    lon: String(lng),
    coordType: 'WGS84GEO',
    addressType: 'A04',
  })
  try {
    const res = await fetch(`${BASE}/reversegeocoding?${params}`)
    if (!res.ok) throw new Error('역지오코딩 실패')
    const json = await res.json()
    return json?.addressInfo?.fullAddress ?? null
  } catch {
    const nearest = FALLBACK_SEARCH_PLACES.sort(
      (a, b) => haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng)
    )[0]
    return nearest?.address ?? null
  }
}
