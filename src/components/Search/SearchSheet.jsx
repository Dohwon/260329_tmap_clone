import React, { useState, useEffect, useRef } from 'react'
import useAppStore from '../../store/appStore'
import { MOCK_RECENT_SEARCHES, MOCK_FAVORITES } from '../../data/mockData'
import { searchPOI } from '../../services/tmapService'

const HAS_API_KEY = true  // 프록시 서버 통해 항상 시도

const QUICK_CATEGORIES = [
  { icon: '⛽', label: '주유소' },
  { icon: '🅿️', label: '주차장' },
  { icon: '☕', label: '카페' },
  { icon: '🍽️', label: '음식점' },
  { icon: '🏥', label: '병원' },
  { icon: '🏪', label: '편의점' },
]

const POPULAR_DESTINATIONS = [
  { id: 10, name: '부산 해운대', address: '부산광역시 해운대구', lat: 35.1631, lng: 129.1635 },
  { id: 11, name: '경주 불국사', address: '경북 경주시 진현동', lat: 35.7898, lng: 129.3316 },
  { id: 12, name: '강릉 경포대', address: '강원 강릉시 경포로', lat: 37.7948, lng: 128.9000 },
  { id: 13, name: '전주 한옥마을', address: '전북 전주시 완산구', lat: 35.8175, lng: 127.1529 },
]

export default function SearchSheet({ onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const { searchRoute, userLocation } = useAppStore()
  const debounceRef = useRef(null)

  const handleSelect = (dest) => {
    searchRoute(dest)
    onClose()
  }

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        if (HAS_API_KEY) {
          const pois = await searchPOI(query, userLocation?.lat, userLocation?.lng)
          setResults(pois)
        } else {
          // 목업 필터링
          setResults(POPULAR_DESTINATIONS.filter(d =>
            d.name.includes(query) || d.address.includes(query)
          ))
        }
      } catch { setResults([]) }
      finally { setIsLoading(false) }
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const filtered = results

  return (
    <div className="absolute inset-0 z-30 bg-white flex flex-col">
      {/* 검색 입력 헤더 */}
      <div className="bg-white px-4 pt-14 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2">
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="flex-1 flex items-center bg-gray-100 rounded-xl px-3 py-2.5">
            <svg className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              placeholder="어디로 갈까요?"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="bg-transparent flex-1 text-sm outline-none text-gray-800 placeholder-gray-400"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery('')}>
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 검색 결과 or 홈 컨텐츠 */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {query.length > 0 ? (
          /* 검색 결과 */
          <div>
            {isLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-tmap-blue border-t-transparent rounded-full animate-spin"/>
              </div>
            ) : filtered.length > 0 ? (
              filtered.map(dest => (
                <SearchResultRow key={dest.id} dest={dest} onSelect={handleSelect} />
              ))
            ) : (
              <div className="flex flex-col items-center py-16 text-gray-400">
                <span className="text-4xl mb-3">🔍</span>
                <div className="text-sm">검색 결과가 없어요</div>
              </div>
            )}
          </div>
        ) : (
          /* 홈 컨텐츠 */
          <div className="px-4 pt-4 space-y-6">
            {/* 즐겨찾기 */}
            <div>
              <div className="flex gap-3">
                {MOCK_FAVORITES.map(fav => (
                  <button
                    key={fav.id}
                    onClick={() => handleSelect(fav)}
                    className="flex-1 flex items-center gap-2 bg-gray-50 rounded-2xl px-3 py-3"
                  >
                    <span className="text-xl">{fav.icon}</span>
                    <div className="text-left">
                      <div className="text-sm font-semibold text-gray-800">{fav.name}</div>
                      <div className="text-xs text-gray-400 truncate max-w-[90px]">{fav.address}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 빠른 검색 카테고리 */}
            <div>
              <div className="text-sm font-bold text-gray-700 mb-3">빠른 검색</div>
              <div className="grid grid-cols-3 gap-2">
                {QUICK_CATEGORIES.map(cat => (
                  <button
                    key={cat.label}
                    className="flex flex-col items-center py-3 bg-gray-50 rounded-2xl active:bg-gray-100"
                  >
                    <span className="text-2xl mb-1">{cat.icon}</span>
                    <span className="text-xs text-gray-600 font-medium">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 최근 검색 */}
            {MOCK_RECENT_SEARCHES.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-gray-700">최근 검색</div>
                  <button className="text-xs text-gray-400">전체삭제</button>
                </div>
                <div className="space-y-0">
                  {MOCK_RECENT_SEARCHES.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      className="w-full flex items-center gap-3 py-3 border-b border-gray-50 active:bg-gray-50"
                    >
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800">{item.name}</div>
                        <div className="text-xs text-gray-400 truncate">{item.address}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 인기 목적지 */}
            <div className="pb-6">
              <div className="text-sm font-bold text-gray-700 mb-3">인기 목적지</div>
              <div className="space-y-0">
                {POPULAR_DESTINATIONS.map(dest => (
                  <SearchResultRow key={dest.id} dest={dest} onSelect={handleSelect} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SearchResultRow({ dest, onSelect }) {
  return (
    <button
      onClick={() => onSelect(dest)}
      className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 active:bg-gray-50"
    >
      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-sm font-semibold text-gray-900">{dest.name}</div>
        <div className="text-xs text-gray-400 truncate">{dest.address}</div>
      </div>
      <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
      </svg>
    </button>
  )
}
