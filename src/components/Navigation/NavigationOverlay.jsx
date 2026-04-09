import React, { useRef, useState } from 'react'
import useAppStore from '../../store/appStore'
import MergeOptionsSheet from './MergeOptionsSheet'
import { formatEta } from '../Route/RouteCard'

export default function NavigationOverlay() {
  const { isNavigating, stopNavigation, destination, routes, selectedRouteId, mergeOptions } = useAppStore()
  const [showMerge, setShowMerge] = useState(false)
  const segmentRef = useRef(null)

  if (!isNavigating) return null

  const route = routes.find(r => r.id === selectedRouteId)
  const primaryMerge = mergeOptions.find((item) => item.isSelected) ?? mergeOptions[0]
  const nextSegments = route?.nextSegments ?? []
  const handleWheelScroll = (event) => {
    if (!segmentRef.current) return
    segmentRef.current.scrollLeft += event.deltaY
  }

  return (
    <>
      {/* 상단 방향 배너 */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <div className="bg-tmap-blue px-5 pt-14 pb-4">
          <div className="flex items-center gap-4">
            {/* 방향 아이콘 */}
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18"/>
              </svg>
            </div>
            {/* 안내 문구 */}
            <div className="flex-1">
              <div className="text-white/70 text-sm mb-0.5">직진</div>
              <div className="text-white text-xl font-black">
                {primaryMerge ? `${primaryMerge.distanceFromCurrent}km 후 ${primaryMerge.name}` : '주행 경로 유지'}
              </div>
              <div className="text-white/70 text-sm mt-0.5">
                {primaryMerge?.afterRoadName ?? destination?.name}
              </div>
            </div>
            {/* 종료 버튼 */}
            <button
              onClick={stopNavigation}
              className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* 통계 바 */}
        <div className="bg-white px-5 py-3 flex items-center shadow-md">
          <div className="flex-1 text-center">
            <div className="text-xs text-gray-400">남은시간</div>
            <div className="text-lg font-black text-gray-900">{route?.eta ? formatEta(route.eta) : '--'}</div>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="flex-1 text-center">
            <div className="text-xs text-gray-400">도착예정</div>
            <div className="text-lg font-black text-gray-900">{getArrivalTime(route?.eta)}</div>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="flex-1 text-center">
            <div className="text-xs text-gray-400">남은거리</div>
            <div className="text-lg font-black text-gray-900">{route?.distance ?? '--'}km</div>
          </div>
          {/* 제한속도 배지 */}
          <div className="ml-3 flex flex-col items-center justify-center w-12 h-12 rounded-full border-3 border-red-500 speed-badge">
            <span className="text-xs font-black text-red-600 leading-tight">{route?.maxSpeedLimit ?? 110}</span>
            <span className="text-[9px] text-red-400">km/h</span>
          </div>
        </div>
      </div>

      {/* 하단 다음 구간 예고 바 */}
      <div className="absolute bottom-20 left-0 right-0 z-20 px-4">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* 섹션 헤더 */}
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50"
            onClick={() => setShowMerge(true)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">🗺️</span>
              <span className="text-sm font-semibold text-gray-700">다음 10km 구간 예고</span>
            </div>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </button>

          {/* 세그먼트 타임라인 */}
          <div ref={segmentRef} onWheel={handleWheelScroll} className="flex overflow-x-auto no-scrollbar px-4 py-3 gap-3 snap-x snap-mandatory">
            {nextSegments.map((seg) => (
              <SegmentChip key={`${seg.km}-${seg.roadName}`} seg={seg} />
            ))}
          </div>

          {/* 카메라/구간단속 요약 */}
          <div className="flex items-center gap-4 px-4 pb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">📷</span>
              <span className="text-xs text-gray-500">다음 카메라 <strong className="text-red-500">{Math.max(4, Math.round((route?.distance ?? 0) / 6))}km</strong> 앞</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🚧</span>
              <span className="text-xs text-gray-500">구간단속 <strong className="text-orange-500">{Math.max(8, Math.round((route?.distance ?? 0) / 4))}km</strong> 앞</span>
            </div>
          </div>
        </div>
      </div>

      {showMerge && <MergeOptionsSheet onClose={() => setShowMerge(false)} />}
    </>
  )
}

function SegmentChip({ seg }) {
  const typeStyles = {
    highway: { bg: 'bg-blue-50', text: 'text-tmap-blue', icon: '🛣️' },
    junction: { bg: 'bg-yellow-50', text: 'text-yellow-600', icon: '🔀' },
    exit: { bg: 'bg-green-50', text: 'text-tmap-green', icon: '↗️' },
    section: { bg: 'bg-orange-50', text: 'text-tmap-orange', icon: '🚧' },
  }
  const style = typeStyles[seg.type] ?? typeStyles.highway

  return (
    <div className={`flex-shrink-0 rounded-xl px-3 py-2 ${style.bg} min-w-[90px]`}>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs">{style.icon}</span>
        <span className={`text-xs font-bold ${style.text}`}>{seg.km}km~</span>
      </div>
      <div className="text-xs text-gray-600 font-medium leading-tight">{seg.roadName}</div>
      <div className="flex items-center gap-1 mt-1">
        <div className={`w-1.5 h-1.5 rounded-full ${seg.congestion === 1 ? 'bg-green-400' : seg.congestion === 2 ? 'bg-yellow-400' : 'bg-red-400'}`}/>
        <span className="text-xs text-gray-400">{seg.speedLimit}km/h</span>
      </div>
    </div>
  )
}

function getArrivalTime(minutesFromNow) {
  if (!minutesFromNow) return '--:--'
  const now = new Date()
  now.setMinutes(now.getMinutes() + minutesFromNow)
  return now.toTimeString().slice(0, 5)
}
