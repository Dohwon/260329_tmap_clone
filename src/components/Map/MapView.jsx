import React, { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import useAppStore from '../../store/appStore'
import { HIGHWAYS } from '../../data/highwayData'
import { shouldUseRawRoutePolyline } from '../../utils/navigationLogic'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const COLORS = {
  selectedRoute: '#0064FF',
  navigationGuide: '#FF4FD8',
  secondaryRoute: '#AEB7C6',
  routeHighway: '#2563EB',
  routeNational: '#16A34A',
  routeLocal: '#F97316',
  routeJunction: '#F59E0B',
  fixedCamera: '#FF3B30',
  sectionCamera: '#FF3B30',
  restStop: '#008800',
  congestion1: '#00A84F',
  congestion2: '#FF9500',
  congestion3: '#FF3B30',
  speedLimit: '#1C1C1E',
}

const destIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:34px;height:34px;border-radius:50% 50% 50% 0;
    background:#0064FF;transform:rotate(-45deg);
    border:3px solid white;box-shadow:0 6px 14px rgba(0,100,255,0.35);
  "></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
})

function makeBadgeIcon({ text, background, size = 28, color = '#fff', border = '#fff' }) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:999px;background:${background};
      color:${color};display:flex;align-items:center;justify-content:center;
      font-size:${Math.max(10, size / 2.4)}px;font-weight:800;border:2px solid ${border};
      box-shadow:0 2px 8px rgba(0,0,0,0.22);
    ">${text}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function makeCurrentLocationIcon(heading = 0) {
  const rotation = Number.isFinite(heading) ? heading : 0
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
      <div style="
        position:absolute;width:28px;height:28px;border-radius:999px;background:rgba(0,100,255,0.14);
        border:2px solid rgba(255,255,255,0.7);
      "></div>
      <div style="
        width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:18px solid #0064FF;
        transform:rotate(${rotation}deg);transform-origin:50% 75%;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.28));
      "></div>
      <div style="
        position:absolute;width:8px;height:8px;border-radius:999px;background:#fff;border:2px solid #0064FF;
      "></div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}
const fixedCameraIcon = makeBadgeIcon({ text: '단', background: COLORS.fixedCamera })
const sectionStartIcon = makeBadgeIcon({ text: '구', background: COLORS.sectionCamera })
const sectionEndIcon = makeBadgeIcon({ text: '끝', background: COLORS.sectionCamera, size: 30 })
const restStopIcon = makeBadgeIcon({ text: '휴', background: COLORS.restStop })
const drowsyIcon = makeBadgeIcon({ text: '쉼', background: COLORS.restStop, size: 30 })
const startIcon = makeBadgeIcon({ text: '시', background: '#111827' })
const endIcon = makeBadgeIcon({ text: '종', background: '#2563EB' })
const junctionIcon = makeBadgeIcon({ text: '분', background: '#FF6B00', size: 26 })
const schoolZoneIcon = makeBadgeIcon({ text: '30', background: '#F59E0B', size: 30 })
const speedBumpIcon = makeBadgeIcon({ text: '턱', background: '#0EA5E9', size: 30 })

function getLookAheadCenter(map, location, zoom = 19, enabled = true) {
  if (!location) return null
  const latLng = L.latLng(location.lat, location.lng)
  if (!enabled) return latLng
  const projected = map.project(latLng, zoom)
  return map.unproject(projected.add([0, -300]), zoom)
}

