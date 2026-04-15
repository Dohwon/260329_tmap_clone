import { create } from 'zustand'

// 시뮬레이션 인터벌 ID (스토어 외부에 보관)
let _simIntervalId = null
import { HIGHWAYS } from '../data/highwayData'
import { SCENIC_SEGMENTS_SORTED } from '../data/scenicRoads'
import { PRESET_INFO, MOCK_RECENT_SEARCHES } from '../data/mockData'
import { enrichDestinationTarget, fetchDirectRoute, fetchRouteByWaypoints, fetchRoutes, fetchTmapStatus, searchNearbyPOIs, searchPOI, searchSafetyHazards } from '../services/tmapService'
import { analyzeRecordedDrive, analyzeRouteProgress, ensureLiveRouteSource, isUsableLiveRoute } from '../utils/navigationLogic'

const DEFAULT_CENTER = [37.5665, 126.978]
const DEFAULT_ORIGIN = { lat: 37.5665, lng: 126.978, speedKmh: 0, heading: 0, accuracy: null }
const LIVE_ROUTE_REQUEST_TTL_MS = 8000
const STORAGE_KEYS = {
  favorites: 'tmap_favorites_v3',
  recents: 'tmap_recent_searches_v3',
  savedRoutes: 'tmap_saved_routes_v1',
  cameraReports: 'tmap_camera_reports_v1',
  settings: 'tmap_settings_v1',
  restaurantRatings: 'tmap_restaurant_ratings_v1',
}

const DEFAULT_FAVORITES = [
  { id: 'home', name: '집', icon: '🏠', address: '', lat: null, lng: null },
  { id: 'work', name: '회사', icon: '🏢', address: '', lat: null, lng: null },
]

const DEFAULT_SETTINGS = {
  voiceGuidance: true,
  navigationLookAhead: true,
  navigationMinimalMap: true,
  mapTheme: 'auto',
  showTrafficOnMap: false,
  safetyModeEnabled: false,
  fuelBenefitEnabled: true,
  fuelBenefitBrand: 'SK에너지',
  fuelBenefitPercent: 5,
}

const LEGACY_FAVORITE_ADDRESSES = new Set(['서울시 강남구 테헤란로', '서울시 중구 을지로'])
const liveRouteRequestCache = new Map()
const liveRouteInflightRequests = new Map()

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // noop
  }
}

function sanitizeFavorites(favorites) {
  return (favorites ?? DEFAULT_FAVORITES).map((favorite) => (
    LEGACY_FAVORITE_ADDRESSES.has(favorite.address)
      ? { ...favorite, address: '', lat: null, lng: null }
      : favorite
  ))
}

function sanitizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings ?? {}),
  }
}

function buildLiveRouteRequestKey(origin, destination, waypoints = [], routePreferences = {}) {
  const waypointKey = dedupeWaypoints(waypoints)
    .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
    .map((point) => `${Number(point.lat).toFixed(5)},${Number(point.lng).toFixed(5)}`)
    .join('|')
  return JSON.stringify({
    origin: [Number(origin?.lat).toFixed(5), Number(origin?.lng).toFixed(5)],
    destination: [Number(destination?.lat).toFixed(5), Number(destination?.lng).toFixed(5)],
    waypointKey,
    roadType: routePreferences?.roadType ?? 'mixed',
    allowNarrowRoads: Boolean(routePreferences?.allowNarrowRoads),
  })
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

function sanitizePolyline(polyline = []) {
  return (polyline ?? [])
    .map((point) => normalizeCoordPair(point))
    .filter(Boolean)
}

function sanitizeRoutePointEntries(entries = [], { allowDistanceOnly = false } = {}) {
  return (entries ?? [])
    .map((entry) => {
      const coord = normalizeCoordPair(entry?.coord)
      const lat = Number(entry?.lat ?? coord?.[0])
      const lng = Number(entry?.lng ?? coord?.[1])
      const hasPoint = Number.isFinite(lat) && Number.isFinite(lng)
      const distanceFromStart = Number(entry?.distanceFromStart)

      if (!hasPoint && !(allowDistanceOnly && Number.isFinite(distanceFromStart))) {
        return null
      }

      return {
        ...entry,
        ...(hasPoint ? { lat, lng, coord: [lat, lng] } : {}),
        distanceFromStart: Number.isFinite(distanceFromStart) ? distanceFromStart : entry?.distanceFromStart,
      }
    })
    .filter(Boolean)
}

function sanitizeSegmentStats(segments = []) {
  return (segments ?? [])
    .map((segment) => {
      const positions = sanitizePolyline(segment?.positions ?? [])
      if (positions.length < 2) return null
      const start = positions[0]
      const end = positions[positions.length - 1]
      const center = normalizeCoordPair(segment?.center) ?? [
        Number(((start[0] + end[0]) / 2).toFixed(6)),
        Number(((start[1] + end[1]) / 2).toFixed(6)),
      ]

      return {
        ...segment,
        positions,
        center,
        speedLimit: Number.isFinite(Number(segment?.speedLimit)) ? Number(segment.speedLimit) : null,
        averageSpeed: Number.isFinite(Number(segment?.averageSpeed)) ? Number(segment.averageSpeed) : null,
        congestionScore: Number.isFinite(Number(segment?.congestionScore)) ? Number(segment.congestionScore) : 1,
      }
    })
    .filter(Boolean)
}

function dedupeWaypoints(waypoints = []) {
  const unique = []
  for (const point of waypoints ?? []) {
    const lat = Number(point?.lat)
    const lng = Number(point?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const duplicated = unique.some((existing) => haversineKm(existing.lat, existing.lng, lat, lng) <= 0.08)
    if (duplicated) continue
    unique.push({ ...point, lat, lng })
  }
  return unique.slice(0, 3)
}

function mergeWaypointsInRouteOrder(existingWaypoints = [], incomingWaypoint, referencePolyline = []) {
  if (!incomingWaypoint || !Number.isFinite(incomingWaypoint.lat) || !Number.isFinite(incomingWaypoint.lng)) {
    return dedupeWaypoints(existingWaypoints)
  }

  const base = dedupeWaypoints(existingWaypoints)
  const withoutDuplicate = base.filter((point) => haversineKm(point.lat, point.lng, incomingWaypoint.lat, incomingWaypoint.lng) > 0.08)
  const next = [...withoutDuplicate, incomingWaypoint]

  const scored = next.map((point, index) => {
    const routeOrderKm = Number.isFinite(point.routeOrderKm)
      ? point.routeOrderKm
      : getProgressKmOnPolyline([point.lat, point.lng], referencePolyline)
    return {
      ...point,
      routeOrderKm: Number.isFinite(routeOrderKm) ? Number(routeOrderKm.toFixed(1)) : null,
      _originalIndex: index,
    }
  })

  scored.sort((a, b) => {
    const orderA = Number.isFinite(a.routeOrderKm) ? a.routeOrderKm : Infinity
    const orderB = Number.isFinite(b.routeOrderKm) ? b.routeOrderKm : Infinity
    if (orderA !== orderB) return orderA - orderB
    return a._originalIndex - b._originalIndex
  })

  return scored.slice(0, 3).map(({ _originalIndex, ...point }) => point)
}

function getPolylineDistanceKm(polyline = []) {
  if (!Array.isArray(polyline) || polyline.length < 2) return 0
  let total = 0
  for (let index = 0; index < polyline.length - 1; index += 1) {
    total += haversineKm(polyline[index][0], polyline[index][1], polyline[index + 1][0], polyline[index + 1][1])
  }
  return Number(total.toFixed(2))
}

function samplePolyline(polyline = [], sampleSize = 12) {
  if (!Array.isArray(polyline) || polyline.length === 0) return []
  if (polyline.length <= sampleSize) return polyline
  return Array.from({ length: sampleSize }, (_, index) => {
    const ratio = index / Math.max(1, sampleSize - 1)
    return polyline[Math.min(polyline.length - 1, Math.round((polyline.length - 1) * ratio))]
  })
}

function areSimilarPolylines(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return false
  const aStart = a[0]
  const bStart = b[0]
  const aEnd = a[a.length - 1]
  const bEnd = b[b.length - 1]
  if (haversineKm(aStart[0], aStart[1], bStart[0], bStart[1]) > 0.25) return false
  if (haversineKm(aEnd[0], aEnd[1], bEnd[0], bEnd[1]) > 0.25) return false

  const aSample = samplePolyline(a)
  const bSample = samplePolyline(b, aSample.length)
  let diffSum = 0
  for (let index = 0; index < Math.min(aSample.length, bSample.length); index += 1) {
    diffSum += haversineKm(aSample[index][0], aSample[index][1], bSample[index][0], bSample[index][1])
  }
  const avgDiffKm = diffSum / Math.max(1, Math.min(aSample.length, bSample.length))
  const distanceGapKm = Math.abs(getPolylineDistanceKm(a) - getPolylineDistanceKm(b))
  return avgDiffKm <= 0.12 && distanceGapKm <= 1.5
}

function getRoadPath(road) {
  return [road.startCoord, ...road.majorJunctions.map((junction) => junction.coord), road.endCoord]
}

function projectPointToSegment(point, start, end) {
  const latFactor = 111320
  const lngFactor = 111320 * Math.cos((((point[0] + start[0] + end[0]) / 3) * Math.PI) / 180)
  const px = point[1] * lngFactor
  const py = point[0] * latFactor
  const ax = start[1] * lngFactor
  const ay = start[0] * latFactor
  const bx = end[1] * lngFactor
  const by = end[0] * latFactor
  const abx = bx - ax
  const aby = by - ay
  const ab2 = abx * abx + aby * aby

  if (ab2 === 0) {
    return { ratio: 0, distanceM: Math.hypot(px - ax, py - ay) }
  }

  const apx = px - ax
  const apy = py - ay
  const ratio = Math.min(1, Math.max(0, (apx * abx + apy * aby) / ab2))
  const closestX = ax + (abx * ratio)
  const closestY = ay + (aby * ratio)
  return {
    ratio,
    distanceM: Math.hypot(px - closestX, py - closestY),
  }
}

function getProgressKmOnPolyline(point, polyline = []) {
  if (!Array.isArray(point) || point.length < 2 || !Array.isArray(polyline) || polyline.length < 2) return null

  let travelledM = 0
  let bestDistanceM = Infinity
  let bestProgressKm = null

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = normalizeCoordPair(polyline[index])
    const end = normalizeCoordPair(polyline[index + 1])
    if (!start || !end) continue

    const segmentLengthM = haversineKm(start[0], start[1], end[0], end[1]) * 1000
    const projection = projectPointToSegment(point, start, end)
    if (projection.distanceM < bestDistanceM) {
      bestDistanceM = projection.distanceM
      bestProgressKm = (travelledM + (segmentLengthM * projection.ratio)) / 1000
    }
    travelledM += segmentLengthM
  }

  return bestProgressKm
}

function getDistanceKmToPolyline(point, polyline = []) {
  if (!Array.isArray(point) || point.length < 2 || !Array.isArray(polyline) || polyline.length < 2) return null

  let bestDistanceM = Infinity
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = normalizeCoordPair(polyline[index])
    const end = normalizeCoordPair(polyline[index + 1])
    if (!start || !end) continue
    const projection = projectPointToSegment(point, start, end)
    if (projection.distanceM < bestDistanceM) {
      bestDistanceM = projection.distanceM
    }
  }

  return Number.isFinite(bestDistanceM) ? Number((bestDistanceM / 1000).toFixed(1)) : null
}

