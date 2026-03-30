import React, { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import useAppStore from '../../store/appStore'
import { MOCK_SPEED_CAMERAS } from '../../data/mockData'

// Leaflet 기본 아이콘 fix
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const cameraIcon = (type) => L.divIcon({
  className: '',
  html: `<div style="
    width:32px;height:32px;border-radius:50%;
    background:${type === 'section_start' || type === 'section_end' ? '#FF6B00' : '#FF3B30'};
    display:flex;align-items:center;justify-content:center;
    color:white;font-size:13px;font-weight:800;
    box-shadow:0 2px 6px rgba(0,0,0,0.25);
    border:2px solid white;
  ">📷</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

const destIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:36px;height:36px;border-radius:50% 50% 50% 0;
    background:#0064FF;
    transform:rotate(-45deg);
    border:3px solid white;
    box-shadow:0 3px 10px rgba(0,100,255,0.4);
  "></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
})

// 지도 중심 이동 컴포넌트
function MapController() {
  const map = useMap()
  const mapCenter = useAppStore(s => s.mapCenter)
  const mapZoom = useAppStore(s => s.mapZoom)
  useEffect(() => {
    if (mapCenter && mapCenter[0] && mapCenter[1]) {
      map.setView(mapCenter, mapZoom, { animate: true, duration: 0.8 })
    }
  }, [mapCenter[0], mapCenter[1], mapZoom])
  return null
}

export default function MapView() {
  const { routes, selectedRouteId, destination, visibleLayers, userLocation } = useAppStore()

  const selectedRoute = routes.find(r => r.id === selectedRouteId)
  const otherRoutes = routes.filter(r => r.id !== selectedRouteId)

  return (
    <MapContainer
      center={[37.5665, 126.9780]}
      zoom={13}
      zoomControl={false}
      attributionControl={true}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <MapController />

      {/* 대안 경로 (회색) */}
      {otherRoutes.map(route => (
        <Polyline
          key={route.id}
          positions={route.polyline}
          pathOptions={{ color: '#C7C7CC', weight: 5, opacity: 0.6 }}
        />
      ))}

      {/* 선택 경로 (파란색) */}
      {selectedRoute && (
        <Polyline
          positions={selectedRoute.polyline}
          pathOptions={{ color: '#0064FF', weight: 7, opacity: 1 }}
        />
      )}

      {/* 과속 카메라 */}
      {visibleLayers.speedCameras && MOCK_SPEED_CAMERAS.map(cam => (
        <Marker key={cam.id} position={[cam.lat, cam.lng]} icon={cameraIcon(cam.type)}>
          <Popup>
            <div className="text-sm font-bold">{cam.label} {cam.speedLimit}km/h</div>
            {cam.sectionLength && <div className="text-xs text-gray-500">구간 {cam.sectionLength}km</div>}
          </Popup>
        </Marker>
      ))}

      {/* 구간단속 오버레이 */}
      {visibleLayers.sectionEnforcement && MOCK_SPEED_CAMERAS
        .filter(c => c.type === 'section_start')
        .map(cam => (
          <Circle
            key={`zone-${cam.id}`}
            center={[cam.lat, cam.lng]}
            radius={cam.sectionLength * 500}
            pathOptions={{ color: '#FF6B00', fillColor: '#FF6B00', fillOpacity: 0.06, weight: 2, dashArray: '6 4' }}
          />
        ))
      }

      {/* 내 위치 마커 */}
      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={L.divIcon({
            className: '',
            html: `<div style="
              width:20px;height:20px;border-radius:50%;
              background:#0064FF;border:3px solid white;
              box-shadow:0 0 0 4px rgba(0,100,255,0.25);
            "/>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          })}
        />
      )}

      {/* 목적지 마커 */}
      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={destIcon}>
          <Popup>{destination.name}</Popup>
        </Marker>
      )}
    </MapContainer>
  )
}
