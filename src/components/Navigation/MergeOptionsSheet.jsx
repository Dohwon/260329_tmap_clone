import React from 'react'
import useAppStore from '../../store/appStore'

const ROAD_TYPE_STYLE = {
  highway: { icon: '🛣️', label: '고속도로', color: '#0064FF', bg: '#E8F0FF' },
  national: { icon: '🛤️', label: '국도', color: '#00A84F', bg: '#E8F5EE' },
  local: { icon: '🏘️', label: '일반도로', color: '#8E8E93', bg: '#F2F2F7' },
}

export default function MergeOptionsSheet({ onClose }) {
  const { mergeOptions, applyMergeOption, routes, selectedRouteId } = useAppStore()
  const currentRoute = routes.find(r => r.id === selectedRouteId)
  // 현재 탑승 중인 도로 레이블
  const currentRoadLabel = currentRoute
    ? (currentRoute.highwayRatio >= 60 ? '고속도로' : currentRoute.highwayRatio >= 30 ? '고속+국도' : '국도')
    : '현재 경로'

  return (
    <>
      <div className="absolute inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white bottom-sheet slide-up">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-5 pb-3 border-b border-gray-100">
          <div className="text-base font-bold text-gray-900">🔀 분기점별 합류 옵션</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400">현재 경로:</span>
            <span className="text-xs font-bold text-tmap-blue bg-blue-50 px-2 py-0.5 rounded-full">
              {currentRoute?.title ?? currentRoadLabel}
            </span>
            <span className="text-xs text-gray-400">({currentRoadLabel})</span>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[65vh] overflow-y-auto no-scrollbar">
          {mergeOptions.map((opt) => {
            const roadStyle = ROAD_TYPE_STYLE[opt.afterRoadType] ?? ROAD_TYPE_STYLE.local
            return (
              <div
                key={opt.id}
                className={`rounded-2xl overflow-hidden border-2 transition-all ${
                  opt.isSelected ? 'border-tmap-blue shadow-lg shadow-blue-100' : 'border-gray-100'
                }`}
              >
                {/* 상단: IC 이름 + 거리 */}
                <div className={`flex items-center justify-between px-4 py-3 ${opt.isSelected ? 'bg-tmap-blue' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base flex-shrink-0">🔀</span>
                    <div className="min-w-0">
                      <div className={`text-sm font-bold ${opt.isSelected ? 'text-white' : 'text-gray-900'}`}>
                        {opt.name}
                      </div>
                      {!opt.isCurrent && (
                        <div className={`text-xs mt-0.5 ${opt.isSelected ? 'text-white/70' : 'text-gray-400'}`}>
                          현재 {currentRoadLabel} → {opt.afterRoadType === 'highway' ? '고속도로' : '국도'}로 전환
                        </div>
                      )}
                    </div>
                    {opt.isSelected && (
                      <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full flex-shrink-0">
                        {opt.isCurrent ? '현재 경로' : '선택됨'}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-medium flex-shrink-0 ml-2 ${opt.isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                    {Number(opt.distanceFromCurrent).toFixed(1)}km 앞
                  </span>
                </div>

                <div className="px-4 py-3 bg-white space-y-3">
                  {/* 진입 후 도로 정보 — 핵심 */}
                  <div
                    className="rounded-xl px-3 py-2.5"
                    style={{ background: roadStyle.bg }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{roadStyle.icon}</span>
                      <span className="text-xs font-bold" style={{ color: roadStyle.color }}>
                        {roadStyle.label} 진입
                      </span>
                      <span className="text-xs font-bold text-gray-700 ml-1">{opt.afterRoadName}</span>
                    </div>
                    <div className="text-xs text-gray-600 leading-relaxed">{opt.afterDescription}</div>
                    <div className="text-xs mt-1.5 font-medium" style={{ color: roadStyle.color }}>
                      → {opt.afterNextJunction}
                    </div>
                  </div>

                  {/* 핵심 지표 — 절약시간·유지거리·난이도 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {opt.timeSaving > 0 ? (
                      <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        {opt.timeSaving}분 절약
                      </span>
                    ) : opt.addedTime > 0 ? (
                      <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                        +{opt.addedTime}분
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">기준</span>
                    )}
                    {opt.maintainKm != null && (
                      <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
                        {Number(opt.maintainKm).toFixed(1)}km 유지
                      </span>
                    )}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      opt.difficulty === '하' ? 'bg-green-50 text-green-700'
                      : opt.difficulty === '중' ? 'bg-orange-50 text-orange-600'
                      : 'bg-red-50 text-red-600'
                    }`}>
                      난이도 {opt.difficulty ?? '중'}
                    </span>
                  </div>

                  {/* 수치 비교 */}
                  <div className="grid grid-cols-4 gap-2">
                    <MiniStat
                      label="평균속도"
                      value={opt.avgSpeedAfter != null
                        ? (opt.avgSpeedAfter > (opt.avgSpeedBefore ?? opt.avgSpeedAfter)
                          ? `+${opt.avgSpeedAfter - (opt.avgSpeedBefore ?? opt.avgSpeedAfter)}`
                          : `${opt.avgSpeedAfter}`)
                        : '--'}
                      unit="km/h"
                      color={opt.avgSpeedAfter > (opt.avgSpeedBefore ?? opt.avgSpeedAfter) ? '#00A84F' : '#3A3A3C'}
                    />
                    <MiniStat
                      label="교통상황"
                      value={opt.congestionPreview}
                      color={opt.congestionPreview === '원활' ? '#00A84F' : opt.congestionPreview === '서행' ? '#FF9500' : '#FF3B30'}
                    />
                    <MiniStat
                      label="카메라"
                      value={`${(opt.fixedCameraCount ?? 0) + (opt.sectionCameraCount ?? 0)}개`}
                      color={(opt.fixedCameraCount ?? 0) + (opt.sectionCameraCount ?? 0) > 0 ? '#FF3B30' : '#00A84F'}
                    />
                    <MiniStat
                      label="제한속도"
                      value={`${opt.dominantSpeedLimit}`}
                      unit="km/h"
                      color="#3A3A3C"
                    />
                  </div>

                  <button
                    onClick={async () => {
                      await applyMergeOption(opt.id)
                      onClose()
                    }}
                    className={`w-full rounded-xl py-2.5 text-sm font-bold transition-all ${
                      opt.isSelected
                        ? 'bg-tmap-blue text-white'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {opt.isSelected ? '선택 중' : '이 경로로 보기'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-5 pb-6 pt-2 safe-bottom">
          <button onClick={onClose} className="w-full py-4 bg-tmap-blue rounded-2xl text-sm font-bold text-white">
            확인
          </button>
        </div>
      </div>
    </>
  )
}

function MiniStat({ label, value, unit, color }) {
  return (
    <div className="bg-gray-50 rounded-xl p-2 text-center">
      <div className="text-xs font-bold" style={{ color }}>{value}</div>
      {unit && <div className="text-xs text-gray-400">{unit}</div>}
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}
