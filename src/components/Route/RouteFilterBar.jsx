import React from 'react'
import useAppStore from '../../store/appStore'

const ROAD_TYPES = [
  { key: 'highway_only', label: '고속도로만' },
  { key: 'mixed',        label: '고속+국도' },
  { key: 'national_road', label: '국도선호' },
]

export default function RouteFilterBar() {
  const { routePreferences, setRoutePreference, routes, selectedRouteId } = useAppStore()
  const selectedRoute = routes.find(r => r.id === selectedRouteId)

  // 도로 유형 설정이 유의미한지 판단
  // 단거리(30km 미만) 또는 고속비율 낮은 도심 경로에서는 고속도로 유형 설정이 효과 없음
  const isUrbanOrShort = selectedRoute
    ? (selectedRoute.distance < 30 || selectedRoute.highwayRatio < 25)
    : false

  return (
    <div className="flex flex-col gap-3">
      {/* 도로 타입 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          {ROAD_TYPES.map(rt => {
            const active = routePreferences.roadType === rt.key
            return (
              <button
                key={rt.key}
                onClick={() => !isUrbanOrShort && setRoutePreference('roadType', rt.key)}
                disabled={isUrbanOrShort}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  isUrbanOrShort
                    ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                    : active
                      ? 'bg-blue-50 border-tmap-blue text-tmap-blue'
                      : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {rt.label}
              </button>
            )
          })}
        </div>
        {/* 도심/단거리 안내 메시지 */}
        {isUrbanOrShort && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-sm">🏙️</span>
            <div>
              <div className="text-xs font-semibold text-gray-500">도심·단거리 구간</div>
              <div className="text-xs text-gray-400">
                {selectedRoute && selectedRoute.distance < 30
                  ? `${selectedRoute.distance}km 단거리`
                  : '고속도로 비율이 낮은 도심 구간'}에서는 도로 유형 설정이 경로에 반영되지 않습니다.
                초보/중수/고수 성향은 계속 적용됩니다.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 도로 취향 옵션 */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setRoutePreference('includeScenic', !routePreferences.includeScenic)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            routePreferences.includeScenic
              ? 'bg-orange-50 border-tmap-orange text-tmap-orange'
              : 'bg-white border-gray-200 text-gray-400'
          }`}
        >
          🌊 해안도로 선호
        </button>
        <button
          onClick={() => setRoutePreference('includeMountain', !routePreferences.includeMountain)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            routePreferences.includeMountain
              ? 'bg-green-50 border-tmap-green text-tmap-green'
              : 'bg-white border-gray-200 text-gray-400'
          }`}
        >
          🌲 산길도로 선호
        </button>
        <button
          onClick={() => setRoutePreference('allowNarrowRoads', !routePreferences.allowNarrowRoads)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            routePreferences.allowNarrowRoads
              ? 'bg-red-50 border-red-400 text-red-500'
              : 'bg-white border-gray-200 text-gray-400'
          }`}
        >
          🚗 좁은 길 포함
        </button>
      </div>
    </div>
  )
}