function detectScenicRoads(origin, destination, polyline = [], minDetourMinutes = 20) {
  const MAX_SCENIC_AHEAD_KM = 80
  const MIN_FORWARD_PROGRESS_KM = 0
  const MAX_ROUTE_CORRIDOR_KM = 20

  const ranked = SCENIC_SEGMENTS_SORTED
    .filter((seg) => seg.detourMinutes >= minDetourMinutes)
    .map((seg) => {
      const [mLat, mLng] = seg.segmentMid
      const routeDistanceKm = getDistanceKmToPolyline([mLat, mLng], polyline)
      const directDistanceKm = Math.min(
        haversineKm(origin.lat, origin.lng, mLat, mLng),
        haversineKm(destination.lat, destination.lng, mLat, mLng)
      )
      const encounteredProgressKm = getProgressKmOnPolyline([mLat, mLng], polyline)
      const requiresBacktrack = Number.isFinite(encounteredProgressKm)
        ? encounteredProgressKm <= 0.5 && routeDistanceKm > 1.5
        : false
      return {
        ...seg,
        routeDistanceKm: Number(routeDistanceKm.toFixed(1)),
        directDistanceKm: Number(directDistanceKm.toFixed(1)),
        encounteredProgressKm: Number.isFinite(encounteredProgressKm) ? Number(encounteredProgressKm.toFixed(1)) : null,
        requiresBacktrack,
        isRecommended: routeDistanceKm <= 10,
        isReachableSoon: routeDistanceKm <= 30,
        recommendationMode: routeDistanceKm <= 10 ? 'nearby' : routeDistanceKm <= 30 ? 'reachable' : 'distant',
        noScenicWithin30Km: routeDistanceKm > 30,
      }
    })
    .filter((seg) => Number.isFinite(seg.routeDistanceKm) && seg.routeDistanceKm <= MAX_ROUTE_CORRIDOR_KM)
    .filter((seg) => Number.isFinite(seg.encounteredProgressKm))
    .filter((seg) => seg.encounteredProgressKm >= MIN_FORWARD_PROGRESS_KM)
    .filter((seg) => seg.encounteredProgressKm <= MAX_SCENIC_AHEAD_KM)
    .sort((a, b) => {
      if (a.requiresBacktrack !== b.requiresBacktrack) {
        return a.requiresBacktrack ? 1 : -1
      }
      const progressA = Number.isFinite(a.encounteredProgressKm) ? a.encounteredProgressKm : Infinity
      const progressB = Number.isFinite(b.encounteredProgressKm) ? b.encounteredProgressKm : Infinity
      if (progressA !== progressB) return progressA - progressB
      if (a.routeDistanceKm !== b.routeDistanceKm) return a.routeDistanceKm - b.routeDistanceKm
      return b.stars - a.stars
    })

  return ranked.slice(0, 6)
}

async function decorateScenicSuggestionsWithEntry(suggestions = []) {
  const resolved = await Promise.all(
    (suggestions ?? []).map(async (suggestion) => {
      const seed =
        suggestion?.viaPoints?.[0]
        ?? (Array.isArray(suggestion?.segmentMid)
          ? { name: suggestion.name, lat: suggestion.segmentMid[0], lng: suggestion.segmentMid[1] }
          : null)

      if (!seed || !Number.isFinite(seed.lat) || !Number.isFinite(seed.lng)) {
        return suggestion
      }

      try {
        const enriched = await enrichDestinationTarget({
          id: `scenic-entry-${suggestion.id}`,
          name: seed.name ?? suggestion.name,
          address: seed.address ?? seed.name ?? suggestion.roadLabel ?? suggestion.name,
          lat: seed.lat,
          lng: seed.lng,
        }, { preferRoadSnap: true })

        return {
          ...suggestion,
          entryName: enriched?.name ?? seed.name ?? suggestion.name,
          entryAddress: enriched?.address ?? seed.address ?? suggestion.roadLabel ?? null,
        }
      } catch {
        return {
          ...suggestion,
          entryName: seed.name ?? suggestion.name,
          entryAddress: seed.address ?? suggestion.roadLabel ?? null,
        }
      }
    })
  )

  return resolved
}

function getRoadById(roadId) {
  return HIGHWAYS.find((road) => road.id === roadId) ?? null
}

function buildRoadSegments(road) {
  const path = getRoadPath(road)
  return path.slice(1).map((coord, index) => {
    const previous = path[index]
    const speedLimit = road.id === 'sejongPocheon'
      ? (index === 0 ? 120 : 110)
      : road.number === '1' || road.number === '50'
        ? (index % 2 === 0 ? 110 : 100)
        : 100
    const averageSpeed = Math.max(55, speedLimit - (index % 3 === 1 ? 18 : 8))
    const congestionScore = averageSpeed < speedLimit * 0.6 ? 3 : averageSpeed < speedLimit * 0.8 ? 2 : 1
    return {
      id: `${road.id}-segment-${index}`,
      positions: [previous, coord],
      speedLimit,
      averageSpeed,
      congestionScore,
      center: [(previous[0] + coord[0]) / 2, (previous[1] + coord[1]) / 2],
    }
  })
}

function buildRoadCameras(road) {
  const path = getRoadPath(road)
  return path.slice(1).flatMap((coord, index) => {
    const previous = path[index]
    const mid = [(previous[0] + coord[0]) / 2, (previous[1] + coord[1]) / 2]
    const speedLimit = road.id === 'sejongPocheon'
      ? (index === 0 ? 120 : 110)
      : road.number === '1' || road.number === '50'
        ? (index % 2 === 0 ? 110 : 100)
        : 100
    const cameras = [
      {
        id: `${road.id}-fixed-${index}`,
        coord: mid,
        type: 'fixed',
        speedLimit,
        label: '지점 단속',
      },
    ]

    if (index % 2 === 1) {
      cameras.push(
        {
          id: `${road.id}-section-start-${index}`,
          coord: previous,
          type: 'section_start',
          speedLimit,
          label: '구간단속 시작',
          sectionLength: Number(haversineKm(previous[0], previous[1], coord[0], coord[1]).toFixed(1)),
        },
        {
          id: `${road.id}-section-end-${index}`,
          coord,
          type: 'section_end',
          speedLimit,
          label: '구간단속 종료',
        }
      )
    }
    return cameras
  })
}

function buildRoadRestStops(road) {
  // 실제 휴게소 데이터가 있으면 그대로 사용
  if (road.restStops && road.restStops.length > 0) {
    return road.restStops.map((stop) => ({
      id: stop.id ?? `${road.id}-rest-${stop.km}`,
      name: stop.name,
      coord: stop.coord,
      type: stop.type,
      km: stop.km,
    }))
  }
  // 폴백: 분기점 좌표 기반 생성 (국도 등)
  const path = getRoadPath(road)
  return path.slice(1, -1).map((coord, index) => ({
    id: `${road.id}-rest-${index}`,
    name: index % 2 === 0 ? `${road.shortName} 휴게소` : `${road.shortName} 졸음쉼터`,
    coord,
    type: index % 2 === 0 ? 'service' : 'drowsy',
    km: road.majorJunctions[index]?.km ?? Math.round((road.totalKm / Math.max(1, path.length - 1)) * (index + 1)),
  }))
}

function buildRoadSummary(road) {
  const segments = buildRoadSegments(road)
  return {
    maxSpeedLimit: Math.max(...segments.map((segment) => segment.speedLimit)),
    averageSpeed: Math.round(segments.reduce((sum, segment) => sum + segment.averageSpeed, 0) / segments.length),
    congestionLabel: segments.some((segment) => segment.congestionScore === 3)
      ? '정체'
      : segments.some((segment) => segment.congestionScore === 2)
        ? '서행'
        : '원활',
  }
}

/**
 * 도심 판단 밀도 패널티 (merge-strategy-rules.md 6-1항)
 * 반환값: 패널티 점수 (클수록 초보에게 불리)
 */
function calcUrbanDensityPenalty(route) {
  const junctions = route.junctions ?? []
  // 출발 후 첫 5km 내 분기점
  const earlyJcts = junctions.filter(j => (j.distanceFromStart ?? 0) <= 5)
  let penalty = 0

  // 고속비율 낮을수록 도심 판단 많음
  if (route.highwayRatio < 30) penalty += 8        // 저속 국도/도심
  else if (route.highwayRatio < 50) penalty += 4

  // 초반 5km 내 좌/우회전 연속 (turnType 12=좌, 13=우)
  const earlyLR = earlyJcts.filter(j => j.turnType === 12 || j.turnType === 13).length
  if (earlyLR >= 2) penalty += 10   // 좌회전 직후 우회전 = -10
  else if (earlyLR === 1) penalty += 5

  // 초반 분기 3개 이상 = 연속 판단 집중 = -10
  if (earlyJcts.length >= 3) penalty += 10
  else if (earlyJcts.length === 2) penalty += 5

  // 전체 합류 많으면 복잡
  if (route.mergeCount >= 10) penalty += 5
  else if (route.mergeCount >= 7) penalty += 2

  // 감점: 고속 본선 빠른 진입 후 20km+ 직진 → 초보에게 오히려 쉬움
  if (route.highwayRatio >= 75 && route.mergeCount <= 4) penalty = Math.max(0, penalty - 8)
  else if (route.highwayRatio >= 60 && route.mergeCount <= 6) penalty = Math.max(0, penalty - 4)

  return penalty
}

/**
 * 도심 밀도 기반 "초반 판단 난이도" 문구 반환
 * MergeOptionsSheet UI 표기용 (rules.md 9항)
 */
function getBeginnerNote(route, urbanPenalty) {
  if (urbanPenalty <= 0) {
    if (route.highwayRatio >= 70) return '초반 직진 구간 유지 · 차로변경 여유 충분'
    return '흐름 단순 · 합류 적음'
  }
  if (urbanPenalty >= 15) return '출발 직후 연속 회전 있음 · 초보 주의'
  if (urbanPenalty >= 8) return '초반 도심 구간 포함 · 판단 다소 필요'
  return '일부 도심 구간 통과'
}

// 합류 점수 계산 (merge-strategy-rules.md 5항 — 도심판단밀도패널티 포함)
function calcMergeScore(jct, idx, junctions, route) {
  const timeGain = -jct.addedTime
  const timePts = Math.min(20, Math.max(0, timeGain) * 2)

  // 흐름이득: 정체→서행=+6, 정체→원활=+12, 서행→원활=+5
  const congestionMap = { '원활': 0, '서행': 5, '정체': 12 }
  const routeCongestion = congestionMap[route.congestionLabel] ?? 0
  const afterCongestion = jct.afterRoadType === 'highway' ? Math.max(0, routeCongestion - 4) : routeCongestion
  const flowPts = routeCongestion - afterCongestion

  const mainKm = junctions[idx + 1]
    ? (junctions[idx + 1].distanceFromStart - jct.distanceFromStart)
    : Math.max(10, route.distance - jct.distanceFromStart)
  const maintPts = mainKm > 40 ? 14 : mainKm > 25 ? 9 : mainKm > 15 ? 5 : mainKm > 10 ? 2 : 0

  // 복잡도 패널티 (IC=-2, JC=-5, 합류 직후 차로변경=-6, 15km 내 재분기=-7)
  const isJC = /JC|분기/i.test(jct.name)
  const complexPenalty = isJC ? 5 : 2
  // 15km 내 재분기: 다음 분기가 15km 이내면 -7
  const nextJctKm = junctions[idx + 1] ? mainKm : Infinity
  const rebranchPenalty = nextJctKm < 15 ? 7 : 0

  // 원복 패널티
  const returnPenalty = mainKm < 10 ? 20 : mainKm < 15 ? 12 : 0

  // 도심 판단 밀도 패널티 (출발 5km 내 복잡도)
  const urbanPenalty = calcUrbanDensityPenalty(route)

  return timePts + flowPts + maintPts - complexPenalty - rebranchPenalty - returnPenalty - urbanPenalty
}

// 난이도 라벨 (도심 판단 밀도 반영 — rules.md 6, 6-1항)
function getMergeDifficulty(jct, idx, junctions, route) {
  const isJC = /JC|분기/i.test(jct.name)
  const mainKm = junctions[idx + 1]
    ? (junctions[idx + 1].distanceFromStart - jct.distanceFromStart)
    : 30

  // 도심 복잡도
  const earlyJcts = (route?.junctions ?? []).filter(j => (j.distanceFromStart ?? 0) <= 5)
  const earlyLR = earlyJcts.filter(j => j.turnType === 12 || j.turnType === 13).length
  const isUrbanComplex = (route?.highwayRatio ?? 50) < 40 && (earlyLR >= 1 || earlyJcts.length >= 2)

  if (isJC || mainKm < 10 || isUrbanComplex) return '상'
  if (mainKm < 20 || (route?.mergeCount ?? 5) >= 8) return '중'
  // 고속 20km+ 직진: 초보에게 쉬움
  if (mainKm >= 20 && (route?.highwayRatio ?? 50) >= 70) return '하'
  return '중'
}

