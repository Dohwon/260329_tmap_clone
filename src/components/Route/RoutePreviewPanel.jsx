import React, { useState } from 'react'
import useAppStore from '../../store/appStore'
import PresetSelector from './PresetSelector'
import RouteFilterBar from './RouteFilterBar'
import RouteCard, { formatEta } from './RouteCard'
import MergeOptionsSheet from '../Navigation/MergeOptionsSheet'

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
    mergeOptions,
  } = useAppStore()
  const [showMergeSheet, setShowMergeSheet] = useState(false)

  if (!showRoutePanel) return null

  const selectedRoute = routes.find(r => r.id === selectedRouteId)
  const baselineRoute = routes.find((route) => route.isBaseline) ?? routes[0]
  const mergePreview = mergeOptions[0]

  let compareLabel = null
  if (selectedRoute && baselineRoute) {
    const delta = selectedRoute.eta - baselineRoute.eta
    compareLabel = delta === 0
      ? 'TMAP 기준 경로'
      : delta < 0
        ? `TMAP 대비 ${Math.abs(delta)}분 빠름`
        : `TMAP 대비 ${Math.abs(delta)}분 느림`
  }

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
                  <span>{selectedRoute.distance}km</span>
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
                className="flex-[2] py-3 rounded-2xl bg-tmap-blue text-white text-sm font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all"
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd"/>
                  </svg>
                  안내 시작
                </div>
              </button>
            </div>
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
                    ? 'API 키가 있으나 경로 API 권한이 없거나 일일 한도가 초과되었습니다.'
                    : 'API 키 미설정 — .env.local에 VITE_TMAP_API_KEY를 추가하세요.'}
            </div>
            {compareLabel && <div className="text-xs text-tmap-blue font-semibold mt-2">{compareLabel}</div>}
          </div>

          {/* 프리셋 */}
          <PresetSelector />

          {/* 필터 */}
          <RouteFilterBar />

          {/* 다음 10km 합류 미리보기 버튼 */}
          <button
            onClick={() => setShowMergeSheet(true)}
            className="w-full flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3 border border-tmap-blue/20"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🔀</span>
              <div className="text-left">
                <div className="text-sm font-semibold text-tmap-blue">다음 10km 합류 옵션 보기</div>
                <div className="text-xs text-blue-400">
                  {mergePreview ? `${mergePreview.name}까지 ${mergePreview.distanceFromCurrent}km` : '합류 옵션 계산 중'}
                </div>
              </div>
            </div>
            <svg className="w-4 h-4 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* 경로 카드 리스트 */}
          {isLoadingRoutes ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="w-8 h-8 border-3 border-tmap-blue border-t-transparent rounded-full animate-spin"/>
              <div className="text-sm text-gray-400">경로 탐색 중...</div>
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
              className="flex-[2] py-4 bg-tmap-blue rounded-2xl text-sm font-bold text-white active:scale-95 transition-all shadow-lg shadow-blue-200"
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd"/>
                </svg>
                안내 시작
              </div>
            </button>
          </div>
        </div>
      </div>

      {showMergeSheet && <MergeOptionsSheet onClose={() => setShowMergeSheet(false)} />}
    </>
  )
}
