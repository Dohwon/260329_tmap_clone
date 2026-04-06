import React from 'react'
import useAppStore from '../../store/appStore'

const TABS = [
  {
    key: 'home',
    label: '홈',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-tmap-blue' : 'text-gray-400'}`} fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
      </svg>
    )
  },
  {
    key: 'search',
    label: '검색',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-tmap-blue' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
    )
  },
  {
    key: 'favorites',
    label: '즐겨찾기',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-tmap-blue' : 'text-gray-400'}`} fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
      </svg>
    )
  },
  {
    key: 'more',
    label: '더보기',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-tmap-blue' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 24 24">
        <circle cx="5" cy="12" r="2" opacity={active ? 1 : 0.5}/>
        <circle cx="12" cy="12" r="2" opacity={active ? 1 : 0.5}/>
        <circle cx="19" cy="12" r="2" opacity={active ? 1 : 0.5}/>
      </svg>
    )
  }
]

export default function BottomTabBar() {
  const { activeTab, setActiveTab, openSearchHome, isNavigating } = useAppStore()

  if (isNavigating) return null

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 safe-bottom shadow-[0_-6px_18px_rgba(15,23,42,0.06)]">
      <div className="flex">
        {TABS.map(tab => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => (tab.key === 'search' ? openSearchHome() : setActiveTab(tab.key))}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 active:bg-gray-50 transition-all"
            >
              {tab.icon(active)}
              <span className={`text-[10px] font-semibold ${active ? 'text-tmap-blue' : 'text-gray-400'}`}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
