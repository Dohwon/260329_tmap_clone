import { create } from 'zustand'
import { MOCK_ROUTES, MOCK_MERGE_OPTIONS } from '../data/mockData'
import { fetchRoutes, searchPOI } from '../services/tmapService'

// 프록시 서버를 통해 항상 시도, 실패 시 시뮬레이션으로 fallback
const HAS_API_KEY = true

const useAppStore = create((set, get) => ({
  // 탭
  activeTab: 'home',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // 지도 중심
  mapCenter: [37.5665, 126.9780],
  mapZoom: 11,
  setMapCenter: (center, zoom) => set({ mapCenter: center, mapZoom: zoom ?? get().mapZoom }),

  // 현재 위치 (Geolocation API)
  userLocation: null,
  setUserLocation: (loc) => set({ userLocation: loc }),

  // 검색/목적지
  destination: null,
  setDestination: (dest) => set({ destination: dest }),

  // 경로 패널
  showRoutePanel: false,
  setShowRoutePanel: (v) => set({ showRoutePanel: v }),

  routes: [],
  setRoutes: (r) => set({ routes: r }),

  selectedRouteId: null,
  setSelectedRouteId: (id) => set({ selectedRouteId: id }),

  // 로딩 상태
  isLoadingRoutes: false,

  // 내비게이션 모드
  isNavigating: false,
  startNavigation: () => set({ isNavigating: true, showRoutePanel: false }),
  stopNavigation: () => set({ isNavigating: false, destination: null, routes: [], selectedRouteId: null }),

  // 드라이버 프리셋
  driverPreset: 'intermediate',
  setDriverPreset: (p) => set({ driverPreset: p }),

  // 경로 조건 필터
  routePreferences: {
    roadType: 'mixed',
    includeScenic: false,
    includeMountain: false,
  },
  setRoutePreference: (key, value) =>
    set((s) => ({ routePreferences: { ...s.routePreferences, [key]: value } })),

  // 지도 레이어 토글
  visibleLayers: {
    speedCameras: true,
    sectionEnforcement: true,
    speedLimits: false,
    mergePoints: true,
  },
  toggleLayer: (key) =>
    set((s) => ({ visibleLayers: { ...s.visibleLayers, [key]: !s.visibleLayers[key] } })),

  // 합류 옵션 (다음 10km)
  mergeOptions: [],
  setMergeOptions: (opts) => set({ mergeOptions: opts }),

  // ─── 경로 탐색 ───────────────────────────────────────────────────────────
  searchRoute: async (destination) => {
    const { userLocation } = get()

    // 지도 뷰 즉시 이동
    set({
      destination,
      showRoutePanel: true,
      isLoadingRoutes: true,
      routes: [],
      selectedRouteId: null,
      mergeOptions: MOCK_MERGE_OPTIONS,
      mapCenter: [
        (37.5665 + destination.lat) / 2,
        (126.9780 + destination.lng) / 2,
      ],
      mapZoom: 8,
    })

    if (HAS_API_KEY && userLocation) {
      // ── 실제 T-map API ──
      try {
        const routes = await fetchRoutes(
          userLocation.lat, userLocation.lng,
          destination.lat, destination.lng
        )
        if (routes.length > 0) {
          set({
            routes,
            selectedRouteId: routes[0].id,
            isLoadingRoutes: false,
          })
          return
        }
      } catch (e) {
        console.warn('T-map API 실패, 시뮬레이션으로 대체:', e)
      }
    }

    // ── 가상 시뮬레이션 (API 키 없거나 실패 시) ──
    const distKm = haversineKm(37.5665, 126.9780, destination.lat, destination.lng)
    const { routePreferences, driverPreset } = get()
    const simRoutes = buildSimulatedRoutes(destination, distKm, routePreferences, driverPreset)
    set({
      routes: simRoutes,
      selectedRouteId: simRoutes[0].id,
      isLoadingRoutes: false,
    })
  },
}))

