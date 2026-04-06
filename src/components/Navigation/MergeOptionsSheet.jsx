import React from 'react'
import useAppStore from '../../store/appStore'

const ROAD_TYPE_STYLE = {
  highway: { icon: '🛣️', label: '고속도로', color: '#0064FF', bg: '#E8F0FF' },
  national: { icon: '🛤️', label: '국도', color: '#00A84F', bg: '#E8F5EE' },
  local: { icon: '🏘️', label: '일반도로', color: '#8E8E93', bg: '#F2F2F7' },
}

export default function MergeOptionsSheet({ onClose }) {
  const { mergeOptions, selectMergeOption } = useAppStore()

  return (
    <>
      <div className="absolute inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white bottom-sheet slide-up">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-5 pb-3 border-b border-gray-100">
          <div className="text-base font-bold text-gray-900">🔀 다음 10km 합류 옵션</div>
          <div className="text-xs text-gray-400 mt-0.5">
            IC·JC에서 나가면 어떤 길을 만나게 되는지 확인하세요
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
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔀</span>
                    <span className={`text-sm font-bold ${opt.isSelected ? 'text-white' : 'text-gray-900'}`}>
                      {opt.name}
                    </span>
                    {opt.isSelected && (
                      <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">
                        {opt.isCurrent ? '현재 경로' : '선택됨'}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${opt.isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                    {opt.distanceFromCurrent}km 앞
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

                  {/* 수치 비교 */}
                  <div className="grid grid-cols-4 gap-2">
                    <MiniStat
                      label="추가시간"
                      value={opt.addedTime === 0 ? '기준' : `+${opt.addedTime}분`}
                      color={opt.addedTime > 0 ? '#FF9500' : '#00A84F'}
                    />
                    <MiniStat
                      label="교통상황"
                      value={opt.congestionPreview}
                      color={opt.congestionPreview === '원활' ? '#00A84F' : opt.congestionPreview === '서행' ? '#FF9500' : '#FF3B30'}
                    />
                    <MiniStat
                      label="카메라"
                      value={`${opt.fixedCameraCount + opt.sectionCameraCount}개`}
                      color={opt.fixedCameraCount + opt.sectionCameraCount > 0 ? '#FF3B30' : '#00A84F'}
                    />
                    <MiniStat
                      label="제한속도"
                      value={`${opt.dominantSpeedLimit}`}
                      unit="km/h"
                      color="#3A3A3C"
                    />
                  </div>

                  <button
                    onClick={() => selectMergeOption(opt.id)}
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
