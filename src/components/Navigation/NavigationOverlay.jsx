import React, { useEffect, useRef, useState } from 'react'
import useAppStore from '../../store/appStore'
import MergeOptionsSheet from './MergeOptionsSheet'
import { formatEta } from '../Route/RouteCard'
import { SCENIC_SEGMENTS } from '../../data/scenicRoads'

export default function NavigationOverlay() {
  const {
    isNavigating, stopNavigation, destination, routes, selectedRouteId,
    mergeOptions, userLocation, saveRoute, cameraReports, reportCamera,
    navAutoFollow, setNavAutoFollow,
  } = useAppStore()
  const [showMerge, setShowMerge] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showCameraReport, setShowCameraReport] = useState(null) // camera object
  const [scenicToast, setScenicToast] = useState(null) // { emoji, name, type }
  const segmentRef = useRef(null)
  const wakeLockRef = useRef(null)
  const nearCameraNotifiedRef = useRef(new Set()) // 이미 알린 카메라 id
  const notifiedScenicRef = useRef(new Set()) // 이미 알린 scenic segment id

  // 화면 꺼짐 방지
  useEffect(() => {
    if (!isNavigating) return
    let released = false
    async function acquireWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          wakeLockRef.current.addEventListener('release', () => {
            if (!released) acquireWakeLock()
          })
        }
      } catch { /* 미지원 기기 무시 */ }
    }
    acquireWakeLock()
    return () => {
      released = true
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [isNavigating])

  // 카메라 근접 감지 (100m 이내 → 신고 프롬프트)
  useEffect(() => {
    if (!isNavigating || !userLocation) return
    const route = routes.find(r => r.id === selectedRouteId)
    const cameras = route?.cameras ?? []
    for (const cam of cameras) {
      if (nearCameraNotifiedRef.current.has(cam.id)) continue
      const dist = haversineM(userLocation.lat, userLocation.lng, cam.coord[0], cam.coord[1])
      if (dist < 120) {
        nearCameraNotifiedRef.current.add(cam.id)
        // 150m 내 통과 후 신고 팝업 (1.5초 딜레이)
        setTimeout(() => setShowCameraReport(cam), 1500)
      }
    }
  }, [userLocation])

  // 경관 구간 진입 감지 → 토스트 알림
  useEffect(() => {
    if (!isNavigating || !userLocation) return
    const NOTIFY_KM = 4 // 이 거리 내에 들어오면 진입으로 판단
    for (const seg of SCENIC_SEGMENTS) {
      if (notifiedScenicRef.current.has(seg.id)) continue
      const [mLat, mLng] = seg.segmentMid
      const dist = haversineM(userLocation.lat, userLocation.lng, mLat, mLng) / 1000
      if (dist <= NOTIFY_KM) {
        notifiedScenicRef.current.add(seg.id)
        setScenicToast({ emoji: seg.emoji, name: seg.name, type: seg.scenicType })
        setTimeout(() => setScenicToast(null), 5000)
      }
    }
  }, [userLocation, isNavigating])

  if (!isNavigating) return null

  const route = routes.find(r => r.id === selectedRouteId)
  const junctions = route?.junctions ?? []   // TMAP 실제 분기점
  const nextRealJunction = junctions[0]      // 경로 상 첫 번째 실제 IC/JC
  const nextMergeOpt = mergeOptions[0]       // merge 옵션 첫 번째

  // 상단 배너: 실제 분기점 우선, 없으면 목적지
  const bannerTitle = nextRealJunction
    ? nextRealJunction.name
    : destination?.name ?? '목적지'
  const bannerSub = nextRealJunction
    ? (nextRealJunction.afterRoadName
        ? `${nextRealJunction.afterRoadName} 진입`
        : `${nextRealJunction.afterRoadType === 'highway' ? '고속도로' : '국도'} 진입`)
    : `${route?.distance != null ? Number(route.distance).toFixed(2) : '--'}km · ${route?.eta ? formatEta(route.eta) : '--'} 소요`
  const bannerLabel = nextRealJunction
    ? `${Number(nextRealJunction.distanceFromStart).toFixed(2)}km 앞`
    : '직진'
  const bannerTurnType = nextRealJunction?.turnType ?? 11

  const handleWheelScroll = (e) => {
    if (segmentRef.current) segmentRef.current.scrollLeft += e.deltaY
  }

  const handleStop = () => {
    setShowSaveDialog(true)
  }

  return (
    <>
      {/* 상단 방향 배너 */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <div className="bg-tmap-blue px-5 pt-14 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              <TurnArrow turnType={bannerTurnType} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white/70 text-sm mb-0.5">{bannerLabel}</div>
              <div className="text-white text-xl font-black truncate">{bannerTitle}</div>
              <div className="text-white/70 text-sm mt-0.5 truncate">{bannerSub}</div>
            </div>
            <button
              onClick={handleStop}
              className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* 통계 바 */}
        {(() => {
          const currentSpeed = Math.round(userLocation?.speedKmh ?? 0)
          const speedLimit = route?.dominantSpeedLimit ?? route?.maxSpeedLimit ?? null
          const overLimit = speedLimit && currentSpeed > speedLimit
          return (
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
                <div className="text-lg font-black text-gray-900">{route?.distance != null ? Number(route.distance).toFixed(2) : '--'}km</div>
              </div>
              {/* 현재 속도 배지 */}
              <div className={`ml-3 flex flex-col items-center justify-center w-14 h-14 rounded-full border-[3px] ${overLimit ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}>
                <span className={`text-base font-black leading-none ${overLimit ? 'text-red-600' : 'text-gray-900'}`}>{currentSpeed}</span>
                {speedLimit && <span className={`text-[9px] leading-tight ${overLimit ? 'text-red-400' : 'text-gray-400'}`}>/{speedLimit}</span>}
                <span className="text-[8px] text-gray-400 leading-none">km/h</span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* 하단 분기점 바 */}
      <div className="absolute bottom-20 left-0 right-0 z-20 px-4">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 active:bg-gray-100"
            onClick={() => setShowMerge(true)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base flex-shrink-0">🔀</span>
              <div className="text-left min-w-0">
                <div className="text-xs text-gray-500 leading-tight">다음 분기점</div>
                {nextMergeOpt ? (
                  <div className="text-sm font-bold text-gray-900 truncate">
                    {nextMergeOpt.name}
                    <span className="text-xs font-normal text-gray-500 ml-1">
                      ({Number(nextMergeOpt.distanceFromCurrent).toFixed(2)}km 앞)
                    </span>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-gray-500">분기점 없음</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {nextMergeOpt && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${nextMergeOpt.afterRoadType === 'highway' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                  {nextMergeOpt.afterRoadType === 'highway' ? '고속' : '국도'}
                </span>
              )}
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {mergeOptions.length > 0 && (
            <div ref={segmentRef} onWheel={handleWheelScroll} className="flex overflow-x-auto no-scrollbar px-4 py-3 gap-2 snap-x">
              {mergeOptions.slice(0, 4).map((opt) => (
                <JunctionChip key={opt.id} opt={opt} onSelect={() => setShowMerge(true)} />
              ))}
            </div>
          )}

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

      {/* 내 위치로 재중심 버튼 (auto-follow 꺼졌을 때) */}
      {!navAutoFollow && (
        <button
          onClick={() => setNavAutoFollow(true)}
          className="absolute right-4 bottom-48 z-20 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center border border-gray-200 active:bg-gray-50"
        >
          <svg className="w-6 h-6 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v3m0 14v3M2 12h3m14 0h3"/>
          </svg>
        </button>
      )}

      {/* 경관 구간 진입 토스트 */}
      {scenicToast && (
        <div className={`absolute top-36 left-4 right-4 z-30 rounded-2xl px-4 py-3 shadow-xl flex items-center gap-3 text-white ${scenicToast.type === 'coastal' ? 'bg-blue-500' : 'bg-green-600'}`}>
          <span className="text-2xl">{scenicToast.emoji}</span>
          <div>
            <div className="text-xs font-medium opacity-80">{scenicToast.type === 'coastal' ? '해안도로 구간 진입' : '산악도로 구간 진입'}</div>
            <div className="text-sm font-black">{scenicToast.name}</div>
          </div>
          <button onClick={() => setScenicToast(null)} className="ml-auto opacity-60">✕</button>
        </div>
      )}

      {/* 경로 저장 다이얼로그 */}
      {showSaveDialog && (
        <SaveRouteDialog
          route={route}
          destination={destination}
          onSave={(name) => {
            saveRoute({ route, destination, name })
            setShowSaveDialog(false)
            stopNavigation()
          }}
          onDiscard={() => {
            setShowSaveDialog(false)
            stopNavigation()
          }}
        />
      )}

      {/* 카메라 신고 다이얼로그 */}
      {showCameraReport && (
        <CameraReportDialog
          camera={showCameraReport}
          cameraReports={cameraReports}
          onReport={(type) => {
            reportCamera({ id: showCameraReport.id, coord: showCameraReport.coord, type })
            setShowCameraReport(null)
          }}
          onClose={() => setShowCameraReport(null)}
        />
      )}
    </>
  )
}

// ── 하위 컴포넌트 ──────────────────────────────────────

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
        <span className={`text-xs font-bold truncate ${opt.isSelected ? 'text-tmap-blue' : 'text-gray-700'}`}>{opt.name}</span>
      </div>
      <div className={`text-xs font-medium ${isHighway ? 'text-blue-600' : 'text-green-600'}`}>
        {isHighway ? '고속' : '국도'} 진입
      </div>
      <div className="text-xs text-gray-400 mt-0.5">
        {Number(opt.distanceFromCurrent).toFixed(2)}km 앞
        {opt.addedTime > 0 && <span className="ml-1 text-orange-400">+{opt.addedTime}분</span>}
      </div>
    </button>
  )
}

function SaveRouteDialog({ route, destination, onSave, onDiscard }) {
  const [name, setName] = useState(
    destination?.name ? `→ ${destination.name}` : `경로 ${new Date().toLocaleDateString('ko-KR')}`
  )
  return (
    <>
      <div className="absolute inset-0 bg-black/40 z-50" onClick={onDiscard} />
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-5 pt-5 pb-8 safe-bottom slide-up">
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="text-lg font-black text-gray-900 mb-1">이 경로를 저장할까요?</div>
        <div className="text-sm text-gray-500 mb-4">
          {route?.distance != null ? Number(route.distance).toFixed(2) : '--'}km · {route?.eta ? formatEta(route.eta) : '--'} · 통행료 {route?.tollFee ? `${route.tollFee.toLocaleString()}원` : '없음'}
        </div>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-4 outline-none focus:border-tmap-blue"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="경로 이름"
        />
        <div className="flex gap-3">
          <button onClick={onDiscard} className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-sm font-bold text-gray-700">
            저장 안 함
          </button>
          <button onClick={() => onSave(name)} className="flex-1 py-3.5 rounded-2xl bg-tmap-blue text-sm font-bold text-white">
            💾 저장
          </button>
        </div>
      </div>
    </>
  )
}

function CameraReportDialog({ camera, cameraReports, onReport, onClose }) {
  const existingReport = cameraReports.find(r => r.id === camera.id)
  return (
    <>
      <div className="absolute inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-5 pt-5 pb-8 safe-bottom slide-up">
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">📷</span>
          <div>
            <div className="text-base font-black text-gray-900">{camera.label ?? '카메라'}</div>
            <div className="text-xs text-gray-400">제한 {camera.speedLimit}km/h</div>
          </div>
        </div>

        {existingReport ? (
          <div className="mt-4 bg-gray-50 rounded-xl p-3 text-sm text-gray-500 text-center">
            이미 신고됨: {existingReport.type === 'off' ? '꺼진 카메라' : '없는 카메라'}
          </div>
        ) : (
          <>
            <div className="text-sm text-gray-500 mt-3 mb-4">이 카메라의 상태를 신고하세요</div>
            <div className="flex gap-3">
              <button
                onClick={() => onReport('off')}
                className="flex-1 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-sm font-bold text-amber-700"
              >
                🟡 꺼진 카메라
              </button>
              <button
                onClick={() => onReport('fake')}
                className="flex-1 py-3 rounded-2xl bg-red-50 border border-red-200 text-sm font-bold text-red-600"
              >
                ❌ 없는 카메라
              </button>
            </div>
          </>
        )}
        <button onClick={onClose} className="w-full mt-3 py-3 text-sm text-gray-400">
          닫기
        </button>
      </div>
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

// TMAP turnType → 방향 화살표 아이콘
function TurnArrow({ turnType }) {
  // 직진(11), 좌회전(12), 우회전(13), 유턴(14), 좌측합류(16), 우측합류(17), 좌분기(18), 우분기(19), IC/JC램프(100+)
  const t = Number(turnType)
  if (t === 12 || t === 16 || t === 18) {
    // 좌회전
    return (
      <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
      </svg>
    )
  }
  if (t === 13 || t === 17 || t === 19 || t >= 100) {
    // 우회전 / IC 램프 (오른쪽 진출)
    return (
      <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 16l4-4m0 0l-4-4m4 4H3m5 4v1a3 3 0 003 3h7a3 3 0 003-3V7a3 3 0 00-3-3h-7a3 3 0 00-3 3v1"/>
      </svg>
    )
  }
  if (t === 14) {
    // 유턴
    return (
      <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
      </svg>
    )
  }
  // 기본: 직진
  return (
    <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18"/>
    </svg>
  )
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}
