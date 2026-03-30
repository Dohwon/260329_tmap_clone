// T-map Open API 연동 서비스
// 브라우저 → /api/tmap/* → 서버 프록시 → apis.openapi.sk.com/tmap/*
// API 키는 server.js에서 주입 (클라이언트 노출 없음)

const BASE = '/api/tmap'

function getKey() { return '' }  // 서버 프록시가 키 주입

// ─── 장소 검색 ────────────────────────────────────────────────────────────────
export async function searchPOI(keyword, nearLat, nearLng) {
  const params = new URLSearchParams({
    version: '1',
    searchKeyword: keyword,
    resCoordType: 'WGS84GEO',
    reqCoordType: 'WGS84GEO',
    count: '15',
    appKey: getKey(),
    ...(nearLat && nearLng ? { centerLat: nearLat, centerLon: nearLng } : {}),
  })
  const res = await fetch(`${BASE}/pois?${params}`)
  if (!res.ok) throw new Error('POI 검색 실패')
  const json = await res.json()
  const pois = json?.searchPoiInfo?.pois?.poi ?? []
  return pois.map(p => ({
    id: p.id,
    name: p.name,
    address: [p.upperAddrName, p.middleAddrName, p.lowerAddrName].filter(Boolean).join(' '),
    lat: parseFloat(p.frontLat),
    lng: parseFloat(p.frontLon),
    category: p.mlClass ?? '',
  }))
}

// ─── 자동차 경로 탐색 (searchOption 별 3가지) ─────────────────────────────────
// searchOption: 0=최적, 4=최단, 10=고속도로우선, 12=국도우선
const ROUTE_OPTIONS = [
  { searchOption: '0',  title: '추천경로',    tag: '추천',   tagColor: 'blue' },
  { searchOption: '10', title: '고속도로 중심', tag: '고속우선', tagColor: 'blue' },
  { searchOption: '12', title: '국도 포함',    tag: '국도포함', tagColor: 'green' },
]

export async function fetchRoutes(startLat, startLng, endLat, endLng) {
  const results = await Promise.allSettled(
    ROUTE_OPTIONS.map(opt => fetchSingleRoute(startLat, startLng, endLat, endLng, opt))
  )
  const routes = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)

  // 중복 제거 (eta 5분 이내 동일 경로)
  const unique = routes.filter((r, i, arr) =>
    arr.findIndex(x => Math.abs(x.eta - r.eta) < 5) === i
  )
  return unique
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
    trafficInfo: 'Y',   // 실시간 교통 반영
  }
  const res = await fetch(`${BASE}/routes?version=1&callback=result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      appKey: getKey(),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  const json = await res.json()
  return parseRouteResponse(json, option)
}

function parseRouteResponse(json, option) {
  const features = json?.features ?? []
  if (!features.length) return null

  // 첫 번째 feature가 전체 요약
  const summary = features[0]?.properties ?? {}
  const totalDistance = summary.totalDistance ?? 0      // m
  const totalTime     = summary.totalTime ?? 0          // 초
  const totalFare     = summary.totalFare ?? 0          // 원
  const taxiFare      = summary.taxiFare ?? 0

  // 교통정보 지연시간
  const trafficTime   = summary.trafficTime ?? 0        // 초

  // 폴리라인 좌표 (LineString feature 모두 합치기)
  const polyline = []
  let highwayDist = 0
  let nationalDist = 0
  let mergeCount = 0
  let fixedCamCount = 0
  let sectionCamCount = 0

  for (const f of features) {
    if (f.geometry?.type === 'LineString') {
      for (const coord of f.geometry.coordinates) {
        polyline.push([coord[1], coord[0]])  // [lng,lat] → [lat,lng]
      }
      const props = f.properties ?? {}
      const dist = props.distance ?? 0
      // 도로 타입: 1=일반도로, 2=지방도, 3=국도, 4=고속국도, 5=도시고속, 6=고속도로
      if ([4, 5, 6].includes(props.roadType)) highwayDist += dist
      else nationalDist += dist

      if (props.turnType === 14 || props.description?.includes('합류')) mergeCount++
      if (props.speedLimit && props.trafficSpeed < props.speedLimit * 0.7) {}
    }
  }

  const totalDist = highwayDist + nationalDist || totalDistance
  const highwayRatio = Math.round((highwayDist / totalDist) * 100) || 0
  const nationalRatio = 100 - highwayRatio

  // 정체 점수 (실시간 교통 지연 기반)
  const delayRatio = trafficTime / (totalTime || 1)
  const congestionScore = delayRatio > 0.3 ? 3 : delayRatio > 0.1 ? 2 : 1
  const congestionLabel = ['', '원활', '서행', '정체'][congestionScore]

  // 설명 문구 자동 생성
  const explanation = buildExplanation({ highwayRatio, mergeCount, fixedCamCount, sectionCamCount, congestionScore, trafficTime })

  return {
    id: `route-${option.searchOption}`,
    title: option.title,
    explanation,
    eta: Math.ceil(totalTime / 60),
    distance: Math.round(totalDistance / 100) / 10,
    highwayRatio,
    nationalRoadRatio: nationalRatio,
    mergeCount,
    congestionScore,
    congestionLabel,
    fixedCameraCount: fixedCamCount,
    sectionCameraCount: sectionCamCount,
    sectionEnforcementDistance: sectionCamCount * 6,
    dominantSpeedLimit: highwayRatio > 50 ? 110 : 80,
    tollFee: totalFare,
    recommended: option.searchOption === '0',
    tag: option.tag,
    tagColor: option.tagColor,
    routeColor: option.searchOption === '0' ? '#0064FF' : '#8E8E93',
    polyline,
    rawSummary: summary,
  }
}

function buildExplanation({ highwayRatio, mergeCount, fixedCamCount, sectionCamCount, congestionScore, trafficTime }) {
  const parts = []
  if (highwayRatio >= 70) parts.push('고속도로 중심')
  else if (highwayRatio >= 40) parts.push('고속+국도 혼합')
  else parts.push('국도 위주')

  if (mergeCount <= 4) parts.push('합류 단순')
  else if (mergeCount <= 8) parts.push(`합류 ${mergeCount}회`)
  else parts.push(`합류 많음(${mergeCount}회)`)

  const totalCam = fixedCamCount + sectionCamCount
  if (totalCam === 0) parts.push('카메라 없음')
  else parts.push(`카메라 ${totalCam}개`)

  if (congestionScore === 3) parts.push('⚠️ 정체 구간 포함')
  else if (congestionScore === 2) parts.push('서행 구간 있음')

  return parts.join(' · ')
}

// ─── 역지오코딩 (현재위치 → 주소) ────────────────────────────────────────────
export async function reverseGeocode(lat, lng) {
  const params = new URLSearchParams({
    version: '1',
    lat: String(lat),
    lon: String(lng),
    coordType: 'WGS84GEO',
    addressType: 'A04',
    appKey: getKey(),
  })
  const res = await fetch(`${BASE}/reversegeocoding?${params}`)
  if (!res.ok) return null
  const json = await res.json()
  return json?.addressInfo?.fullAddress ?? null
}
