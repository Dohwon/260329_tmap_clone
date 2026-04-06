import React, { useEffect, useRef, useState } from 'react'
import useAppStore from '../../store/appStore'
import { searchPOI } from '../../services/tmapService'

const QUICK_CATEGORIES = [
  { icon: '⛽', label: '주유소' },
  { icon: '🅿️', label: '주차장' },
  { icon: '☕', label: '카페' },
  { icon: '🍽️', label: '음식점' },
  { icon: '🏥', label: '병원' },
  { icon: '🏪', label: '편의점' },
]

export default function SearchSheet({ onClose, embedded = false }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const debounceRef = useRef(null)
  const isComposingRef = useRef(false)

  const {
    searchRoute,
    userLocation,
    favorites,
    recentSearches,
    removeRecentSearch,
    clearRecentSearches,
    openNearbyCategory,
    nearbyPlaces,
    selectedNearbyCategory,
    searchMode,
    isLoadingNearby,
    setActiveTab,
  } = useAppStore()

  const handleSelect = (destination) => {
    searchRoute(destination)
    if (onClose) onClose()
    else setActiveTab('home')
  }

  useEffect(() => {
    if (!query.trim() || isComposingRef.current) {
      setResults([])
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const pois = await searchPOI(query, userLocation?.lat, userLocation?.lng)
        setResults(pois)
      } catch {
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 180)

    return () => clearTimeout(debounceRef.current)
  }, [query, userLocation?.lat, userLocation?.lng])

  const showNearby = !query.trim() && searchMode === 'nearby'
  const showRecent = !query.trim() && (searchMode === 'recent' || recentSearches.length > 0)
  const containerClass = embedded
    ? 'absolute inset-x-0 top-0 bottom-16 z-20 bg-white flex flex-col'
    : 'absolute inset-0 z-30 bg-white flex flex-col'

  return (
    <div className={containerClass}>
      <div className="bg-white px-4 pt-14 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => (onClose ? onClose() : setActiveTab('home'))} className="p-2 -ml-2">
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 flex items-center bg-gray-100 rounded-xl px-3 py-2.5">
            <svg className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="주소, 장소, 고속도로 시점/종점 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onCompositionStart={() => { isComposingRef.current = true }}
              onCompositionEnd={(event) => {
                isComposingRef.current = false
                setQuery(event.currentTarget.value)
              }}
              className="bg-transparent flex-1 text-sm outline-none text-gray-800 placeholder-gray-400"
              autoFocus={!embedded}
            />
            {query ? (
              <button onClick={() => setQuery('')}>
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1.293-6.293a1 1 0 011.414 0L10 11.414l1.293-1.293a1 1 0 111.414 1.414L11.414 12.8l1.293 1.293a1 1 0 01-1.414 1.414L10 14.214l-1.293 1.293a1 1 0 01-1.414-1.414l1.293-1.293-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {query.trim() ? (
          <div>
            {isLoading ? (
              <div className="px-4 py-3 text-xs text-gray-400">입력 중인 주소와 관련된 장소를 찾는 중이에요</div>
            ) : results.length > 0 ? (
              results.map((destination) => (
                <SearchResultRow key={destination.id} destination={destination} onSelect={handleSelect} />
              ))
            ) : (
              <div className="flex flex-col items-center py-16 text-gray-400">
                <span className="text-4xl mb-3">🔍</span>
                <div className="text-sm">검색 결과가 없어요</div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 pt-4 pb-6 space-y-6">
            <div>
              <div className="text-sm font-bold text-gray-700 mb-3">즐겨찾기</div>
              <div className="flex gap-3">
                {favorites.slice(0, 2).map((favorite) => (
                  <div key={favorite.id} className="flex-1 flex items-center gap-2 bg-gray-50 rounded-2xl px-3 py-3 min-w-0">
                    <button
                      onClick={() => {
                        if (favorite.lat && favorite.lng) {
                          handleSelect(favorite)
                          return
                        }
                        setActiveTab('favorites')
                      }}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <span className="text-xl">{favorite.icon}</span>
                      <div className="text-left min-w-0">
                        <div className="text-sm font-semibold text-gray-800">{favorite.name}</div>
                        <div className="text-xs text-gray-400 truncate max-w-[92px]">
                          {favorite.address || '주소 설정 필요'}
                        </div>
                      </div>
                    </button>
                    <button onClick={() => setActiveTab('favorites')} className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-bold text-gray-700 mb-3">빠른 검색</div>
              <div className="grid grid-cols-3 gap-2">
                {QUICK_CATEGORIES.map((category) => (
                  <button
                    key={category.label}
                    onClick={() => openNearbyCategory(category.label)}
                    className={`flex flex-col items-center py-3 rounded-2xl active:bg-gray-100 ${
                      selectedNearbyCategory === category.label ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
                    }`}
                  >
                    <span className="text-2xl mb-1">{category.icon}</span>
                    <span className="text-xs text-gray-600 font-medium">{category.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {showNearby ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-gray-700">{selectedNearbyCategory} 근처 전체</div>
                  <div className="text-xs text-gray-400">현재 위치 기준</div>
                </div>
                {isLoadingNearby ? (
                  <div className="text-sm text-gray-400 py-4">근처 장소를 찾는 중이에요</div>
                ) : nearbyPlaces.length > 0 ? (
                  nearbyPlaces.map((place) => (
                    <SearchResultRow
                      key={place.id}
                      destination={{
                        ...place,
                        address: place.distanceKm != null ? `${place.address} · ${place.distanceKm}km` : place.address,
                      }}
                      onSelect={handleSelect}
                    />
                  ))
                ) : (
                  <div className="text-sm text-gray-400 py-4">주변 결과가 없어요.</div>
                )}
              </div>
            ) : null}

            {showRecent ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-gray-700">최근 검색</div>
                  <button onClick={clearRecentSearches} className="text-xs text-gray-400">전체삭제</button>
                </div>
                {recentSearches.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 py-3 border-b border-gray-50">
                    <button onClick={() => handleSelect(item)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800">{item.name}</div>
                        <div className="text-xs text-gray-400 truncate">{item.address}</div>
                      </div>
                    </button>
                    <button onClick={() => removeRecentSearch(item.id)} className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function SearchResultRow({ destination, onSelect }) {
  return (
    <button
      onClick={() => onSelect(destination)}
      className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 active:bg-gray-50"
    >
      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-sm font-semibold text-gray-900">{destination.name}</div>
        <div className="text-xs text-gray-400 truncate">{destination.address}</div>
      </div>
      <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
