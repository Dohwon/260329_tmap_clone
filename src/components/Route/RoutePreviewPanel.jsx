import React, { useState } from 'react'
import useAppStore from '../../store/appStore'
import PresetSelector from './PresetSelector'
import RouteFilterBar from './RouteFilterBar'
import RouteCard from './RouteCard'
import MergeOptionsSheet from '../Navigation/MergeOptionsSheet'

export default function RoutePreviewPanel() {
  const {
    routes,
    selectedRouteId,
    setSelectedRouteId,
    destination,
    showRoutePanel,
    setShowRoutePanel,
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

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
          <div className={`rounded-2xl px-4 py-3 border ${
            tmapStatus.mode === 'live'
              ? 'bg-blue-50 border-blue-100'
              : 'bg-amber-50 border-amber-100'
          }`}>
            <div className="text-sm font-bold text-gray-900">
              {tmapStatus.mode === 'live' ? 'TMAP 실시간 경로 적용 중' : 'TMAP 실시간 경로 미적용'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {tmapStatus.mode === 'live'
                ? '실시간 교통 흐름과 경로 응답을 기준으로 비교 중입니다.'
                : (tmapStatus.lastError || 'API 키, 권한, 허용 도메인 확인이 필요합니다.')}
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
