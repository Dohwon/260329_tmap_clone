import React, { useMemo, useState } from 'react'
import useAppStore from '../store/appStore'
import { HIGHWAYS } from '../data/highwayData'
import { analyzeRecordedDrive, buildDrivingHabitSummary } from '../utils/navigationLogic'

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function getHighwayTrafficRows(userLocation) {
  const hour = new Date().getHours()
  return HIGHWAYS.map((road, index) => {
    const midpoint = [
      (road.startCoord[0] + road.endCoord[0]) / 2,
      (road.startCoord[1] + road.endCoord[1]) / 2,
    ]
    const distanceKm = userLocation ? haversineKm(userLocation.lat, userLocation.lng, midpoint[0], midpoint[1]) : null
    const peakPenalty = hour >= 7 && hour <= 9 ? 14 : hour >= 17 && hour <= 20 ? 18 : 4
    const baseline = road.roadClass === 'national' ? 68 : road.id === 'sejongPocheon' ? 101 : 92
    const variation = ((road.totalKm + index * 17) % 15) - 7
    const avgSpeed = Math.max(35, baseline - peakPenalty + variation)
    const congestionLabel = avgSpeed < 50 ? '정체' : avgSpeed < 72 ? '서행' : '원활'
    return {
      id: road.id,
      name: road.name,
      color: road.color,
      avgSpeed,
      congestionLabel,
      summary: `${road.startName} → ${road.endName}`,
      distanceKm: distanceKm != null ? Number(distanceKm.toFixed(0)) : null,
    }
  }).sort((a, b) => {
    if (a.distanceKm == null || b.distanceKm == null) return 0
    return a.distanceKm - b.distanceKm
  })
}

