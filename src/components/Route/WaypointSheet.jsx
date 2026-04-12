import React, { useEffect, useRef, useState } from 'react'
import useAppStore from '../../store/appStore'
import { searchInstantPlaceCandidates, searchPOI } from '../../services/tmapService'

export default function WaypointSheet({ onClose }) {
  const { waypoints, addWaypoint, removeWaypoint, searchRoute, destination, userLocation } = useAppStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef(null)
  const isComposingRef = useRef(false)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || isComposingRef.current) {
      setResults([])
      setIsSearching(false)
      return
    }
    if (trimmed.length < 2) {
      setResults([])
      setIsSearching(false)
      return
    }

    const instantResults = searchInstantPlaceCandidates(trimmed, userLocation?.lat ?? destination?.lat, userLocation?.lng ?? destination?.lng)
    if (instantResults.length > 0) {
      setResults(instantResults.slice(0, 5))
      setIsSearching(false)
    }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const pois = await searchPOI(trimmed, userLocation?.lat ?? destination?.lat, userLocation?.lng ?? destination?.lng)
        setResults(pois.slice(0, 5))
      } catch {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 120)

    return () => clearTimeout(debounceRef.current)
  }, [query, userLocation?.lat, userLocation?.lng, destination?.lat, destination?.lng])

  function handleAdd(poi) {
    addWaypoint({ id: `wp-${poi.lat}-${poi.lng}`, name: poi.name, lat: poi.lat, lng: poi.lng, address: poi.address })
    setQuery('')
    setResults([])
  }

  async function handleApply() {
    if (destination) await searchRoute(destination)
    onClose()
  }

  return (
    <>
      <div className="absolute inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl slide-up">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="px-5 pb-2 border-b border-gray-100">
          <div className="text-base font-bold text-gray-900">📍 경유지 추가</div>
          <div className="text-xs text-gray-400 mt-0.5">목적지 전에 들를 장소를 추가하세요</div>
        </div>

        {/* 검색 */}
        <div className="px-5 py-3 flex gap-2">
          <input
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none"
            placeholder="장소 검색 (예: 죽전휴게소)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={(event) => {
              isComposingRef.current = false
              setQuery(event.currentTarget.value)
            }}
          />
          <div className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-bold text-gray-500 flex items-center">자동</div>
        </div>

        {/* 검색 결과 */}
        {query.trim().length > 0 && query.trim().length < 2 && <div className="text-center text-sm text-gray-400 py-3">두 글자 이상 입력하세요.</div>}
        {isSearching && <div className="text-center text-sm text-gray-400 py-3">검색 중...</div>}
        {results.length > 0 && (
          <div className="px-5 space-y-1 max-h-40 overflow-y-auto">
            {results.map(poi => (
              <button
                key={poi.id}
                onClick={() => handleAdd(poi)}
                className="w-full text-left px-3 py-2 rounded-xl bg-gray-50 hover:bg-blue-50 flex items-center gap-2"
              >
                <span className="text-sm">📍</span>
                <div>
                  <div className="text-sm font-semibold text-gray-800">{poi.name}</div>
                  <div className="text-xs text-gray-400">{poi.address}</div>
                </div>
                <span className="ml-auto text-xs text-tmap-blue font-bold">추가</span>
              </button>
            ))}
          </div>
        )}

        {/* 현재 경유지 목록 */}
        {waypoints.length > 0 && (
          <div className="px-5 py-3">
            <div className="text-xs font-bold text-gray-500 mb-2">추가된 경유지 ({waypoints.length}개)</div>
            <div className="space-y-1">
              {waypoints.map((wp, i) => (
                <div key={wp.id} className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2">
                  <span className="text-xs font-bold text-tmap-blue w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{wp.name}</div>
                    {wp.address && <div className="text-xs text-gray-400 truncate">{wp.address}</div>}
                  </div>
                  <button
                    onClick={() => removeWaypoint(wp.id)}
                    className="text-gray-400 text-lg leading-none"
                  >×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 pb-6 pt-2 flex gap-2 safe-bottom">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-2xl text-sm font-semibold text-gray-700">
            취소
          </button>
          <button onClick={handleApply} className="flex-[2] py-3 bg-tmap-blue rounded-2xl text-sm font-bold text-white">
            {waypoints.length > 0 ? `경유지 ${waypoints.length}개 적용` : '확인'}
          </button>
        </div>
      </div>
    </>
  )
}