function buildMergeOptions(route, selectedId, driverPreset = 'intermediate') {
  const junctions = route.junctions ?? []
  const routeDistance = route.distance ?? 50
  const routeEta = route.eta ?? 60

  // 거리/시간에 따른 성향 차이 적용 강도
  const isShort = routeDistance < 30 || routeEta < 35
  const isLong = routeDistance > 80 || routeEta > 60
  const isStrategic = routeDistance > 150 || routeEta > 120

  // 성향별 컷오프 점수 + 최대 노출 수
  const cutoff = isShort
    ? 999  // 짧은 구간: 성향 차이 거의 없음 — 기본 옵션만
    : driverPreset === 'expert' ? 8 : driverPreset === 'intermediate' ? 12 : 18
  const maxOptions = driverPreset === 'expert' ? 4 : driverPreset === 'intermediate' ? 3 : 2

  // 실제 분기점 있으면 분기점 기반 옵션 (merge-strategy-rules 적용)
  // 경로 전체 도심 밀도 (필터·표기에 공유)
  const routeUrbanPenalty = calcUrbanDensityPenalty(route)

  if (junctions.length > 0) {
    const allOptions = junctions.map((jct, idx) => {
      const isHighway = jct.afterRoadType === 'highway'
      const addedTime = idx === 0 ? 0 : Math.round((jct.distanceFromStart - junctions[0].distanceFromStart) * 0.8)
      const mainKm = junctions[idx + 1]
        ? Math.round((junctions[idx + 1].distanceFromStart - jct.distanceFromStart) * 10) / 10
        : Math.max(10, Math.round((routeDistance - jct.distanceFromStart) * 10) / 10)
      const difficulty = getMergeDifficulty(jct, idx, junctions, route)
      const score = calcMergeScore({ ...jct, addedTime }, idx, junctions, route)

      // 도로명: TMAP 데이터 우선, 없으면 분기점명+방향
      const afterRoadName = jct.afterRoadName
        || (isHighway
          ? `${jct.name.replace(/IC|JC|나들목|분기점/g, '').trim()} 방면 고속도로`
          : `${jct.name.replace(/IC|JC|나들목|분기점/g, '').trim()} 방면 국도`)
      const speedLimit = isHighway ? Math.max(100, route.dominantSpeedLimit) : Math.min(80, route.dominantSpeedLimit)
      const avgSpeedBefore = route.averageSpeed ?? 80
      const avgSpeedAfter = isHighway ? Math.min(100, avgSpeedBefore + 12) : Math.max(55, avgSpeedBefore - 8)

      return {
        id: `merge-jct-${idx}`,
        name: jct.name,
        distanceFromCurrent: jct.distanceFromStart,
        addedTime,
        timeSaving: -addedTime,  // 양수 = 절약
        maintainKm: mainKm,
        difficulty,
        score,
        fixedCameraCount: Math.max(1, Math.round(route.fixedCameraCount * mainKm / Math.max(1, routeDistance))),
        sectionCameraCount: isHighway ? 1 : 0,
        dominantSpeedLimit: speedLimit,
        avgSpeedBefore,
        avgSpeedAfter,
        isCurrent: idx === 0,
        afterRoadType: jct.afterRoadType,
        afterRoadName,
        afterDescription: isHighway
          ? `${jct.name}에서 진입 후 ${mainKm}km 구간 이어집니다.`
          : `${jct.name}에서 국도로 전환, ${mainKm}km 구간입니다.`,
        afterNextJunction: junctions[idx + 1] ? `다음: ${junctions[idx + 1].name} (${Math.round(mainKm)}km 후)` : '이후 직진',
        congestionPreview: route.congestionLabel,
        wayPoints: [{ id: `via-${jct.id}`, name: jct.name, lat: jct.lat, lng: jct.lng }],
        urbanDensityScore: routeUrbanPenalty,
        beginnerNote: getBeginnerNote(route, routeUrbanPenalty),
        isHidden: difficulty === '상' && driverPreset === 'beginner',
      }
    })

    // 성향별 최소 유지거리 (rules.md 4항)
    const minMaintainKm = driverPreset === 'beginner' ? 25 : driverPreset === 'intermediate' ? 15 : 10

    // 필터: 단거리이거나 컷오프 미달 시 첫 번째(현재경로) 빼고 숨김
    const filtered = allOptions.filter((opt, idx) => {
      if (idx === 0) return true  // 현재 경로는 항상 표시
      if (opt.isHidden) return false  // 초보에게 난이도 상 숨김
      if (isShort) return false  // 단거리: 나머지 숨김
      // 유지거리 컷오프 (성향별)
      if (opt.maintainKm < minMaintainKm) return false
      // 초보: 8분 이상 절약 또는 정체 2단계 이상 회피만 노출 (rules.md 4-초보)
      if (driverPreset === 'beginner') {
        const bigCongestionImprovement = route.congestionScore >= 3 && opt.afterRoadType === 'highway'
        if (opt.timeSaving < 8 && !bigCongestionImprovement) return false
      }
      if (isLong && opt.score < cutoff) return false
      return true
    }).slice(0, maxOptions)

    return filtered.map((option) => ({
      ...option,
      isSelected: option.id === (selectedId ?? filtered[0]?.id),
    }))
  }

  // 폴백: 3-옵션 (실제 분기점 없을 때)
  const fallbackOptions = [
    {
      id: 'merge-current',
      name: '현재 경로 유지',
      distanceFromCurrent: routeDistance * 0.15,
      addedTime: 0,
      timeSaving: 0,
      maintainKm: routeDistance * 0.7,
      difficulty: '하',
      score: 20,
      fixedCameraCount: route.fixedCameraCount,
      sectionCameraCount: route.sectionCameraCount,
      dominantSpeedLimit: route.dominantSpeedLimit,
      isCurrent: true,
      afterRoadType: route.highwayRatio >= 50 ? 'highway' : 'national',
      afterRoadName: route.highwayRatio >= 50 ? '현재 고속도로 본선 유지' : '현재 국도 유지',
      afterDescription: '현재 흐름을 유지하면서 가장 단순한 경로를 탑니다.',
      afterNextJunction: '다음 분기까지 직진 흐름이 이어집니다.',
      congestionPreview: route.congestionLabel,
      avgSpeedBefore: route.averageSpeed ?? 80,
      avgSpeedAfter: route.averageSpeed ?? 80,
      wayPoints: [],
    },
    ...(!isShort ? [
      {
        id: 'merge-highway',
        name: '분기점 통과 후 고속 본선 연결',
        distanceFromCurrent: routeDistance * 0.2,
        addedTime: -3,
        timeSaving: 3,
        maintainKm: routeDistance * 0.6,
        difficulty: '중',
        score: 15,
        fixedCameraCount: route.fixedCameraCount + 2,
        sectionCameraCount: Math.max(1, route.sectionCameraCount),
        dominantSpeedLimit: Math.max(100, route.dominantSpeedLimit),
        isCurrent: false,
        afterRoadType: 'highway',
        afterRoadName: '고속 본선 진입',
        afterDescription: '고속도로 본선 진입 후 정체 없이 이어집니다.',
        afterNextJunction: '고속 직진 구간으로 다시 연결됩니다.',
        congestionPreview: route.congestionScore >= 2 ? '원활' : route.congestionLabel,
        avgSpeedBefore: route.averageSpeed ?? 80,
        avgSpeedAfter: Math.min(100, (route.averageSpeed ?? 80) + 12),
        wayPoints: [],  // 폴백: 직선보간 좌표는 도로 위가 아니라 1100 에러 유발 → 빈 배열로 direct route
      },
    ] : []),
    ...(!isShort && driverPreset !== 'beginner' ? [
      {
        id: 'merge-national',
        name: '분기점 통과 후 국도 연결',
        distanceFromCurrent: routeDistance * 0.25,
        addedTime: 7,
        timeSaving: -7,
        maintainKm: routeDistance * 0.55,
        difficulty: '중',
        score: 10,
        fixedCameraCount: Math.max(0, route.fixedCameraCount - 1),
        sectionCameraCount: 0,
        dominantSpeedLimit: Math.min(80, route.dominantSpeedLimit),
        isCurrent: false,
        afterRoadType: 'national',
        afterRoadName: '국도 본선 전환',
        afterDescription: '신호·합류 증가하지만 정체 회피 가능 구간입니다.',
        afterNextJunction: '국도 본선과 연결됩니다.',
        congestionPreview: route.congestionScore === 3 ? '서행' : '원활',
        avgSpeedBefore: route.averageSpeed ?? 80,
        avgSpeedAfter: Math.max(55, (route.averageSpeed ?? 80) - 10),
        wayPoints: [],  // 폴백: offset 좌표는 도로 위가 아님 → 빈 배열로 searchOption으로만 구분
      },
    ] : []),
  ]

  const fallbackNote = getBeginnerNote(route, routeUrbanPenalty)
  return fallbackOptions.slice(0, maxOptions).map((option) => ({
    ...option,
    urbanDensityScore: routeUrbanPenalty,
    beginnerNote: fallbackNote,
    isSelected: option.id === (selectedId ?? 'merge-current'),
  }))
}

function buildPolyline(origin, destination, offsetLng = 0) {
  return Array.from({ length: 9 }, (_, index) => {
    const t = index / 8
    return [
      origin.lat + (destination.lat - origin.lat) * t,
      origin.lng + offsetLng * Math.sin(Math.PI * t) + (destination.lng - origin.lng) * t,
    ]
  })
}

function buildSegmentStats(route) {
  const pl = route.polyline ?? []
  const n = pl.length
  const totalDistance = Number(route.distance ?? 0)
  const baseAverageSpeed = route.averageSpeed ?? Math.max(35, route.dominantSpeedLimit - (route.congestionScore === 3 ? 28 : route.congestionScore === 2 ? 16 : 8))
  // 폴리라인 길이에 무관하게 균등 분포 (긴 TMAP 경로에서도 올바른 위치)
  const c0 = pl[Math.max(0, Math.floor(n * 0.15))]
  const c1 = pl[Math.max(0, Math.floor(n * 0.5))]
  const c2 = pl[Math.max(0, Math.floor(n * 0.85))]
  return [
    {
      id: `${route.id}-segment-0`,
      name: route.highwayRatio >= 50 ? '고속 본선' : '국도 본선',
      positions: pl.slice(0, Math.ceil(n / 3)),
      roadType: route.highwayRatio >= 50 ? 'highway' : 'national',
      speedLimit: route.dominantSpeedLimit,
      averageSpeed: Math.min(route.dominantSpeedLimit, Math.max(35, baseAverageSpeed + (route.highwayRatio >= 60 ? 6 : 2))),
      congestionScore: route.congestionScore,
      startProgressKm: 0,
      endProgressKm: Number((totalDistance / 3).toFixed(3)),
      center: c0,
    },
    {
      id: `${route.id}-segment-1`,
      name: '합류/연결 구간',
      positions: pl.slice(Math.ceil(n / 3), Math.ceil(n * 2 / 3)),
      roadType: route.highwayRatio >= 50 ? 'junction' : 'national',
      speedLimit: Math.max(70, route.dominantSpeedLimit - 10),
      averageSpeed: Math.max(30, Math.min(route.dominantSpeedLimit - 4, baseAverageSpeed - 8)),
      congestionScore: Math.min(3, route.congestionScore + 1),
      startProgressKm: Number((totalDistance / 3).toFixed(3)),
      endProgressKm: Number(((totalDistance * 2) / 3).toFixed(3)),
      center: c1,
    },
    {
      id: `${route.id}-segment-2`,
      name: '도착 진입',
      positions: pl.slice(Math.ceil(n * 2 / 3)),
      roadType: 'local',
      speedLimit: Math.max(50, route.dominantSpeedLimit - 30),
      averageSpeed: Math.max(25, Math.min(route.dominantSpeedLimit - 10, baseAverageSpeed - 15)),
      congestionScore: Math.min(3, route.congestionScore + 1),
      startProgressKm: Number(((totalDistance * 2) / 3).toFixed(3)),
      endProgressKm: Number(totalDistance.toFixed(3)),
      center: c2,
    },
  ]
}

function formatRouteSpeedSummary(route) {
  const maxSpeed = Number(route.maxSpeedLimit)
  const avgSpeed = Number(route.averageSpeed)
  const hasMax = Number.isFinite(maxSpeed) && maxSpeed > 0
  const hasAvg = Number.isFinite(avgSpeed) && avgSpeed > 0

  if (hasMax && hasAvg) return `최고 ${maxSpeed} / 평균 ${avgSpeed}km/h`
  if (hasAvg) return `평균 ${avgSpeed}km/h`
  if (hasMax) return `최고 ${maxSpeed}km/h`
  return '속도 실측값 없음'
}

function buildNextSegments(route) {
  return route.segmentStats.map((segment, index) => ({
    km: Number((index * Math.max(4.5, route.distance / 3)).toFixed(1)),
    roadName: segment.name,
    type: index === 1 ? 'junction' : index === 2 ? 'section' : 'highway',
    speedLimit: segment.speedLimit,
    congestion: segment.congestionScore,
  }))
}

