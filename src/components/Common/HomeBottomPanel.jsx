import React, { useState } from 'react'
import useAppStore from '../../store/appStore'
import SearchSheet from '../Search/SearchSheet'
import { MOCK_FAVORITES } from '../../data/mockData'

export default function HomeBottomPanel() {
  const [showSearch, setShowSearch] = useState(false)
  const { isNavigating, showRoutePanel } = useAppStore()

  if (isNavigating || showRoutePanel) return null

  return (
    <>
      <div className="absolute bottom-16 left-0 right-0 z-10">
        <div className="bg-white bottom-sheet mx-0 pt-3 pb-2 safe-bottom">
          {/* 드래그 핸들 */}
          <div className="flex justify-center mb-2">
            <div className="w-10 h-1 bg-gray-300 rounded-full"/>
          </div>

          {/* 즐겨찾기 바로가기 */}
          <div className="flex gap-2 px-4 mb-3">
            {MOCK_FAVORITES.map(fav => (
              <QuickChip key={fav.id} icon={fav.icon} label={fav.name} />
            ))}
            <QuickChip icon="⭐" label="최근" />
            <QuickChip icon="⛽" label="주유소" />
            <QuickChip icon="🅿️" label="주차장" />
          </div>

          {/* 검색 버튼 */}
          <button
            onClick={() => setShowSearch(true)}
            className="mx-4 w-[calc(100%-2rem)] flex items-center bg-gray-100 rounded-2xl px-4 py-3.5 active:bg-gray-200 transition-all"
          >
            <div className="w-8 h-8 bg-tmap-blue rounded-lg flex items-center justify-center mr-3 flex-shrink-0">
              <span className="text-white font-black text-base leading-none">T</span>
            </div>
            <span className="text-gray-400 text-sm flex-1 text-left">어디로 갈까요?</span>
            <svg className="w-5 h-5 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
            </svg>
          </button>

          {/* 교통 상황 - 시간대 기반 */}
          <TrafficBanner />
        </div>
      </div>

      {showSearch && <SearchSheet onClose={() => setShowSearch(false)} />}
    </>
  )
}

function QuickChip({ icon, label }) {
  return (
    <button className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1.5 active:bg-gray-200 flex-shrink-0">
      <span className="text-sm">{icon}</span>
      <span className="text-xs font-medium text-gray-700">{label}</span>
    </button>
  )
}

function TrafficBanner() {
  const hour = new Date().getHours()
  const day = new Date().getDay()
  const isWeekend = day === 0 || day === 6
  const isMorningRush = !isWeekend && hour >= 7 && hour <= 9
  const isEveningRush = !isWeekend && hour >= 17 && hour <= 20
  const isLateNight = hour >= 23 || hour <= 5
  const isWeekendAft = isWeekend && hour >= 13 && hour <= 18

  let color, bg, dot, text
  if (isMorningRush) {
    color = 'text-orange-700'; bg = 'bg-orange-50'; dot = 'bg-orange-400'
    text = `출근 시간대 (${hour}시) · 수도권 도심 서행 예상`
  } else if (isEveningRush) {
    color = 'text-red-700'; bg = 'bg-red-50'; dot = 'bg-red-400'
    text = `퇴근 시간대 (${hour}시) · 주요 간선도로 정체 예상`
  } else if (isWeekendAft) {
    color = 'text-orange-700'; bg = 'bg-orange-50'; dot = 'bg-orange-400'
    text = `주말 오후 (${hour}시) · 귀경 차량 증가 예상`
  } else if (isLateNight) {
    color = 'text-blue-700'; bg = 'bg-blue-50'; dot = 'bg-blue-400'
    text = `심야 시간대 (${hour}시) · 전국 도로 원활`
  } else {
    color = 'text-green-700'; bg = 'bg-green-50'; dot = 'bg-tmap-green'
    text = `현재 (${hour}시) · 전반적으로 원활한 편`
  }

  return (
    <div className={`mx-4 mt-2 flex items-center gap-2 ${bg} rounded-xl px-3 py-2`}>
      <div className={`w-2 h-2 ${dot} rounded-full animate-pulse flex-shrink-0`}/>
      <span className={`text-xs ${color} font-medium flex-1`}>{text}</span>
    </div>
  )
}