function MapController({ center, zoom, darkMode, minimalMap }) {
  const isNavigating = useAppStore((s) => s.isNavigating)
  const navAutoFollow = useAppStore((s) => s.navAutoFollow)
  const setNavAutoFollow = useAppStore((s) => s.setNavAutoFollow)
  const userLocation = useAppStore((s) => s.userLocation)
  const settings = useAppStore((s) => s.settings)

  // 드래그만 auto-follow 해제 (zoomstart는 setView/panTo 프로그래밍 호출도 발생시키므로 제외)
  const map = useMapEvents({
    dragstart: () => { if (isNavigating) setNavAutoFollow(false) },
  })

  // 안내 시작 시 내 위치로 강제 포커스 (스토어에서 직접 읽어 stale closure 방지)
  useEffect(() => {
    if (!isNavigating) return
    const freshLoc = useAppStore.getState().userLocation
    const target = freshLoc
      ? getLookAheadCenter(map, freshLoc, 19, settings.navigationLookAhead)
      : (Array.isArray(center) ? center : null)
    if (target) map.setView(target, 19, { animate: true, duration: 0.45 })
    // 시작 시 자동추적 활성화
    useAppStore.getState().setNavAutoFollow(true)
  }, [isNavigating, settings.navigationLookAhead]) // eslint-disable-line react-hooks/exhaustive-deps

  // 연속 auto-follow: 내비 시작 직후에는 확대 수준을 유지하고, 이후에는 부드럽게 중심만 이동
  useEffect(() => {
    if (!isNavigating || !navAutoFollow || !userLocation) return
    const target = getLookAheadCenter(map, userLocation, 19, settings.navigationLookAhead) ?? L.latLng(userLocation.lat, userLocation.lng)
    const centerDistance = map.distance(map.getCenter(), target)
    if (map.getZoom() < 19 || centerDistance > 35) {
      map.setView(target, Math.max(19, map.getZoom()), { animate: true, duration: 0.28 })
      return
    }
    map.panTo(target, { animate: true, duration: 0.22 })
  }, [userLocation, navAutoFollow, isNavigating, settings.navigationLookAhead]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tilePane = map.getPane('tilePane')
    if (!tilePane) return
    if (darkMode) {
      tilePane.style.filter = 'grayscale(0.35) saturate(0.55) brightness(0.48) contrast(1.08)'
      tilePane.style.opacity = '0.96'
      return
    }
    if (isNavigating && minimalMap) {
      tilePane.style.filter = 'grayscale(0.72) saturate(0.45) brightness(0.88)'
      tilePane.style.opacity = '0.78'
      return
    }
    tilePane.style.filter = 'none'
    tilePane.style.opacity = '1'
  }, [darkMode, isNavigating, map, minimalMap])

  // 일반 지도 이동 (안내 중에는 무시)
  useEffect(() => {
    if (isNavigating) return
    if (Array.isArray(center) && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
      map.setView(center, zoom, { animate: true, duration: 0.8 })
    }
  }, [center, zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function buildNearbyRoadCameras(userLocation) {
  if (!userLocation) return []

  return HIGHWAYS.flatMap((road) => {
    const points = [road.startCoord, ...road.majorJunctions.map((junction) => junction.coord), road.endCoord]
    return points.slice(1).map((coord, index) => {
      const previous = points[index]
      const mid = [(previous[0] + coord[0]) / 2, (previous[1] + coord[1]) / 2]
      const speedLimit = road.id === 'sejongPocheon' ? 110 : 100
      return {
        id: `${road.id}-nearby-cam-${index}`,
        coord: mid,
        type: 'fixed',
        label: `${road.shortName} 지점단속`,
        speedLimit,
        distanceM: haversineM(userLocation.lat, userLocation.lng, mid[0], mid[1]),
      }
    })
  })
    .filter((camera) => camera.distanceM <= 8000)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 10)
}

function smoothPath(positions, curvature = 0.18) {
  if (!Array.isArray(positions) || positions.length < 2) return positions ?? []

  const next = [positions[0]]
  for (let index = 0; index < positions.length - 1; index += 1) {
    const [lat1, lng1] = positions[index]
    const [lat2, lng2] = positions[index + 1]
    const dx = lng2 - lng1
    const dy = lat2 - lat1
    const bend = ((index % 2 === 0 ? 1 : -1) * curvature) / Math.max(1, positions.length - 1)

    next.push(
      [lat1 + dy * 0.25 - dx * bend, lng1 + dx * 0.25 + dy * bend],
      [lat1 + dy * 0.5, lng1 + dx * 0.5],
      [lat1 + dy * 0.75 + dx * bend, lng1 + dx * 0.75 - dy * bend],
      [lat2, lng2]
    )
  }
  return next
}

// 제한속도가 바뀌는 첫 지점에서만 마커 표시 (같은 제한속도 연속 구간은 첫 구간만)
function buildSpeedMarkers(segments) {
  const markers = []
  let prevLimit = null
  for (const segment of segments) {
    if (segment.speedLimit !== prevLimit) {
      markers.push({
        id: `${segment.id}-speed`,
        center: segment.center,
        label: `${segment.speedLimit}`,
      })
      prevLimit = segment.speedLimit
    }
  }
  return markers
}

function getCongestionColor(score) {
  if (score === 3) return COLORS.congestion3
  if (score === 2) return COLORS.congestion2
  return COLORS.congestion1
}

function getRouteSegmentColor(roadType) {
  if (roadType === 'highway') return COLORS.routeHighway
  if (roadType === 'national') return COLORS.routeNational
  if (roadType === 'local') return COLORS.routeLocal
  if (roadType === 'junction') return COLORS.routeJunction
  return COLORS.selectedRoute
}

function getRoutePath(route, curvature = 0.1) {
  if (!route?.polyline) return []
  return shouldUseRawRoutePolyline(route) ? route.polyline : smoothPath(route.polyline, curvature)
}

const reportedOffIcon = makeBadgeIcon({ text: '끔', background: '#F59E0B', size: 28 })
const reportedFakeIcon = makeBadgeIcon({ text: '없음', background: '#EF4444', size: 32 })

export default function MapView({ darkMode = false }) {
  const {
    mapCenter,
    mapZoom,
    routes,
    selectedRouteId,
    destination,
    visibleLayers,
    userLocation,
    userAddress,
    locationHistory,
    selectedRoadId,
    getSelectedRoadDetail,
    cameraReports,
    searchRoute,
    isNavigating,
    settings,
    safetyHazards,
  } = useAppStore()

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null
  const otherRoutes = routes.filter((route) => route.id !== selectedRouteId)
  const selectedRoad = selectedRoadId ? getSelectedRoadDetail() : null

  const routeSpeedMarkers = useMemo(
    () => (selectedRoute ? buildSpeedMarkers(selectedRoute.segmentStats ?? []) : []),
    [selectedRoute]
  )
  const roadSpeedMarkers = useMemo(
    () => (selectedRoad ? buildSpeedMarkers(selectedRoad.congestionSegments ?? []) : []),
    [selectedRoad]
  )
  const nearbyRoadCameras = useMemo(
    () => buildNearbyRoadCameras(userLocation),
    [userLocation]
  )
  const currentLocationIcon = useMemo(
    () => makeCurrentLocationIcon(userLocation?.heading ?? 0),
    [userLocation?.heading]
  )
  const showMinimalNavigationMap = isNavigating && settings.navigationMinimalMap

  // OSM Korea HOT 타일은 현재 유효한 한국어 라벨 베이스맵을 제공한다.
  const tileUrl = 'https://tiles.osm.kr/hot/{z}/{x}/{y}.png'
  const labelUrl = null

  return (
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      zoomControl={false}
      attributionControl
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url={tileUrl}
        attribution='&copy; OpenStreetMap contributors &copy; OSM Korea'
      />
      {labelUrl && (
        <TileLayer
          url={labelUrl}
          attribution=''
          pane="overlayPane"
        />
      )}
      <MapController center={mapCenter} zoom={mapZoom} darkMode={darkMode} minimalMap={showMinimalNavigationMap} />

      {locationHistory.length > 1 && (
        <Polyline
          positions={locationHistory}
          pathOptions={{ color: '#5AC8FA', weight: 4, opacity: 0.35, dashArray: '10 8' }}
        />
      )}

      {selectedRoad && !showMinimalNavigationMap && (
        <>
          <Polyline
            positions={smoothPath(selectedRoad.path, 0.22)}
            pathOptions={{ color: selectedRoad.color, weight: 7, opacity: 0.92 }}
          />

          {visibleLayers.congestion && selectedRoad.congestionSegments.map((segment) => (
            <Polyline
              key={segment.id}
              positions={smoothPath(segment.positions, 0.08)}
              pathOptions={{ color: getCongestionColor(segment.congestionScore), weight: 9, opacity: 0.5 }}
            />
          ))}

          <Marker position={selectedRoad.startCoord} icon={startIcon}>
            <Popup autoClose={false} closeOnClick={false}>
              <div className="text-sm font-bold">{selectedRoad.name} 시점</div>
              <div className="text-xs text-gray-700 mt-0.5">{selectedRoad.startName}</div>
              {selectedRoad.startAddress && (
                <div className="text-xs text-gray-500 mt-0.5">{selectedRoad.startAddress}</div>
              )}
              <button
                onClick={() => {
                  const [lat, lng] = selectedRoad.startCoord
                  searchRoute({ name: selectedRoad.startName, lat, lng, address: selectedRoad.startAddress ?? selectedRoad.startName ?? '' })
                }}
                className="mt-2 w-full py-1.5 rounded-lg bg-tmap-blue text-white text-xs font-bold"
              >
                🚗 여기로 안내
              </button>
            </Popup>
          </Marker>

          <Marker position={selectedRoad.endCoord} icon={endIcon}>
            <Popup autoClose={false} closeOnClick={false}>
              <div className="text-sm font-bold">{selectedRoad.name} 종점</div>
              <div className="text-xs text-gray-700 mt-0.5">{selectedRoad.endName}</div>
              {selectedRoad.endAddress && (
                <div className="text-xs text-gray-500 mt-0.5">{selectedRoad.endAddress}</div>
              )}
              <button
                onClick={() => {
                  const [lat, lng] = selectedRoad.endCoord
                  searchRoute({ name: selectedRoad.endName, lat, lng, address: selectedRoad.endAddress ?? selectedRoad.endName ?? '' })
                }}
                className="mt-2 w-full py-1.5 rounded-lg bg-tmap-blue text-white text-xs font-bold"
              >
                🚗 여기로 안내
              </button>
            </Popup>
          </Marker>

          {visibleLayers.mergePoints && selectedRoad.majorJunctions.map((junction) => (
            <CircleMarker
              key={`${selectedRoad.id}-${junction.name}`}
              center={junction.coord}
              radius={10}
              pathOptions={{ color: '#ffffff', fillColor: '#1C1C1E', fillOpacity: 0.95, weight: 2 }}
            >
              <Popup>
                <div className="text-sm font-bold">{junction.name}</div>
                <div className="text-xs text-gray-500">{selectedRoad.name} {junction.km}km 지점</div>
              </Popup>
            </CircleMarker>
          ))}

          {visibleLayers.speedCameras && selectedRoad.cameras.map((camera) => {
            const report = cameraReports.find(r => r.id === camera.id)
            const icon = report?.type === 'off' ? reportedOffIcon
              : report?.type === 'fake' ? reportedFakeIcon
              : camera.type === 'fixed' ? fixedCameraIcon
              : camera.type === 'section_end' ? sectionEndIcon
              : sectionStartIcon
            return (
              <Marker key={camera.id} position={camera.coord} icon={icon}>
                <Popup>
                  <div className="text-sm font-bold">{camera.label}</div>
                  <div className="text-xs text-gray-500">제한 {camera.speedLimit}km/h</div>
                  {camera.sectionLength && <div className="text-xs text-gray-500">구간 {camera.sectionLength}km</div>}
                  {report && <div className="text-xs text-amber-600 mt-1">신고: {report.type === 'off' ? '꺼진 카메라' : '없는 카메라'}</div>}
                </Popup>
              </Marker>
            )
          })}

          {visibleLayers.sectionEnforcement && selectedRoad.cameras
            .filter((camera) => camera.type === 'section_start')
            .map((camera) => {
              const endCamera = selectedRoad.cameras.find((item) => item.id === camera.id.replace('section-start', 'section-end'))
              if (!endCamera) return null
              return (
                <Polyline
                  key={`${camera.id}-section`}
                  positions={smoothPath([camera.coord, endCamera.coord], 0.03)}
                  pathOptions={{ color: COLORS.sectionCamera, weight: 6, opacity: 0.55, dashArray: '10 8' }}
                />
              )
            })}

          {visibleLayers.restStops && selectedRoad.restStops.map((stop) => (
            <Marker
              key={stop.id}
              position={stop.coord}
              icon={stop.type === 'service' ? restStopIcon : drowsyIcon}
            >
              <Popup>
                <div className="text-sm font-bold">{stop.name}</div>
                <div className="text-xs text-gray-500">{selectedRoad.name} {stop.km}km 지점</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {stop.type === 'service' ? '휴게소' : '졸음쉼터'}
                </div>
                <button
                  onClick={() => {
                    const [lat, lng] = stop.coord
                    searchRoute({ name: stop.name, lat, lng, address: `${selectedRoad.name} ${stop.name}` })
                  }}
                  className="mt-2 w-full py-1.5 rounded-lg bg-tmap-blue text-white text-xs font-bold"
                >
                  🚗 여기로 안내
                </button>
              </Popup>
            </Marker>
          ))}

          {visibleLayers.speedLimits && roadSpeedMarkers.map((marker) => (
            <Marker
              key={marker.id}
              position={marker.center}
              icon={makeBadgeIcon({ text: marker.label, background: COLORS.speedLimit, size: 34 })}
            />
          ))}
        </>
      )}

      {!showMinimalNavigationMap && otherRoutes.map((route) => (
        <Polyline
          key={route.id}
          positions={getRoutePath(route, 0.1)}
          pathOptions={{ color: route.routeColor ?? COLORS.secondaryRoute, weight: 4, opacity: 0.28 }}
        />
      ))}

      {selectedRoute && (
        <>
          {(selectedRoute.segmentStats ?? [])
            .filter((segment) => Array.isArray(segment.positions) && segment.positions.length > 1)
            .map((segment) => (
              <Polyline
                key={`route-segment-${segment.id}`}
                positions={smoothPath(segment.positions, 0.03)}
                pathOptions={{
                  color: getRouteSegmentColor(segment.roadType),
                  weight: showMinimalNavigationMap ? 10 : 8,
                  opacity: isNavigating ? 0.92 : 0.9,
                }}
              />
            ))}

          {isNavigating && (
            <Polyline
              positions={getRoutePath(selectedRoute, 0.1)}
              pathOptions={{ color: COLORS.navigationGuide, weight: showMinimalNavigationMap ? 6 : 5, opacity: 0.98 }}
            />
          )}

          {visibleLayers.congestion && !showMinimalNavigationMap && (selectedRoute.segmentStats ?? []).map((segment) => (
            <Polyline
              key={segment.id}
              positions={smoothPath(segment.positions, 0.03)}
              pathOptions={{ color: getCongestionColor(segment.congestionScore), weight: 8, opacity: 0.55 }}
            />
          ))}

          {visibleLayers.speedLimits && routeSpeedMarkers.map((marker) => (
            <Marker
              key={marker.id}
              position={marker.center}
              icon={makeBadgeIcon({ text: marker.label, background: '#1C1C1E', size: 42 })}
            />
          ))}

          {/* 실제 IC/JC 분기점 마커 */}
          {visibleLayers.mergePoints && !showMinimalNavigationMap && (selectedRoute.junctions ?? []).map((jct) => (
            <Marker key={jct.id} position={[jct.lat, jct.lng]} icon={junctionIcon}>
              <Popup>
                <div className="text-sm font-bold">{jct.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {jct.afterRoadType === 'highway' ? '고속도로' : '국도'} · 출발 후 {jct.distanceFromStart}km
                </div>
              </Popup>
            </Marker>
          ))}

          {/* 경로 과속카메라 (TMAP safetyFacilityList 기반) */}
          {visibleLayers.speedCameras && (selectedRoute.cameras ?? []).map((camera) => {
            const report = cameraReports.find(r => r.id === camera.id)
            const icon = report?.type === 'off' ? reportedOffIcon
              : report?.type === 'fake' ? reportedFakeIcon
              : camera.type === 'fixed' ? fixedCameraIcon
              : camera.type === 'section_end' ? sectionEndIcon
              : sectionStartIcon
            return (
              <Marker key={`route-cam-${camera.id}`} position={camera.coord} icon={icon}>
                <Popup>
                  <div className="text-sm font-bold">{camera.label}</div>
                  <div className="text-xs text-gray-500">제한 {camera.speedLimit}km/h</div>
                  {camera.sectionLength && <div className="text-xs text-gray-500">구간 {camera.sectionLength}km</div>}
                </Popup>
              </Marker>
            )
          })}
        </>
      )}

      {!selectedRoute && !selectedRoad && visibleLayers.speedCameras && nearbyRoadCameras.map((camera) => (
        <Marker key={`nearby-cam-${camera.id}`} position={camera.coord} icon={fixedCameraIcon}>
          <Popup>
            <div className="text-sm font-bold">{camera.label}</div>
            <div className="text-xs text-gray-500">제한 {camera.speedLimit}km/h</div>
            <div className="text-xs text-gray-500">{Math.round(camera.distanceM)}m 거리</div>
          </Popup>
        </Marker>
      ))}

      {settings.safetyModeEnabled && (safetyHazards ?? []).slice(0, 12).map((hazard) => (
        <Marker
          key={`hazard-${hazard.id}`}
          position={[hazard.lat, hazard.lng]}
          icon={hazard.type === 'school_zone' ? schoolZoneIcon : speedBumpIcon}
        >
          <Popup>
            <div className="text-sm font-bold">{hazard.type === 'school_zone' ? '어린이보호구역' : '방지턱 주의'}</div>
            <div className="text-xs text-gray-500">{hazard.name}</div>
            {hazard.address && <div className="text-xs text-gray-400 mt-0.5">{hazard.address}</div>}
          </Popup>
        </Marker>
      ))}

      {/* 신고된 카메라 (전체 지도에 표시) */}
      {cameraReports.map((report) => (
        <Marker
          key={`report-${report.id}`}
          position={report.coord}
          icon={report.type === 'off' ? reportedOffIcon : reportedFakeIcon}
        >
          <Popup>
            <div className="text-sm font-bold">{report.type === 'off' ? '🟡 꺼진 카메라 신고' : '❌ 없는 카메라 신고'}</div>
            <div className="text-xs text-gray-400">{new Date(report.reportedAt).toLocaleDateString('ko-KR')}</div>
          </Popup>
        </Marker>
      ))}

      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={currentLocationIcon}>
          <Popup>
            <div className="text-sm font-bold">내 위치</div>
            {userAddress && <div className="text-xs text-gray-700 mt-0.5">{userAddress}</div>}
            <div className="text-xs text-gray-500 mt-0.5">
              {Math.round(userLocation.speedKmh ?? 0)}km/h · 정확도 {Math.round(userLocation.accuracy ?? 0)}m
            </div>
          </Popup>
        </Marker>
      )}

      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={destIcon}>
          <Popup>
            <div className="text-sm font-bold">{destination.name}</div>
            <div className="text-xs text-gray-500">{destination.address}</div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  )
}
