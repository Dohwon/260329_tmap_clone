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

function buildMergeOptions(route, selectedId) {
  const junctions = route.junctions ?? []

  // 실제 분기점 있으면 분기점 기반 옵션
  if (junctions.length > 0) {
    const options = junctions.slice(0, 5).map((jct, idx) => {
      const isHighway = jct.afterRoadType === 'highway'
      return {
        id: `merge-jct-${idx}`,
        name: jct.name,
        distanceFromCurrent: jct.distanceFromStart,
        addedTime: idx === 0 ? 0 : Math.round((jct.distanceFromStart - junctions[0].distanceFromStart) * 0.8),
        fixedCameraCount: route.fixedCameraCount,
        sectionCameraCount: route.sectionCameraCount,
        dominantSpeedLimit: isHighway ? Math.max(100, route.dominantSpeedLimit) : Math.min(80, route.dominantSpeedLimit),
        isCurrent: idx === 0,
        afterRoadType: jct.afterRoadType,
        afterRoadName: isHighway ? '고속도로 본선' : '국도 진입',
        afterDescription: isHighway
          ? `${jct.name}을(를) 통해 고속 본선으로 이어집니다.`
          : `${jct.name}에서 국도로 전환됩니다.`,
        afterNextJunction: junctions[idx + 1] ? `다음: ${junctions[idx + 1].name}` : '이후 직진',
        congestionPreview: route.congestionLabel,
        wayPoints: [{ id: `via-${jct.id}`, name: jct.name, lat: jct.lat, lng: jct.lng }],
      }
    })
    return options.map((option) => ({
      ...option,
      isSelected: option.id === (selectedId ?? options[0]?.id),
    }))
  }

  // 폴백: 기존 3-옵션
  const options = [
    {
      id: 'merge-current',
      name: '현재 경로 유지',
      distanceFromCurrent: 8.4,
      addedTime: 0,
      fixedCameraCount: route.fixedCameraCount,
      sectionCameraCount: route.sectionCameraCount,
      dominantSpeedLimit: route.dominantSpeedLimit,
      isCurrent: true,
      afterRoadType: route.highwayRatio >= 50 ? 'highway' : 'national',
      afterRoadName: route.highwayRatio >= 50 ? '고속도로 본선 유지' : '국도 본선 유지',
      afterDescription: '현재 흐름을 유지하면서 가장 단순한 경로를 탑니다.',
      afterNextJunction: '다음 분기까지 직진 흐름이 이어집니다.',
      congestionPreview: route.congestionLabel,
      wayPoints: [],
    },
    {
      id: 'merge-highway',
      name: '고속 본선 재합류',
      distanceFromCurrent: 12.8,
      addedTime: 2,
      fixedCameraCount: route.fixedCameraCount + 1,
      sectionCameraCount: Math.max(1, route.sectionCameraCount),
      dominantSpeedLimit: Math.max(100, route.dominantSpeedLimit),
      isCurrent: false,
      afterRoadType: 'highway',
      afterRoadName: '고속 본선 재합류',
      afterDescription: '조금 더 빠르지만 카메라와 통행료가 늘어날 수 있습니다.',
      afterNextJunction: '고속 직진 구간으로 다시 연결됩니다.',
      congestionPreview: route.congestionScore >= 2 ? '원활' : route.congestionLabel,
      wayPoints: (() => {
        const idx = Math.floor((route.polyline?.length ?? 0) / 4)
        const pt = route.polyline?.[idx]
        return pt ? [{ id: 'via-highway', name: '고속 재합류 지점', lat: pt[0], lng: pt[1] }] : []
      })(),
    },
    {
      id: 'merge-national',
      name: '국도로 전환',
      distanceFromCurrent: 14.6,
      addedTime: 5,
      fixedCameraCount: Math.max(0, route.fixedCameraCount - 1),
      sectionCameraCount: Math.max(0, route.sectionCameraCount - 1),
      dominantSpeedLimit: Math.min(80, route.dominantSpeedLimit),
      isCurrent: false,
      afterRoadType: 'national',
      afterRoadName: '국도 본선 전환',
      afterDescription: '정체를 피할 수 있지만 신호와 합류는 늘어납니다.',
      afterNextJunction: '국도 본선과 연결됩니다.',
      congestionPreview: route.congestionScore === 3 ? '서행' : '원활',
      wayPoints: (() => {
        const idx = Math.floor((route.polyline?.length ?? 0) / 3)
        const pt = route.polyline?.[idx]
        return pt ? [{ id: 'via-national', name: '국도 전환 지점', lat: pt[0] + 0.008, lng: pt[1] - 0.012 }] : []
      })(),
    },
  ]

  return options.map((option) => ({
    ...option,
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
  return [
    {
      id: `${route.id}-segment-0`,
      name: route.highwayRatio >= 50 ? '고속 본선' : '국도 본선',
      positions: route.polyline.slice(0, 3),
      roadType: route.highwayRatio >= 50 ? 'highway' : 'national',
      speedLimit: route.dominantSpeedLimit,
      averageSpeed: Math.max(35, route.dominantSpeedLimit - (route.congestionScore === 3 ? 28 : route.congestionScore === 2 ? 16 : 8)),
      congestionScore: route.congestionScore,
      center: route.polyline[1],
    },
    {
      id: `${route.id}-segment-1`,
      name: '합류/연결 구간',
      positions: route.polyline.slice(2, 6),
      roadType: route.highwayRatio >= 50 ? 'junction' : 'national',
      speedLimit: Math.max(70, route.dominantSpeedLimit - 10),
      averageSpeed: Math.max(30, route.dominantSpeedLimit - 24),
      congestionScore: Math.min(3, route.congestionScore + 1),
      center: route.polyline[4],
    },
    {
      id: `${route.id}-segment-2`,
      name: '도착 진입',
      positions: route.polyline.slice(5),
      roadType: 'local',
      speedLimit: Math.max(50, route.dominantSpeedLimit - 30),
      averageSpeed: Math.max(25, route.dominantSpeedLimit - 36),
      congestionScore: Math.min(3, route.congestionScore + 1),
      center: route.polyline[7],
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

  if (driverPreset === 'beginner') {
    eta += 3
    mergeCount = Math.max(2, mergeCount - 1)
  } else if (driverPreset === 'expert') {
    eta = Math.max(eta - 2, 1)
    mergeCount += 1
  }

  if (routePreferences.roadType === 'highway_only') {
    highwayRatio = Math.max(82, highwayRatio)
    nationalRoadRatio = 100 - highwayRatio
    dominantSpeedLimit = Math.max(100, dominantSpeedLimit)
  } else if (routePreferences.roadType === 'national_road') {
    nationalRoadRatio = Math.max(58, nationalRoadRatio)
    highwayRatio = 100 - nationalRoadRatio
    dominantSpeedLimit = Math.min(80, dominantSpeedLimit)
    eta += 5
  }

  if (routePreferences.includeScenic && index === 2) eta += 6
  if (routePreferences.includeMountain && index === 1) eta += 4

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
  nextRoute.explanation = [
    driverPreset === 'beginner' ? '초보 기준' : driverPreset === 'expert' ? '고수 기준' : '중수 기준',
    routePreferences.roadType === 'highway_only' ? '고속 위주' : routePreferences.roadType === 'national_road' ? '국도 선호' : '고속+국도',
    `합류 ${mergeCount}회`,
    `최고 ${nextRoute.maxSpeedLimit} / 평균 ${nextRoute.averageSpeed}km/h`,
  ].join(' · ')
  return nextRoute
}

function buildFallbackRoutes(origin, destination, routePreferences, driverPreset) {
  const distanceKm = haversineKm(origin.lat, origin.lng, destination.lat, destination.lng)
  const baseEta = Math.max(20, Math.round((distanceKm / 82) * 60))
  const configs = [
    {
      id: 'route-fast',
      title: '빠른 도로',
      eta: baseEta,
      distance: Number((distanceKm * 1.03).toFixed(1)),
      highwayRatio: 72,
      nationalRoadRatio: 28,
      mergeCount: 6,
      congestionScore: 2,
      congestionLabel: '서행',
      fixedCameraCount: 3,
      sectionCameraCount: 1,
      sectionEnforcementDistance: 6,
      dominantSpeedLimit: 100,
      tollFee: Math.round(distanceKm * 85),
      tag: '추천',
      tagColor: 'blue',
      routeColor: '#0064FF',
      polyline: buildPolyline(origin, destination, 0.03),
    },
    {
      id: 'route-highway',
      title: '고속도로 중심',
      eta: baseEta + 3,
      distance: Number((distanceKm * 1.05).toFixed(1)),
      highwayRatio: 88,
      nationalRoadRatio: 12,
      mergeCount: 4,
      congestionScore: 1,
      congestionLabel: '원활',
      fixedCameraCount: 4,
      sectionCameraCount: 2,
      sectionEnforcementDistance: 10,
      dominantSpeedLimit: 110,
      tollFee: Math.round(distanceKm * 110),
      tag: '고속우선',
      tagColor: 'blue',
      routeColor: '#8E8E93',
      polyline: buildPolyline(origin, destination, -0.04),
    },
    {
      id: 'route-national',
      title: '국도 포함',
      eta: baseEta + 8,
      distance: Number((distanceKm * 1.1).toFixed(1)),
      highwayRatio: 42,
      nationalRoadRatio: 58,
      mergeCount: 9,
      congestionScore: 1,
      congestionLabel: '원활',
      fixedCameraCount: 2,
      sectionCameraCount: 0,
      sectionEnforcementDistance: 0,
      dominantSpeedLimit: 80,
      tollFee: Math.round(distanceKm * 45),
      tag: '국도선호',
      tagColor: 'green',
      routeColor: '#8E8E93',
      polyline: buildPolyline(origin, destination, 0.08),
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
      mergeOptions: route ? buildMergeOptions(route, get().selectedMergeOptionId) : [],
      mapCenter: route?.polyline?.[Math.floor(route.polyline.length / 2)] ?? get().mapCenter,
      mapZoom: route ? 9 : get().mapZoom,
    })
  },
  isLoadingRoutes: false,
  isNavigating: false,
  startNavigation: () => {
    const { userLocation } = get()
    // 내 위치로 지도 포커스
    const center = userLocation ? [userLocation.lat, userLocation.lng] : get().mapCenter
    set({ isNavigating: true, showRoutePanel: false, routePanelMode: 'full', mapCenter: center, mapZoom: 15 })
  },
  stopNavigation: () => set({ isNavigating: false, destination: null, routes: [], selectedRouteId: null, routePanelMode: 'full' }),

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
      set({ mergeOptions: buildMergeOptions(route, selectedMergeOptionId) })
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

    // 해안/산악도로 감지 (경로 탐색 후 20분 이상 우회 필요한 것만)
    const scenicRoadSuggestions = detectScenicRoads(
      origin,
      destination,
      selectedRoute?.polyline ?? []
    )

    set({
      routes,
      selectedRouteId,
      isLoadingRoutes: false,
      selectedMergeOptionId: 'merge-current',
      mergeOptions: selectedRoute ? buildMergeOptions(selectedRoute, 'merge-current') : [],
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
          mergeOptions: buildMergeOptions(decorated, mergeOptionId),
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
      mergeOptions: buildMergeOptions(baseRoute, mergeOptionId),
      isLoadingRoutes: false,
    })
  },
}))

export default useAppStore
