import React, { useEffect, useRef, useState } from 'react'
import MapView from '../components/Map/MapView'
import HomeBottomPanel from '../components/Common/HomeBottomPanel'
import RoutePreviewPanel from '../components/Route/RoutePreviewPanel'
import NavigationOverlay from '../components/Navigation/NavigationOverlay'
import ScenicRoadDialog from '../components/Navigation/ScenicRoadDialog'
import HighwayExplorer from '../components/Map/HighwayExplorer'
import useAppStore from '../store/appStore'
import SearchSheet from '../components/Search/SearchSheet'

function getBearingDeg(fromLat, fromLng, toLat, toLng) {
  const fromLatRad = (fromLat * Math.PI) / 180
  const toLatRad = (toLat * Math.PI) / 180
  const deltaLngRad = ((toLng - fromLng) * Math.PI) / 180
  const y = Math.sin(deltaLngRad) * Math.cos(toLatRad)
  const x =
    Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(deltaLngRad)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

function getHeadingGap(a, b) {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

function getHazardsAhead(safetyHazards = [], userLocation) {
  if (!userLocation) return safetyHazards
  const heading = Number(userLocation.heading)
  const hasHeading = Number.isFinite(heading) && heading > 0

  return [...safetyHazards]
    .map((hazard) => {
      const bearing = getBearingDeg(userLocation.lat, userLocation.lng, hazard.lat, hazard.lng)
      const headingGap = hasHeading ? getHeadingGap(heading, bearing) : 0
      return { ...hazard, headingGap }
    })
    .filter((hazard) => !hasHeading || hazard.headingGap <= 70)
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
}

class HomeScreenBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('HomeScreen render crash', error, info)
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 z-50 bg-white flex items-center justify-center px-6">
          <div className="w-full max-w-sm rounded-3xl border border-red-100 bg-white shadow-xl p-6">
            <div className="text-sm font-bold text-red-500">안내 화면 오류</div>
            <div className="text-lg font-black text-gray-900 mt-1">경로 화면을 복구할 수 없었습니다</div>
            <div className="text-sm text-gray-500 mt-2">
              현재 경로 데이터 중 일부가 비정상이라 화면이 중단됐습니다. 안내를 종료하고 홈으로 복구합니다.
            </div>
            <button
              onClick={this.props.onRecover}
              className="mt-4 w-full rounded-2xl bg-tmap-blue py-3 text-sm font-bold text-white"
            >
              홈으로 복구
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default function HomeScreen() {
  const {
    isNavigating,
    showRoutePanel,
    toggleLayer,
    visibleLayers,
    userLocation,
    selectedRoadId,
    scenicRoadSuggestions,
    settings,
    safetyHazards,
    refreshSafetyHazards,
    isSearchOverlayOpen,
    openSearchOverlay,
    closeSearchOverlay,
    refreshHomeRestaurantPins,
    homeRestaurantPinsLoadedAt,
    stopNavigation,
  } = useAppStore()
  const [showLayerMenu, setShowLayerMenu] = useState(false)
  const [showHighwayExplorer, setShowHighwayExplorer] = useState(false)
  const [isSafetyBannerCollapsed, setIsSafetyBannerCollapsed] = useState(false)
  const safetySpeechRef = useRef('')
  const restaurantRefreshCoordRef = useRef(null)

  // 팝업 상호 배타적 열기
  const openSearch = () => { openSearchOverlay(); setShowLayerMenu(false); setShowHighwayExplorer(false) }
  const openLayerMenu = () => { setShowLayerMenu((v) => !v); setShowHighwayExplorer(false) }
  const openHighwayExplorer = () => { setShowHighwayExplorer(true); setShowLayerMenu(false) }
  const hour = new Date().getHours()
  const isNight = hour >= 19 || hour < 6
  const looksLikeTunnel = (userLocation?.speedKmh ?? 0) > 35 && (userLocation?.accuracy ?? 0) > 60
  const darkMode = settings.mapTheme === 'dark'
    ? true
    : settings.mapTheme === 'light'
      ? false
      : (isNight || looksLikeTunnel)

  useEffect(() => {
    if (!settings.safetyModeEnabled || !userLocation) return
    refreshSafetyHazards()
    const timer = window.setInterval(() => {
      refreshSafetyHazards()
    }, 90000)
    return () => window.clearInterval(timer)
  }, [refreshSafetyHazards, settings.safetyModeEnabled, userLocation])

  useEffect(() => {
    if (isNavigating || !settings.safetyModeEnabled || !settings.voiceGuidance || !userLocation) return
    const nearestHazard = getHazardsAhead(safetyHazards ?? [], userLocation).find((hazard) => hazard.distanceKm != null && hazard.distanceKm <= 0.6)
    if (!nearestHazard || !window.speechSynthesis) return

    const threshold = nearestHazard.distanceKm <= 0.12 ? '100m' : '600m'
    const key = `${nearestHazard.id}:${threshold}`
    if (safetySpeechRef.current === key) return
    safetySpeechRef.current = key

    const utterance = new SpeechSynthesisUtterance(
      threshold === '100m'
        ? `100미터 앞, ${nearestHazard.type === 'school_zone' ? '어린이 보호구역' : '방지턱'}입니다.`
        : `${Math.round(nearestHazard.distanceKm * 1000)}미터 앞, ${nearestHazard.type === 'school_zone' ? '어린이 보호구역' : '방지턱'} 주의하세요.`
    )
    utterance.lang = 'ko-KR'
    utterance.rate = 1
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }, [isNavigating, safetyHazards, settings.safetyModeEnabled, settings.voiceGuidance, userLocation])

  useEffect(() => {
    if (!showRoutePanel) return
    setShowLayerMenu(false)
    setShowHighwayExplorer(false)
  }, [showRoutePanel])

  useEffect(() => {
    if (isNavigating || !settings.safetyModeEnabled) {
      setIsSafetyBannerCollapsed(false)
    }
  }, [isNavigating, settings.safetyModeEnabled])

  return (
    <div className="relative w-full h-full overflow-hidden">
      <HomeScreenBoundary
        resetKey={`${isNavigating}-${showRoutePanel}`}
        onRecover={() => {
          stopNavigation()
          closeSearchOverlay()
        }}
      >
        <MapView darkMode={darkMode} />

        {/* 상단 검색바 */}
        {!isNavigating && !showRoutePanel && (
          <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-14 pb-2">
            <button
              onClick={openSearch}
              className="w-full bg-white/96 backdrop-blur-md rounded-[24px] px-4 py-3 shadow-lg active:scale-[0.98] transition-all text-left"
            >
              <div className="text-lg font-black text-gray-900">어디로 갈까요?</div>
              <div className="text-xs text-gray-500 mt-1">
                {darkMode
                  ? '야간 또는 터널 환경이라 지도를 어둡게 표시하고 있어요'
                  : selectedRoadId
                    ? '선택한 도로 전체 흐름과 단속 구간을 보고 있어요'
                    : '현재 도로 상황이 원활합니다'}
              </div>
            </button>
          </div>
        )}

        {/* 지도 우측 버튼 - 패널 위 고정 */}
        {!isNavigating && !showRoutePanel && (
          <div className="absolute right-4 z-30" style={{ bottom: '380px' }}>
            <div className="flex flex-col gap-2">
              {/* 내 위치 */}
              <FloatButton onClick={() => {
                const { userLocation, setMapCenter } = useAppStore.getState()
                if (userLocation) setMapCenter([userLocation.lat, userLocation.lng], 16)
              }}>
                <svg className="w-5 h-5 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </FloatButton>

              {/* 고속도로 탐색 */}
              <FloatButton onClick={openHighwayExplorer}>
                <span className="text-lg">🛣️</span>
              </FloatButton>

              {/* 레이어 토글 */}
              <FloatButton onClick={openLayerMenu}>
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
                </svg>
              </FloatButton>
            </div>
          </div>
        )}

        {/* 레이어 메뉴 */}
        {showLayerMenu && (
          <>
            <div className="absolute inset-0 z-10" onClick={() => setShowLayerMenu(false)}/>
            <div
              className="absolute right-4 z-40 bg-white rounded-2xl shadow-xl p-4 w-52 overflow-y-auto"
              style={{
                top: 'calc(env(safe-area-inset-top, 0px) + 92px)',
                maxHeight: 'calc(100vh - env(safe-area-inset-top, 0px) - 140px)',
              }}
            >
              <div className="text-xs font-bold text-gray-400 mb-3 tracking-wide">지도 레이어</div>
              {[
                { key: 'speedCameras', label: '📷 과속카메라' },
                { key: 'sectionEnforcement', label: '🚧 구간단속' },
                { key: 'speedLimits', label: '🔴 제한속도' },
                { key: 'mergePoints', label: '🔀 합류지점' },
                { key: 'restStops', label: '🟢 휴게소/졸음쉼터' },
                { key: 'congestion', label: '🚦 정체 구간' },
              ].map(layer => (
                <button
                  key={layer.key}
                  onClick={() => toggleLayer(layer.key)}
                  className="w-full flex items-center justify-between py-2.5"
                >
                  <span className="text-sm text-gray-700">{layer.label}</span>
                  <div className={`w-10 h-6 rounded-full transition-all ${visibleLayers[layer.key] ? 'bg-tmap-blue' : 'bg-gray-200'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow m-0.5 transition-all ${visibleLayers[layer.key] ? 'translate-x-4' : 'translate-x-0'}`}/>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <NavigationOverlay />
        <RoutePreviewPanel />
        {/* 알림창 + 홈패널을 하나의 bottom 컨테이너로 묶어 항상 붙어있게 */}
        {!isSearchOverlayOpen && !showRoutePanel && !isNavigating && (
          <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col">
            {settings.safetyModeEnabled && (
              <SafetyModeBanner
                safetyHazards={getHazardsAhead(safetyHazards, userLocation)}
                collapsed={isSafetyBannerCollapsed}
                onCollapse={() => setIsSafetyBannerCollapsed(true)}
                onExpand={() => setIsSafetyBannerCollapsed(false)}
              />
            )}
            <HomeBottomPanel />
          </div>
        )}

        {/* 해안/산악도로 경유 제안 다이얼로그 (경로 패널 위에 표시) */}
        {scenicRoadSuggestions.length > 0 && showRoutePanel && !isNavigating && <ScenicRoadDialog />}

        {isSearchOverlayOpen && <SearchSheet onClose={closeSearchOverlay} />}
        {showHighwayExplorer && <HighwayExplorer onClose={() => setShowHighwayExplorer(false)} />}
      </HomeScreenBoundary>
    </div>
  )
}

function FloatButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all border border-white/80"
    >
      {children}
    </button>
  )
}

function SafetyModeBanner({ safetyHazards, collapsed = false, onCollapse, onExpand }) {
  const touchStartRef = useRef(null)
  const nextHazard = (safetyHazards ?? []).find((hazard) => hazard.distanceKm != null && hazard.distanceKm <= 1.2) ?? safetyHazards?.[0]

  const handleTouchStart = (e) => {
    touchStartRef.current = e.touches?.[0]?.clientY ?? null
  }

  const handleTouchMove = (e) => {
    // 부모 스크롤이 터치를 가로채지 못하도록 방지
    e.stopPropagation()
  }

  const handleTouchEnd = (e) => {
    const startY = touchStartRef.current
    const endY = e.changedTouches?.[0]?.clientY ?? null
    touchStartRef.current = null
    if (startY == null || endY == null) return
    if (endY - startY >= 16) onCollapse?.()   // 아래로 16px = 접기
    if (startY - endY >= 16) onExpand?.()     // 위로 16px = 펼치기
  }

  if (collapsed) {
    return (
      <div className="px-4 pb-1">
        <button
          type="button"
          onClick={onExpand}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full rounded-full bg-white/92 backdrop-blur-md shadow-lg px-4 py-2 border border-emerald-100 flex items-center gap-2"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <div className="text-xs font-bold text-emerald-700">안전 운전 모드</div>
          <div className="text-[11px] text-gray-400 ml-auto">↑ 펼치기</div>
        </button>
      </div>
    )
  }

  if (!nextHazard) {
    return (
      <div className="px-4 pb-1">
        <div
          className="rounded-2xl bg-white/92 backdrop-blur-md shadow-lg px-4 py-3 border border-emerald-100"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="text-[11px] font-bold text-emerald-600">안전 운전 모드</div>
          <div className="text-sm font-semibold text-gray-900 mt-0.5">주변 위험요소를 확인하는 중입니다</div>
          <div className="text-[11px] text-gray-400 mt-1">↓ 내려서 접기</div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pb-1">
      <div
        className="rounded-2xl bg-white/92 backdrop-blur-md shadow-lg px-4 py-3 border border-emerald-100"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg ${nextHazard.type === 'school_zone' ? 'bg-amber-100' : 'bg-sky-100'}`}>
            {nextHazard.type === 'school_zone' ? '🚸' : '턱'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-emerald-600">안전 운전 모드</div>
            <div className="text-sm font-semibold text-gray-900 truncate">
              {Math.max(50, Math.round((nextHazard.distanceKm ?? 0) * 1000))}m 앞 {nextHazard.type === 'school_zone' ? '어린이보호구역' : '방지턱'}
            </div>
            <div className="text-xs text-gray-500 truncate">{nextHazard.name}</div>
          </div>
        </div>
        <div className="text-[11px] text-gray-400 mt-2">↓ 내려서 접기</div>
      </div>
    </div>
  )
}
