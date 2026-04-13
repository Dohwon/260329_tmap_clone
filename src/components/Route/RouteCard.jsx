import React from 'react'
import { CONGESTION_INFO } from '../../data/mockData'
import useAppStore from '../../store/appStore'

export function formatEta(minutes) {
  if (!minutes) return '--'
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`
}

function formatRouteSpeedMetric(route) {
  const maxSpeed = Number(route.maxSpeedLimit)
  const avgSpeed = Number(route.averageSpeed)
  const hasMax = Number.isFinite(maxSpeed) && maxSpeed > 0
  const hasAvg = Number.isFinite(avgSpeed) && avgSpeed > 0

  if (hasMax && hasAvg) return `${maxSpeed}/${avgSpeed}`
  if (hasAvg) return `--/${avgSpeed}`
  if (hasMax) return `${maxSpeed}/--`
  return '실값없음'
}

export default function RouteCard({ route, isSelected, onClick }) {
  const congestion = CONGESTION_INFO[route.congestionScore]
  const { setRoutePanelMode, setSelectedRouteId } = useAppStore()

  const handleViewOnMap = (e) => {
    e.stopPropagation()
    setSelectedRouteId(route.id)
    setRoutePanelMode('peek')
  }

  const tagColors = {
    blue:   'bg-tmap-blue text-white',
    green:  'bg-tmap-green text-white',
    orange: 'bg-tmap-orange text-white',
  }

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl p-4 text-left transition-all active:scale-[0.98] ${
        isSelected ? 'route-card-active' : 'route-card-inactive'
      }`}
    >
      {/* 헤더 행 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-gray-900">{route.title}</span>
          {isSelected && route.tag && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tagColors[route.tagColor]}`}>
              {route.tag}
            </span>
          )}
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {route.source === 'live' ? 'TMAP 실시간' : '시뮬레이션'}
          </span>
        </div>
        {isSelected && (
          <div className="w-5 h-5 rounded-full bg-tmap-blue flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
          </div>
        )}
      </div>

      {/* 한 줄 설명 */}
      <div className="text-xs text-gray-500 mb-3">{route.explanation}</div>

      {/* 주요 지표 행 */}
      <div className="flex items-center gap-3 mb-3">
        <div>
          <span className="text-2xl font-black text-gray-900">{formatEta(route.eta)}</span>
        </div>
        <div className="text-sm text-gray-400">·</div>
        <div className="text-sm text-gray-600 font-medium">{Number(route.distance).toFixed(2)}km</div>
        <div className="text-sm text-gray-400">·</div>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ color: congestion.color, background: congestion.bg }}
        >
          {congestion.label}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          route.difficultyColor === 'red'
            ? 'bg-red-50 text-red-500'
            : route.difficultyColor === 'orange'
              ? 'bg-orange-50 text-orange-500'
              : 'bg-green-50 text-green-600'
        }`}>
          {route.difficultyLabel}
        </span>
      </div>

      {/* 도로 구성 바 */}
      <div className="mb-3">
        <div className="flex rounded-full overflow-hidden h-2">
          <div
            className="bg-tmap-blue transition-all"
            style={{ width: `${route.highwayRatio}%` }}
          />
          <div
            className="bg-tmap-green transition-all"
            style={{ width: `${route.nationalRoadRatio}%` }}
          />
        </div>
        <div className="flex gap-3 mt-1">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-tmap-blue"/>
            <span className="text-xs text-gray-400">고속 {route.highwayRatio}%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-tmap-green"/>
            <span className="text-xs text-gray-400">국도 {route.nationalRoadRatio}%</span>
          </div>
        </div>
      </div>

      {/* 세부 지표 그리드 */}
      <div className="grid grid-cols-4 gap-2">
        <MetricBadge icon="🔀" value={route.mergeCount} label="합류" />
        <MetricBadge icon="📷" value={route.fixedCameraCount} label="고정" color={route.fixedCameraCount > 3 ? 'red' : 'gray'} />
        <MetricBadge icon="🚧" value={route.sectionCameraCount} label="구간" color={route.sectionCameraCount > 0 ? 'orange' : 'gray'} />
        <MetricBadge icon="⚡" value={formatRouteSpeedMetric(route)} label="최고/평균" />
      </div>

      {/* 구간단속 있을 때 */}
      {route.sectionEnforcementDistance > 0 && (
        <div className="mt-2 flex items-center gap-1.5 bg-orange-50 rounded-lg px-3 py-1.5">
          <span className="text-xs">🚧</span>
          <span className="text-xs text-orange-600 font-medium">
            구간단속 {route.sectionEnforcementDistance}km 포함
          </span>
        </div>
      )}

      {/* 지도에서 보기 버튼 */}
      {isSelected && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={handleViewOnMap}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-50 border border-tmap-blue/20 active:bg-blue-100 transition-all"
          >
            <svg className="w-4 h-4 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
            </svg>
            <span className="text-sm font-semibold text-tmap-blue">이 경로로 보기</span>
          </button>
        </div>
      )}
    </button>
  )
}

function MetricBadge({ icon, value, label, color = 'gray' }) {
  const colors = {
    gray:   'text-gray-600',
    red:    'text-tmap-red',
    orange: 'text-tmap-orange',
  }
  return (
    <div className="flex flex-col items-center bg-gray-50 rounded-xl py-2">
      <div className="text-sm mb-0.5">{icon}</div>
      <div className={`text-sm font-bold ${colors[color]}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}