function getNearestRoadId(userLocation) {
  if (!userLocation) return HIGHWAYS[0]?.id ?? null
  return HIGHWAYS
    .map((road) => ({
      id: road.id,
      distance: haversineKm(
        userLocation.lat,
        userLocation.lng,
        (road.startCoord[0] + road.endCoord[0]) / 2,
        (road.startCoord[1] + road.endCoord[1]) / 2
      ),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.id ?? HIGHWAYS[0]?.id ?? null
}

function getRoadClassLabel(roadId) {
  const road = HIGHWAYS.find((item) => item.id === roadId)
  return road?.roadClass === 'national' ? '국도' : '고속도로'
}

export default function MoreScreen() {
  const {
    startNavigation,
    setActiveTab,
    userLocation,
    openNearbyCategory,
    savedRoutes,
    deleteSavedRoute,
    resumeSavedRoute,
    settings,
    updateSetting,
    selectRoad,
    setLayerVisibility,
    refreshSafetyHazards,
  } = useAppStore()
  const [toast, setToast] = useState(null)
  const [panel, setPanel] = useState(null)

  const showToast = (msg) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }

  const openExternal = (url) => {
    if (url.startsWith('tel:')) {
      window.location.href = url
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleNearby = async (keyword) => {
    if (!userLocation) {
      showToast('위치 정보를 가져오는 중입니다.')
      return
    }
    await openNearbyCategory(keyword)
  }

  const drivingHabit = useMemo(() => buildDrivingHabitSummary(savedRoutes), [savedRoutes])
  const routeAnalyses = useMemo(
    () => Object.fromEntries(savedRoutes.map((route) => [
      route.id,
      route.routeAnalysis ?? analyzeRecordedDrive(route.polyline ?? [], [], {
        polyline: route.originalRoutePolyline ?? route.polyline ?? [],
        junctions: route.junctions ?? [],
      }),
    ])),
    [savedRoutes]
  )
  const highwayRows = useMemo(() => getHighwayTrafficRows(userLocation), [userLocation])

  const MENU_SECTIONS = [
    {
      title: '드라이브',
      items: [
        { icon: '📊', label: '드라이브 기록', desc: '주행 후 저장한 경로 보기', action: () => setPanel('records') },
        { icon: '🧠', label: '내 운전 습관', desc: '저장된 경로 기반 분석', action: () => setPanel('habits') },
      ],
    },
    {
      title: '근처 찾기',
      items: [
        { icon: '⛽', label: '주유/충전소', desc: '후보 목록에서 선택', action: () => handleNearby('주유소'), live: true },
        { icon: '🅿️', label: '주차장', desc: '후보 목록에서 선택', action: () => handleNearby('주차장'), live: true },
        { icon: '🏥', label: '병원', desc: '후보 목록에서 선택', action: () => handleNearby('병원'), live: true },
        { icon: '☕', label: '카페', desc: '후보 목록에서 선택', action: () => handleNearby('카페'), live: true },
        { icon: '🍽️', label: '음식점', desc: '후보 목록에서 선택', action: () => handleNearby('음식점'), live: true },
      ],
    },
    {
      title: '교통 정보',
      items: [
        { icon: '🚌', label: '실시간 버스', desc: '네이버지도 대중교통', action: () => openExternal('https://map.naver.com/p?menu=transit') },
        { icon: '🚇', label: '지하철 노선도', desc: '실제 지하철 노선도 열기', action: () => openExternal('https://map.naver.com/p?menu=subway') },
        { icon: '🛣️', label: '도로 정보', desc: '가까운 고속도로·국도 흐름', action: () => setPanel('highway') },
      ],
    },
    {
      title: '안전',
      items: [
        {
          icon: '📷',
          label: '과속카메라 정보',
          desc: '지도에 단속 위치 표시',
          action: () => {
            const nearestRoadId = getNearestRoadId(userLocation)
            setLayerVisibility('speedCameras', true)
            setLayerVisibility('sectionEnforcement', true)
            if (nearestRoadId) selectRoad(nearestRoadId)
            setActiveTab('home')
            showToast('지도에 과속카메라를 표시했습니다.')
          },
        },
        {
          icon: '🛡️',
          label: '안전 운전 모드',
          desc: settings.safetyModeEnabled ? '실행 중' : '목적지 없이 위험요소 안내',
          toggle: true,
          enabled: settings.safetyModeEnabled,
          action: async () => {
            const nextValue = !settings.safetyModeEnabled
            updateSetting('safetyModeEnabled', nextValue)
            if (nextValue) await refreshSafetyHazards()
            showToast(nextValue ? '안전 운전 모드를 켰습니다.' : '안전 운전 모드를 껐습니다.')
          },
        },
        { icon: '🆘', label: '긴급 신고', desc: '112 / 119 바로 연결', action: () => setPanel('emergency') },
      ],
    },
    {
      title: '설정',
      items: [
        { icon: '⚙️', label: '설정', desc: '음성·지도·안전 설정', action: () => setPanel('settings') },
        { icon: '❓', label: '고객센터', desc: '피드백 보내기', action: () => showToast('현재 세션의 피드백은 개발 작업에 바로 반영 중입니다.') },
        { icon: 'ℹ️', label: '앱 정보', desc: 'v1.0.0 Web MVP', action: () => showToast('장거리 드라이버용 T맵 클론 Web 빌드입니다.') },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white px-5 pt-14 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-black text-gray-900">더보기</h1>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
        {MENU_SECTIONS.map((section) => (
          <div key={section.title} className="px-4 pt-5">
            <div className="text-xs font-semibold text-gray-400 mb-2 tracking-wide px-1">
              {section.title}
            </div>
            <div className="bg-white rounded-2xl overflow-hidden divide-y divide-gray-50">
              {section.items.map((item) => (
                item.toggle ? (
                  <div
                    key={item.label}
                    className="w-full flex items-center gap-3 px-4 py-3.5"
                  >
                    <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                      {item.icon}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{item.label}</span>
                      </div>
                      <div className="text-xs text-gray-400">{item.desc}</div>
                    </div>
                    <button
                      type="button"
                      onClick={item.action}
                      aria-label={`${item.label} 토글`}
                      aria-pressed={Boolean(item.enabled)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        item.enabled ? 'bg-tmap-blue' : 'bg-gray-200'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                          item.enabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ) : (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                  >
                    <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                      {item.icon}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{item.label}</span>
                        {item.live && (
                          <span className="text-xs bg-tmap-blue text-white px-1.5 py-0.5 rounded-full font-bold">Live</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{item.desc}</div>
                    </div>
                    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )
              ))}
            </div>
          </div>
        ))}
      </div>

      {panel === 'records' && (
        <BottomSheet title="드라이브 기록" subtitle="주행 후 저장한 경로" onClose={() => setPanel(null)}>
          {savedRoutes.length === 0 ? (
            <EmptyState text="아직 저장된 경로가 없습니다." />
          ) : (
            savedRoutes.map((route) => (
              <div key={route.id} className="rounded-2xl bg-gray-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-gray-900 truncate">{route.name}</div>
                    <div className="text-xs text-gray-500 mt-1 truncate">{route.destination?.address ?? route.destination?.name ?? '목적지 정보 없음'}</div>
                    <div className="text-xs text-gray-500 mt-2">
                      {route.source === 'no_movement'
                        ? '실제 이동 없음'
                        : `${route.distance?.toFixed?.(1) ?? route.distance}km · ${route.eta ?? '--'}분 · 고속 ${route.highwayRatio ?? '--'}%`}
                    </div>
                    {route.source === 'recorded' && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="text-[11px] px-2 py-1 rounded-full bg-white text-gray-600 font-semibold">
                          이탈 {routeAnalyses[route.id]?.deviationCount ?? 0}회
                        </span>
                        <span className="text-[11px] px-2 py-1 rounded-full bg-white text-gray-600 font-semibold">
                          급감속 {routeAnalyses[route.id]?.brakingEventCount ?? 0}회
                        </span>
                        <span className="text-[11px] px-2 py-1 rounded-full bg-white text-gray-600 font-semibold">
                          실속 {route.actualAverageMovingSpeed ?? routeAnalyses[route.id]?.averageMovingSpeedKmh ?? '--'}km/h
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteSavedRoute(route.id)}
                    className="px-3 py-1.5 rounded-xl bg-white text-xs font-bold text-gray-500 border border-gray-200"
                  >
                    삭제
                  </button>
                </div>
                {Array.isArray(route.polyline) && route.polyline.length > 1 && (
                  <button
                    onClick={async () => {
                      resumeSavedRoute(route)
                      await startNavigation()
                      setPanel(null)
                      setActiveTab('home')
                    }}
                    className="mt-3 w-full py-2.5 rounded-2xl bg-tmap-blue text-white text-sm font-bold"
                  >
                    실제 주행 경로 다시 안내
                  </button>
                )}
                {route.source === 'recorded' && routeAnalyses[route.id]?.summaryLines?.length > 0 && (
                  <div className="mt-3 rounded-2xl bg-white px-3 py-3 space-y-1.5">
                    {routeAnalyses[route.id].summaryLines.slice(0, 3).map((line) => (
                      <div key={`${route.id}-${line}`} className="text-xs text-gray-600 leading-5">
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </BottomSheet>
      )}

      {panel === 'habits' && (
        <BottomSheet title="내 운전 습관" subtitle="저장된 경로 실제 통계" onClose={() => setPanel(null)}>
          <div className="rounded-2xl bg-gray-50 p-4">
            <div className="text-sm font-black text-gray-900">{drivingHabit.title}</div>
            <div className="mt-3 space-y-2">
              {drivingHabit.lines.map((line) => (
                <div key={line} className="text-sm text-gray-600 leading-6">{line}</div>
              ))}
            </div>
          </div>
          {(drivingHabit.topDeviation || drivingHabit.topDetour || drivingHabit.topBrake) && (
            <div className="grid gap-3">
              {drivingHabit.topDeviation && (
                <div className="rounded-2xl border border-gray-100 p-4">
                  <div className="text-xs font-bold text-gray-400">자주 벗어나는 합류</div>
                  <div className="text-sm font-black text-gray-900 mt-1">{drivingHabit.topDeviation.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{drivingHabit.topDeviation.count}회</div>
                </div>
              )}
              {drivingHabit.topDetour && (
                <div className="rounded-2xl border border-gray-100 p-4">
                  <div className="text-xs font-bold text-gray-400">실제 선호 우회</div>
                  <div className="text-sm font-black text-gray-900 mt-1">{drivingHabit.topDetour.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{drivingHabit.topDetour.count}회</div>
                </div>
              )}
              {drivingHabit.topBrake && (
                <div className="rounded-2xl border border-gray-100 p-4">
                  <div className="text-xs font-bold text-gray-400">브레이크 빈발 구간</div>
                  <div className="text-sm font-black text-gray-900 mt-1">{drivingHabit.topBrake.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{drivingHabit.topBrake.count}회</div>
                </div>
              )}
            </div>
          )}
        </BottomSheet>
      )}

      {panel === 'highway' && (
        <BottomSheet title="도로 정보" subtitle="내 위치에서 가까운 고속도로·국도 순" onClose={() => setPanel(null)}>
          {highwayRows.map((road) => (
            <button
              key={road.id}
              onClick={() => {
                selectRoad(road.id)
                setPanel(null)
                setActiveTab('home')
              }}
              className="w-full rounded-2xl border border-gray-100 p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-10 rounded-full" style={{ backgroundColor: road.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-black text-gray-900 truncate">{road.name}</div>
                    <span className={`text-[11px] px-2 py-1 rounded-full font-bold ${getRoadClassLabel(road.id) === '국도' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                      {getRoadClassLabel(road.id)}
                    </span>
                    <span className={`text-[11px] px-2 py-1 rounded-full font-bold ${road.congestionLabel === '원활' ? 'bg-emerald-50 text-emerald-600' : road.congestionLabel === '서행' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                      {road.congestionLabel}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 truncate">{road.summary}</div>
                  <div className="text-xs text-gray-500 mt-2">평균 {road.avgSpeed}km/h {road.distanceKm != null ? `· 내 위치에서 ${road.distanceKm}km` : ''}</div>
                </div>
              </div>
            </button>
          ))}
        </BottomSheet>
      )}

      {panel === 'settings' && (
        <BottomSheet title="설정" subtitle="음성·지도·안전 설정" onClose={() => setPanel(null)}>
          <ToggleRow label="음성 안내" desc="100m 후 우회전 같은 음성 안내" value={settings.voiceGuidance} onChange={(value) => updateSetting('voiceGuidance', value)} />
          <ToggleRow label="내비 시점 확대" desc="안내 시작 시 운전자 시점으로 확대" value={settings.navigationLookAhead} onChange={(value) => updateSetting('navigationLookAhead', value)} />
          <ToggleRow label="내비 최소 지도" desc="경로 외 지도 색조를 줄여 시인성 강화" value={settings.navigationMinimalMap} onChange={(value) => updateSetting('navigationMinimalMap', value)} />
          <ToggleRow label="안전 운전 모드" desc="목적지 없이 위험요소 안내" value={settings.safetyModeEnabled} onChange={(value) => updateSetting('safetyModeEnabled', value)} />
          <ToggleRow
            label="주유 할인 반영"
            desc={`${settings.fuelBenefitBrand ?? 'SK에너지'} ${settings.fuelBenefitPercent ?? 5}% 적용가로 최저가 순위 조정`}
            value={settings.fuelBenefitEnabled}
            onChange={(value) => updateSetting('fuelBenefitEnabled', value)}
          />

          <div className="rounded-2xl border border-gray-100 p-4">
            <div className="text-sm font-black text-gray-900">지도 테마</div>
            <div className="text-xs text-gray-500 mt-1">자동, 항상 밝게, 항상 어둡게 중 선택</div>
            <div className="flex gap-2 mt-3">
              {[
                { id: 'auto', label: '자동' },
                { id: 'light', label: '밝게' },
                { id: 'dark', label: '어둡게' },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => updateSetting('mapTheme', option.id)}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-bold ${settings.mapTheme === option.id ? 'bg-tmap-blue text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 p-4">
            <div className="text-sm font-black text-gray-900">주유 할인 기준</div>
            <div className="text-xs text-gray-500 mt-1">표시 유가는 그대로 두고, 추천 순서만 내 할인 적용가 기준으로 계산합니다.</div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-3 py-2">
              <span className="text-sm font-black text-blue-700">{settings.fuelBenefitBrand ?? 'SK에너지'}</span>
              <span className="text-xs font-bold text-blue-500">{settings.fuelBenefitPercent ?? 5}% 할인</span>
            </div>
          </div>
        </BottomSheet>
      )}

      {panel === 'emergency' && (
        <BottomSheet title="긴급 신고" subtitle="필요한 곳으로 바로 연결" onClose={() => setPanel(null)}>
          <button onClick={() => openExternal('tel:112')} className="w-full py-4 rounded-2xl bg-blue-600 text-white text-base font-black">
            112 경찰 신고
          </button>
          <button onClick={() => openExternal('tel:119')} className="w-full py-4 rounded-2xl bg-red-600 text-white text-base font-black">
            119 소방·응급 신고
          </button>
        </BottomSheet>
      )}

      {toast && (
        <div className="absolute bottom-24 left-4 right-4 z-50">
          <div className="bg-gray-800 text-white text-sm rounded-2xl px-4 py-3 text-center shadow-xl">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

function BottomSheet({ title, subtitle, children, onClose }) {
  return (
    <>
      <div className="absolute inset-0 bg-black/35 z-40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl slide-up">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="text-base font-black text-gray-900">{title}</div>
          <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
        </div>
        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto no-scrollbar space-y-3">
          {children}
        </div>
        <div className="px-5 pb-6 pt-2 safe-bottom">
          <button onClick={onClose} className="w-full py-3 bg-gray-100 rounded-2xl text-sm font-semibold text-gray-700">
            닫기
          </button>
        </div>
      </div>
    </>
  )
}

function ToggleRow({ label, desc, value, onChange }) {
  return (
    <div className="rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-black text-gray-900">{label}</div>
        <div className="text-xs text-gray-500 mt-1">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-12 h-7 rounded-full transition-all ${value ? 'bg-tmap-blue' : 'bg-gray-200'}`}
      >
        <div className={`w-5 h-5 bg-white rounded-full shadow transition-all ${value ? 'translate-x-6 ml-0.5' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-6 text-center text-sm text-gray-500">
      {text}
    </div>
  )
}
