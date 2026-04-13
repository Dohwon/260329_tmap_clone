import React, { useState } from 'react'
import { HIGHWAYS } from '../../data/highwayData'
import useAppStore from '../../store/appStore'

export default function HighwayExplorer({ onClose }) {
  const [selected, setSelected] = useState(null)
  const { setMapCenter, searchRoute, searchRouteAlongRoad, selectRoad } = useAppStore()

  const handleSelect = (hw) => {
    setSelected(hw)
    selectRoad(hw.id)
    // 고속도로 전체가 보이는 중간 좌표로 지도 이동
    const midLat = (hw.startCoord[0] + hw.endCoord[0]) / 2
    const midLng = (hw.startCoord[1] + hw.endCoord[1]) / 2
    setMapCenter([midLat, midLng], 8)
  }

  const goStart = () => {
    if (!selected) return
    searchRoute({ name: selected.startName, address: selected.startAddress ?? selected.startName, lat: selected.startCoord[0], lng: selected.startCoord[1] })
    onClose()
  }

  const goEnd = () => {
    if (!selected) return
    searchRoute({ name: selected.endName, address: selected.endAddress ?? selected.endName, lat: selected.endCoord[0], lng: selected.endCoord[1] })
    onClose()
  }

  const goWholeRoad = async (viaPoint = null) => {
    if (!selected) return
    await searchRouteAlongRoad({ road: selected, viaPoint })
    onClose()
  }

  return (
    <>
      <div className="absolute inset-0 bg-black/30 z-40" onClick={onClose}/>
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white bottom-sheet slide-up max-h-[88vh] flex flex-col">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full"/>
        </div>

        {/* 헤더 */}
        <div className="px-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-bold text-gray-900">🛣️ 고속도로 탐색</div>
              <div className="text-xs text-gray-400 mt-0.5">고속도로와 국도를 선택하면 시작~끝, 단속, 속도 흐름을 지도에서 확인해요</div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* 고속도로 리스트 */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="px-4 py-3 space-y-2">
            {HIGHWAYS.map(hw => (
              <button
                key={hw.id}
                onClick={() => handleSelect(hw)}
                className={`w-full rounded-2xl p-4 text-left transition-all active:scale-[0.98] border-2 ${
                  selected?.id === hw.id
                    ? 'border-opacity-100 bg-opacity-5'
                    : 'border-gray-100 bg-gray-50'
                }`}
                style={selected?.id === hw.id ? { borderColor: hw.color, backgroundColor: hw.color + '08' } : {}}
              >
                <div className="flex items-center gap-3">
                  {/* 노선 번호 배지 */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-black text-sm"
                    style={{ backgroundColor: hw.color }}
                  >
                    {hw.number}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{hw.name}</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
                        hw.roadClass === 'national'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-blue-50 text-blue-600'
                      }`}>
                        {hw.roadClass === 'national' ? '국도' : '고속'}
                      </span>
                      <span className="text-xs text-gray-400">{hw.totalKm}km</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {hw.startName} → {hw.endName}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {hw.startAddress ?? hw.startName} → {hw.endAddress ?? hw.endName}
                    </div>
                  </div>

                  {selected?.id === hw.id && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: hw.color }}>
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                  )}
                </div>

                {/* 선택된 경우 상세 정보 */}
                {selected?.id === hw.id && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-gray-500 bg-white rounded-xl px-3 py-2">
                      {hw.description}
                    </div>

                    {/* 주요 JC */}
                    <div className="bg-white rounded-xl px-3 py-2">
                      <div className="text-xs font-semibold text-gray-400 mb-2">주요 분기점</div>
                      <div className="flex flex-wrap gap-1.5">
                        {hw.majorJunctions.map(jc => (
                          <span key={jc.name} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                            {jc.name} ({jc.km}km)
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white rounded-xl px-3 py-2">
                        <div className="text-[11px] font-semibold text-gray-400">시점 주소</div>
                        <div className="text-xs text-gray-700 mt-1">{hw.startAddress ?? hw.startName}</div>
                      </div>
                      <div className="bg-white rounded-xl px-3 py-2">
                        <div className="text-[11px] font-semibold text-gray-400">종점 주소</div>
                        <div className="text-xs text-gray-700 mt-1">{hw.endAddress ?? hw.endName}</div>
                      </div>
                    </div>

                    {/* 시작/끝 길찾기 버튼 */}
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); goStart() }}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white"
                        style={{ backgroundColor: hw.color }}
                      >
                        📍 시점으로 길찾기
                        <div className="font-normal opacity-80 mt-0.5">{hw.startName}</div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); goEnd() }}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2"
                        style={{ borderColor: hw.color, color: hw.color }}
                      >
                        🏁 종점으로 길찾기
                        <div className="font-normal opacity-80 mt-0.5">{hw.endName}</div>
                      </button>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); goWholeRoad({ id: `${hw.id}-start`, name: hw.startName, address: hw.startAddress ?? hw.startName, lat: hw.startCoord[0], lng: hw.startCoord[1] }) }}
                      className="mt-2 w-full py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold"
                    >
                      🛣️ 시점 진입 후 {hw.endName}까지 계속 주행
                    </button>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
