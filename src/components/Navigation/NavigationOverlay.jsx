import React, { useEffect, useRef, useState } from 'react'
import useAppStore from '../../store/appStore'
import MergeOptionsSheet from './MergeOptionsSheet'
import { formatEta } from '../Route/RouteCard'

export default function NavigationOverlay() {
  const { isNavigating, stopNavigation, destination, routes, selectedRouteId, mergeOptions } = useAppStore()
  const [showMerge, setShowMerge] = useState(false)
  const segmentRef = useRef(null)
  const wakeLockRef = useRef(null)

  // 길안내 중 화면 꺼짐 방지
  useEffect(() => {
    if (!isNavigating) return
    let released = false
    async function acquireWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          wakeLockRef.current.addEventListener('release', () => {
            if (!released) acquireWakeLock() // 시스템에 의해 해제되면 재획득
          })
        }
      } catch {
        // Wake Lock 미지원 기기는 조용히 무시
      }
    }
    acquireWakeLock()
    return () => {
      released = true
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [isNavigating])

  if (!isNavigating) return null

  const route = routes.find(r => r.id === selectedRouteId)
  const primaryMerge = mergeOptions.find((item) => item.isSelected) ?? mergeOptions[0]
  const nextSegments = route?.nextSegments ?? []
  // 가장 가까운 분기점 (첫 번째 미선택 혹은 전체에서 첫 번째)
  const nextJunction = mergeOptions[0]
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
          {/* 분기점 헤더 — 탭하면 합류 옵션 시트 */}
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 active:bg-gray-100"
            onClick={() => setShowMerge(true)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base flex-shrink-0">🔀</span>
              <div className="text-left min-w-0">
                <div className="text-xs text-gray-500 leading-tight">다음 분기점</div>
                {nextJunction ? (
                  <div className="text-sm font-bold text-gray-900 truncate">
                    {nextJunction.name}
                    <span className="text-xs font-normal text-gray-500 ml-1">
                      ({nextJunction.distanceFromCurrent}km 앞)
                    </span>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-gray-900">분기점 없음</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {nextJunction && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${nextJunction.afterRoadType === 'highway' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                  {nextJunction.afterRoadType === 'highway' ? '고속' : '국도'}
                </span>
              )}
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* 합류 옵션 미리보기 (최대 3개) */}
          {mergeOptions.length > 0 && (
            <div ref={segmentRef} onWheel={handleWheelScroll} className="flex overflow-x-auto no-scrollbar px-4 py-3 gap-2 snap-x snap-mandatory">
              {mergeOptions.slice(0, 4).map((opt) => (
                <JunctionChip key={opt.id} opt={opt} onSelect={() => setShowMerge(true)} />
              ))}
            </div>
          )}

          {/* 세그먼트가 없고 nextSegments가 있으면 표시 */}
          {mergeOptions.length === 0 && nextSegments.length > 0 && (
            <div ref={segmentRef} onWheel={handleWheelScroll} className="flex overflow-x-auto no-scrollbar px-4 py-3 gap-3 snap-x snap-mandatory">
              {nextSegments.map((seg) => (
                <SegmentChip key={`${seg.km}-${seg.roadName}`} seg={seg} />
              ))}
            </div>
          )}

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

function JunctionChip({ opt, onSelect }) {
  const isHighway = opt.afterRoadType === 'highway'
  return (
    <button
      onClick={onSelect}
      className={`flex-shrink-0 rounded-xl px-3 py-2 min-w-[100px] text-left snap-start border ${
        opt.isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-xs">🔀</span>
        <span className={`text-xs font-bold truncate ${opt.isSelected ? 'text-tmap-blue' : 'text-gray-700'}`}>
          {opt.name}
        </span>
      </div>
      <div className={`text-xs font-medium ${isHighway ? 'text-blue-600' : 'text-green-600'}`}>
        {isHighway ? '고속' : '국도'} 진입
      </div>
      <div className="text-xs text-gray-400 mt-0.5">
        {opt.distanceFromCurrent}km 앞
        {opt.addedTime > 0 && <span className="ml-1 text-orange-400">+{opt.addedTime}분</span>}
      </div>
    </button>
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
