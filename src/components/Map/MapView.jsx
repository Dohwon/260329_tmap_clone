import React, { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import useAppStore from '../../store/appStore'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const COLORS = {
  selectedRoute: '#0064FF',
  secondaryRoute: '#AEB7C6',
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

const currentLocationIcon = makeBadgeIcon({ text: '●', background: '#0064FF', size: 22 })
const fixedCameraIcon = makeBadgeIcon({ text: '단', background: COLORS.fixedCamera })
const sectionStartIcon = makeBadgeIcon({ text: '구', background: COLORS.sectionCamera })
const sectionEndIcon = makeBadgeIcon({ text: '끝', background: COLORS.sectionCamera, size: 30 })
const restStopIcon = makeBadgeIcon({ text: '휴', background: COLORS.restStop })
const drowsyIcon = makeBadgeIcon({ text: '쉼', background: COLORS.restStop, size: 30 })
const startIcon = makeBadgeIcon({ text: '시', background: '#111827' })
const endIcon = makeBadgeIcon({ text: '종', background: '#2563EB' })
const junctionIcon = makeBadgeIcon({ text: '분', background: '#FF6B00', size: 26 })

function MapController({ center, zoom }) {
  const map = useMap()

  useEffect(() => {
    if (Array.isArray(center) && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
      map.setView(center, zoom, { animate: true, duration: 0.8 })
    }
  }, [map, center, zoom])

  return null
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

function buildSpeedMarkers(segments) {
  return segments.map((segment) => ({
    id: `${segment.id}-speed`,
    center: segment.center,
    label: `${segment.speedLimit}/${segment.averageSpeed}`,
  }))
}

function getCongestionColor(score) {
  if (score === 3) return COLORS.congestion3
  if (score === 2) return COLORS.congestion2
  return COLORS.congestion1
}

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

  const tileUrl = darkMode
    ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'

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
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
      />
      <MapController center={mapCenter} zoom={mapZoom} />

      {locationHistory.length > 1 && (
        <Polyline
          positions={locationHistory}
          pathOptions={{ color: '#5AC8FA', weight: 4, opacity: 0.35, dashArray: '10 8' }}
        />
      )}

      {selectedRoad && (
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
            </Popup>
          </Marker>

          <Marker position={selectedRoad.endCoord} icon={endIcon}>
            <Popup autoClose={false} closeOnClick={false}>
              <div className="text-sm font-bold">{selectedRoad.name} 종점</div>
              <div className="text-xs text-gray-700 mt-0.5">{selectedRoad.endName}</div>
              {selectedRoad.endAddress && (
                <div className="text-xs text-gray-500 mt-0.5">{selectedRoad.endAddress}</div>
              )}
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

          {visibleLayers.speedCameras && selectedRoad.cameras.map((camera) => (
            <Marker
              key={camera.id}
              position={camera.coord}
              icon={camera.type === 'fixed'
                ? fixedCameraIcon
                : camera.type === 'section_end'
                  ? sectionEndIcon
                  : sectionStartIcon}
            >
              <Popup>
                <div className="text-sm font-bold">{camera.label}</div>
                <div className="text-xs text-gray-500">제한 {camera.speedLimit}km/h</div>
                {camera.sectionLength && <div className="text-xs text-gray-500">구간 {camera.sectionLength}km</div>}
              </Popup>
            </Marker>
          ))}

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
              </Popup>
            </Marker>
          ))}

          {visibleLayers.speedLimits && roadSpeedMarkers.map((marker) => (
            <Marker
              key={marker.id}
              position={marker.center}
              icon={makeBadgeIcon({ text: marker.label, background: COLORS.speedLimit, size: 42 })}
            />
          ))}
        </>
      )}

      {otherRoutes.map((route) => (
        <Polyline
          key={route.id}
          positions={smoothPath(route.polyline, 0.1)}
          pathOptions={{ color: COLORS.secondaryRoute, weight: 5, opacity: 0.68 }}
        />
      ))}

      {selectedRoute && (
        <>
          <Polyline
            positions={smoothPath(selectedRoute.polyline, 0.1)}
            pathOptions={{ color: COLORS.selectedRoute, weight: 7, opacity: 0.94 }}
          />

          {visibleLayers.congestion && (selectedRoute.segmentStats ?? []).map((segment) => (
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
          {visibleLayers.mergePoints && (selectedRoute.junctions ?? []).map((jct) => (
            <Marker key={jct.id} position={[jct.lat, jct.lng]} icon={junctionIcon}>
              <Popup>
                <div className="text-sm font-bold">{jct.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {jct.afterRoadType === 'highway' ? '고속도로' : '국도'} · 출발 후 {jct.distanceFromStart}km
                </div>
              </Popup>
            </Marker>
          ))}
        </>
      )}

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
