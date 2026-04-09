import { create } from 'zustand'
import { HIGHWAYS } from '../data/highwayData'
import { SCENIC_SEGMENTS_SORTED } from '../data/scenicRoads'
import { PRESET_INFO, MOCK_RECENT_SEARCHES } from '../data/mockData'
import { fetchRouteByWaypoints, fetchRoutes, fetchTmapStatus, searchNearbyPOIs } from '../services/tmapService'

const DEFAULT_CENTER = [37.5665, 126.978]
const DEFAULT_ORIGIN = { lat: 37.5665, lng: 126.978, speedKmh: 0, heading: 0, accuracy: null }
const STORAGE_KEYS = {
  favorites: 'tmap_favorites_v3',
  recents: 'tmap_recent_searches_v3',
  savedRoutes: 'tmap_saved_routes_v1',
  cameraReports: 'tmap_camera_reports_v1',
}

const DEFAULT_FAVORITES = [
  { id: 'home', name: '집', icon: '🏠', address: '', lat: null, lng: null },
  { id: 'work', name: '회사', icon: '🏢', address: '', lat: null, lng: null },
]

const LEGACY_FAVORITE_ADDRESSES = new Set(['서울시 강남구 테헤란로', '서울시 중구 을지로'])

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

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function getRoadPath(road) {
  return [road.startCoord, ...road.majorJunctions.map((junction) => junction.coord), road.endCoord]
}

/**
 * 경로 근처의 해안/산악 경관 구간을 감지하여 반환
 * - 폴리라인의 샘플 포인트 중 하나가 segment.nearKm 이내에 있으면 "근처"
 * - detourMinutes >= minDetourMinutes 인 것만 반환
 * - 같은 타입(coastal/mountain) 최대 MAX_PER_TYPE개까지만
 */
function detectScenicRoads(origin, destination, polyline = [], minDetourMinutes = 20) {
  // 경로 전체에서 최대 12개 포인트 샘플
  const step = Math.max(1, Math.floor(polyline.length / 12))
  const checkPoints = [
    [origin.lat, origin.lng],
    [destination.lat, destination.lng],
    ...polyline.filter((_, i) => i % step === 0),
  ]

  const MAX_PER_TYPE = 2
  const countByType = { coastal: 0, mountain: 0 }

  return SCENIC_SEGMENTS_SORTED.filter((seg) => {
    if (seg.detourMinutes < minDetourMinutes) return false
    if (countByType[seg.scenicType] >= MAX_PER_TYPE) return false

    const [mLat, mLng] = seg.segmentMid
    const isNear = checkPoints.some(([lat, lng]) =>
      haversineKm(lat, lng, mLat, mLng) <= seg.nearKm
    )
    if (isNear) countByType[seg.scenicType]++
    return isNear
  })
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
        name: '고속 본선 재합류',
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
        wayPoints: (() => {
          const pt = route.polyline?.[Math.floor((route.polyline?.length ?? 0) / 4)]
          return pt ? [{ id: 'via-highway', name: '고속 재합류 지점', lat: pt[0], lng: pt[1] }] : []
        })(),
      },
    ] : []),
    ...(!isShort && driverPreset !== 'beginner' ? [
      {
        id: 'merge-national',
        name: '국도로 전환',
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
        wayPoints: (() => {
          const pt = route.polyline?.[Math.floor((route.polyline?.length ?? 0) / 3)]
          return pt ? [{ id: 'via-national', name: '국도 전환 지점', lat: pt[0] + 0.008, lng: pt[1] - 0.012 }] : []
        })(),
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
      averageSpeed: Math.max(35, route.dominantSpeedLimit - (route.congestionScore === 3 ? 28 : route.congestionScore === 2 ? 16 : 8)),
      congestionScore: route.congestionScore,
      center: c0,
    },
    {
      id: `${route.id}-segment-1`,
      name: '합류/연결 구간',
      positions: pl.slice(Math.ceil(n / 3), Math.ceil(n * 2 / 3)),
      roadType: route.highwayRatio >= 50 ? 'junction' : 'national',
      speedLimit: Math.max(70, route.dominantSpeedLimit - 10),
      averageSpeed: Math.max(30, route.dominantSpeedLimit - 24),
      congestionScore: Math.min(3, route.congestionScore + 1),
      center: c1,
    },
    {
      id: `${route.id}-segment-2`,
      name: '도착 진입',
      positions: pl.slice(Math.ceil(n * 2 / 3)),
      roadType: 'local',
      speedLimit: Math.max(50, route.dominantSpeedLimit - 30),
      averageSpeed: Math.max(25, route.dominantSpeedLimit - 36),
      congestionScore: Math.min(3, route.congestionScore + 1),
      center: c2,
    },
  ]
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
  let eta = route.eta
  let mergeCount = route.mergeCount
  let highwayRatio = route.highwayRatio
  let nationalRoadRatio = route.nationalRoadRatio
  let dominantSpeedLimit = route.dominantSpeedLimit

  // 초보: 시간 페널티 없음 — 단순히 합류 횟수를 줄여서 표시
  if (driverPreset === 'beginner') {
    mergeCount = Math.max(1, mergeCount - 2)
  } else if (driverPreset === 'expert') {
    eta = Math.max(eta - 2, 1)
    mergeCount += 1
  }

  // 고속도로만 = 빠른 경로와 동일한 수준 (시간 유지, 고속비율만 표시 조정)
  if (routePreferences.roadType === 'highway_only') {
    highwayRatio = Math.max(85, highwayRatio)
    nationalRoadRatio = 100 - highwayRatio
    dominantSpeedLimit = Math.max(100, dominantSpeedLimit)
  } else if (routePreferences.roadType === 'national_road') {
    nationalRoadRatio = Math.max(58, nationalRoadRatio)
    highwayRatio = 100 - nationalRoadRatio
    dominantSpeedLimit = Math.min(80, dominantSpeedLimit)
    eta += 5
  }

  const nextRoute = {
    ...route,
    eta,
    mergeCount,
    highwayRatio,
    nationalRoadRatio,
    dominantSpeedLimit,
  }

  const difficultyScore = mergeCount + (nextRoute.congestionScore * 2)
  nextRoute.difficultyLabel = difficultyScore >= 12 ? '난이도 상' : difficultyScore >= 8 ? '난이도 중' : '난이도 하'
  nextRoute.difficultyColor = difficultyScore >= 12 ? 'red' : difficultyScore >= 8 ? 'orange' : 'green'
  nextRoute.segmentStats = buildSegmentStats(nextRoute)
  nextRoute.averageSpeed = Math.round(nextRoute.segmentStats.reduce((sum, segment) => sum + segment.averageSpeed, 0) / nextRoute.segmentStats.length)
  nextRoute.maxSpeedLimit = Math.max(...nextRoute.segmentStats.map((segment) => segment.speedLimit))
  nextRoute.nextSegments = buildNextSegments(nextRoute)

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
    `최고 ${nextRoute.maxSpeedLimit} / 평균 ${nextRoute.averageSpeed}km/h`,
    ...(urbanNote ? [urbanNote] : []),
  ].join(' · ')
  return nextRoute
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

