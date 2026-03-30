import React, { useState } from 'react'
import MapView from '../components/Map/MapView'
import HomeBottomPanel from '../components/Common/HomeBottomPanel'
import RoutePreviewPanel from '../components/Route/RoutePreviewPanel'
import NavigationOverlay from '../components/Navigation/NavigationOverlay'
import HighwayExplorer from '../components/Map/HighwayExplorer'
import useAppStore from '../store/appStore'
import SearchSheet from '../components/Search/SearchSheet'

export default function HomeScreen() {
  const { isNavigating, showRoutePanel, toggleLayer, visibleLayers } = useAppStore()
  const [showSearch, setShowSearch] = useState(false)
  const [showLayerMenu, setShowLayerMenu] = useState(false)
  const [showHighwayExplorer, setShowHighwayExplorer] = useState(false)

  return (
    <div className="relative w-full h-full overflow-hidden">
      <MapView />

      {/* 상단 검색바 */}
      {!isNavigating && !showRoutePanel && (
        <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-14 pb-2">
          <button
            onClick={() => setShowSearch(true)}
            className="w-full flex items-center bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg active:scale-[0.98] transition-all"
          >
            <div className="w-7 h-7 bg-tmap-blue rounded-lg flex items-center justify-center mr-3 flex-shrink-0">
              <span className="text-white font-black text-sm leading-none">T</span>
            </div>
            <span className="text-gray-400 text-sm flex-1 text-left">어디로 갈까요?</span>
            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </button>
        </div>
      )}

      {/* 우측 플로팅 버튼 */}
      {!isNavigating && !showRoutePanel && (
        <div className="absolute right-4 bottom-52 z-10 flex flex-col gap-3">
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
      )}

      {/* 레이어 메뉴 */}
      {showLayerMenu && (
        <>
          <div className="absolute inset-0 z-10" onClick={() => setShowLayerMenu(false)}/>
          <div className="absolute right-4 bottom-80 z-20 bg-white rounded-2xl shadow-xl p-4 w-52">
            <div className="text-xs font-bold text-gray-400 mb-3 tracking-wide">지도 레이어</div>
            {[
              { key: 'speedCameras', label: '📷 과속카메라' },
              { key: 'sectionEnforcement', label: '🚧 구간단속' },
              { key: 'speedLimits', label: '🔴 제한속도' },
              { key: 'mergePoints', label: '🔀 합류지점' },
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
      <HomeBottomPanel />

      {showSearch && <SearchSheet onClose={() => setShowSearch(false)} />}
      {showHighwayExplorer && <HighwayExplorer onClose={() => setShowHighwayExplorer(false)} />}
    </div>
  )
}

function FloatButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all"
    >
      {children}
    </button>
  )
}
