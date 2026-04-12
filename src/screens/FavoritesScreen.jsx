import React, { useEffect, useRef, useState } from 'react'
import useAppStore from '../store/appStore'
import { searchInstantPlaceCandidates, searchPOI } from '../services/tmapService'

const ICONS = ['⭐', '🏪', '🍽️', '☕', '🏋️', '🏫', '🏥', '💼', '🎯', '🏖️']

export default function FavoritesScreen() {
  const { favorites, updateFavorite, addFavorite, deleteFavorite, searchRoute, setActiveTab } = useAppStore()
  const [editTarget, setEditTarget] = useState(null)
  const [showAddNew, setShowAddNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('⭐')

  const handleGo = (favorite) => {
    if (!favorite.lat || !favorite.lng) {
      setEditTarget(favorite)
      return
    }
    searchRoute(favorite)
    setActiveTab('home')
  }

  const handleAddNew = () => {
    if (!newName.trim()) return
    const nextFavorite = {
      id: Date.now().toString(),
      name: newName.trim(),
      icon: newIcon,
      address: '',
      lat: null,
      lng: null,
    }
    addFavorite(nextFavorite)
    setShowAddNew(false)
    setNewName('')
    setNewIcon('⭐')
    setEditTarget(nextFavorite)
  }

  return (
    <div className="relative flex flex-col h-full bg-gray-50">
      <div className="bg-white px-5 pt-14 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-black text-gray-900">즐겨찾기</h1>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="px-4 pt-4">
          <div className="text-xs font-semibold text-gray-400 mb-2 tracking-wide px-1">저장된 장소</div>
          <div className="bg-white rounded-2xl overflow-hidden divide-y divide-gray-50">
            {favorites.map((favorite) => (
              <div key={favorite.id} className="flex items-center gap-3 px-4 py-4">
                <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                  {favorite.icon}
                </div>
                <button className="flex-1 text-left" onClick={() => handleGo(favorite)}>
                  <div className="text-sm font-bold text-gray-900">{favorite.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{favorite.address || '주소를 설정해주세요 →'}</div>
                </button>
                <div className="flex items-center gap-1">
                  {favorite.lat ? (
                    <button onClick={() => handleGo(favorite)} className="text-xs text-tmap-blue font-semibold px-2 py-1 bg-blue-50 rounded-lg">
                      길찾기
                    </button>
                  ) : null}
                  <button onClick={() => setEditTarget(favorite)} className="p-1.5">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  {!['home', 'work'].includes(favorite.id) ? (
                    <button onClick={() => deleteFavorite(favorite.id)} className="p-1.5">
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowAddNew(true)}
            className="w-full mt-3 flex items-center justify-center gap-2 py-3.5 bg-white rounded-2xl border border-dashed border-gray-200 active:bg-gray-50"
          >
            <svg className="w-5 h-5 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-semibold text-tmap-blue">장소 추가</span>
          </button>
        </div>
      </div>

      {showAddNew ? (
        <>
          <div className="absolute inset-0 bg-black/30 z-40" onClick={() => setShowAddNew(false)} />
          <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-5 pt-4 pb-10">
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="text-base font-bold mb-4">새 즐겨찾기 추가</div>

            <div className="mb-3">
              <div className="text-xs text-gray-500 mb-1.5 font-medium">아이콘</div>
              <div className="flex gap-2 flex-wrap">
                {ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setNewIcon(icon)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${newIcon === icon ? 'bg-blue-100 ring-2 ring-tmap-blue' : 'bg-gray-100'}`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <div className="text-xs text-gray-500 mb-1.5 font-medium">이름</div>
              <input
                autoFocus
                type="text"
                placeholder="예: 헬스장, 부모님댁..."
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none"
              />
            </div>

            <button
              onClick={handleAddNew}
              disabled={!newName.trim()}
              className="w-full py-3.5 bg-tmap-blue text-white font-bold rounded-2xl text-sm disabled:opacity-40"
            >
              추가하기
            </button>
          </div>
        </>
      ) : null}

      {editTarget ? (
        <EditSheet
          favorite={editTarget}
          onSave={(favorite) => {
            updateFavorite(favorite)
            setEditTarget(null)
          }}
          onClose={() => setEditTarget(null)}
        />
      ) : null}
    </div>
  )
}

function EditSheet({ favorite, onSave, onClose }) {
  const { userLocation } = useAppStore()
  const [query, setQuery] = useState(favorite.address || '')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const isComposingRef = useRef(false)

  useEffect(() => {
    if (!query.trim() || isComposingRef.current) {
      setResults([])
      return
    }
    if (query.trim().length < 2) {
      setResults([])
      setIsLoading(false)
      return
    }
    const instantResults = searchInstantPlaceCandidates(query, userLocation?.lat, userLocation?.lng)
    if (instantResults.length > 0) {
      setResults(instantResults)
      setIsLoading(false)
    }
    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const pois = await searchPOI(query, userLocation?.lat, userLocation?.lng)
        setResults(pois)
      } catch {
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 220)
    return () => clearTimeout(timer)
  }, [query, userLocation?.lat, userLocation?.lng])

  return (
    <>
      <div className="absolute inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white bottom-sheet slide-up max-h-[80vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="px-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="text-base font-bold">{favorite.icon} {favorite.name} 주소 설정</div>
          <div className="text-xs text-gray-400 mt-1">실제 주소 검색이 되며 저장 후 홈/검색 화면에 바로 반영됩니다.</div>
        </div>

        <div className="px-4 pt-3 flex-shrink-0">
          <div className="flex items-center bg-gray-100 rounded-xl px-3 py-2.5">
            <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              autoFocus
              type="text"
              placeholder="주소나 장소명 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onCompositionStart={() => { isComposingRef.current = true }}
              onCompositionEnd={(event) => {
                isComposingRef.current = false
                setQuery(event.currentTarget.value)
              }}
              className="bg-transparent flex-1 text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 pb-6">
          {isLoading ? (
            <div className="text-sm text-gray-400 py-6">검색 중...</div>
          ) : results.length > 0 ? (
            results.map((poi) => (
              <button
                key={poi.id}
                onClick={() => onSave({ ...favorite, address: poi.address || poi.name, lat: poi.lat, lng: poi.lng })}
                className="w-full flex items-center gap-3 py-3 border-b border-gray-50 active:bg-gray-50"
              >
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{poi.name}</div>
                  <div className="text-xs text-gray-400 truncate">{poi.address}</div>
                </div>
              </button>
            ))
          ) : query.trim() ? (
            <div className="text-sm text-gray-400 py-8 text-center">검색 결과가 없어요.</div>
          ) : null}
        </div>
      </div>
    </>
  )
}
