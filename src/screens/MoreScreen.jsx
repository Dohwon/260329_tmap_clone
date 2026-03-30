import React, { useState } from 'react'
import useAppStore from '../store/appStore'

export default function MoreScreen() {
  const { searchRoute, setActiveTab, userLocation } = useAppStore()
  const [toast, setToast] = useState(null)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const searchNearby = (keyword) => {
    if (!userLocation) { showToast('위치 정보를 가져오는 중이에요'); return }
    searchRoute({ name: `근처 ${keyword}`, address: '현재 위치 기준', lat: userLocation.lat, lng: userLocation.lng })
    setActiveTab('home')
  }

  const openExternal = (url) => window.open(url, '_blank')

  const MENU_SECTIONS = [
    {
      title: '드라이브',
      items: [
        { icon: '📊', label: '드라이브 기록', desc: '최근 주행 이력 확인', action: () => showToast('드라이브 기록은 Phase 2에서 지원 예정이에요') },
        { icon: '🧠', label: '내 운전 습관', desc: '합류/감속 패턴 분석', action: () => showToast('운전 습관 분석은 Phase 2에서 지원 예정이에요') },
        { icon: '📷', label: '블랙박스 연결', desc: '영상 자동 저장', action: () => showToast('블랙박스 연결은 Phase 2에서 지원 예정이에요') },
      ]
    },
    {
      title: '근처 찾기',
      items: [
        { icon: '⛽', label: '주유/충전소', desc: '현재 위치 기준 탐색', action: () => searchNearby('주유소'), live: true },
        { icon: '🅿️', label: '주차장', desc: '현재 위치 기준 탐색', action: () => searchNearby('주차장'), live: true },
        { icon: '🏥', label: '병원', desc: '현재 위치 기준 탐색', action: () => searchNearby('병원'), live: true },
        { icon: '☕', label: '카페', desc: '현재 위치 기준 탐색', action: () => searchNearby('카페'), live: true },
        { icon: '🍽️', label: '음식점', desc: '현재 위치 기준 탐색', action: () => searchNearby('음식점'), live: true },
      ]
    },
    {
      title: '교통 정보',
      items: [
        { icon: '🚌', label: '실시간 버스', desc: '네이버 버스 연결', action: () => openExternal('https://m.map.naver.com/transit/') },
        { icon: '🚇', label: '지하철 노선도', desc: '카카오맵 지하철', action: () => openExternal('https://map.kakao.com/') },
        { icon: '🛣️', label: '고속도로 정보', desc: '한국도로공사', action: () => openExternal('https://www.ex.co.kr/') },
      ]
    },
    {
      title: '안전',
      items: [
        { icon: '📷', label: '과속카메라 정보', desc: '지도에서 레이어 켜기', action: () => { setActiveTab('home'); showToast('홈 지도에서 🗺️ 버튼을 눌러 레이어를 켤 수 있어요') } },
        { icon: '🛡️', label: '안전 운전 모드', desc: '준비 중', action: () => showToast('안전 운전 모드는 Phase 2에서 지원 예정이에요') },
        { icon: '🆘', label: '긴급 신고', desc: '112 / 119', action: () => openExternal('tel:112') },
      ]
    },
    {
      title: '설정',
      items: [
        { icon: '⚙️', label: '설정', desc: '알림·지도·음성 설정', action: () => showToast('설정은 Phase 2에서 지원 예정이에요') },
        { icon: '❓', label: '고객센터', desc: '도움말 및 문의', action: () => showToast('Phase 1 MVP입니다. 피드백은 개발자에게 전달해주세요') },
        { icon: 'ℹ️', label: '앱 정보', desc: 'v1.0.0 Phase 1 MVP', action: () => showToast('T맵 클론 v1.0.0 - Phase 1 MVP') },
      ]
    }
  ]

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white px-5 pt-14 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-black text-gray-900">더보기</h1>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
        {MENU_SECTIONS.map(section => (
          <div key={section.title} className="px-4 pt-5">
            <div className="text-xs font-semibold text-gray-400 mb-2 tracking-wide px-1">
              {section.title}
            </div>
            <div className="bg-white rounded-2xl overflow-hidden divide-y divide-gray-50">
              {section.items.map(item => (
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 토스트 메시지 */}
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
