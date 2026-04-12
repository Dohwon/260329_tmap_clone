import React from 'react'
import useAppStore from '../../store/appStore'

export default function ScenicRoadDialog() {
  const { scenicRoadSuggestions, dismissScenicSuggestion, applyScenicRoute, destination, routes, selectedRouteId, isLoadingRoutes, scenicRouteError } = useAppStore()

  // 가장 첫 번째 제안만 표시 (순서대로 하나씩)
  const suggestion = scenicRoadSuggestions[0]
  if (!suggestion) return null

  const baseRoute = routes.find((r) => r.id === selectedRouteId)
  const baseEta = baseRoute?.eta ?? 0
  const totalEta = baseEta + suggestion.detourMinutes

  const typeLabel = suggestion.scenicType === 'coastal' ? '해안도로' : '산악도로'
  const bgClass = suggestion.scenicType === 'coastal'
    ? 'from-blue-500 to-cyan-400'
    : 'from-green-600 to-emerald-400'
  const recommendationLabel = suggestion.recommendationMode === 'nearby'
    ? '경로 10km 이내 추천'
    : suggestion.recommendationMode === 'reachable'
      ? '경로 30km 이내 우회 가능'
      : '30km 이내 없음 · 가장 가까운 경관도로'

  return (
    <>
      {/* 딤 */}
      <div className="absolute inset-0 bg-black/40 z-50" onClick={() => dismissScenicSuggestion(suggestion.id)} />

      {/* 시트 */}
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl slide-up safe-bottom">
        {/* 헤더 그라데이션 */}
        <div className={`bg-gradient-to-r ${bgClass} px-5 pt-5 pb-6 rounded-t-3xl`}>
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 bg-white/40 rounded-full" />
          </div>
          <div className="text-white/80 text-xs font-medium mb-1">{typeLabel} 경유 제안</div>
          <div className="text-white text-xl font-black leading-tight">
            {suggestion.emoji} {suggestion.name}
          </div>
          <div className="text-white/80 text-sm mt-1">{suggestion.roadLabel}</div>
          <div className="text-white/90 text-xs font-semibold mt-2">{recommendationLabel}</div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 설명 */}
          <p className="text-sm text-gray-600 leading-relaxed">{suggestion.description}</p>

          {/* 시간 비교 카드 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-2xl p-3 text-center">
              <div className="text-xs text-gray-400 mb-1">현재 경로</div>
              <div className="text-lg font-black text-gray-900">{formatMin(baseEta)}</div>
              <div className="text-xs text-gray-500">직행</div>
            </div>
            <div className={`rounded-2xl p-3 text-center ${suggestion.type === 'coastal' ? 'bg-blue-50' : 'bg-green-50'}`}>
              <div className="text-xs text-gray-400 mb-1">{typeLabel} 경유</div>
              <div className={`text-lg font-black ${suggestion.type === 'coastal' ? 'text-blue-700' : 'text-green-700'}`}>
                {formatMin(totalEta)}
              </div>
              <div className="text-xs text-orange-500 font-semibold">+{suggestion.detourMinutes}분 추가</div>
            </div>
          </div>

          {/* 경유지 목록 */}
          {suggestion.viaPoints.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {suggestion.viaPoints.map((pt) => (
                <span key={pt.name} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                  📍 {pt.name}
                </span>
              ))}
            </div>
          )}

          {/* 안내 문구 */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-700">
            {suggestion.noScenicWithin30Km
              ? `현재 경로 30km 이내에는 ${typeLabel}가 없습니다. 가장 가까운 ${typeLabel}는 경로에서 약 `
              : '경로에서 약 '}
            <strong>{suggestion.routeDistanceKm ?? suggestion.detourKm}km</strong> 떨어져 있고,
            우회 시 <strong>{suggestion.detourMinutes}분</strong> 더 걸립니다.
            {destination && ` 최종 목적지(${destination.name})까지 총 ${formatMin(totalEta)} 예상.`}
          </div>

          {/* 오류 메시지 */}
          {scenicRouteError && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600">
              ⚠️ {scenicRouteError}
            </div>
          )}

          {/* 버튼 */}
          <div className="flex gap-3 pb-2">
            <button
              onClick={() => dismissScenicSuggestion(suggestion.id)}
              className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-sm font-bold text-gray-700"
            >
              직행으로 가기
            </button>
            <button
              disabled={isLoadingRoutes}
              onClick={() => applyScenicRoute(suggestion)}
              className={`flex-1 py-3.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r ${bgClass} disabled:opacity-60`}
            >
              {isLoadingRoutes ? '경로 탐색 중…' : `${typeLabel} 경유`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function formatMin(minutes) {
  if (!minutes) return '--'
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`
}