const useAppStore = create((set, get) => ({
  activeTab: 'home',
  setActiveTab: (tab) => set({ activeTab: tab }),
  openSearchHome: () => set({ activeTab: 'search', searchMode: 'default', selectedNearbyCategory: null, nearbyPlaces: [] }),

  mapCenter: DEFAULT_CENTER,
  mapZoom: 13,
  setMapCenter: (center, zoom) => set({ mapCenter: center, mapZoom: zoom ?? get().mapZoom }),

  userLocation: null,
  userAddress: '',
  locationHistory: [],
  setUserLocation: (location) =>
    set((state) => ({
      userLocation: location,
      locationHistory: [...state.locationHistory.slice(-19), [location.lat, location.lng]],
    })),
  setUserAddress: (userAddress) => set({ userAddress }),

  destination: null,
  setDestination: (destination) => set({ destination }),

  showRoutePanel: false,
  routePanelMode: 'full',
  setShowRoutePanel: (showRoutePanel) => set({ showRoutePanel }),
  setRoutePanelMode: (routePanelMode) => set({ routePanelMode }),
  routes: [],
  setRoutes: (routes) => set({ routes }),
  selectedRouteId: null,
  setSelectedRouteId: (selectedRouteId) => {
    const route = get().routes.find((item) => item.id === selectedRouteId)
    set({
      selectedRouteId,
      mergeOptions: route ? buildMergeOptions(route, get().selectedMergeOptionId, get().driverPreset) : [],
      mapCenter: route?.polyline?.[Math.floor(route.polyline.length / 2)] ?? get().mapCenter,
      mapZoom: route ? 9 : get().mapZoom,
    })
  },
  isLoadingRoutes: false,
  isNavigating: false,
  navAutoFollow: false,
  setNavAutoFollow: (val) => set({ navAutoFollow: val }),
  startNavigation: () => {
    const { userLocation } = get()
    // 내 위치로 지도 포커스
    const center = userLocation ? [userLocation.lat, userLocation.lng] : get().mapCenter
    set({ isNavigating: true, navAutoFollow: true, showRoutePanel: false, routePanelMode: 'full', mapCenter: center, mapZoom: 15 })
  },
  stopNavigation: () => set({ isNavigating: false, navAutoFollow: false, destination: null, routes: [], selectedRouteId: null, routePanelMode: 'full' }),

  // ── 경로 저장 ──────────────────────────────────────
  savedRoutes: readStorage(STORAGE_KEYS.savedRoutes, []),
  saveRoute: ({ route, destination, name }) => {
    const entry = {
      id: `saved-${Date.now()}`,
      name: name || (destination?.name ? `→ ${destination.name}` : '저장된 경로'),
      savedAt: new Date().toISOString(),
      distance: route?.distance,
      eta: route?.eta,
      tollFee: route?.tollFee,
      highwayRatio: route?.highwayRatio,
      destination,
      polyline: route?.polyline?.slice(0, 50) ?? [], // 용량 절약을 위해 50점만
    }
    const next = [entry, ...get().savedRoutes].slice(0, 20)
    writeStorage(STORAGE_KEYS.savedRoutes, next)
    set({ savedRoutes: next })
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
  dismissScenicSuggestion: (id) => set((state) => ({
    scenicRoadSuggestions: state.scenicRoadSuggestions.filter((item) => item.id !== id),
  })),
  scenicRouteError: null,
  applyScenicRoute: async (suggestion) => {
    const state = get()
    const origin = state.userLocation ?? DEFAULT_ORIGIN
    const { destination, routePreferences, driverPreset } = state
    if (!destination) return
    set({ isLoadingRoutes: true, scenicRouteError: null })

    // 경유지 후보 목록: viaPoints → segmentMid → segmentStart/End 중간점 순으로 시도
    const viaCandidates = []
    if (suggestion.viaPoints?.length > 0) {
      viaCandidates.push(suggestion.viaPoints.map((pt, i) => ({
        id: `scenic-via-${i}`, name: pt.name, lat: pt.lat, lng: pt.lng,
      })))
    }
    if (suggestion.segmentMid) {
      viaCandidates.push([{ id: 'scenic-mid', name: suggestion.name, lat: suggestion.segmentMid[0], lng: suggestion.segmentMid[1] }])
    }
    if (suggestion.segmentStart && suggestion.segmentEnd) {
      const midLat = (suggestion.segmentStart[0] + suggestion.segmentEnd[0]) / 2
      const midLng = (suggestion.segmentStart[1] + suggestion.segmentEnd[1]) / 2
      viaCandidates.push([{ id: 'scenic-se-mid', name: suggestion.name, lat: midLat, lng: midLng }])
    }

    let viaRoute = null
    let lastErr = null
    for (const wayPoints of viaCandidates) {
      try {
        viaRoute = await fetchRouteByWaypoints(
          { ...origin, name: '현재 위치' },
          destination,
          wayPoints,
          { searchOption: '00', title: `${suggestion.name} 경유`, tag: '경관경로', tagColor: 'green' }
        )
        if (viaRoute) break
      } catch (err) {
        lastErr = err
        // 1100(NOT_FOUND) 이면 다음 좌표 후보로 재시도
        if (!String(err?.message ?? '').includes('1100')) break
      }
    }

    try {
      if (viaRoute) {
        const scenicId = `route-scenic-${suggestion.id}`
        const decorated = decorateRoute(
          { ...viaRoute, id: scenicId, tag: '경관경로', tagColor: 'green', routeColor: '#10B981' },
          99,
          { origin, destination, routePreferences, driverPreset }
        )
        const nextRoutes = [...get().routes.filter(r => r.id !== scenicId), decorated]
        set({
          routes: nextRoutes,
          selectedRouteId: decorated.id,
          isLoadingRoutes: false,
          mergeOptions: buildMergeOptions(decorated, null, driverPreset),
          mapCenter: decorated.polyline?.[Math.floor(decorated.polyline.length / 2)] ?? get().mapCenter,
          mapZoom: 9,
          scenicRoadSuggestions: get().scenicRoadSuggestions.filter((s) => s.id !== suggestion.id),
        })
      } else {
        set({ isLoadingRoutes: false, scenicRouteError: lastErr?.message ?? '경유 경로를 찾을 수 없습니다. (도로에서 멀거나 통행 불가 구간)' })
      }
    } catch (err) {
      set({ isLoadingRoutes: false, scenicRouteError: err?.message ?? '경로 탐색 실패' })
    }
  },

  tmapStatus: { hasApiKey: false, mode: 'simulation', lastError: null },
  setTmapStatus: (patch) => set((state) => ({ tmapStatus: { ...state.tmapStatus, ...patch } })),

  driverPreset: 'intermediate',
  setDriverPreset: (driverPreset) => {
    set({ driverPreset })
    const { destination } = get()
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
  showRecentSearches: () => set({ activeTab: 'search', searchMode: 'recent' }),
  openNearbyCategory: async (category) => {
    const origin = get().userLocation ?? DEFAULT_ORIGIN
    set({
      activeTab: 'search',
      searchMode: 'nearby',
      selectedNearbyCategory: category,
      nearbyPlaces: [],
      isLoadingNearby: true,
    })
    try {
      const nearbyPlaces = await searchNearbyPOIs(category, origin.lat, origin.lng)
      set({ nearbyPlaces, isLoadingNearby: false })
    } catch {
      set({ nearbyPlaces: [], isLoadingNearby: false })
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
    const origin = get().userLocation ?? DEFAULT_ORIGIN
    const { routePreferences, driverPreset } = get()
    set({
      activeTab: 'home',
      destination,
      showRoutePanel: true,
      routePanelMode: 'full',
      isLoadingRoutes: true,
      routes: [],
      selectedRouteId: null,
      selectedRoadId: null,
    })
    get().addRecentSearch(destination)

    const tmapStatus = await fetchTmapStatus()
    get().setTmapStatus({ ...tmapStatus, lastError: null })

    let liveRoutes = []
    try {
      liveRoutes = await fetchRoutes(origin.lat, origin.lng, destination.lat, destination.lng, {
        allowNarrowRoads: routePreferences.allowNarrowRoads,
        roadType: routePreferences.roadType,
      })
      if (liveRoutes.length > 0) {
        get().setTmapStatus({ hasApiKey: true, mode: 'live', lastError: null })
      }
    } catch (error) {
      get().setTmapStatus({
        mode: 'simulation',
        lastError: error?.message ?? 'TMAP 경로 응답 실패',
      })
    }

    const routes = (liveRoutes.length > 0 ? liveRoutes : buildFallbackRoutes(origin, destination, routePreferences, driverPreset))
      .map((route, index) => decorateRoute(route, index, { origin, destination, routePreferences, driverPreset }))

    const selectedRouteId = routes[0]?.id ?? null
    const selectedRoute = routes[0] ?? null

    // 해안/산악도로 감지 — 타입별 독립 필터 (해안선호≠산악선호)
    const wantsCoastal = routePreferences.includeScenic || driverPreset === 'expert'
    const wantsMountain = routePreferences.includeMountain || driverPreset === 'expert'
    const scenicRoadSuggestions = (wantsCoastal || wantsMountain)
      ? detectScenicRoads(origin, destination, selectedRoute?.polyline ?? [])
          .filter(s => s.scenicType === 'coastal' ? wantsCoastal : wantsMountain)
      : []

    set({
      routes,
      selectedRouteId,
      isLoadingRoutes: false,
      selectedMergeOptionId: 'merge-current',
      mergeOptions: selectedRoute ? buildMergeOptions(selectedRoute, 'merge-current', driverPreset) : [],
      mapCenter: selectedRoute?.polyline?.[Math.floor(selectedRoute.polyline.length / 2)] ?? [destination.lat, destination.lng],
      mapZoom: selectedRoute ? 8 : 14,
      scenicRoadSuggestions,
    })
  },

  applyMergeOption: async (mergeOptionId) => {
    const state = get()
    const origin = state.userLocation ?? DEFAULT_ORIGIN
    const destination = state.destination
    const baseRoute = state.routes.find((route) => route.id === state.selectedRouteId)
    const option = state.mergeOptions.find((item) => item.id === mergeOptionId)

    if (!destination || !baseRoute || !option) return

    set({
      isLoadingRoutes: true,
      selectedMergeOptionId: mergeOptionId,
      routePanelMode: 'peek',
    })

    try {
      const liveRoute = await fetchRouteByWaypoints(
        { ...origin, name: '현재 위치' },
        destination,
        option.wayPoints ?? [],
        {
          searchOption: option.afterRoadType === 'national' ? '02' : '04',
          title: option.afterRoadName,
          tag: option.isCurrent ? '현재' : '합류',
          tagColor: option.afterRoadType === 'national' ? 'green' : 'blue',
          isBaseline: option.isCurrent,
        }
      )

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
    } catch (error) {
      get().setTmapStatus({
        mode: 'simulation',
        lastError: error?.message ?? '합류 경로 재계산 실패',
      })
    }

    set({
      mergeOptions: buildMergeOptions(baseRoute, mergeOptionId, state.driverPreset),
      isLoadingRoutes: false,
    })
  },
}))

export default useAppStore
