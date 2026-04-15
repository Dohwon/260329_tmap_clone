import React, { useEffect, useMemo, useRef, useState } from 'react'
import useAppStore from '../../store/appStore'
import { buildRestaurantRatingKey, fetchRestaurantRatingForPlace, getDiscountedFuelPrice, searchInstantPlaceCandidates, searchPOI } from '../../services/tmapService'

const SEARCH_DEBOUNCE_MS = 450

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
  const [pendingSelection, setPendingSelection] = useState(null)
  const [restaurantSelection, setRestaurantSelection] = useState(null)
  const [restaurantDetail, setRestaurantDetail] = useState(null)
  const [restaurantDetailLoading, setRestaurantDetailLoading] = useState(false)
  const debounceRef = useRef(null)
  const isComposingRef = useRef(false)
  const requestIdRef = useRef(0)

  const {
    searchRoute,
    userLocation,
    routeOrigin,
    routeSearchTarget,
    setRouteOrigin,
    clearRouteOrigin,
    setRouteSearchTarget,
    destination,
    routes,
    selectedRouteId,
    isNavigating,
    addWaypoint,
    clearWaypoints,
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
    restaurantRatings,
    stationaryVisitState,
    rateRestaurant,
    settings,
  } = useAppStore()
  const activeRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null,
    [routes, selectedRouteId]
  )
  const activeRoutePolyline = activeRoute?.polyline ?? []
  const originLabel = routeOrigin?.name ?? '현재 위치'
  const originSubLabel = routeOrigin?.address ?? 'GPS 기준 출발'
  const searchAnchor = routeSearchTarget === 'origin'
    ? (routeOrigin ?? userLocation ?? destination ?? null)
    : (userLocation ?? routeOrigin ?? destination ?? null)

  const closeSheet = () => {
    setPendingSelection(null)
    setRestaurantSelection(null)
    if (onClose) onClose()
    else setActiveTab('home')
  }

  const performSelect = (nextDestination) => {
    if (routeSearchTarget === 'origin' && !isNavigating) {
      setRouteOrigin({
        id: `origin-${nextDestination.lat}-${nextDestination.lng}`,
        name: nextDestination.name,
        lat: nextDestination.lat,
        lng: nextDestination.lng,
        address: nextDestination.address ?? '',
      })
      if (destination) searchRoute(destination)
      closeSheet()
      return
    }
    if (isNavigating) {
      setPendingSelection(nextDestination)
      return
    }
    searchRoute(nextDestination)
    closeSheet()
  }

  const handleSelect = (nextDestination) => {
    if (isRestaurantDestination(nextDestination)) {
      setRestaurantSelection(nextDestination)
      return
    }
    performSelect(nextDestination)
  }

  useEffect(() => {
    if (!query.trim() || isComposingRef.current) {
      requestIdRef.current += 1
      setResults([])
      setIsLoading(false)
      return
    }
    if (query.trim().length < 2) {
      requestIdRef.current += 1
      setResults([])
      setIsLoading(false)
      return
    }
    const instantResults = searchInstantPlaceCandidates(query, searchAnchor?.lat, searchAnchor?.lng)
    if (instantResults.length > 0) {
      setResults(instantResults)
      setIsLoading(false)
    }
    clearTimeout(debounceRef.current)
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const pois = await searchPOI(query, searchAnchor?.lat, searchAnchor?.lng, {
          routePolyline: activeRoutePolyline,
          fuelSettings: settings,
        })
        if (requestIdRef.current !== requestId) return
        setResults(pois)
      } catch {
        if (requestIdRef.current !== requestId) return
        setResults([])
      } finally {
        if (requestIdRef.current === requestId) setIsLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(debounceRef.current)
  }, [activeRoutePolyline, query, searchAnchor?.lat, searchAnchor?.lng, settings])

  useEffect(() => {
    if (!restaurantSelection) {
      setRestaurantDetail(null)
      setRestaurantDetailLoading(false)
      return
    }

    let cancelled = false
    setRestaurantDetail(restaurantSelection)
    setRestaurantDetailLoading(true)

    fetchRestaurantRatingForPlace(restaurantSelection)
      .then((enriched) => {
        if (cancelled || !enriched) return
        setRestaurantDetail(enriched)
      })
      .catch(() => {
        if (cancelled) return
        setRestaurantDetail(restaurantSelection)
      })
      .finally(() => {
        if (!cancelled) setRestaurantDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [restaurantSelection])

  const showNearby = !query.trim() && searchMode === 'nearby'
  const showRecent = !query.trim() && (searchMode === 'recent' || recentSearches.length > 0)
  const isFuelSearch = query.trim().length >= 2 && results.some((item) => Number.isFinite(Number(item.fuelPrice)) && Number(item.fuelPrice) > 0)
  const nearbyFuelSummary = useMemo(() => {
    if (selectedNearbyCategory !== '주유소' || nearbyPlaces.length === 0) return null
    return {
      nearbyLowestPoi: [...nearbyPlaces].sort((a, b) => getDiscountedFuelPrice(a, settings) - getDiscountedFuelPrice(b, settings))[0] ?? null,
      routeLowestPoi: nearbyPlaces
        .filter((poi) => poi.isRouteCorridor)
        .sort((a, b) => getDiscountedFuelPrice(a, settings) - getDiscountedFuelPrice(b, settings))[0] ?? null,
    }
  }, [nearbyPlaces, selectedNearbyCategory, settings])
  const fuelSearchSummary = useMemo(() => {
    if (!isFuelSearch) return null
    return {
      nearbyLowestPoi: [...results].sort((a, b) => getDiscountedFuelPrice(a, settings) - getDiscountedFuelPrice(b, settings))[0] ?? null,
      routeLowestPoi: results
        .filter((poi) => poi.isRouteCorridor)
        .sort((a, b) => getDiscountedFuelPrice(a, settings) - getDiscountedFuelPrice(b, settings))[0] ?? null,
    }
  }, [isFuelSearch, results, settings])
  const containerClass = embedded
    ? 'absolute inset-x-0 top-0 bottom-16 z-20 bg-white flex flex-col'
    : 'absolute inset-0 z-30 bg-white flex flex-col'

  const handleFuelQuickPick = (poi) => {
    if (!poi) return
    handleSelect({
      ...poi,
      address: poi.address,
    })
  }

  const selectedRestaurantRating = restaurantSelection
    ? restaurantRatings[restaurantSelection.restaurantRatingKey ?? buildRestaurantRatingKey(restaurantSelection)] ?? null
    : null
  const restaurantRatingEligibility = useMemo(
    () => getRestaurantRatingEligibility(restaurantSelection, userLocation, stationaryVisitState),
    [restaurantSelection, stationaryVisitState, userLocation]
  )

  return (
    <div className={containerClass}>
      <div className="bg-white px-4 pt-14 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={closeSheet} className="p-2 -ml-2">
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
              placeholder={routeSearchTarget === 'origin' ? '출발지 검색' : '주소, 장소, 고속도로 시점/종점 검색'}
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
        {!isNavigating && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => setRouteSearchTarget('origin')}
              className={`rounded-2xl border px-3 py-2 text-left ${routeSearchTarget === 'origin' ? 'border-tmap-blue bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
            >
              <div className="text-[11px] font-bold text-gray-500">출발지</div>
              <div className="text-sm font-bold text-gray-900 truncate mt-0.5">{originLabel}</div>
              <div className="text-[11px] text-gray-400 truncate mt-0.5">{originSubLabel}</div>
            </button>
            <button
              onClick={() => setRouteSearchTarget('destination')}
              className={`rounded-2xl border px-3 py-2 text-left ${routeSearchTarget === 'destination' ? 'border-tmap-blue bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
            >
              <div className="text-[11px] font-bold text-gray-500">도착지</div>
              <div className="text-sm font-bold text-gray-900 truncate mt-0.5">{destination?.name ?? '도착지 선택'}</div>
              <div className="text-[11px] text-gray-400 truncate mt-0.5">{destination?.address ?? '검색 결과에서 선택'}</div>
            </button>
          </div>
        )}
        {!isNavigating && routeSearchTarget === 'origin' && (
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => {
                clearRouteOrigin()
                if (destination) searchRoute(destination)
              }}
              className="rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-semibold text-gray-600"
            >
              현재 위치로 초기화
            </button>
            <div className="text-[11px] text-gray-400">출발지를 바꾸면 현재 도착지 기준으로 경로를 다시 계산합니다.</div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {query.trim() ? (
          <div>
            {isLoading ? (
              <div className="px-4 py-3 text-xs text-gray-400">입력 중인 주소와 관련된 장소를 찾는 중이에요</div>
            ) : query.trim().length < 2 ? (
              <div className="px-4 py-3 text-xs text-gray-400">두 글자 이상 입력하면 빠르게 후보를 보여줍니다.</div>
            ) : results.length > 0 ? (
              <div>
                {fuelSearchSummary && (
                  <div className="px-4 pt-3 pb-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleFuelQuickPick(fuelSearchSummary.nearbyLowestPoi)}
                      disabled={!fuelSearchSummary.nearbyLowestPoi}
                      className="rounded-2xl bg-orange-50 px-3 py-3 text-left disabled:opacity-50"
                    >
                      <div className="text-[11px] font-bold text-orange-500">근방 최저</div>
                      <div className="text-sm font-black text-gray-900 mt-0.5">
                        {fuelSearchSummary.nearbyLowestPoi?.discountedFuelPrice != null
                          ? `${fuelSearchSummary.nearbyLowestPoi.discountedFuelPrice.toLocaleString()}원/L`
                          : '--'}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1 truncate">
                        {fuelSearchSummary.nearbyLowestPoi?.name ?? '선택 불가'}
                      </div>
                    </button>
                    <button
                      onClick={() => handleFuelQuickPick(fuelSearchSummary.routeLowestPoi)}
                      disabled={!fuelSearchSummary.routeLowestPoi}
                      className="rounded-2xl bg-blue-50 px-3 py-3 text-left disabled:opacity-50"
                    >
                      <div className="text-[11px] font-bold text-blue-500">경로상 최저</div>
                      <div className="text-sm font-black text-gray-900 mt-0.5">
                        {fuelSearchSummary.routeLowestPoi?.discountedFuelPrice != null
                          ? `${fuelSearchSummary.routeLowestPoi.discountedFuelPrice.toLocaleString()}원/L`
                          : '--'}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1 truncate">
                        {fuelSearchSummary.routeLowestPoi?.name ?? '경로상 주유소 없음'}
                      </div>
                    </button>
                  </div>
                )}
                {results.map((destination) => (
                  <SearchResultRow key={destination.id} destination={destination} onSelect={handleSelect} />
                ))}
              </div>
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
                  <div>
                    {nearbyFuelSummary && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <button
                          onClick={() => handleFuelQuickPick(nearbyFuelSummary.routeLowestPoi)}
                          disabled={!nearbyFuelSummary.routeLowestPoi}
                          className="rounded-2xl bg-blue-50 px-3 py-3 text-left disabled:opacity-50"
                        >
                          <div className="text-[11px] font-bold text-blue-500">경로상 최저</div>
                          <div className="text-sm font-black text-gray-900 mt-0.5">
                            {nearbyFuelSummary.routeLowestPoi?.discountedFuelPrice != null
                              ? `${nearbyFuelSummary.routeLowestPoi.discountedFuelPrice.toLocaleString()}원/L`
                              : '--'}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-1 truncate">
                            {nearbyFuelSummary.routeLowestPoi?.name ?? '경로상 주유소 없음'}
                          </div>
                        </button>
                        <button
                          onClick={() => handleFuelQuickPick(nearbyFuelSummary.nearbyLowestPoi)}
                          disabled={!nearbyFuelSummary.nearbyLowestPoi}
                          className="rounded-2xl bg-orange-50 px-3 py-3 text-left disabled:opacity-50"
                        >
                          <div className="text-[11px] font-bold text-orange-500">반경내 최저</div>
                          <div className="text-sm font-black text-gray-900 mt-0.5">
                            {nearbyFuelSummary.nearbyLowestPoi?.discountedFuelPrice != null
                              ? `${nearbyFuelSummary.nearbyLowestPoi.discountedFuelPrice.toLocaleString()}원/L`
                              : '--'}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-1 truncate">
                            {nearbyFuelSummary.nearbyLowestPoi?.name ?? '선택 불가'}
                          </div>
                        </button>
                      </div>
                    )}
                    {nearbyPlaces.map((place) => (
                      <SearchResultRow
                        key={place.id}
                        destination={{
                          ...place,
                          address: place.distanceKm != null ? `${place.address} · ${place.distanceKm}km` : place.address,
                        }}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
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

      {pendingSelection && (
        <>
          <div className="absolute inset-0 z-40 bg-black/35" onClick={() => setPendingSelection(null)} />
          <div className="absolute left-4 right-4 bottom-6 z-50 rounded-3xl bg-white shadow-2xl border border-gray-100 p-5">
            <div className="text-sm font-black text-gray-900">"{pendingSelection.name}" 검색 결과</div>
            <div className="text-xs text-gray-500 mt-1 truncate">{pendingSelection.address}</div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={async () => {
                  addWaypoint({
                    id: `wp-nav-search-${pendingSelection.lat}-${pendingSelection.lng}`,
                    name: pendingSelection.name,
                    lat: pendingSelection.lat,
                    lng: pendingSelection.lng,
                    address: pendingSelection.address,
                  })
                  if (destination) await searchRoute(destination)
                  setPendingSelection(null)
                  closeSheet()
                }}
                className="rounded-2xl bg-tmap-blue text-white py-3 text-sm font-bold"
              >
                경유지 추가
              </button>
              <button
                onClick={async () => {
                  clearWaypoints()
                  await searchRoute(pendingSelection)
                  setPendingSelection(null)
                  closeSheet()
                }}
                className="rounded-2xl bg-gray-900 text-white py-3 text-sm font-bold"
              >
                목적지 변경
              </button>
            </div>
            <button
              onClick={() => setPendingSelection(null)}
              className="w-full mt-3 rounded-2xl bg-gray-100 text-gray-600 py-3 text-sm font-semibold"
            >
              취소
            </button>
          </div>
        </>
      )}

      {restaurantSelection && (
        <>
          <div className="absolute inset-0 z-40 bg-black/35" onClick={() => setRestaurantSelection(null)} />
          <RestaurantDetailSheet
            restaurant={restaurantDetail ?? restaurantSelection}
            isLoadingMeta={restaurantDetailLoading}
            isNavigating={isNavigating}
            userRating={selectedRestaurantRating?.rating ?? null}
            canRate={restaurantRatingEligibility.canRate}
            canRateReason={restaurantRatingEligibility.reason}
            onRate={(rating) => {
              rateRestaurant({
                placeKey: restaurantSelection.restaurantRatingKey ?? buildRestaurantRatingKey(restaurantSelection),
                rating,
                restaurant: restaurantSelection,
              })
            }}
            onAddWaypoint={async () => {
              addWaypoint({
                id: `wp-restaurant-${restaurantSelection.lat}-${restaurantSelection.lng}`,
                name: restaurantSelection.name,
                lat: restaurantSelection.lat,
                lng: restaurantSelection.lng,
                address: restaurantSelection.address,
              })
              if (destination) await searchRoute(destination)
              setRestaurantSelection(null)
              closeSheet()
            }}
            onSetDestination={async () => {
              if (isNavigating) clearWaypoints()
              await searchRoute(restaurantSelection)
              setRestaurantSelection(null)
              closeSheet()
            }}
            onClose={() => setRestaurantSelection(null)}
          />
        </>
      )}
    </div>
  )
}

function isRestaurantDestination(destination = {}) {
  return Boolean(destination?.restaurantRatingKey)
    || [destination?.name, destination?.category, destination?.address].filter(Boolean).join(' ').match(/음식점|맛집|식당|한식|중식|일식|양식|분식|국밥|냉면|칼국수|파스타|치킨|피자|햄버거|고기집|기사식당/i)
}

function formatGoogleRating(restaurant = {}) {
  const rating = Number(restaurant?.googleRating)
  if (!Number.isFinite(rating) || rating <= 0) {
    return restaurant?.googleRatingSource === 'lazy'
      ? '카드에서 평점 조회'
      : '별점 정보 없음'
  }
  const reviewCount = Number(restaurant?.googleUserRatingCount)
  return `Google ${rating.toFixed(1)}${Number.isFinite(reviewCount) && reviewCount > 0 ? ` · 리뷰 ${reviewCount.toLocaleString()}` : ''}`
}

function getRestaurantRatingEligibility(restaurant, userLocation, stationaryVisitState) {
  if (!restaurant || !userLocation || !stationaryVisitState) {
    return { canRate: false, reason: '현재 위치 체류 기록이 부족합니다.' }
  }

  const restaurantLat = Number(restaurant.lat)
  const restaurantLng = Number(restaurant.lng)
  if (!Number.isFinite(restaurantLat) || !Number.isFinite(restaurantLng)) {
    return { canRate: false, reason: '위치 정보가 없어 평점을 남길 수 없습니다.' }
  }

  const distanceKm = haversineKm(userLocation.lat, userLocation.lng, restaurantLat, restaurantLng)
  if (distanceKm > 0.25) {
    return { canRate: false, reason: '해당 음식점 반경 250m 안에서 20분 이상 머물러야 합니다.' }
  }

  const dwellMinutes = Number(stationaryVisitState?.dwellMinutes ?? 0)
  if (dwellMinutes < 20) {
    return { canRate: false, reason: `현재 구역 체류 ${dwellMinutes.toFixed(0)}분 · 20분 이상 머물러야 합니다.` }
  }

  return { canRate: true, reason: `현재 구역 체류 ${dwellMinutes.toFixed(0)}분` }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
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
        {destination.fuelPrice != null ? (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-orange-600">
              {destination.fuelLabel ?? '휘발유'} {destination.fuelPrice.toLocaleString()}원/L
            </span>
            {destination.discountedFuelPrice != null && destination.fuelBenefitApplied ? (
              <span className="text-[11px] font-bold text-blue-600">
                할인 적용 {destination.discountedFuelPrice.toLocaleString()}원/L
              </span>
            ) : null}
            {destination.isRouteCorridor ? (
              <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                경로상
              </span>
            ) : null}
            {destination.priceSource ? (
              <span className="text-[10px] text-gray-400">
                {destination.priceSource === 'opinet'
                  ? destination.fuelBenefitLabel ?? '오피넷 실유가'
                  : '유가 정보 없음'}
              </span>
            ) : null}
          </div>
        ) : destination.fuelLabel ? (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-gray-500">유가 정보 없음</span>
          </div>
        ) : null}
        {destination.parkingFeeLabel ? (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-indigo-600">
              {destination.parkingFeeLabel}
            </span>
            <span className="text-[10px] text-gray-400">
              {destination.parkingFeeSource === 'estimated' ? '표시용 추정가' : '요금 정보'}
            </span>
          </div>
        ) : null}
        {destination.todayHoursLabel || destination.saturdayOpen || destination.sundayOpen ? (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-bold ${destination.isOpenNow ? 'text-emerald-600' : 'text-gray-500'}`}>
              {destination.isOpenNow ? '영업중' : '종료'}
            </span>
            {destination.todayHoursLabel ? (
              <span className="text-[11px] text-gray-600">오늘 {destination.todayHoursLabel}</span>
            ) : null}
            {destination.saturdayOpen ? (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                토 진료
              </span>
            ) : null}
            {destination.sundayOpen ? (
              <span className="px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-bold">
                일 진료
              </span>
            ) : null}
          </div>
        ) : null}
        {isRestaurantDestination(destination) ? (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-bold ${destination.googleRating != null ? 'text-amber-600' : 'text-gray-500'}`}>
              {formatGoogleRating(destination)}
            </span>
            {typeof destination.googleOpenNow === 'boolean' ? (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                destination.googleOpenNow ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {destination.googleOpenNow ? '영업중' : '영업종료'}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}

function RestaurantDetailSheet({
  restaurant,
  isLoadingMeta,
  isNavigating,
  userRating,
  canRate,
  canRateReason,
  onRate,
  onAddWaypoint,
  onSetDestination,
  onClose,
}) {
  return (
    <div className="absolute left-4 right-4 bottom-6 z-50 rounded-3xl bg-white shadow-2xl border border-gray-100 p-5">
      <div className="text-base font-black text-gray-900">{restaurant.name}</div>
      <div className="text-xs text-gray-500 mt-1">{restaurant.address}</div>
      <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-3">
        <div className="text-[11px] font-bold text-amber-600">구글 평점</div>
        <div className="text-sm font-black text-gray-900 mt-1">
          {isLoadingMeta ? '평점 조회 중...' : formatGoogleRating(restaurant)}
        </div>
        <div className="text-[11px] text-gray-500 mt-1">
          {isLoadingMeta
            ? '영업 정보를 불러오는 중입니다.'
            : typeof restaurant.googleOpenNow === 'boolean'
            ? restaurant.googleOpenNow ? '현재 영업중' : '현재 영업종료'
            : '영업 정보 없음'}
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-gray-50 px-3 py-3">
        <div className="text-[11px] font-bold text-gray-500">내 평점</div>
        <div className="text-sm font-black text-gray-900 mt-1">
          {userRating != null ? `${Number(userRating).toFixed(1)}점` : '아직 없음'}
        </div>
        <div className={`text-[11px] mt-1 ${canRate ? 'text-emerald-600' : 'text-gray-500'}`}>
          {canRateReason}
        </div>
        <div className="grid grid-cols-5 gap-2 mt-3">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              onClick={() => canRate && onRate(score)}
              disabled={!canRate}
              className={`rounded-xl py-2 text-xs font-bold border ${
                userRating === score
                  ? 'bg-tmap-blue text-white border-tmap-blue'
                  : 'bg-white text-gray-600 border-gray-200'
              } disabled:opacity-40`}
            >
              {score}.0
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-3 mt-4 ${isNavigating ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {isNavigating ? (
          <button
            onClick={onAddWaypoint}
            className="rounded-2xl bg-tmap-blue text-white py-3 text-sm font-bold"
          >
            경유지 추가
          </button>
        ) : null}
        <button
          onClick={onSetDestination}
          className="rounded-2xl bg-gray-900 text-white py-3 text-sm font-bold"
        >
          {isNavigating ? '목적지 변경' : '길안내 시작'}
        </button>
      </div>
      <button
        onClick={onClose}
        className="w-full mt-3 rounded-2xl bg-gray-100 text-gray-600 py-3 text-sm font-semibold"
      >
        닫기
      </button>
    </div>
  )
}
