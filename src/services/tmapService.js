import { HIGHWAYS } from '../data/highwayData'
import { ensureLiveRouteSource, normalizeSearchOption } from '../utils/navigationLogic'

const BASE = '/api/tmap'
const ROAD_KEYWORD_PATTERN = /(고속|국도|jc|ic|분기|인터체인지|나들목|휴게소|톨게이트)/i
// 도로명 주소 패턴: "효행로 250", "강남대로 123번길 45" 등
const ROAD_ADDRESS_PATTERN = /[가-힣]+(?:로|길|대로|avenue)\s*\d+/i

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
      address: road.startAddress ?? road.startName,
      lat: road.startCoord[0],
      lng: road.startCoord[1],
      category: road.roadClass === 'national' ? '국도' : '고속도로',
    },
    {
      id: `${road.id}-end`,
      name: `${road.name} 종점`,
      address: road.endAddress ?? road.endName,
      lat: road.endCoord[0],
      lng: road.endCoord[1],
      category: road.roadClass === 'national' ? '국도' : '고속도로',
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
  const isRoadAddress = ROAD_ADDRESS_PATTERN.test(keyword)

  if (isRoadAddress) {
    // 도로명/지번 주소: fullAddrGeo 우선, POI 병렬 시도
    const [addrResults, poiResults] = await Promise.all([
      fetchFullAddrGeo(keyword).catch(() => []),
      fetchPoiSearch(keyword, nearLat, nearLng).catch(() => []),
    ])
    const combined = [...addrResults, ...poiResults]
    const unique = combined.filter((item, index, all) =>
      all.findIndex((other) => Math.abs(other.lat - item.lat) < 0.0001 && Math.abs(other.lng - item.lng) < 0.0001) === index
    )
    if (unique.length > 0) return unique
  } else {
    // 건물명/업체명: POI 검색 (전체 + 업종 병렬)
    const [poiAll, poiBiz] = await Promise.all([
      fetchPoiSearch(keyword, nearLat, nearLng, 'A').catch(() => []),
      fetchPoiSearch(keyword, nearLat, nearLng, 'B').catch(() => []),
    ])
    // 중복 제거 (id 기준)
    const seen = new Set()
    const combined = [...poiAll, ...poiBiz].filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    if (combined.length > 0) return combined

    // POI 결과 없으면 fullAddrGeo도 시도
    const addrResults = await fetchFullAddrGeo(keyword).catch(() => [])
    if (addrResults.length > 0) return addrResults
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
  const body = {
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    startName: start.name ?? '출발',
    startX: String(start.lng),
    startY: String(start.lat),
    startTime: new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''),
    endName: destination.name ?? '도착',
    endX: String(destination.lng),
    endY: String(destination.lat),
    searchOption: normalizeSearchOption(option.searchOption ?? '00'),
    carType: '0',
    viaPoints: wayPoints.map((point, index) => ({
      viaPointId: point.id ?? `via-${index}`,
      viaPointName: point.name ?? `경유지 ${index + 1}`,
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
  const normalizedSearchOption = normalizeSearchOption(option.searchOption)
  const bodies = [
    {
      startX: String(startLng),
      startY: String(startLat),
      endX: String(endLng),
      endY: String(endLat),
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      searchOption: normalizedSearchOption,
    },
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
      searchOption: normalizedSearchOption,
      sort: 'index',
      trafficInfo: 'Y',
    },
  ]

  let lastMessage = 'TMAP 경로 응답 실패'
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
      return parseRouteResponse(json, option)
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

// TMAP turnType: 125=분기, 126=합류, 127=진입, 128=진출, 129=IC, 130=JC
const JUNCTION_TURN_TYPES = new Set([125, 126, 127, 128, 129, 130])

function parseRouteResponse(json, option) {
  const features = json?.features ?? []
  if (!features.length) return null

  const summary = json?.properties ?? features[0]?.properties ?? {}
  const polyline = []
  let highwayDist = 0
  let nationalDist = 0
  let mergeCount = 0
  const junctions = [] // 실제 IC/JC 분기점
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

      if ([4, 5, 6].includes(props.roadType)) highwayDist += dist
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
      if (JUNCTION_TURN_TYPES.has(Number(props.turnType)) && props.name) {
        mergeCount += 1
        const [lng, lat] = feature.geometry.coordinates
        const nextFeature = features.slice(fi + 1).find(f => f.geometry?.type === 'LineString')
        const afterRoadName = nextFeature?.properties?.roadName ?? ''
        const afterRoadNo = nextFeature?.properties?.roadNo ?? ''
        const afterRoadType = [4, 5, 6].includes(nextFeature?.properties?.roadType)
          ? 'highway' : 'national'
        // 이미 같은 위치에 추가된 분기점 중복 방지
        const isDup = junctions.some(j => Math.abs(j.lat - lat) < 0.001 && Math.abs(j.lng - lng) < 0.001)
        if (!isDup) {
          junctions.push({
            id: `jct-${junctions.length}`,
            name: props.name ?? props.description ?? `분기점 ${junctions.length + 1}`,
            lat,
            lng,
            turnType: Number(props.turnType),
            distanceFromStart: Math.round((props.totalDistance ?? accumulatedDist) / 100) / 10,
            afterRoadType,
            afterRoadName: afterRoadName
              ? (afterRoadNo ? `${afterRoadName} (${afterRoadNo}호선)` : afterRoadName)
              : (afterRoadType === 'highway' ? '고속도로' : '국도'),
          })
        }
      }
    }
  }

  const totalDistance = summary.totalDistance ?? highwayDist + nationalDist
  const totalTime = summary.totalTime ?? 0
  const trafficTime = summary.trafficTime ?? 0
  const totalFare = summary.totalFare ?? 0
  const totalDist = highwayDist + nationalDist || totalDistance
  const highwayRatio = Math.round((highwayDist / totalDist) * 100) || 0
  const nationalRoadRatio = 100 - highwayRatio
  const congestionScore = trafficTime / Math.max(totalTime, 1) > 0.3 ? 3 : trafficTime / Math.max(totalTime, 1) > 0.1 ? 2 : 1

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

  return ensureLiveRouteSource({
    id: option.id ?? `route-${option.searchOption}`,
    title: option.title,
    explanation: buildExplanation(highwayRatio, mergeCount, congestionScore, option.isBaseline),
    eta: Math.ceil(totalTime / 60),
    distance: Math.round(totalDistance / 100) / 10,
    highwayRatio,
    nationalRoadRatio,
    mergeCount,
    congestionScore,
    congestionLabel: ['', '원활', '서행', '정체'][congestionScore],
    fixedCameraCount,
    sectionCameraCount,
    sectionEnforcementDistance: highwayRatio >= 60 ? 6 : 0,
    dominantSpeedLimit: highwayRatio >= 60 ? 100 : 80,
    tollFee: totalFare,
    recommended: option.isBaseline === true || option.searchOption === '2',
    tag: option.tag,
    tagColor: option.tagColor,
    routeColor: option.isBaseline === true ? '#0064FF' : '#8E8E93',
    isBaseline: option.isBaseline === true,
    polyline,
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
