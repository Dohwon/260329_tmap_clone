import React, { useState } from 'react'
import useAppStore from '../store/appStore'
import { searchPOI } from '../services/tmapService'

const DEFAULT_FAVORITES = [
  { id: 'home', name: '집', icon: '🏠', address: '', lat: null, lng: null },
  { id: 'work', name: '회사', icon: '🏢', address: '', lat: null, lng: null },
]

const ICONS = ['⭐', '🏪', '🍽️', '☕', '🏋️', '🏫', '🏥', '💼', '🎯', '🏖️']

function loadFavorites() {
  try {
    const saved = localStorage.getItem('tmap_favorites')
    return saved ? JSON.parse(saved) : DEFAULT_FAVORITES
  } catch { return DEFAULT_FAVORITES }
}

export default function FavoritesScreen() {
  const { searchRoute, setActiveTab } = useAppStore()
  const [favorites, setFavorites] = useState(loadFavorites)
  const [editTarget, setEditTarget] = useState(null)
  const [showAddNew, setShowAddNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('⭐')

  const save = (updated) => {
    setFavorites(updated)
    localStorage.setItem('tmap_favorites', JSON.stringify(updated))
  }

  const handleGo = (fav) => {
    if (!fav.lat) { setEditTarget(fav); return }
    searchRoute(fav)
    setActiveTab('home')
  }

  const handleSaveEdit = (fav) => {
    const updated = favorites.map(f => f.id === fav.id ? fav : f)
    save(updated)
    setEditTarget(null)
  }

  const handleAddNew = () => {
    if (!newName.trim()) return
    const newFav = {
      id: Date.now().toString(),
      name: newName.trim(),
      icon: newIcon,
      address: '',
      lat: null,
      lng: null,
    }
    const updated = [...favorites, newFav]
    save(updated)
    setShowAddNew(false)
    setNewName('')
    setNewIcon('⭐')
    setEditTarget(newFav)
  }

  const handleDelete = (id) => {
    const updated = favorites.filter(f => f.id !== id)
    save(updated)
  }

  const isDefault = (id) => id === 'home' || id === 'work'

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white px-5 pt-14 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-black text-gray-900">즐겨찾기</h1>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="px-4 pt-4">
          <div className="text-xs font-semibold text-gray-400 mb-2 tracking-wide px-1">저장된 장소</div>
          <div className="bg-white rounded-2xl overflow-hidden divide-y divide-gray-50">
            {favorites.map(fav => (
              <div key={fav.id} className="flex items-center gap-3 px-4 py-4">
                <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                  {fav.icon}
                </div>
                <button className="flex-1 text-left" onClick={() => handleGo(fav)}>
                  <div className="text-sm font-bold text-gray-900">{fav.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {fav.address || '주소를 설정해주세요 →'}
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  {fav.lat && (
                    <button
                      onClick={() => handleGo(fav)}
                      className="text-xs text-tmap-blue font-semibold px-2 py-1 bg-blue-50 rounded-lg"
                    >
                      길찾기
                    </button>
                  )}
                  <button onClick={() => setEditTarget(fav)} className="p-1.5">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                    </svg>
                  </button>
                  {!isDefault(fav.id) && (
                    <button onClick={() => handleDelete(fav.id)} className="p-1.5">
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 장소 추가 버튼 */}
          <button
            onClick={() => setShowAddNew(true)}
            className="w-full mt-3 flex items-center justify-center gap-2 py-3.5 bg-white rounded-2xl border border-dashed border-gray-200 active:bg-gray-50"
          >
            <svg className="w-5 h-5 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            <span className="text-sm font-semibold text-tmap-blue">장소 추가</span>
          </button>
        </div>

        <div className="px-5 mt-4 pb-8">
          <div className="bg-blue-50 rounded-2xl px-4 py-4">
            <div className="text-sm font-semibold text-tmap-blue mb-1">💡 즐겨찾기 활용법</div>
            <div className="text-xs text-blue-500 leading-relaxed">
              연필 아이콘을 눌러 주소를 설정하면 바로 길찾기를 시작할 수 있어요.
            </div>
          </div>
        </div>
      </div>

      {/* 새 장소 추가 모달 */}
      {showAddNew && (
        <>
          <div className="absolute inset-0 bg-black/30 z-40" onClick={() => setShowAddNew(false)}/>
          <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-5 pt-4 pb-10">
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 bg-gray-300 rounded-full"/>
            </div>
            <div className="text-base font-bold mb-4">새 즐겨찾기 추가</div>

            <div className="mb-3">
              <div className="text-xs text-gray-500 mb-1.5 font-medium">아이콘</div>
              <div className="flex gap-2 flex-wrap">
                {ICONS.map(icon => (
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
                onChange={e => setNewName(e.target.value)}
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
      )}

      {editTarget && (
        <EditSheet
          fav={editTarget}
          onSave={handleSaveEdit}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}

function EditSheet({ fav, onSave, onClose }) {
  const [query, setQuery] = useState(fav.address || '')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const { userLocation } = useAppStore()

  React.useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setIsLoading(true)
      try {
        const pois = await searchPOI(query, userLocation?.lat, userLocation?.lng)
        setResults(pois)
      } catch { setResults([]) }
      finally { setIsLoading(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  const handleSelect = (poi) => {
    onSave({ ...fav, address: poi.address || poi.name, lat: poi.lat, lng: poi.lng })
  }

  return (
    <>
      <div className="absolute inset-0 bg-black/30 z-40" onClick={onClose}/>
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white bottom-sheet slide-up max-h-[80vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full"/>
        </div>
        <div className="px-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="text-base font-bold">{fav.icon} {fav.name} 주소 설정</div>
        </div>

        <div className="px-4 pt-3 flex-shrink-0">
          <div className="flex items-center bg-gray-100 rounded-xl px-3 py-2.5">
            <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              autoFocus
              type="text"
              placeholder="주소나 장소명 검색"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="bg-transparent flex-1 text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 pb-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-tmap-blue border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : results.length > 0 ? results.map(poi => (
            <button
              key={poi.id}
              onClick={() => handleSelect(poi)}
              className="w-full flex items-center gap-3 py-3 border-b border-gray-50 active:bg-gray-50"
            >
              <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                </svg>
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-semibold text-gray-900">{poi.name}</div>
                <div className="text-xs text-gray-400 truncate">{poi.address}</div>
              </div>
            </button>
          )) : query.length > 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">검색 결과가 없어요</div>
          ) : null}
        </div>
      </div>
    </>
  )
}