function decorateRoute(route, index, context) {
  const { driverPreset, routePreferences } = context
  const safePolyline = sanitizePolyline(route.polyline)
  const safeManeuvers = sanitizeRoutePointEntries(route.maneuvers, { allowDistanceOnly: true })
  const safeJunctions = sanitizeRoutePointEntries(route.junctions, { allowDistanceOnly: true })
  const safeCameras = sanitizeRoutePointEntries(route.cameras).map((camera) => ({
    ...camera,
    endCoord: normalizeCoordPair(camera.endCoord),
  }))
  const safeSegmentStats = sanitizeSegmentStats(route.segmentStats)
  let eta = route.eta
  let mergeCount = route.mergeCount
  let highwayRatio = route.highwayRatio
  let nationalRoadRatio = route.nationalRoadRatio
  let localRoadRatio = route.localRoadRatio ?? Math.max(0, 100 - route.highwayRatio - route.nationalRoadRatio)
  let dominantSpeedLimit = route.dominantSpeedLimit
  let maxSpeedLimit = route.maxSpeedLimit ?? route.dominantSpeedLimit
  let averageSpeed = route.averageSpeed
  const routeDistance = route.distance ?? 0
  const urbanDensityPenalty = calcUrbanDensityPenalty(route)
  const urbanCongestionPressure = ((route.congestionScore ?? 1) * 4) + (urbanDensityPenalty * 0.9) + (localRoadRatio * 0.22)

  // 프리셋은 기본 경로 순서를 뒤집지 않고 설명/난이도/합류 옵션에만 반영한다.
  if (driverPreset === 'beginner') {
    mergeCount = Math.max(1, mergeCount - 1)
  } else if (driverPreset === 'expert') {
    mergeCount += 1
  }

  // 고속도로만 = 빠른 경로와 동일한 수준 (시간 유지, 고속비율만 표시 조정)
  if (!route.source && routePreferences.roadType === 'highway_only') {
    highwayRatio = Math.max(85, highwayRatio)
    nationalRoadRatio = 100 - highwayRatio
    localRoadRatio = Math.max(0, 100 - highwayRatio - nationalRoadRatio)
    dominantSpeedLimit = Math.max(100, dominantSpeedLimit)
    maxSpeedLimit = Math.max(110, maxSpeedLimit)
    averageSpeed = Math.max(averageSpeed ?? 0, 82)
  } else if (!route.source && routePreferences.roadType === 'national_road') {
    nationalRoadRatio = Math.max(58, nationalRoadRatio)
    highwayRatio = 100 - nationalRoadRatio
    localRoadRatio = Math.max(0, 100 - highwayRatio - nationalRoadRatio)
    dominantSpeedLimit = Math.min(80, dominantSpeedLimit)
    maxSpeedLimit = Math.min(90, maxSpeedLimit)
    averageSpeed = Math.min(averageSpeed ?? 68, 68)
    eta += 5
  }

  const nextRoute = {
    ...route,
    eta,
    mergeCount,
    highwayRatio,
    nationalRoadRatio,
    localRoadRatio,
    dominantSpeedLimit,
    maxSpeedLimit,
    averageSpeed,
    polyline: safePolyline,
    maneuvers: safeManeuvers,
    junctions: safeJunctions,
    cameras: safeCameras,
  }

  const difficultyScore = mergeCount + (nextRoute.congestionScore * 2)
  nextRoute.difficultyLabel = difficultyScore >= 12 ? '난이도 상' : difficultyScore >= 8 ? '난이도 중' : '난이도 하'
  nextRoute.difficultyColor = difficultyScore >= 12 ? 'red' : difficultyScore >= 8 ? 'orange' : 'green'
  nextRoute.segmentStats = safeSegmentStats.length > 0
    ? safeSegmentStats
    : route.source === 'live' || route.source === 'recorded'
      ? []
      : sanitizeSegmentStats(buildSegmentStats(nextRoute))
  const segmentAverageSpeeds = nextRoute.segmentStats
    .map((segment) => Number(segment.averageSpeed))
    .filter((speed) => Number.isFinite(speed) && speed > 0)
  const segmentSpeedLimits = nextRoute.segmentStats
    .map((segment) => Number(segment.speedLimit))
    .filter((speed) => Number.isFinite(speed) && speed > 0)
  nextRoute.averageSpeed = averageSpeed ?? (segmentAverageSpeeds.length > 0
    ? Math.round(segmentAverageSpeeds.reduce((sum, segmentSpeed) => sum + segmentSpeed, 0) / segmentAverageSpeeds.length)
    : null)
  nextRoute.maxSpeedLimit = maxSpeedLimit ?? (segmentSpeedLimits.length > 0 ? Math.max(...segmentSpeedLimits) : null)
  nextRoute.nextSegments = nextRoute.segmentStats.length > 0 ? buildNextSegments(nextRoute) : []

  // 도심 판단 밀도 (경로 카드·합류옵션 UI 표기용)
  nextRoute.urbanDensityScore = calcUrbanDensityPenalty(nextRoute)
  nextRoute.beginnerNote = getBeginnerNote(nextRoute, nextRoute.urbanDensityScore)

  // 초보 경로 설명: 도심 밀도 반영
  const urbanNote = driverPreset === 'beginner'
    ? (nextRoute.urbanDensityScore >= 10 ? '도심 구간 주의' : nextRoute.urbanDensityScore >= 5 ? '도심 일부 통과' : '초반 직진 유리')
    : null

  nextRoute.explanation = [
    driverPreset === 'beginner' ? '초보 기준' : driverPreset === 'expert' ? '고수 기준' : '중수 기준',
    routePreferences.roadType === 'highway_only' ? '고속 위주' : routePreferences.roadType === 'national_road' ? '국도 선호' : '고속+국도',
    `합류 ${mergeCount}회`,
    nextRoute.localRoadRatio >= 18 ? `일반도로 ${nextRoute.localRoadRatio}%` : null,
    formatRouteSpeedSummary(nextRoute),
    ...(urbanNote ? [urbanNote] : []),
  ].filter(Boolean).join(' · ')
  return nextRoute
}

function getRoutePreferenceScore(route, driverPreset) {
  const urbanDensityScore = route.urbanDensityScore ?? calcUrbanDensityPenalty(route)
  const congestionPenalty = (route.congestionScore ?? 1) * 5
  const localRoadPressure = (route.localRoadRatio ?? 0) * 0.18

  if (driverPreset === 'beginner') {
    return (
      (route.distance ?? 0) * 0.55 +
      (route.eta ?? 0) * 1.2 +
      (route.mergeCount ?? 0) * 3.6 +
      urbanDensityScore * 2.8 +
      congestionPenalty * 1.6 +
      localRoadPressure
    )
  }

  if (driverPreset === 'expert') {
    return (
      (route.eta ?? 0) * 2.8 +
      (route.distance ?? 0) * 0.15 +
      (route.mergeCount ?? 0) * 0.35 +
      urbanDensityScore * 0.35
    )
  }

  return (
    (route.eta ?? 0) * 2 +
    (route.distance ?? 0) * 0.25 +
    (route.mergeCount ?? 0) * 1.5 +
    urbanDensityScore * 1.1 +
    congestionPenalty * 0.8
  )
}

function rankRoutesByDriverPreset(routes, driverPreset) {
  return [...routes].sort((a, b) => {
    const etaDiff = (a.eta ?? Infinity) - (b.eta ?? Infinity)
    if (Math.abs(etaDiff) >= 1) return etaDiff
    const scoreDiff = getRoutePreferenceScore(a, driverPreset) - getRoutePreferenceScore(b, driverPreset)
    if (scoreDiff !== 0) return scoreDiff
    return (a.eta ?? Infinity) - (b.eta ?? Infinity)
  })
}

function buildFallbackRoutes(origin, destination, routePreferences, driverPreset) {
  const distanceKm = haversineKm(origin.lat, origin.lng, destination.lat, destination.lng)
  // 도로 유형별 실제 속도 가정 (시뮬레이션)
  // 고속도로: 직선 거리의 1.1배, 평균 100km/h → 도심 포함 조정
  // 혼합: 직선 거리의 1.25배, 평균 80km/h
  // 국도 포함: 직선 거리의 1.4배, 평균 65km/h
  const etaHighway = Math.max(15, Math.round((distanceKm * 1.1) / 100 * 60))
  const etaMixed = Math.max(20, Math.round((distanceKm * 1.25) / 80 * 60))
  const etaNational = Math.max(25, Math.round((distanceKm * 1.4) / 65 * 60))
  // 카메라: 고속도로 1개/6km, 국도 1개/10km (실제 수준)
  const hwCam = Math.max(2, Math.round(distanceKm * 1.1 / 6))
  const mixCam = Math.max(1, Math.round(distanceKm * 1.25 / 8))

  const configs = [
    {
      id: 'route-fast',
      title: '고속도로 중심',
      eta: etaHighway,
      distance: Number((distanceKm * 1.1).toFixed(1)),
      highwayRatio: 88,
      nationalRoadRatio: 12,
      mergeCount: 4,
      congestionScore: 1,
      congestionLabel: '원활',
      fixedCameraCount: hwCam,
      sectionCameraCount: Math.max(1, Math.round(hwCam / 4)),
      sectionEnforcementDistance: 10,
      dominantSpeedLimit: 110,
      tollFee: Math.round(distanceKm * 110),
      tag: '추천',
      tagColor: 'blue',
      routeColor: '#0064FF',
      polyline: buildPolyline(origin, destination, 0.03),
    },
    {
      id: 'route-mixed',
      title: '빠른 도로',
      eta: etaMixed,
      distance: Number((distanceKm * 1.25).toFixed(1)),
      highwayRatio: 68,
      nationalRoadRatio: 32,
      mergeCount: 7,
      congestionScore: 2,
      congestionLabel: '서행',
      fixedCameraCount: mixCam,
      sectionCameraCount: Math.max(1, Math.round(mixCam / 5)),
      sectionEnforcementDistance: 6,
      dominantSpeedLimit: 100,
      tollFee: Math.round(distanceKm * 75),
      tag: '고속+국도',
      tagColor: 'blue',
      routeColor: '#FF9500',
      polyline: buildPolyline(origin, destination, -0.07),
    },
    {
      id: 'route-national',
      title: '국도 포함',
      eta: etaNational,
      distance: Number((distanceKm * 1.4).toFixed(1)),
      highwayRatio: 38,
      nationalRoadRatio: 62,
      mergeCount: 12,
      congestionScore: 1,
      congestionLabel: '원활',
      fixedCameraCount: Math.max(1, Math.round(distanceKm * 1.4 / 12)),
      sectionCameraCount: 0,
      sectionEnforcementDistance: 0,
      dominantSpeedLimit: 80,
      tollFee: Math.round(distanceKm * 35),
      tag: '국도선호',
      tagColor: 'green',
      routeColor: '#00A84F',
      polyline: buildPolyline(origin, destination, 0.12),
    },
  ]

  return configs.map((route, index) => decorateRoute(route, index, { origin, destination, routePreferences, driverPreset }))
}

async function loadLiveRoutes(origin, destination, waypoints = [], routePreferences = {}) {
  const requestKey = buildLiveRouteRequestKey(origin, destination, waypoints, routePreferences)
  const cached = liveRouteRequestCache.get(requestKey)
  if (cached && Date.now() - cached.savedAt <= LIVE_ROUTE_REQUEST_TTL_MS) {
    return cached.routes.map((route) => ({ ...route }))
  }

  const inflight = liveRouteInflightRequests.get(requestKey)
  if (inflight) {
    return inflight.then((routes) => routes.map((route) => ({ ...route })))
  }

  const validWaypoints = dedupeWaypoints(waypoints)
    .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
    .filter((point) => {
      const fromOriginKm = haversineKm(origin.lat, origin.lng, point.lat, point.lng)
      const toDestinationKm = haversineKm(destination.lat, destination.lng, point.lat, point.lng)
      return fromOriginKm > 0.08 && toDestinationKm > 0.08
    })
  const requestPromise = (async () => {
    if (validWaypoints.length > 0) {
      try {
        const waypointRoute = await fetchRouteByWaypoints(
          { lat: origin.lat, lng: origin.lng, name: '출발' },
          destination,
          validWaypoints,
          { id: 'route-wp', searchOption: '00', title: `경유 ${validWaypoints.length}개소`, tag: '경유', tagColor: 'purple', isBaseline: true }
        )
        if (waypointRoute) {
          const routes = [ensureLiveRouteSource(waypointRoute)]
          liveRouteRequestCache.set(requestKey, { savedAt: Date.now(), routes })
          return routes
        }
      } catch (error) {
        if (String(error?.message ?? '').includes('잠시 후 다시 시도')) {
          throw error
        }
        // fall through to direct route lookup
      }
    }

    const directRoutes = await fetchRoutes(origin.lat, origin.lng, destination.lat, destination.lng, {
      allowNarrowRoads: routePreferences.allowNarrowRoads,
      roadType: routePreferences.roadType,
    })
    const routes = directRoutes.map((route) => ensureLiveRouteSource(route))
    liveRouteRequestCache.set(requestKey, { savedAt: Date.now(), routes })
    return routes
  })()

  liveRouteInflightRequests.set(requestKey, requestPromise)
  try {
    const routes = await requestPromise
    return routes.map((route) => ({ ...route }))
  } finally {
    liveRouteInflightRequests.delete(requestKey)
  }
}

