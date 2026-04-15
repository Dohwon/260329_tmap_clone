import React, { useRef } from 'react'
import useAppStore from '../../store/appStore'
import { HIGHWAYS } from '../../data/highwayData'

export default function HomeBottomPanel() {
  const {
    isNavigating,
    showRoutePanel,
    favorites,
    userLocation,
    userAddress,
    mapCenter,
    searchRoute,
    showRecentSearches,
    openNearbyCategory,
    refreshHomeRestaurantPins,
    selectRoad,
    setActiveTab,
  } = useAppStore()
  const quickChipRef = useRef(null)
  const roadRef = useRef(null)

  const handleWheelScroll = (ref) => (event) => {
    if (!ref.current) return
    ref.current.scrollLeft += event.deltaY
  }

  if (isNavigating || showRoutePanel) return null

  return (
    <div className="w-full">
      <div className="bg-white bottom-sheet mx-0 pt-3 pb-2 safe-bottom">
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="mx-4 rounded-2xl bg-gray-50 px-4 py-3">
          <div className="text-[11px] font-semibold text-gray-400">내 위치</div>
          <div className="text-sm font-bold text-gray-900 mt-0.5">
            {userAddress || 'GPS 위치 확인 중'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {userLocation?.speedKmh != null ? `현재 속도 ${userLocation.speedKmh}km/h` : '위치 권한이 필요할 수 있어요'}
          </div>
        </div>

        <div className="px-4 mt-3">
          <div ref={quickChipRef} onWheel={handleWheelScroll(quickChipRef)} className="flex gap-2 overflow-x-auto no-scrollbar">
            {favorites.slice(0, 2).map((favorite) => (
              <QuickChip
                key={favorite.id}
                icon={favorite.icon}
                label={favorite.name}
                sublabel={favorite.address ? '' : '설정'}
                onClick={() => {
                  if (favorite.lat && favorite.lng) {
                    searchRoute(favorite)
                    return
                  }
                  setActiveTab('favorites')
                }}
              />
            ))}
            <QuickChip icon="⭐" label="최근" onClick={showRecentSearches} />
            <QuickChip icon="⛽" label="주유소" onClick={() => openNearbyCategory('주유소')} />
            <QuickChip icon="🏥" label="병원" onClick={() => openNearbyCategory('병원')} />
            <QuickChip icon="🍽️" label="맛집" onClick={() => openNearbyCategory('음식점')} />
            <QuickChip
              icon="🔄"
              label="맛집 새로고침"
              onClick={() => refreshHomeRestaurantPins({
                lat: Number(mapCenter?.[0] ?? userLocation?.lat),
                lng: Number(mapCenter?.[1] ?? userLocation?.lng),
              })}
            />
            <QuickChip icon="🅿️" label="주차장" onClick={() => openNearbyCategory('주차장')} />
          </div>
        </div>

        <div className="px-4 mt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-gray-500 tracking-wide">고속도로 / 국도 탐색</div>
            <div className="text-[11px] text-gray-400">스크롤해서 선택</div>
          </div>
          <div ref={roadRef} onWheel={handleWheelScroll(roadRef)} className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {HIGHWAYS.map((road) => (
              <button
                key={road.id}
                onClick={() => selectRoad(road.id)}
                className="flex-shrink-0 rounded-2xl px-3 py-2.5 border bg-gray-50 border-gray-100 w-[138px] text-left"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg text-white text-xs font-black flex items-center justify-center" style={{ backgroundColor: road.color }}>
                    {road.number}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-900 truncate">{road.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{road.startName} → {road.endName}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickChip({ icon, label, sublabel, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1.5 active:bg-gray-200 flex-shrink-0">
      <span className="text-sm">{icon}</span>
      <span className="text-xs font-medium text-gray-700">{label}</span>
      {sublabel ? <span className="text-[10px] text-tmap-blue font-semibold">{sublabel}</span> : null}
    </button>
  )
}
