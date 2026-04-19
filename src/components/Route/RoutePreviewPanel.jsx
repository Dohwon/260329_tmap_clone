import React, { useState } from 'react'
import useAppStore from '../../store/appStore'
import PresetSelector from './PresetSelector'
import RouteFilterBar from './RouteFilterBar'
import RouteCard, { formatEta } from './RouteCard'
import MergeOptionsSheet from '../Navigation/MergeOptionsSheet'
import WaypointSheet from './WaypointSheet'
import { isUsableLiveRoute } from '../../utils/navigationLogic'

export default function RoutePreviewPanel() {
  const {
    routes,
    selectedRouteId,
    setSelectedRouteId,
    destination,
    showRoutePanel,
    setShowRoutePanel,
    routePanelMode,
    setRoutePanelMode,
    startNavigation,
    isLoadingRoutes,
    tmapStatus,
    enrichmentStatus,
    mergeOptions,
    waypoints,
    isDriveSimulation,
    startDriveSimulation,
    stopDriveSimulation,
  } = useAppStore()
  const [showMergeSheet, setShowMergeSheet] = useState(false)
  const [showWaypointSheet, setShowWaypointSheet] = useState(false)
  const showSimControls = import.meta.env.VITE_SHOW_SIM_CONTROLS === 'true'

  if (!showRoutePanel) return null

  const selectedRoute = routes.find(r => r.id === selectedRouteId)
  const baselineRoute = routes.find((route) => route.isBaseline) ?? routes[0]
  const mergePreview = mergeOptions[0]
  const canStartNavigation = isUsableLiveRoute(selectedRoute)
  const startNavigationWithSimulation = async (speedKmh) => {
    const started = await startNavigation()
    if (started) startDriveSimulation(speedKmh)
  }

  // 단거리 판단 (30km 미만 또는 35분 미만)
  const isShortDistance = selectedRoute
    ? (selectedRoute.distance < 30 || selectedRoute.eta < 35)
    : false
  // 경로 간 최대 시간 차이
  const maxTimeDiff = routes.length > 1
    ? Math.max(...routes.map(r => r.eta)) - Math.min(...routes.map(r => r.eta))
    : 0

  let compareLabel = null
  if (selectedRoute && baselineRoute) {
    const delta = selectedRoute.eta - baselineRoute.eta
    compareLabel = delta === 0
      ? 'TMAP 기준 경로'
      : delta < 0
        ? `TMAP 대비 ${Math.abs(delta)}분 빠름`
        : `TMAP 대비 ${Math.abs(delta)}분 느림`
  }

  const enrichmentEntries = [
    { key: 'nearby', label: '근처 찾기', status: enrichmentStatus?.nearby },
    { key: 'restaurants', label: '맛집/평점', status: enrichmentStatus?.restaurants },
    { key: 'safety', label: '안전/카메라', status: enrichmentStatus?.safety },
  ]
  const enrichmentErrors = enrichmentEntries.filter((entry) => entry.status?.state === 'error')
  const enrichmentLoading = enrichmentEntries.filter((entry) => entry.status?.state === 'loading')
  const enrichmentReady = enrichmentEntries.filter((entry) => entry.status?.state === 'ready')
  const enrichmentSummary = enrichmentLoading.length > 0
    ? `부가정보 로딩 중: ${enrichmentLoading.map((entry) => entry.label).join(', ')}`
    : enrichmentErrors.length > 0
      ? `일부 제한: ${enrichmentErrors.map((entry) => entry.label).join(', ')}`
      : enrichmentReady.length > 0
        ? `정상: ${enrichmentReady.map((entry) => entry.label).join(', ')}`
        : '아직 불러온 부가정보 없음'
  const enrichmentDetail = enrichmentErrors.length > 0
    ? enrichmentErrors[0].status?.lastError ?? '부가정보를 불러오지 못했습니다.'
    : '부가정보 오류가 있어도 길찾기 코어는 유지됩니다.'

  if (routePanelMode === 'peek' && selectedRoute) {
    return (
      <div className="absolute bottom-20 left-4 right-4 z-30">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          {/* 드래그 핸들 */}
          <div className="flex justify-center pt-2">
            <div className="w-8 h-1 bg-gray-200 rounded-full"/>
          </div>
          <div className="px-4 pb-4 pt-2">
            {/* 경로 정보 */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-gray-900">{selectedRoute.title}</span>
                  {selectedRoute.tag && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      selectedRoute.source === 'live' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {selectedRoute.source === 'live' ? 'TMAP 실시간' : '시뮬레이션'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-bold text-gray-900 text-base">{formatEta(selectedRoute.eta)}</span>
                  <span>·</span>
                  <span>{Number(selectedRoute.distance).toFixed(2)}km</span>
                  <span>·</span>
                  <span>{selectedRoute.congestionLabel}</span>
                  {selectedRoute.tollFee > 0 && (
                    <>
                      <span>·</span>
                      <span>{selectedRoute.tollFee.toLocaleString()}원</span>
                    </>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{selectedRoute.explanation}</div>
              </div>
            </div>
            {/* 버튼 영역 */}
            <div className="flex gap-2">
              <button
                onClick={() => setRoutePanelMode('full')}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-sm font-semibold text-gray-700 active:scale-95 transition-all"
              >
                경로 목록
              </button>
              <button
                onClick={startNavigation}
                disabled={!canStartNavigation}
                className={`flex-[2] py-3 rounded-2xl text-sm font-bold shadow-lg transition-all ${
                  canStartNavigation
                    ? 'bg-tmap-blue text-white shadow-blue-200 active:scale-95'
                    : 'bg-gray-200 text-gray-500 shadow-none cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd"/>
                  </svg>
                  안내 시작
                </div>
              </button>
            </div>
            {showSimControls && (
              <div className="mt-2 flex justify-end">
                {isDriveSimulation ? (
                  <button
                    onClick={stopDriveSimulation}
                    className="px-3 py-2 rounded-2xl bg-red-500 text-white text-xs font-bold shadow-lg active:bg-red-600"
                  >
                    시뮬 정지
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => startNavigationWithSimulation(60)}
                      disabled={!canStartNavigation}
                      className={`px-3 py-2 rounded-2xl text-xs font-bold shadow-lg ${
                        canStartNavigation
                          ? 'bg-gray-800 text-white active:bg-gray-700'
                          : 'bg-gray-200 text-gray-500 shadow-none cursor-not-allowed'
                      }`}
                    >
                      시뮬 60
                    </button>
                    <button
                      onClick={() => startNavigationWithSimulation(100)}
                      disabled={!canStartNavigation}
                      className={`px-3 py-2 rounded-2xl text-xs font-bold shadow-lg ${
                        canStartNavigation
                          ? 'bg-gray-800 text-white active:bg-gray-700'
                          : 'bg-gray-200 text-gray-500 shadow-none cursor-not-allowed'
                      }`}
                    >
                      시뮬 100
                    </button>
                    <button
                      onClick={() => startNavigationWithSimulation(200)}
                      disabled={!canStartNavigation}
                      className={`px-3 py-2 rounded-2xl text-xs font-bold shadow-lg ${
                        canStartNavigation
                          ? 'bg-gray-800 text-white active:bg-gray-700'
                          : 'bg-gray-200 text-gray-500 shadow-none cursor-not-allowed'
                      }`}
                    >
                      시뮬 200
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="absolute inset-0 bg-black/20 z-20" onClick={() => setShowRoutePanel(false)} />

      <div className="absolute bottom-0 left-0 right-0 z-30 bg-white bottom-sheet slide-up max-h-[85vh] flex flex-col">
        {/* 드래그 핸들 */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* 목적지 헤더 */}
        <div className="px-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-0.5">목적지</div>
              <div className="text-lg font-bold text-gray-900">{destination?.name}</div>
              <div className="text-xs text-gray-400">{destination?.address}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRoutePanelMode('peek')}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7-7-7 7" />
                </svg>
              </button>
              <button
                onClick={() => setShowRoutePanel(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
          <div className={`rounded-2xl px-4 py-3 border ${
            tmapStatus.mode === 'live'
              ? 'bg-blue-50 border-blue-100'
              : 'bg-amber-50 border-amber-100'
          }`}>
            <div className="text-sm font-bold text-gray-900">
              {tmapStatus.mode === 'live' ? '✅ TMAP 실시간 경로 적용 중' : '⚠️ TMAP 실시간 경로 미적용'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {tmapStatus.mode === 'live'
                ? '실시간 교통 흐름과 경로 응답을 기준으로 비교 중입니다.'
                : tmapStatus.lastError
                  ? `오류: ${tmapStatus.lastError}`
                  : tmapStatus.hasApiKey
                    ? 'API 키 설정됨. 경로 호출 실패 — 진단: /api/meta/tmap-diag 확인'
                    : 'API 키 미설정 — Railway 환경변수 TMAP_API_KEY를 추가하세요.'}
            </div>
            {tmapStatus.mode !== 'live' && tmapStatus.hasApiKey && (
              <button
                onClick={() => fetch('/api/meta/tmap-diag').then(r => r.json()).then(d => alert(JSON.stringify(d, null, 2)))}
                className="mt-2 text-xs text-tmap-blue underline"
              >
                진단 실행 (탭하면 오류 원인 표시)
              </button>
            )}
            {compareLabel && <div className="text-xs text-tmap-blue font-semibold mt-2">{compareLabel}</div>}
          </div>

          <div className={`rounded-2xl px-4 py-3 border ${
            enrichmentErrors.length > 0
              ? 'bg-orange-50 border-orange-100'
              : enrichmentLoading.length > 0
                ? 'bg-slate-50 border-slate-200'
                : 'bg-emerald-50 border-emerald-100'
          }`}>
            <div className="text-sm font-bold text-gray-900">
              {enrichmentErrors.length > 0 ? '⚠️ 부가정보 일부 제한' : enrichmentLoading.length > 0 ? '⏳ 부가정보 로딩 중' : '✅ 부가정보 분리 로드 중'}
            </div>
            <div className="text-xs text-gray-500 mt-1">{enrichmentSummary}</div>
            <div className="text-xs text-gray-400 mt-1">{enrichmentDetail}</div>
          </div>

          {/* 프리셋 */}
          <PresetSelector />

          {/* 필터 */}
          <RouteFilterBar />

          {/* 단거리 성향차이 없음 배너 */}
          {isShortDistance && (
            <div className="rounded-xl px-4 py-3 bg-gray-50 border border-gray-200 flex items-center gap-2">
              <span className="text-base">📍</span>
              <div>
                <div className="text-xs font-bold text-gray-700">단거리 구간 · 경로 차이 미미</div>
                <div className="text-xs text-gray-400">
                  {selectedRoute?.distance != null ? Number(selectedRoute.distance).toFixed(2) : '--'}km 이내 · 성향별 차이 없음 · 추천 경로를 이용하세요
                </div>
              </div>
            </div>
          )}

          {/* 경로 간 시간차 5분 미만이면 안내 */}
          {!isShortDistance && maxTimeDiff < 5 && routes.length > 1 && (
            <div className="rounded-xl px-4 py-3 bg-amber-50 border border-amber-100 flex items-center gap-2">
              <span className="text-base">⚖️</span>
              <div className="text-xs text-amber-700">
                경로 간 시간 차이 <strong>{maxTimeDiff}분</strong> — 교통 상황에 따라 비슷한 수준입니다
              </div>
            </div>
          )}

          {/* 경유지 추가 */}
          <button
            onClick={() => setShowWaypointSheet(true)}
            className="w-full flex items-center justify-between bg-purple-50 rounded-xl px-4 py-3 border border-purple-200"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">📍</span>
              <div className="text-left">
                <div className="text-sm font-semibold text-purple-700">
                  경유지 추가 {waypoints.length > 0 ? `(${waypoints.length}개)` : ''}
                </div>
                <div className="text-xs text-purple-400">
                  {waypoints.length > 0 ? waypoints.map(w => w.name).join(' → ') : '목적지 전에 들를 장소'}
                </div>
              </div>
            </div>
            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* 다음 분기점 합류 옵션 버튼 */}
          <button
            onClick={() => setShowMergeSheet(true)}
            className="w-full flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3 border border-tmap-blue/20"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🔀</span>
              <div className="text-left">
                <div className="text-sm font-semibold text-tmap-blue">다음 분기점 합류 옵션 보기</div>
                <div className="text-xs text-blue-400">
                  {mergePreview ? `${mergePreview.name}까지 ${Number(mergePreview.distanceFromCurrent).toFixed(1)}km` : '합류 옵션 계산 중'}
                </div>
              </div>
            </div>
            <svg className="w-4 h-4 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {showSimControls && (
            <div className="rounded-2xl px-4 py-3 border border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-gray-900">개발용 주행 시뮬레이터</div>
                <div className="text-xs text-gray-500 mt-0.5">안내 시작과 함께 가상 GPS를 경로 위로 이동시킵니다.</div>
              </div>
              {isDriveSimulation ? (
                <button
                  onClick={stopDriveSimulation}
                  className="px-3 py-2 rounded-2xl bg-red-500 text-white text-xs font-bold shadow-lg active:bg-red-600 flex-shrink-0"
                >
                  정지
                </button>
              ) : (
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => startNavigationWithSimulation(60)}
                    disabled={!canStartNavigation}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold shadow-lg ${
                      canStartNavigation
                        ? 'bg-gray-800 text-white active:bg-gray-700'
                        : 'bg-gray-200 text-gray-500 shadow-none cursor-not-allowed'
                    }`}
                  >
                    60
                  </button>
                  <button
                    onClick={() => startNavigationWithSimulation(100)}
                    disabled={!canStartNavigation}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold shadow-lg ${
                      canStartNavigation
                        ? 'bg-gray-800 text-white active:bg-gray-700'
                        : 'bg-gray-200 text-gray-500 shadow-none cursor-not-allowed'
                    }`}
                  >
                    100
                  </button>
                  <button
                    onClick={() => startNavigationWithSimulation(200)}
                    disabled={!canStartNavigation}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold shadow-lg ${
                      canStartNavigation
                        ? 'bg-gray-800 text-white active:bg-gray-700'
                        : 'bg-gray-200 text-gray-500 shadow-none cursor-not-allowed'
                    }`}
                  >
                    200
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 경로 카드 리스트 */}
          {isLoadingRoutes ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="w-8 h-8 border-3 border-tmap-blue border-t-transparent rounded-full animate-spin"/>
              <div className="text-sm text-gray-400">경로 탐색 중...</div>
            </div>
          ) : routes.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5">
              <div className="text-sm font-bold text-amber-800">실제 TMAP 경로를 받아오지 못했습니다</div>
              <div className="text-xs text-amber-700 mt-1">
                현재는 예상 직선 경로를 보여주지 않습니다. API 키, 프록시 응답, 현재 위치 오차를 먼저 확인하세요.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {routes.map(route => (
                <RouteCard
                  key={route.id}
                  route={route}
                  isSelected={route.id === selectedRouteId}
                  onClick={() => setSelectedRouteId(route.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="px-5 pb-6 pt-3 border-t border-gray-100 flex-shrink-0 safe-bottom">
          <div className="flex gap-3">
            <button
              onClick={() => setShowRoutePanel(false)}
              className="flex-1 py-4 bg-gray-100 rounded-2xl text-sm font-semibold text-gray-700 active:scale-95 transition-all"
            >
              취소
            </button>
            <button
              onClick={startNavigation}
              disabled={!canStartNavigation}
              className={`flex-[2] py-4 rounded-2xl text-sm font-bold transition-all ${
                canStartNavigation
                  ? 'bg-tmap-blue text-white active:scale-95 shadow-lg shadow-blue-200'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd"/>
                </svg>
                안내 시작
              </div>
            </button>
          </div>
          {showSimControls && (
            <div className="mt-3 flex justify-end">
              {isDriveSimulation ? (
                <button
                  onClick={stopDriveSimulation}
                  className="px-3 py-2 rounded-2xl bg-red-500 text-white text-xs font-bold shadow-lg active:bg-red-600"
                >
                  시뮬 정지
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => startNavigationWithSimulation(60)}
                    disabled={!canStartNavigation}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold shadow-lg ${
                      canStartNavigation
                        ? 'bg-gray-800 text-white active:bg-gray-700'
                        : 'bg-gray-200 text-gray-500 shadow-none cursor-not-allowed'
                    }`}
                  >
                    시뮬 60
                  </button>
                  <button
                    onClick={() => startNavigationWithSimulation(100)}
                    disabled={!canStartNavigation}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold shadow-lg ${
                      canStartNavigation
                        ? 'bg-gray-800 text-white active:bg-gray-700'
                        : 'bg-gray-200 text-gray-500 shadow-none cursor-not-allowed'
                    }`}
                  >
                    시뮬 100
                  </button>
                  <button
                    onClick={() => startNavigationWithSimulation(200)}
                    disabled={!canStartNavigation}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold shadow-lg ${
                      canStartNavigation
                        ? 'bg-gray-800 text-white active:bg-gray-700'
                        : 'bg-gray-200 text-gray-500 shadow-none cursor-not-allowed'
                    }`}
                  >
                    시뮬 200
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showMergeSheet && <MergeOptionsSheet onClose={() => setShowMergeSheet(false)} />}
      {showWaypointSheet && <WaypointSheet onClose={() => setShowWaypointSheet(false)} />}
    </>
  )
}