async function resolveRoutingOrigin(origin) {
  return origin
}

function getActiveRoutingOrigin(state) {
  return state?.routeOrigin ?? state?.userLocation ?? DEFAULT_ORIGIN
}

const useAppStore = create((set, get) => ({
  activeTab: 'home',
  setActiveTab: (tab) => set({ activeTab: tab }),
  openSearchHome: () => set({ activeTab: 'search', searchMode: 'default', selectedNearbyCategory: null, nearbyPlaces: [], routeSearchTarget: 'destination' }),
  isSearchOverlayOpen: false,
  openSearchOverlay: (target = 'destination') => set({
    activeTab: 'home',
    isSearchOverlayOpen: true,
    searchMode: 'default',
    selectedNearbyCategory: null,
    nearbyPlaces: [],
    routeSearchTarget: target,
  }),
  closeSearchOverlay: () => set({ isSearchOverlayOpen: false }),

  mapCenter: DEFAULT_CENTER,
  mapZoom: 13,
  setMapCenter: (center, zoom) => set({ mapCenter: center, mapZoom: zoom ?? get().mapZoom }),

  userLocation: null,
  userAddress: '',
  routeOrigin: null,
  routeSearchTarget: 'destination',
  setRouteOrigin: (routeOrigin) => set({ routeOrigin }),
  clearRouteOrigin: () => set({ routeOrigin: null }),
  setRouteSearchTarget: (routeSearchTarget) => set({ routeSearchTarget }),
  locationHistory: [],
  drivePathHistory: [],
  driveSampleHistory: [],
  driveRouteSnapshot: null,
  navigationMatchedLocation: null,
  navigationProgressKm: 0,
  setUserLocation: (location) =>
    set((state) => {
      const activeRoute = state.isNavigating
        ? (state.routes.find((route) => route.id === state.selectedRouteId) ?? state.routes[0] ?? null)
        : null
      const routeProgress = activeRoute ? analyzeRouteProgress(activeRoute, location) : null
      const snapDistanceLimitM = Math.max(28, Math.min(85, Number(location.accuracy ?? 45)))
      const matchedLocation = routeProgress?.matchedLocation && routeProgress.distanceToRouteM != null && routeProgress.distanceToRouteM <= snapDistanceLimitM
        ? {
            ...location,
            lat: routeProgress.matchedLocation.lat,
            lng: routeProgress.matchedLocation.lng,
            rawLat: location.lat,
            rawLng: location.lng,
            snappedToRoute: true,
          }
        : null
      const trackedLocation = matchedLocation ?? location
      const nextPoint = [trackedLocation.lat, trackedLocation.lng]
      const rawProgressKm = Number(routeProgress?.progressKm ?? 0)
      const prevProgressKm = Number(state.navigationProgressKm ?? 0)
      const latestDriveSample = state.driveSampleHistory[state.driveSampleHistory.length - 1]
      const elapsedSinceLastSampleSec = latestDriveSample?.capturedAt
        ? (Date.now() - Date.parse(latestDriveSample.capturedAt)) / 1000
        : Infinity
      const currentSpeedKmh = Number.isFinite(Number(location.speedKmh)) ? Number(location.speedKmh) : 0
      const maxAdvanceKm = Math.max(0.04, ((Math.max(12, currentSpeedKmh) * Math.max(1, elapsedSinceLastSampleSec)) / 3600) * 2.4)
      const shouldHoldProgress =
        state.isNavigating &&
        Boolean(matchedLocation) &&
        Number.isFinite(prevProgressKm) &&
        Number.isFinite(rawProgressKm) &&
        (
          rawProgressKm + 0.08 < prevProgressKm ||
          rawProgressKm > prevProgressKm + maxAdvanceKm
        )
      const stableMatchedLocation = shouldHoldProgress
        ? (state.navigationMatchedLocation ?? matchedLocation)
        : matchedLocation
      const stableProgressKm = shouldHoldProgress
        ? prevProgressKm
        : rawProgressKm
      const latestDrivePoint = state.drivePathHistory[state.drivePathHistory.length - 1]
      const movedSinceLastDrivePointKm = latestDrivePoint
        ? haversineKm(latestDrivePoint[0], latestDrivePoint[1], nextPoint[0], nextPoint[1])
        : Infinity
      const shouldAppendDrivePoint = !latestDrivePoint
        || movedSinceLastDrivePointKm >= 0.004
        || (currentSpeedKmh >= 4 && elapsedSinceLastSampleSec >= 2)
        || (currentSpeedKmh < 4 && movedSinceLastDrivePointKm >= 0.0015 && elapsedSinceLastSampleSec >= 4)
      const sampleCapturedAt = new Date().toISOString()
      const speedDelta = latestDriveSample
        ? Math.abs((location.speedKmh ?? 0) - (latestDriveSample.speedKmh ?? 0))
        : Infinity
      const movedSinceLastSampleKm = latestDriveSample
        ? haversineKm(latestDriveSample.lat, latestDriveSample.lng, trackedLocation.lat, trackedLocation.lng)
        : Infinity
      const shouldAppendDriveSample = !latestDriveSample
        || movedSinceLastSampleKm >= 0.003
        || speedDelta >= 4
        || elapsedSinceLastSampleSec >= 2
      const nextDriveSample = {
        lat: trackedLocation.lat,
        lng: trackedLocation.lng,
        rawLat: location.lat,
        rawLng: location.lng,
        snappedToRoute: Boolean(matchedLocation),
        speedKmh: currentSpeedKmh,
        heading: Number.isFinite(Number(location.heading)) ? Number(location.heading) : null,
        capturedAt: sampleCapturedAt,
      }
      const currentStationary = state.stationaryVisitState
      const isSlowEnough = currentSpeedKmh <= 8
      const nextStationary = !isSlowEnough
        ? null
        : !currentStationary
          ? {
              anchorLat: location.lat,
              anchorLng: location.lng,
              startedAt: sampleCapturedAt,
              lastSeenAt: sampleCapturedAt,
              dwellMinutes: 0,
            }
          : haversineKm(currentStationary.anchorLat, currentStationary.anchorLng, location.lat, location.lng) <= 0.12
            ? {
                ...currentStationary,
                lastSeenAt: sampleCapturedAt,
                dwellMinutes: Number(Math.max(0, (Date.parse(sampleCapturedAt) - Date.parse(currentStationary.startedAt)) / 60000).toFixed(1)),
              }
            : {
                anchorLat: location.lat,
                anchorLng: location.lng,
                startedAt: sampleCapturedAt,
                lastSeenAt: sampleCapturedAt,
                dwellMinutes: 0,
              }

      return {
        userLocation: location,
        locationHistory: [...state.locationHistory.slice(-19), nextPoint],
        drivePathHistory: state.isNavigating && shouldAppendDrivePoint
          ? [...state.drivePathHistory.slice(-1999), nextPoint]
          : state.drivePathHistory,
        driveSampleHistory: state.isNavigating && shouldAppendDriveSample
          ? [...state.driveSampleHistory.slice(-1499), nextDriveSample]
          : state.driveSampleHistory,
        navigationMatchedLocation: state.isNavigating ? stableMatchedLocation : null,
        navigationProgressKm: state.isNavigating ? stableProgressKm : 0,
        stationaryVisitState: nextStationary,
      }
    }),
  setUserAddress: (userAddress) => set({ userAddress }),

  settings: sanitizeSettings(readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS)),
  updateSetting: (key, value) => set((state) => {
    const next = sanitizeSettings({ ...state.settings, [key]: value })
    writeStorage(STORAGE_KEYS.settings, next)
    return { settings: next }
  }),

  destination: null,
  setDestination: (destination) => set({ destination }),

  showRoutePanel: false,
  routePanelMode: 'full',
  setShowRoutePanel: (showRoutePanel) => set({ showRoutePanel }),
  setRoutePanelMode: (routePanelMode) => set({ routePanelMode }),
  addWaypoint: (point) => set((state) => ({
    waypoints: dedupeWaypoints([
      ...state.waypoints,
      { ...point, id: point.id ?? `wp-${Date.now()}` },
    ]),
  })),
  removeWaypoint: (id) => set((state) => ({
    waypoints: state.waypoints.filter(w => w.id !== id),
  })),
  clearWaypoints: () => set({ waypoints: [] }),
  reorderWaypoints: (from, to) => set((state) => {
    const arr = [...state.waypoints]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    return { waypoints: arr }
  }),
  waypoints: [],         // { id, name, lat, lng, address }
  routes: [],
  setRoutes: (routes) => set({ routes }),
  selectedRouteId: null,
  setSelectedRouteId: (selectedRouteId) => {
    const route = get().routes.find((item) => item.id === selectedRouteId)
    const userLocation = get().userLocation
    const routeProgress = route && userLocation ? analyzeRouteProgress(route, userLocation) : null
    set({
      selectedRouteId,
      mergeOptions: route ? buildMergeOptions(route, get().selectedMergeOptionId, get().driverPreset) : [],
      mapCenter: route?.polyline?.[Math.floor(route.polyline.length / 2)] ?? get().mapCenter,
      mapZoom: route ? 9 : get().mapZoom,
      navigationMatchedLocation: get().isNavigating && routeProgress?.matchedLocation ? {
        ...userLocation,
        lat: routeProgress.matchedLocation.lat,
        lng: routeProgress.matchedLocation.lng,
        rawLat: userLocation.lat,
        rawLng: userLocation.lng,
        snappedToRoute: true,
      } : get().navigationMatchedLocation,
      navigationProgressKm: get().isNavigating ? Number(routeProgress?.progressKm ?? 0) : get().navigationProgressKm,
    })
  },
  isLoadingRoutes: false,
  isNavigating: false,
  navAutoFollow: false,
  isRefreshingNavigation: false,
  navigationLastRefreshedAt: 0,
  setNavAutoFollow: (val) => set({ navAutoFollow: val }),
  startNavigation: async () => {
    const { userLocation, destination, routes, selectedRouteId } = get()
    // 내 위치로 지도 포커스
    const center = userLocation ? [userLocation.lat, userLocation.lng] : get().mapCenter
    let selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null
    const routeStart = selectedRoute?.polyline?.[0]
    const shouldRefreshLiveRoute =
      selectedRoute?.source !== 'recorded' && Boolean(destination && userLocation) && (
        !isUsableLiveRoute(selectedRoute)
        || !Array.isArray(routeStart)
        || haversineKm(userLocation.lat, userLocation.lng, routeStart[0], routeStart[1]) > 1.2
      )

    if (shouldRefreshLiveRoute) {
      selectedRoute = await get().refreshNavigationRoute('navigation-start')
    }

    if (!isUsableLiveRoute(selectedRoute)) {
      get().setTmapStatus({
        hasApiKey: get().tmapStatus.hasApiKey,
        mode: 'simulation',
        lastError: '실제 TMAP 경로를 받아오지 못해 안내를 시작할 수 없습니다.',
      })
      set({ showRoutePanel: true, routePanelMode: 'full' })
      return false
    }

    set({
      navigationMatchedLocation: userLocation && selectedRoute ? (() => {
        const routeProgress = analyzeRouteProgress(selectedRoute, userLocation)
        if (!routeProgress?.matchedLocation) return null
        return {
          ...userLocation,
          lat: routeProgress.matchedLocation.lat,
          lng: routeProgress.matchedLocation.lng,
          rawLat: userLocation.lat,
          rawLng: userLocation.lng,
          snappedToRoute: true,
        }
      })() : null,
      navigationProgressKm: userLocation && selectedRoute
        ? Number(analyzeRouteProgress(selectedRoute, userLocation).progressKm ?? 0)
        : 0,
      isNavigating: true,
      navAutoFollow: true,
      isSearchOverlayOpen: false,
      showRoutePanel: false,
      routePanelMode: 'full',
      mapCenter: center,
      mapZoom: 18,
      drivePathHistory: userLocation ? [[userLocation.lat, userLocation.lng]] : [],
      driveSampleHistory: userLocation ? [{
        lat: userLocation.lat,
        lng: userLocation.lng,
        speedKmh: Number.isFinite(Number(userLocation.speedKmh)) ? Number(userLocation.speedKmh) : 0,
        heading: Number.isFinite(Number(userLocation.heading)) ? Number(userLocation.heading) : null,
        capturedAt: new Date().toISOString(),
      }] : [],
      driveRouteSnapshot: selectedRoute ? {
        ...selectedRoute,
        polyline: [...(selectedRoute.polyline ?? [])],
        segmentStats: [...(selectedRoute.segmentStats ?? [])],
        nextSegments: [...(selectedRoute.nextSegments ?? [])],
        maneuvers: [...(selectedRoute.maneuvers ?? [])],
        junctions: [...(selectedRoute.junctions ?? [])],
        cameras: [...(selectedRoute.cameras ?? [])],
      } : null,
    })
    return true
  },
  stopNavigation: () => {
    // 내비 종료 시 시뮬레이션도 같이 정지
    if (_simIntervalId != null) {
      clearInterval(_simIntervalId)
      _simIntervalId = null
    }
    set({
      isNavigating: false,
      isDriveSimulation: false,
      driveSimulationForcedOffRoute: null,
      navAutoFollow: false,
      isSearchOverlayOpen: false,
      destination: null,
      routes: [],
      selectedRouteId: null,
      routePanelMode: 'full',
      isRefreshingNavigation: false,
      navigationLastRefreshedAt: 0,
      drivePathHistory: [],
      driveSampleHistory: [],
      driveRouteSnapshot: null,
      navigationMatchedLocation: null,
      navigationProgressKm: 0,
      scenicReferencePolyline: [],
    })
  },

  // ── 주행 시뮬레이터 ─────────────────────────────────
  isDriveSimulation: false,
  driveSimulationForcedOffRoute: null,

  startDriveSimulation: (speedKmh = 60) => {
    const { routes, selectedRouteId } = get()
    const route = routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null
    const polyline = route?.polyline ?? []
    if (polyline.length < 2) return

    if (_simIntervalId != null) {
      clearInterval(_simIntervalId)
      _simIntervalId = null
    }
    set({ isDriveSimulation: true, driveSimulationForcedOffRoute: null })

    const INTERVAL_MS = 250
    const cruiseSpeedKmh = speedKmh
    const tickSeconds = INTERVAL_MS / 1000

    // 폴리라인 세그먼트 길이 사전 계산
    const segLengths = []
    for (let i = 0; i < polyline.length - 1; i++) {
      segLengths.push(haversineKm(polyline[i][0], polyline[i][1], polyline[i + 1][0], polyline[i + 1][1]) * 1000)
    }

    // ── 시뮬레이션 상태 ──
    let segIdx = 0
    let offsetM = 0
    let currentSpeedKmh = 0           // 출발 시 0에서 가속
    let targetSpeedKmh = cruiseSpeedKmh
    let brakingStepsLeft = 0          // 급정거 지속 스텝
    let laneChangeStepsLeft = 0       // 차선변경 지속 스텝
    let desiredLaneOffsetM = 0
    let currentLaneOffsetM = 0
    let currentForcedOffsetM = 0
    let noiseLatM = 0
    let noiseLngM = 0

    // 측면 오프셋 → 위도/경도 변환
    const applyLateralOffset = (lat, lng, headingDeg, offsetM) => {
      if (Math.abs(offsetM) < 0.01) return { lat, lng }
      const perpRad = ((headingDeg + 90) % 360) * Math.PI / 180
      return {
        lat: lat + Math.cos(perpRad) * offsetM / 111320,
        lng: lng + Math.sin(perpRad) * offsetM / (111320 * Math.cos(lat * Math.PI / 180)),
      }
    }

    _simIntervalId = setInterval(() => {
      if (!get().isDriveSimulation) {
        clearInterval(_simIntervalId)
        _simIntervalId = null
        return
      }

      // ── 속도 이벤트 ──
      if (brakingStepsLeft > 0) {
        brakingStepsLeft -= 1
        targetSpeedKmh = brakingStepsLeft === 0 ? cruiseSpeedKmh : Math.max(18, cruiseSpeedKmh * 0.42)
      } else if (Math.random() < (cruiseSpeedKmh >= 140 ? 0.001 : 0.0025)) {
        brakingStepsLeft = 3 + Math.floor(Math.random() * 3)
        targetSpeedKmh = Math.max(18, cruiseSpeedKmh * 0.42)
      } else {
        targetSpeedKmh = cruiseSpeedKmh * (0.97 + Math.random() * 0.05)
      }

      const accelRateKmhPerSec = cruiseSpeedKmh >= 180 ? 56 : cruiseSpeedKmh >= 120 ? 40 : 24
      const brakeRateKmhPerSec = cruiseSpeedKmh >= 180 ? 78 : cruiseSpeedKmh >= 120 ? 58 : 42
      const accelStep = accelRateKmhPerSec * tickSeconds
      const brakeStep = brakeRateKmhPerSec * tickSeconds
      if (currentSpeedKmh < targetSpeedKmh) {
        currentSpeedKmh = Math.min(targetSpeedKmh, currentSpeedKmh + accelStep)
      } else {
        currentSpeedKmh = Math.max(targetSpeedKmh, currentSpeedKmh - (brakingStepsLeft > 0 ? brakeStep : accelStep * 1.4))
      }
      currentSpeedKmh = Math.max(0, currentSpeedKmh)

      // ── 차선변경 이벤트 ──
      laneChangeStepsLeft = 0
      desiredLaneOffsetM = 0
      currentLaneOffsetM += (desiredLaneOffsetM - currentLaneOffsetM) * 0.18

      const forcedOffRoute = get().driveSimulationForcedOffRoute
      if (forcedOffRoute?.remainingTicks > 0) {
        currentForcedOffsetM += (forcedOffRoute.offsetM - currentForcedOffsetM) * 0.24
        set({
          driveSimulationForcedOffRoute: forcedOffRoute.remainingTicks <= 1
            ? null
            : { ...forcedOffRoute, remainingTicks: forcedOffRoute.remainingTicks - 1 },
        })
      } else {
        currentForcedOffsetM *= 0.82
      }

      // ── 이동 거리 계산 ──
      let remaining = ((currentSpeedKmh * 1000) / 3600) * tickSeconds
      while (remaining > 0.001 && segIdx < segLengths.length) {
        const segLen = segLengths[segIdx]
        if (offsetM + remaining < segLen) {
          offsetM += remaining
          remaining = 0
        } else {
          remaining -= (segLen - offsetM)
          segIdx += 1
          offsetM = 0
        }
      }

      if (segIdx >= segLengths.length) {
        clearInterval(_simIntervalId)
        _simIntervalId = null
        set({ isDriveSimulation: false, driveSimulationForcedOffRoute: null })
        return
      }

      const segLen = segLengths[segIdx]
      const ratio = segLen > 0 ? Math.min(1, offsetM / segLen) : 0
      const p0 = polyline[segIdx]
      const p1 = polyline[segIdx + 1]
      const baseLat = p0[0] + (p1[0] - p0[0]) * ratio
      const baseLng = p0[1] + (p1[1] - p0[1]) * ratio

      const headingDeg = ((Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI + 360) % 360

      noiseLatM *= 0.75
      noiseLngM *= 0.75
      const noisedLat = baseLat + (noiseLatM / 111320)
      const noisedLng = baseLng + (noiseLngM / (111320 * Math.cos(baseLat * Math.PI / 180)))

      const { lat, lng } = applyLateralOffset(noisedLat, noisedLng, headingDeg, currentLaneOffsetM + currentForcedOffsetM)

      get().setUserLocation({
        lat,
        lng,
        speedKmh: Math.round(currentSpeedKmh),
        heading: headingDeg,
        accuracy: 4,
      })
    }, INTERVAL_MS)
  },

  stopDriveSimulation: () => {
    if (_simIntervalId != null) {
      clearInterval(_simIntervalId)
      _simIntervalId = null
    }
    set({ isDriveSimulation: false, driveSimulationForcedOffRoute: null })
  },

  triggerDriveSimulationOffRoute: (offsetM = 220, durationSec = 8) => {
    if (!get().isDriveSimulation) return
    const ticks = Math.max(4, Math.round((durationSec * 1000) / 250))
    set({
      driveSimulationForcedOffRoute: {
        offsetM,
        remainingTicks: ticks,
      },
    })
  },

  // ── 경로 저장 ──────────────────────────────────────
  savedRoutes: readStorage(STORAGE_KEYS.savedRoutes, []),
  restaurantRatings: readStorage(STORAGE_KEYS.restaurantRatings, {}),
  stationaryVisitState: null,
  rateRestaurant: ({ placeKey, rating, restaurant }) => {
    const normalizedRating = Number(rating)
    if (!placeKey || !Number.isFinite(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) return
    const entry = {
      placeKey,
      rating: normalizedRating,
      ratedAt: new Date().toISOString(),
      name: restaurant?.name ?? '',
      address: restaurant?.address ?? '',
      lat: Number.isFinite(Number(restaurant?.lat)) ? Number(restaurant.lat) : null,
      lng: Number.isFinite(Number(restaurant?.lng)) ? Number(restaurant.lng) : null,
      googlePlaceId: restaurant?.googlePlaceId ?? null,
    }
    const next = {
      ...get().restaurantRatings,
      [placeKey]: entry,
    }
    writeStorage(STORAGE_KEYS.restaurantRatings, next)
    set({ restaurantRatings: next })
  },
  saveRoute: ({ route, destination, name, forceNoMovement = false }) => {
    const actualDrivePath = get().drivePathHistory
    const actualDriveSamples = get().driveSampleHistory
    const routeSnapshot = get().driveRouteSnapshot ?? route
    const hasActualDrive = !forceNoMovement && actualDrivePath.length > 1
    const recordedPolyline = hasActualDrive ? actualDrivePath.slice(-1200) : []
    const recordedSamples = hasActualDrive ? actualDriveSamples.slice(-1200) : []
    const source = forceNoMovement
      ? 'no_movement'
      : hasActualDrive
        ? 'recorded'
        : (routeSnapshot?.source ?? 'live')
    const duplicate = source === 'recorded'
      ? get().savedRoutes.find((savedRoute) => savedRoute.source === 'recorded' && areSimilarPolylines(savedRoute.polyline, recordedPolyline))
      : null
    if (duplicate) return duplicate

    const routeAnalysis = source === 'recorded'
      ? analyzeRecordedDrive(recordedPolyline, recordedSamples, {
        polyline: routeSnapshot?.polyline ?? [],
        originalRoutePolyline: routeSnapshot?.polyline ?? [],
        junctions: routeSnapshot?.junctions ?? [],
      })
      : null

    const entry = {
      id: `saved-${Date.now()}`,
      name: name || (forceNoMovement
        ? `${destination?.name ?? '주행'} · 이동 없음`
        : (destination?.name ? `→ ${destination.name}` : '저장된 경로')),
      savedAt: new Date().toISOString(),
      distance: forceNoMovement
        ? 0
        : hasActualDrive
          ? getPolylineDistanceKm(recordedPolyline)
          : routeSnapshot?.distance,
      eta: forceNoMovement ? 0 : routeSnapshot?.eta,
      tollFee: routeSnapshot?.tollFee,
      highwayRatio: routeSnapshot?.highwayRatio,
      nationalRoadRatio: routeSnapshot?.nationalRoadRatio,
      localRoadRatio: routeSnapshot?.localRoadRatio,
      destination,
      polyline: source === 'recorded'
        ? recordedPolyline
        : source === 'no_movement'
          ? []
          : routeSnapshot?.polyline?.slice(0, 300) ?? [],
      originalRoutePolyline: routeSnapshot?.polyline?.slice(0, 300) ?? [],
      source,
      hasMovement: source === 'recorded',
      segmentStats: routeSnapshot?.segmentStats?.slice(0, 120) ?? [],
      nextSegments: routeSnapshot?.nextSegments?.slice(0, 32) ?? [],
      maneuvers: routeSnapshot?.maneuvers?.slice(0, 120) ?? [],
      junctions: routeSnapshot?.junctions?.slice(0, 80) ?? [],
      cameras: routeSnapshot?.cameras?.slice(0, 80) ?? [],
      dominantSpeedLimit: routeSnapshot?.dominantSpeedLimit,
      maxSpeedLimit: routeSnapshot?.maxSpeedLimit,
      averageSpeed: routeSnapshot?.averageSpeed,
      actualAverageMovingSpeed: routeAnalysis?.averageMovingSpeedKmh ?? null,
      actualMaxSpeed: routeAnalysis?.maxSpeedKmh ?? null,
      mergeCount: routeSnapshot?.mergeCount,
      congestionScore: routeSnapshot?.congestionScore,
      congestionLabel: routeSnapshot?.congestionLabel,
      fixedCameraCount: routeSnapshot?.fixedCameraCount,
      sectionCameraCount: routeSnapshot?.sectionCameraCount,
      routeAnalysis,
    }
    const next = [entry, ...get().savedRoutes].slice(0, 20)
    writeStorage(STORAGE_KEYS.savedRoutes, next)
    set({ savedRoutes: next })
    return entry
  },
  resumeSavedRoute: (savedRoute) => {
    if (!savedRoute || !Array.isArray(savedRoute.polyline) || savedRoute.polyline.length < 2) return
    const restoredRoute = decorateRoute({
      id: savedRoute.id,
      title: savedRoute.name,
      explanation: '실제 주행 저장 경로',
      eta: savedRoute.eta ?? 1,
      distance: savedRoute.distance ?? 0,
      highwayRatio: savedRoute.highwayRatio ?? 0,
      nationalRoadRatio: savedRoute.nationalRoadRatio ?? 0,
      localRoadRatio: savedRoute.localRoadRatio ?? 0,
      mergeCount: savedRoute.mergeCount ?? 0,
      congestionScore: savedRoute.congestionScore ?? 1,
      congestionLabel: savedRoute.congestionLabel ?? '원활',
      fixedCameraCount: savedRoute.fixedCameraCount ?? 0,
      sectionCameraCount: savedRoute.sectionCameraCount ?? 0,
      dominantSpeedLimit: savedRoute.dominantSpeedLimit ?? 80,
      maxSpeedLimit: savedRoute.maxSpeedLimit ?? savedRoute.dominantSpeedLimit ?? 80,
      averageSpeed: savedRoute.averageSpeed ?? 60,
      tollFee: savedRoute.tollFee ?? 0,
      routeColor: '#14B8A6',
      source: 'recorded',
      isBaseline: true,
      polyline: savedRoute.polyline,
      segmentStats: savedRoute.segmentStats ?? [],
      nextSegments: savedRoute.nextSegments ?? [],
      maneuvers: savedRoute.maneuvers ?? [],
      junctions: savedRoute.junctions ?? [],
      cameras: savedRoute.cameras ?? [],
    }, 0, {
      origin: getActiveRoutingOrigin(get()),
      destination: savedRoute.destination ?? { name: savedRoute.name, lat: savedRoute.polyline.at(-1)?.[0], lng: savedRoute.polyline.at(-1)?.[1] },
      routePreferences: get().routePreferences,
      driverPreset: get().driverPreset,
    })

    set({
      activeTab: 'home',
      destination: savedRoute.destination ?? get().destination,
      routes: [restoredRoute],
      selectedRouteId: restoredRoute.id,
      showRoutePanel: false,
      routePanelMode: 'peek',
      mergeOptions: buildMergeOptions(restoredRoute, 'merge-current', get().driverPreset),
      mapCenter: restoredRoute.polyline[Math.floor(restoredRoute.polyline.length / 2)],
      mapZoom: 11,
      selectedRoadId: null,
      waypoints: [],
    })
  },
  deleteSavedRoute: (id) => {
    const next = get().savedRoutes.filter((r) => r.id !== id)
    writeStorage(STORAGE_KEYS.savedRoutes, next)
    set({ savedRoutes: next })
  },

  // ── 카메라 신고 ────────────────────────────────────
  cameraReports: readStorage(STORAGE_KEYS.cameraReports, []),
  reportCamera: ({ id, coord, type }) => {
    const existing = get().cameraReports.find((r) => r.id === id)
    const next = existing
      ? get().cameraReports.map((r) => r.id === id ? { ...r, type, reportedAt: new Date().toISOString() } : r)
      : [{ id, coord, type, reportedAt: new Date().toISOString() }, ...get().cameraReports].slice(0, 200)
    writeStorage(STORAGE_KEYS.cameraReports, next)
    set({ cameraReports: next })
  },

  // 해안/산악도로 우회 제안
  scenicRoadSuggestions: [],   // DetectedScenicRoad[]
  scenicReferencePolyline: [],
  dismissScenicSuggestion: (id) => set((state) => ({
    scenicRoadSuggestions: state.scenicRoadSuggestions.filter((item) => item.id !== id),
  })),
  scenicRouteError: null,
  applyScenicRoute: async (suggestion) => {
    const state = get()
    const origin = getActiveRoutingOrigin(state)
    const { destination, routePreferences, driverPreset, waypoints, routes, selectedRouteId, scenicReferencePolyline } = state
    if (!destination) return
    set({ isLoadingRoutes: true, scenicRouteError: null })
    const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null
    const referencePolyline = Array.isArray(scenicReferencePolyline) && scenicReferencePolyline.length > 1
      ? scenicReferencePolyline
      : (selectedRoute?.polyline ?? [])

    // 경유지 좌표 후보: viaPoints → segmentMid → segmentStart/End 중간점 → POI 검색
    const coordCandidates = []
    if (suggestion.viaPoints?.length > 0) {
      coordCandidates.push(...suggestion.viaPoints.map((pt, i) => ({ id: `via-${i}`, name: pt.name, lat: pt.lat, lng: pt.lng })))
    }
    if (suggestion.segmentMid) {
      coordCandidates.push({ id: 'mid', name: suggestion.name, lat: suggestion.segmentMid[0], lng: suggestion.segmentMid[1] })
    }
    if (suggestion.segmentStart && suggestion.segmentEnd) {
      coordCandidates.push({
        id: 'se-mid', name: suggestion.name,
        lat: (suggestion.segmentStart[0] + suggestion.segmentEnd[0]) / 2,
        lng: (suggestion.segmentStart[1] + suggestion.segmentEnd[1]) / 2,
      })
    }

    // POI 검색으로 도로 위 좌표 추가 (TMAP이 반환하는 POI는 도로 근처)
    try {
      const [mLat, mLng] = suggestion.segmentMid ?? [0, 0]
      const poiResults = await searchPOI(suggestion.name, mLat, mLng)
      if (poiResults?.length > 0) {
        coordCandidates.push({ id: 'poi', name: poiResults[0].name, lat: poiResults[0].lat, lng: poiResults[0].lng })
      }
      // roadLabel 도로명도 검색 시도 (예: "국도 44호선")
      if (suggestion.roadLabel && poiResults?.length === 0) {
        const roadPoi = await searchPOI(suggestion.roadLabel, mLat, mLng)
        if (roadPoi?.length > 0) {
          coordCandidates.push({ id: 'road-poi', name: roadPoi[0].name, lat: roadPoi[0].lat, lng: roadPoi[0].lng })
        }
      }
    } catch {
      // POI 검색 실패는 무시
    }

    const snappedCandidates = []
    for (const candidate of coordCandidates) {
      try {
        const snapped = await enrichDestinationTarget({
          id: candidate.id,
          name: candidate.name,
          address: candidate.address ?? candidate.name ?? suggestion.name,
          lat: candidate.lat,
          lng: candidate.lng,
        }, { preferRoadSnap: true })
        if (!Number.isFinite(snapped?.lat) || !Number.isFinite(snapped?.lng)) continue
        const duplicated = snappedCandidates.some((existing) =>
          haversineKm(existing.lat, existing.lng, snapped.lat, snapped.lng) <= 0.08
        )
        if (duplicated) continue
        snappedCandidates.push(snapped)
      } catch {
        // 다음 후보 계속
      }
    }

    const scenicWaypoint = snappedCandidates[0]
    if (!scenicWaypoint) {
      set({
        isLoadingRoutes: false,
        scenicRouteError: `${suggestion.name} 경로를 찾을 수 없습니다. 경관 구간 후보를 실제 도로에 맞춰도 유효한 진입 좌표를 만들지 못했습니다.`,
      })
      return
    }

    try {
      const nextWaypoint = {
        ...scenicWaypoint,
        id: scenicWaypoint.id ?? `scenic-${suggestion.id}`,
        scenicId: suggestion.id,
        scenicType: suggestion.scenicType,
        scenicName: suggestion.name,
        routeOrderKm: getProgressKmOnPolyline([scenicWaypoint.lat, scenicWaypoint.lng], referencePolyline),
      }
      const mergedWaypoints = mergeWaypointsInRouteOrder(waypoints, nextWaypoint, referencePolyline)
      set({
        waypoints: mergedWaypoints,
        scenicRoadSuggestions: get().scenicRoadSuggestions.filter((s) => s.id !== suggestion.id),
      })
      await get().searchRoute(destination)
    } catch (err) {
      set({
        isLoadingRoutes: false,
        scenicRouteError: err?.message ?? '경관 경유지 적용 실패',
      })
    }
  },

  tmapStatus: { hasApiKey: false, mode: 'simulation', lastError: null },
  setTmapStatus: (patch) => set((state) => ({ tmapStatus: { ...state.tmapStatus, ...patch } })),

  driverPreset: 'intermediate',
  setDriverPreset: (driverPreset) => {
    set({ driverPreset })
    const { destination, isNavigating, routes, selectedRouteId } = get()
    if (isNavigating) {
      const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0]
      if (selectedRoute?.source === 'recorded') {
        set({
          mergeOptions: selectedRoute ? buildMergeOptions(selectedRoute, 'merge-current', driverPreset) : [],
        })
        return
      }
      if (destination) get().refreshNavigationRoute('preset-change')
      return
    }
    if (destination) get().searchRoute(destination)
  },

  routePreferences: {
    roadType: 'mixed',
    includeScenic: false,
    includeMountain: false,
    allowNarrowRoads: false,
  },
  setRoutePreference: (key, value) => {
    set((state) => ({
      routePreferences: { ...state.routePreferences, [key]: value },
    }))
    const { destination } = get()
    if (destination) get().searchRoute(destination)
  },

  visibleLayers: {
    speedCameras: true,
    sectionEnforcement: true,
    speedLimits: true,
    mergePoints: true,
    restStops: true,
    congestion: true,
  },
  toggleLayer: (key) => set((state) => ({ visibleLayers: { ...state.visibleLayers, [key]: !state.visibleLayers[key] } })),
  setLayerVisibility: (key, value) => set((state) => ({ visibleLayers: { ...state.visibleLayers, [key]: value } })),

  favorites: sanitizeFavorites(readStorage(STORAGE_KEYS.favorites, DEFAULT_FAVORITES)),
  saveFavorites: (favorites) => {
    const next = sanitizeFavorites(favorites)
    writeStorage(STORAGE_KEYS.favorites, next)
    set({ favorites: next })
  },
  updateFavorite: (favorite) => {
    const next = sanitizeFavorites(get().favorites.map((item) => (item.id === favorite.id ? favorite : item)))
    writeStorage(STORAGE_KEYS.favorites, next)
    set({ favorites: next })
  },
  addFavorite: (favorite) => {
    const next = sanitizeFavorites([...get().favorites, favorite])
    writeStorage(STORAGE_KEYS.favorites, next)
    set({ favorites: next })
  },
  deleteFavorite: (favoriteId) => {
    const next = get().favorites.filter((item) => item.id !== favoriteId)
    writeStorage(STORAGE_KEYS.favorites, next)
    set({ favorites: next })
  },

  recentSearches: readStorage(STORAGE_KEYS.recents, MOCK_RECENT_SEARCHES),
  addRecentSearch: (place) => {
    const next = [place, ...get().recentSearches.filter((item) => item.id !== place.id)].slice(0, 12)
    writeStorage(STORAGE_KEYS.recents, next)
    set({ recentSearches: next })
  },
  removeRecentSearch: (id) => {
    const next = get().recentSearches.filter((item) => item.id !== id)
    writeStorage(STORAGE_KEYS.recents, next)
    set({ recentSearches: next })
  },
  clearRecentSearches: () => {
    writeStorage(STORAGE_KEYS.recents, [])
    set({ recentSearches: [] })
  },

  searchMode: 'default',
  selectedNearbyCategory: null,
  nearbyPlaces: [],
  isLoadingNearby: false,
  homeRestaurantPins: [],
  homeRestaurantPinsLoadedAt: 0,
  showRecentSearches: () => set({ activeTab: 'search', searchMode: 'recent' }),
  openNearbyCategory: async (category) => {
    const origin = get().userLocation ?? DEFAULT_ORIGIN
    const selectedRoute = get().routes.find((route) => route.id === get().selectedRouteId) ?? null
    set({
      activeTab: 'search',
      isSearchOverlayOpen: false,
      searchMode: 'nearby',
      selectedNearbyCategory: category,
      nearbyPlaces: [],
      isLoadingNearby: true,
    })
    try {
      const nearbyPlaces = await searchNearbyPOIs(category, origin.lat, origin.lng, {
        routePolyline: selectedRoute?.polyline ?? [],
        fuelSettings: get().settings,
      })
      set({ nearbyPlaces, isLoadingNearby: false })
    } catch {
      set({ nearbyPlaces: [], isLoadingNearby: false })
    }
  },
  refreshHomeRestaurantPins: async (center = null) => {
    const fallbackCenter = normalizeCoordPair(get().mapCenter)
    const origin = center
      ? { lat: Number(center.lat), lng: Number(center.lng) }
      : fallbackCenter
        ? { lat: fallbackCenter[0], lng: fallbackCenter[1] }
        : (get().userLocation ?? DEFAULT_ORIGIN)
    try {
      const pins = await searchNearbyPOIs('음식점', origin.lat, origin.lng, {
        fuelSettings: get().settings,
      })
      set({
        homeRestaurantPins: (pins ?? []).filter((item) => (item.distanceKm ?? Infinity) <= 10).slice(0, 8).map((item) => ({
          ...item,
          referenceLat: origin.lat,
          referenceLng: origin.lng,
        })),
        homeRestaurantPinsLoadedAt: Date.now(),
      })
    } catch {
      set({ homeRestaurantPins: [], homeRestaurantPinsLoadedAt: Date.now() })
    }
  },
  searchRouteAlongRoad: async ({ road, viaPoint = null, direction = 'forward' }) => {
    if (!road) return

    const destination = direction === 'reverse'
      ? {
          name: road.startName ?? `${road.name} 시점`,
          address: road.startAddress ?? road.startName ?? `${road.name} 시점`,
          lat: road.startCoord[0],
          lng: road.startCoord[1],
        }
      : {
          name: road.endName ?? `${road.name} 종점`,
          address: road.endAddress ?? road.endName ?? `${road.name} 종점`,
          lat: road.endCoord[0],
          lng: road.endCoord[1],
        }

    const waypoint = viaPoint && Number.isFinite(viaPoint.lat) && Number.isFinite(viaPoint.lng)
      ? [await enrichDestinationTarget({
          id: viaPoint.id ?? `road-via-${Date.now()}`,
          name: viaPoint.name ?? '경유지',
          address: viaPoint.address ?? viaPoint.name ?? '',
          lat: viaPoint.lat,
          lng: viaPoint.lng,
        }, { preferRoadSnap: true })]
      : []

    set({ waypoints: waypoint })
    await get().searchRoute(destination)
  },

  safetyHazards: [],
  safetyLastLoadedAt: 0,
  refreshSafetyHazards: async () => {
    const state = get()
    // 60초 이내 중복 호출 방지
    if (Date.now() - state.safetyLastLoadedAt < 60000) return state.safetyHazards
    const origin = state.userLocation ?? DEFAULT_ORIGIN
    try {
      const hazards = await searchSafetyHazards(origin.lat, origin.lng)
      set({ safetyHazards: hazards, safetyLastLoadedAt: Date.now() })
      return hazards
    } catch {
      set({ safetyLastLoadedAt: Date.now() })
      return state.safetyHazards
    }
  },

  selectedRoadId: null,
  selectRoad: (roadId) => {
    const road = getRoadById(roadId)
    if (!road) return
    const midLat = (road.startCoord[0] + road.endCoord[0]) / 2
    const midLng = (road.startCoord[1] + road.endCoord[1]) / 2
    set({
      activeTab: 'home',
      selectedRoadId: roadId,
      mapCenter: [midLat, midLng],
      mapZoom: 7,
      showRoutePanel: false,
      routePanelMode: 'full',
    })
  },
  clearSelectedRoad: () => set({ selectedRoadId: null }),

  mergeOptions: [],
  selectedMergeOptionId: 'merge-current',
  setMergeOptions: (mergeOptions) => set({ mergeOptions }),
  selectMergeOption: (selectedMergeOptionId) => {
    set({ selectedMergeOptionId })
    const route = get().routes.find((item) => item.id === get().selectedRouteId)
    if (route) {
      set({ mergeOptions: buildMergeOptions(route, selectedMergeOptionId, get().driverPreset) })
    }
  },

  getSelectedRoadDetail: () => {
    const selectedRoad = getRoadById(get().selectedRoadId)
    if (!selectedRoad) return null
    return {
      ...selectedRoad,
      startAddress: selectedRoad.startAddress ?? selectedRoad.startName,
      endAddress: selectedRoad.endAddress ?? selectedRoad.endName,
      path: getRoadPath(selectedRoad),
      cameras: buildRoadCameras(selectedRoad),
      congestionSegments: buildRoadSegments(selectedRoad),
      restStops: buildRoadRestStops(selectedRoad),
      summary: buildRoadSummary(selectedRoad),
    }
  },

  searchRoute: async (destination) => {
    const normalizedDestination = await enrichDestinationTarget(destination)
    const origin = await resolveRoutingOrigin(getActiveRoutingOrigin(get()))
    const { routePreferences, driverPreset, scenicReferencePolyline, waypoints } = get()
    set({
      activeTab: 'home',
      destination: normalizedDestination,
      showRoutePanel: true,
      routePanelMode: 'full',
      isSearchOverlayOpen: false,
      isLoadingRoutes: true,
      routes: [],
      selectedRouteId: null,
      selectedRoadId: null,
    })
    get().addRecentSearch(normalizedDestination)

    const tmapStatus = await fetchTmapStatus()
    get().setTmapStatus({ ...tmapStatus, lastError: null })

    let liveRoutes = []
    try {
      liveRoutes = await loadLiveRoutes(origin, normalizedDestination, get().waypoints, routePreferences)
      if (liveRoutes.length > 0) {
        get().setTmapStatus({ hasApiKey: true, mode: 'live', lastError: null })
      }
    } catch (error) {
      get().setTmapStatus({
        hasApiKey: tmapStatus.hasApiKey,
        mode: 'simulation',
        lastError: error?.message ?? 'TMAP 경로 응답 실패',
      })
    }

    const decoratedRoutes = rankRoutesByDriverPreset(liveRoutes
      .map((route, index) => decorateRoute(route, index, {
        origin,
        destination: normalizedDestination,
        routePreferences,
        driverPreset,
      })), driverPreset)
    const selectedRouteId = decoratedRoutes[0]?.id ?? null
    const selectedRoute = decoratedRoutes[0] ?? null
    const hasScenicWaypoint = (waypoints ?? []).some((point) => point?.scenicId)
    const referencePolyline = hasScenicWaypoint && Array.isArray(scenicReferencePolyline) && scenicReferencePolyline.length > 1
      ? scenicReferencePolyline
      : (selectedRoute?.polyline ?? [])

    // 해안/산악도로 감지 — 타입별 독립 필터 (해안선호≠산악선호)
    const wantsCoastal = routePreferences.includeScenic || driverPreset === 'expert'
    const wantsMountain = routePreferences.includeMountain || driverPreset === 'expert'
    const rawScenicRoadSuggestions = (wantsCoastal || wantsMountain)
      ? detectScenicRoads(origin, normalizedDestination, referencePolyline)
          .filter(s => s.scenicType === 'coastal' ? wantsCoastal : wantsMountain)
      : []
    const scenicRoadSuggestions = await decorateScenicSuggestionsWithEntry(rawScenicRoadSuggestions)

    set({
      routes: decoratedRoutes,
      selectedRouteId,
      isLoadingRoutes: false,
      selectedMergeOptionId: 'merge-current',
      mergeOptions: selectedRoute ? buildMergeOptions(selectedRoute, 'merge-current', driverPreset) : [],
      mapCenter: selectedRoute?.polyline?.[Math.floor(selectedRoute.polyline.length / 2)] ?? [normalizedDestination.lat, normalizedDestination.lng],
      mapZoom: selectedRoute ? 8 : 14,
      scenicRoadSuggestions,
      scenicReferencePolyline: hasScenicWaypoint
        ? scenicReferencePolyline
        : (selectedRoute?.polyline?.slice(0, 400) ?? []),
    })
  },

  refreshNavigationRoute: async (reason = 'manual') => {
    const state = get()
    if (state.isRefreshingNavigation || !state.destination) return null

    const origin = await resolveRoutingOrigin(getActiveRoutingOrigin(state))
    set({ isRefreshingNavigation: true })

    try {
      const liveRoutes = await loadLiveRoutes(origin, state.destination, state.waypoints, state.routePreferences)
      if (liveRoutes.length === 0) throw new Error('TMAP 경로 응답 없음')

      const routes = rankRoutesByDriverPreset(liveRoutes.map((route, index) => decorateRoute(route, index, {
        origin,
        destination: state.destination,
        routePreferences: state.routePreferences,
        driverPreset: state.driverPreset,
      })), state.driverPreset)
      const selectedRoute = routes.find((route) => route.id === state.selectedRouteId) ?? routes[0] ?? null

      set({
        routes,
        selectedRouteId: selectedRoute?.id ?? null,
        selectedMergeOptionId: 'merge-current',
        mergeOptions: selectedRoute ? buildMergeOptions(selectedRoute, 'merge-current', state.driverPreset) : [],
        isRefreshingNavigation: false,
        navigationLastRefreshedAt: Date.now(),
      })
      get().setTmapStatus({
        hasApiKey: true,
        mode: 'live',
        lastError: reason === 'off-route' ? '경로 이탈 감지 후 재탐색 완료' : null,
      })
      return selectedRoute
    } catch (error) {
      set({
        isRefreshingNavigation: false,
        navigationLastRefreshedAt: Date.now(),
      })
      get().setTmapStatus({
        hasApiKey: state.tmapStatus.hasApiKey,
        mode: state.routes.some((route) => isUsableLiveRoute(route)) ? 'live' : state.tmapStatus.mode,
        lastError: error?.message ?? 'TMAP 실시간 재탐색 실패',
      })
      return null
    }
  },

  applyMergeOption: async (mergeOptionId) => {
    const state = get()
    const origin = getActiveRoutingOrigin(state)
    const destination = state.destination
    const baseRoute = state.routes.find((route) => route.id === state.selectedRouteId)
    const option = state.mergeOptions.find((item) => item.id === mergeOptionId)

    if (!destination || !baseRoute || !option) return

    set({
      isLoadingRoutes: true,
      selectedMergeOptionId: mergeOptionId,
      routePanelMode: 'peek',
    })

    // searchOption: '04'=유료도로 우선(고속), '00'=추천(국도/혼합)
    const searchOption = option.afterRoadType === 'highway' ? '04' : '00'
    const routeOpt = {
      searchOption,
      title: option.afterRoadName,
      tag: option.isCurrent ? '현재' : '합류',
      tagColor: option.afterRoadType === 'national' ? 'green' : 'blue',
      isBaseline: option.isCurrent,
    }

    let liveRoute = null
    const wayPoints = (option.wayPoints ?? []).filter(p => p.lat && p.lng)

    // 실제 TMAP 분기점 좌표(junction)가 있으면 routeSequential30 시도
    if (wayPoints.length > 0) {
      try {
        liveRoute = await fetchRouteByWaypoints(
          { ...origin, name: '현재 위치' }, destination, wayPoints, routeOpt
        )
      } catch {
        // routeSequential30 실패 — 아래 fetchDirectRoute로 폴백
      }
    }

    // 직접 경로 (/routes API) — via point 없이 searchOption만으로 경로 유형 결정
    if (!liveRoute) {
      try {
        liveRoute = await fetchDirectRoute(
          origin.lat, origin.lng, destination.lat, destination.lng, routeOpt
        )
      } catch {
        // 두 번째도 실패하면 liveRoute = null
      }
    }

    if (liveRoute) {
      const decorated = decorateRoute(
        { ...liveRoute, title: option.afterRoadName || liveRoute.title, tag: option.isCurrent ? '현재' : '합류' },
        0,
        { origin, destination, routePreferences: state.routePreferences, driverPreset: state.driverPreset }
      )
      set({
        routes: [decorated, ...state.routes.filter((route) => route.id !== decorated.id)],
        selectedRouteId: decorated.id,
        mergeOptions: buildMergeOptions(decorated, mergeOptionId, state.driverPreset),
        isLoadingRoutes: false,
        mapCenter: decorated.polyline[Math.floor(decorated.polyline.length / 2)],
        mapZoom: 9,
      })
      get().setTmapStatus({ hasApiKey: true, mode: 'live', lastError: null })
      return
    }

    // TMAP 완전 실패: UI만 업데이트, 에러 배너 없이 조용히 폴백
    set({
      mergeOptions: buildMergeOptions(baseRoute, mergeOptionId, state.driverPreset),
      isLoadingRoutes: false,
    })
  },
}))

export default useAppStore