// ─── 거리 계산 (Haversine) ────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// ─── 목적지 기반 가상 경로 생성 ───────────────────────────────────────────────
function buildSimulatedRoutes(destination, distKm, prefs = {}, preset = 'intermediate') {
  const hour = new Date().getHours()
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20)
  const isWeekend = [0, 6].includes(new Date().getDay())
  const trafficMult = isRushHour && !isWeekend ? 1.35 : isWeekend ? 1.1 : 1.0
  const roadType = prefs.roadType ?? 'mixed'

  const startLat = 37.5665, startLng = 126.9780
  const endLat = destination.lat, endLng = destination.lng

  const makePolyline = (offsetLng) => Array.from({ length: 9 }, (_, i) => {
    const t = i / 8
    return [
      startLat + (endLat - startLat) * t,
      startLng + offsetLng * Math.sin(Math.PI * t) + (endLng - startLng) * t,
    ]
  })

  // 도로 타입 필터에 따라 경로 특성이 달라짐
  const ROAD_CONFIGS = {
    highway_only: {
      routes: [
        { hwRatio: 95, natRatio: 5,  merges: 3,  etaMult: 1.0,  distMult: 1.02, toll: 52, cam: 5, sec: 3, secKm: 18, spd: 110,
          title: '고속도로 전용', tag: '추천', tagColor: 'blue',
          expl: '고속도로만 이용 · 합류 최소 · 최고속도 110km/h' },
        { hwRatio: 92, natRatio: 8,  merges: 4,  etaMult: 1.05, distMult: 1.05, toll: 48, cam: 4, sec: 2, secKm: 12, spd: 110,
          title: '고속도로 우선', tag: '고속위주', tagColor: 'blue',
          expl: '고속도로 92% · 단순 구조' },
        { hwRatio: 88, natRatio: 12, merges: 5,  etaMult: 1.08, distMult: 1.06, toll: 44, cam: 3, sec: 2, secKm: 10, spd: 110,
          title: '고속+일부 연결로', tag: '대안', tagColor: 'blue',
          expl: '고속도로 중심 · 일부 연결로 포함' },
      ]
    },
    mixed: {
      routes: [
        { hwRatio: 70, natRatio: 30, merges: 7,  etaMult: 1.0,  distMult: 1.05, toll: 32, cam: 3, sec: 1, secKm: 6,  spd: 100,
          title: '고속+국도 최적', tag: '추천', tagColor: 'blue',
          expl: '고속도로+국도 균형 · 정체 회피 · 통행료 절감' },
        { hwRatio: 55, natRatio: 45, merges: 11, etaMult: 1.1,  distMult: 1.12, toll: 18, cam: 2, sec: 1, secKm: 6,  spd: 80,
          title: '국도 포함', tag: isRushHour ? '정체 회피' : '정체 적음', tagColor: 'green',
          expl: `국도 45% · 카메라 적음 · 통행료 절감${isRushHour ? ' · 출퇴근 정체 우회' : ''}` },
        { hwRatio: 30, natRatio: 70, merges: 14, etaMult: 1.2,  distMult: 1.2,  toll: 8,  cam: 3, sec: 0, secKm: 0,  spd: 70,
          title: isWeekend ? '주말 풍경 경로' : '국도 위주',
          tag: isWeekend ? '주말 추천' : '구간단속 없음', tagColor: 'orange',
          expl: '구간단속 없음 · 국도 중심 · 여유 있을 때 추천' },
      ]
    },
    national_road: {
      routes: [
        { hwRatio: 20, natRatio: 80, merges: 16, etaMult: 1.25, distMult: 1.25, toll: 0,  cam: 2, sec: 0, secKm: 0,  spd: 70,
          title: '국도 전용', tag: '무료', tagColor: 'green',
          expl: '통행료 없음 · 국도 80% · 신호 있음' },
        { hwRatio: 35, natRatio: 65, merges: 13, etaMult: 1.18, distMult: 1.2,  toll: 6,  cam: 2, sec: 0, secKm: 0,  spd: 70,
          title: '국도 중심', tag: '국도선호', tagColor: 'green',
          expl: '국도 65% · 구간단속 없음 · 저렴한 통행료' },
        { hwRatio: 45, natRatio: 55, merges: 10, etaMult: 1.12, distMult: 1.15, toll: 14, cam: 2, sec: 1, secKm: 5,  spd: 80,
          title: '국도+일부 고속', tag: '절충', tagColor: 'green',
          expl: '국도 위주 · 일부 고속 구간 포함' },
      ]
    },
  }

  const config = ROAD_CONFIGS[roadType] ?? ROAD_CONFIGS.mixed
  const baseEta = Math.round((distKm / 90) * 60 * trafficMult)
  const offsets = [-0.08, 0, 0.1]

  return config.routes.map((r, i) => {
    const congestionScore = isRushHour && !isWeekend && r.hwRatio > 70 ? 2 : 1
    return {
      id: `sim-${roadType}-${i}`,
      title: r.title,
      explanation: r.expl + (isRushHour && !isWeekend && r.hwRatio > 70 ? ' · ⚠️ 출퇴근 서행' : ''),
      eta: Math.round(baseEta * r.etaMult),
      distance: Math.round(distKm * r.distMult),
      highwayRatio: r.hwRatio,
      nationalRoadRatio: r.natRatio,
      mergeCount: r.merges,
      congestionScore,
      congestionLabel: congestionScore === 2 ? '서행' : '원활',
      fixedCameraCount: r.cam,
      sectionCameraCount: r.sec,
      sectionEnforcementDistance: r.secKm,
      dominantSpeedLimit: r.spd,
      tollFee: Math.round(distKm * r.toll),
      recommended: i === 0,
      tag: r.tag,
      tagColor: r.tagColor,
      routeColor: i === 0 ? '#0064FF' : '#8E8E93',
      polyline: makePolyline(offsets[i] ?? 0),
    }
  })
}

export default useAppStore
