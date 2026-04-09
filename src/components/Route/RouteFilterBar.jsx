import React from 'react'
import useAppStore from '../../store/appStore'

const ROAD_TYPES = [
  { key: 'highway_only', label: '고속도로만' },
  { key: 'mixed',        label: '고속+국도' },
  { key: 'national_road', label: '국도선호' },
]

export default function RouteFilterBar() {
  const { routePreferences, setRoutePreference } = useAppStore()

  return (
    <div className="flex flex-col gap-3">
      {/* 도로 타입 */}
      <div className="flex gap-2">
        {ROAD_TYPES.map(rt => {
          const active = routePreferences.roadType === rt.key
          return (
            <button
              key={rt.key}
              onClick={() => setRoutePreference('roadType', rt.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                active
                  ? 'bg-blue-50 border-tmap-blue text-tmap-blue'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              {rt.label}
            </button>
          )
        })}
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
