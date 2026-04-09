import React, { useState } from 'react'
import MapView from '../components/Map/MapView'
import HomeBottomPanel from '../components/Common/HomeBottomPanel'
import RoutePreviewPanel from '../components/Route/RoutePreviewPanel'
import NavigationOverlay from '../components/Navigation/NavigationOverlay'
import HighwayExplorer from '../components/Map/HighwayExplorer'
import useAppStore from '../store/appStore'
import SearchSheet from '../components/Search/SearchSheet'

export default function HomeScreen() {
  const { isNavigating, showRoutePanel, toggleLayer, visibleLayers, userLocation, selectedRoadId } = useAppStore()
  const [showSearch, setShowSearch] = useState(false)
  const [showLayerMenu, setShowLayerMenu] = useState(false)
  const [showHighwayExplorer, setShowHighwayExplorer] = useState(false)
  const hour = new Date().getHours()
  const isNight = hour >= 19 || hour < 6
  const looksLikeTunnel = (userLocation?.speedKmh ?? 0) > 35 && (userLocation?.accuracy ?? 0) > 60
  const darkMode = isNight || looksLikeTunnel

  return (
    <div className="relative w-full h-full overflow-hidden">
      <MapView darkMode={darkMode} />

      {/* 상단 검색바 */}
      {!isNavigating && !showRoutePanel && (
        <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-14 pb-2">
          <button
            onClick={() => setShowSearch(true)}
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
            <FloatButton onClick={() => setShowHighwayExplorer(true)}>
              <span className="text-lg">🛣️</span>
            </FloatButton>

            {/* 레이어 토글 */}
            <FloatButton onClick={() => setShowLayerMenu(!showLayerMenu)}>
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
          <div className="absolute right-4 z-40 bg-white rounded-2xl shadow-xl p-4 w-52" style={{ bottom: '540px' }}>
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
      {!showSearch && !showRoutePanel && !isNavigating && <HomeBottomPanel />}

      {showSearch && <SearchSheet onClose={() => setShowSearch(false)} />}
      {showHighwayExplorer && <HighwayExplorer onClose={() => setShowHighwayExplorer(false)} />}
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
