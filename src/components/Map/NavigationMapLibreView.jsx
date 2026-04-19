import React, { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import useAppStore from '../../store/appStore'
import { fetchRouteCorridor } from '../../services/tmapService'
import {
  buildRemainingRoutePolyline,
  getCurrentRouteSegment,
  getGuidancePriority,
  getNavigationCameraState,
  getUpcomingGuidanceList,
  haversineM,
  shouldUseRawRoutePolyline,
} from '../../utils/navigationLogic'

const COLORS = {
  selectedRoute: '#FF89AC',
  navigationGuide: '#FF89AC',
  routeHighway: '#FF89AC',
  routeNational: '#54C7FC',
  routeLocal: '#808080',
  routeJunction: '#B8FFE9',
  fixedCamera: '#FF3B30',
  hazard: '#F59E0B',
  guidance: '#10B981',
}

function getBearingDeg(fromLat, fromLng, toLat, toLng) {
  const fromLatRad = (fromLat * Math.PI) / 180
  const toLatRad = (toLat * Math.PI) / 180
  const deltaLngRad = ((toLng - fromLng) * Math.PI) / 180
  const y = Math.sin(deltaLngRad) * Math.cos(toLatRad)
  const x =
    Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(deltaLngRad)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

function getHeadingDelta(current, previous) {
  return ((current - previous + 540) % 360) - 180
}

function resolveDriverHeading(userLocation, locationHistory = []) {
  const liveHeading = Number(userLocation?.heading)
  if (Number.isFinite(liveHeading) && liveHeading > 0) return liveHeading

  if (Array.isArray(locationHistory) && locationHistory.length >= 2) {
    const from = locationHistory[locationHistory.length - 2]
    const to = locationHistory[locationHistory.length - 1]
    if (Array.isArray(from) && Array.isArray(to)) {
      return getBearingDeg(from[0], from[1], to[0], to[1])
    }
  }

  return 0
}

function buildRasterStyle(tileUrl) {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors &copy; OSM Korea',
      },
    },
    layers: [
      {
        id: 'basemap',
        type: 'raster',
        source: 'basemap',
        paint: {},
      },
    ],
  }
}

function buildLineFeature(id, coordinates = [], properties = {}) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  return {
    type: 'Feature',
    id,
    properties,
    geometry: {
      type: 'LineString',
      coordinates: coordinates
        .filter((point) => Array.isArray(point) && point.length >= 2)
        .map(([lat, lng]) => [lng, lat]),
    },
  }
}

function buildPointFeature(id, coord, properties = {}) {
  if (!Array.isArray(coord) || coord.length < 2) return null
  const lat = Number(coord[0])
  const lng = Number(coord[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    type: 'Feature',
    id,
    properties,
    geometry: {
      type: 'Point',
      coordinates: [lng, lat],
    },
  }
}

function getRouteLookAheadHeading(route, userLocation, fallbackHeading = 0) {
  const polyline = route?.polyline ?? []
  if (!userLocation || polyline.length < 2) return fallbackHeading

  let travelledM = 0
  let bestDistanceM = Infinity
  let bestProgressM = 0

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]
    const end = polyline[index + 1]
    if (!Array.isArray(start) || !Array.isArray(end)) continue
    const segmentLengthM = haversineM(start[0], start[1], end[0], end[1])
    const projection = projectPointToSegment([userLocation.lat, userLocation.lng], start, end)
    if (projection.distanceM < bestDistanceM) {
      bestDistanceM = projection.distanceM
      bestProgressM = travelledM + (segmentLengthM * projection.ratio)
    }
    travelledM += segmentLengthM
  }

  const lookAheadTargetM = bestProgressM + Math.max(110, Math.min(260, (userLocation.speedKmh ?? 0) * 2.4))
  let traversedM = 0

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]
    const end = polyline[index + 1]
    if (!Array.isArray(start) || !Array.isArray(end)) continue
    const segmentLengthM = haversineM(start[0], start[1], end[0], end[1])
    if (traversedM + segmentLengthM >= lookAheadTargetM) {
      const remainM = Math.max(0, lookAheadTargetM - traversedM)
      const ratio = segmentLengthM > 0 ? remainM / segmentLengthM : 0
      const targetLat = start[0] + ((end[0] - start[0]) * ratio)
      const targetLng = start[1] + ((end[1] - start[1]) * ratio)
      return getBearingDeg(userLocation.lat, userLocation.lng, targetLat, targetLng)
    }
    traversedM += segmentLengthM
  }

  const tail = polyline[polyline.length - 1]
  return getBearingDeg(userLocation.lat, userLocation.lng, tail[0], tail[1])
}

function projectPointToSegment(point, start, end) {
  const latFactor = 111320
  const lngFactor = 111320 * Math.cos((((point[0] + start[0] + end[0]) / 3) * Math.PI) / 180)
  const px = point[1] * lngFactor
  const py = point[0] * latFactor
  const ax = start[1] * lngFactor
  const ay = start[0] * latFactor
  const bx = end[1] * lngFactor
  const by = end[0] * latFactor
  const abx = bx - ax
  const aby = by - ay
  const ab2 = abx * abx + aby * aby

  if (ab2 === 0) return { ratio: 0, distanceM: Math.hypot(px - ax, py - ay) }

  const apx = px - ax
  const apy = py - ay
  const ratio = Math.min(1, Math.max(0, (apx * abx + apy * aby) / ab2))
  const closestX = ax + (abx * ratio)
  const closestY = ay + (aby * ratio)
  return { ratio, distanceM: Math.hypot(px - closestX, py - closestY) }
}

function upsertGeoJsonSource(map, id, data) {
  const existing = map.getSource(id)
  if (existing) {
    existing.setData(data)
    return
  }
  map.addSource(id, {
    type: 'geojson',
    data,
  })
}

function ensureLineLayer(map, id, source, paint = {}, layout = {}) {
  if (map.getLayer(id)) return
  map.addLayer({
    id,
    type: 'line',
    source,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
      ...layout,
    },
    paint,
  })
}

function ensureCircleLayer(map, id, source, paint = {}) {
  if (map.getLayer(id)) return
  map.addLayer({
    id,
    type: 'circle',
    source,
    paint,
  })
}

function buildRouteSegmentColor(roadType) {
  if (roadType === 'highway') return COLORS.routeHighway
  if (roadType === 'national') return COLORS.routeNational
  if (roadType === 'local') return COLORS.routeLocal
  if (roadType === 'junction') return COLORS.routeJunction
  return COLORS.selectedRoute
}

function buildCurrentMarkerElement() {
  const el = document.createElement('div')
  el.className = 'maplibre-current-marker'
  el.style.width = '34px'
  el.style.height = '34px'
  el.style.position = 'relative'
  el.innerHTML = `
    <div style="position:absolute;inset:0;border-radius:999px;background:rgba(0,100,255,0.16);border:2px solid rgba(255,255,255,0.7);"></div>
    <div data-arrow style="position:absolute;left:9px;top:3px;width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:20px solid #0064FF;transform-origin:50% 75%;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.28));"></div>
    <div style="position:absolute;left:11px;top:11px;width:8px;height:8px;border-radius:999px;background:#fff;border:2px solid #0064FF;"></div>
  `
  return el
}

function getNavPitch(mode = 'cruise') {
  if (mode === 'confirm') return 58
  if (mode === 'decision') return 55
  if (mode === 'approach') return 50
  if (mode === 'prepare') return 44
  return 40
}

function getNavOffset(mode = 'cruise') {
  if (mode === 'confirm') return [0, 110]
  if (mode === 'decision') return [0, 130]
  if (mode === 'approach') return [0, 160]
  if (mode === 'prepare') return [0, 180]
  return [0, 200]
}

export default function NavigationMapLibreView({ darkMode = false }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const loadedRef = useRef(false)
  const currentMarkerRef = useRef(null)
  const suppressInteractionRef = useRef(false)
  const suppressTimerRef = useRef(null)
  const smoothedHeadingRef = useRef(0)
  const [corridorData, setCorridorData] = useState(null)

  const {
    mapCenter,
    mapZoom,
    routes,
    selectedRouteId,
    userLocation,
    locationHistory,
    drivePathHistory,
    navigationMatchedLocation,
    navigationProgressKm,
    mergeOptions,
    navAutoFollow,
    setNavAutoFollow,
    isNavigating,
    settings,
    safetyHazards,
  } = useAppStore()

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null
  const guidanceLocation = navigationMatchedLocation ?? userLocation
  const currentRouteSegment = useMemo(
    () => getCurrentRouteSegment(selectedRoute, guidanceLocation),
    [guidanceLocation, selectedRoute]
  )
  const currentGuidance = useMemo(
    () => getGuidancePriority(selectedRoute, guidanceLocation, mergeOptions).nextAction ?? null,
    [guidanceLocation, mergeOptions, selectedRoute]
  )
  const currentSegmentIndex = useMemo(() => {
    if (!selectedRoute?.segmentStats?.length || !currentRouteSegment?.id) return -1
    return selectedRoute.segmentStats.findIndex((segment) => segment.id === currentRouteSegment.id)
  }, [currentRouteSegment?.id, selectedRoute?.segmentStats])
  const driverFocusSegments = useMemo(() => {
    const segments = selectedRoute?.segmentStats ?? []
    if (segments.length === 0) return []
    const startIndex = Math.max(0, currentSegmentIndex)
    return segments
      .slice(startIndex, startIndex + 3)
      .filter((segment) => Array.isArray(segment?.positions) && segment.positions.length > 1)
  }, [currentSegmentIndex, selectedRoute?.segmentStats])
  const remainingRoutePath = useMemo(() => {
    if (!selectedRoute) return []
    const trimmed = buildRemainingRoutePolyline(
      selectedRoute,
      navigationProgressKm,
      navigationMatchedLocation ?? userLocation
    )
    if (trimmed.length < 2) return trimmed
    return shouldUseRawRoutePolyline(selectedRoute) ? trimmed : trimmed
  }, [navigationMatchedLocation, navigationProgressKm, selectedRoute, userLocation])
  const activeSegmentPath = useMemo(() => {
    const positions = currentRouteSegment?.positions
    if (!Array.isArray(positions) || positions.length < 2) return []
    return positions
  }, [currentRouteSegment])
  const upcomingDriverGuidance = useMemo(() => {
    if (!selectedRoute || !guidanceLocation) return []
    return getUpcomingGuidanceList(selectedRoute, guidanceLocation, mergeOptions, 4)
      .filter((item) =>
        Number.isFinite(Number(item?.lat)) &&
        Number.isFinite(Number(item?.lng)) &&
        Number(item?.remainingDistanceKm) <= 2.5
      )
  }, [guidanceLocation, mergeOptions, selectedRoute])
  const cameraState = useMemo(() => getNavigationCameraState(currentGuidance), [
    currentGuidance?.id,
    currentGuidance?.remainingDistanceKm,
    currentGuidance?.turnType,
  ])
  const corridorProgressBucket = useMemo(
    () => Number((Number(navigationProgressKm ?? 0) / 0.15).toFixed(0)) || 0,
    [navigationProgressKm]
  )

  const maptilerKey = import.meta.env.VITE_MAPTILER_KEY
  const tileQuery = maptilerKey ? new URLSearchParams({ key: maptilerKey }).toString() : ''
  const tileUrl = maptilerKey
    ? `https://api.maptiler.com/maps/streets-v4-pastel/{z}/{x}/{y}.png?${tileQuery}`
    : 'https://tiles.osm.kr/hot/{z}/{x}/{y}.png'

  const routeCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: remainingRoutePath.length > 1
      ? [buildLineFeature('remaining-route', remainingRoutePath, { color: COLORS.navigationGuide })].filter(Boolean)
      : [],
  }), [remainingRoutePath])

  const activeCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: activeSegmentPath.length > 1
      ? [buildLineFeature('active-segment', activeSegmentPath, { color: '#22D3EE' })].filter(Boolean)
      : [],
  }), [activeSegmentPath])

  const focusCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: driverFocusSegments.slice(1).map((segment, index) => (
      buildLineFeature(`focus-${segment.id}`, segment.positions, {
        color: buildRouteSegmentColor(segment.roadType),
        order: index,
      })
    )).filter(Boolean),
  }), [driverFocusSegments])

  const historyCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: drivePathHistory.length > 1
      ? [buildLineFeature('drive-history', drivePathHistory, { color: '#22D3EE' })].filter(Boolean)
      : [],
  }), [drivePathHistory])

  const cameraCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: (selectedRoute?.cameras ?? [])
      .filter((camera) => Array.isArray(camera?.coord) && camera.coord.length >= 2)
      .filter((camera) => !guidanceLocation || haversineM(guidanceLocation.lat, guidanceLocation.lng, camera.coord[0], camera.coord[1]) <= 2500)
      .slice(0, 12)
      .map((camera) => buildPointFeature(`camera-${camera.id}`, camera.coord, { type: camera.type ?? 'fixed' }))
      .filter(Boolean),
  }), [guidanceLocation, selectedRoute?.cameras])

  const guidanceCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: upcomingDriverGuidance
      .map((guidance, index) => buildPointFeature(
        `guidance-${guidance.id ?? index}`,
        [Number(guidance.lat), Number(guidance.lng)],
        { order: index }
      ))
      .filter(Boolean),
  }), [upcomingDriverGuidance])

  const hazardCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: (safetyHazards ?? [])
      .filter((hazard) => !guidanceLocation || haversineM(guidanceLocation.lat, guidanceLocation.lng, hazard.lat, hazard.lng) <= 1400)
      .slice(0, 8)
      .map((hazard) => buildPointFeature(`hazard-${hazard.id}`, [hazard.lat, hazard.lng], { type: hazard.type ?? 'hazard' }))
      .filter(Boolean),
  }), [guidanceLocation, safetyHazards])

  const corridorLaneCenterCollection = corridorData?.layers?.laneCenter ?? { type: 'FeatureCollection', features: [] }
  const corridorConnectorCollection = corridorData?.layers?.connector ?? { type: 'FeatureCollection', features: [] }
  const corridorRampCollection = corridorData?.layers?.rampShape ?? { type: 'FeatureCollection', features: [] }
  const corridorBoundaryCollection = corridorData?.layers?.roadBoundary ?? { type: 'FeatureCollection', features: [] }

  useEffect(() => {
    if (!selectedRoute?.id || !Array.isArray(selectedRoute?.polyline) || selectedRoute.polyline.length < 2) {
      setCorridorData(null)
      return
    }

    let cancelled = false
    fetchRouteCorridor({
      routeId: selectedRoute.id,
      polyline: selectedRoute.polyline,
      segmentStats: selectedRoute.segmentStats ?? [],
      progressKm: navigationProgressKm ?? 0,
      radiusM: 450,
      includeLayers: ['laneCenter', 'connector', 'rampShape', 'roadBoundary'],
    })
      .then((payload) => {
        if (!cancelled) setCorridorData(payload)
      })
      .catch(() => {
        if (!cancelled) setCorridorData(null)
      })

    return () => {
      cancelled = true
    }
  }, [corridorProgressBucket, navigationProgressKm, selectedRoute?.id, selectedRoute?.polyline, selectedRoute?.segmentStats])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildRasterStyle(tileUrl),
      center: Array.isArray(mapCenter) ? [mapCenter[1], mapCenter[0]] : [126.978, 37.5665],
      zoom: mapZoom,
      attributionControl: true,
      dragRotate: false,
      touchPitch: false,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      loadedRef.current = true
      upsertGeoJsonSource(map, 'remaining-route', routeCollection)
      upsertGeoJsonSource(map, 'active-route', activeCollection)
      upsertGeoJsonSource(map, 'focus-route', focusCollection)
      upsertGeoJsonSource(map, 'drive-history', historyCollection)
      upsertGeoJsonSource(map, 'camera-points', cameraCollection)
      upsertGeoJsonSource(map, 'guidance-points', guidanceCollection)
      upsertGeoJsonSource(map, 'hazard-points', hazardCollection)
      upsertGeoJsonSource(map, 'corridor-boundary', corridorBoundaryCollection)
      upsertGeoJsonSource(map, 'corridor-ramp', corridorRampCollection)
      upsertGeoJsonSource(map, 'corridor-connector', corridorConnectorCollection)
      upsertGeoJsonSource(map, 'corridor-lane-center', corridorLaneCenterCollection)

      ensureLineLayer(map, 'corridor-boundary-line', 'corridor-boundary', {
        'line-color': '#475569',
        'line-width': 2.5,
        'line-opacity': 0.46,
      })
      ensureLineLayer(map, 'corridor-ramp-line', 'corridor-ramp', {
        'line-color': '#94A3B8',
        'line-width': 3,
        'line-opacity': 0.34,
      })
      ensureLineLayer(map, 'corridor-connector-line', 'corridor-connector', {
        'line-color': '#B8FFE9',
        'line-width': 5,
        'line-opacity': 0.52,
      })
      ensureLineLayer(map, 'corridor-lane-center-line', 'corridor-lane-center', {
        'line-color': '#E2E8F0',
        'line-width': 1.6,
        'line-opacity': 0.26,
        'line-dasharray': [1.4, 1.2],
      })
      ensureLineLayer(map, 'drive-history-outline', 'drive-history', {
        'line-color': '#05233B',
        'line-width': 8,
        'line-opacity': 0.55,
      })
      ensureLineLayer(map, 'drive-history-line', 'drive-history', {
        'line-color': '#22D3EE',
        'line-width': 5,
        'line-opacity': 0.96,
      })
      ensureLineLayer(map, 'remaining-route-line', 'remaining-route', {
        'line-color': COLORS.navigationGuide,
        'line-width': 8,
        'line-opacity': 0.97,
      })
      ensureLineLayer(map, 'focus-route-outline', 'focus-route', {
        'line-color': '#0F172A',
        'line-width': 8,
        'line-opacity': 0.2,
      })
      ensureLineLayer(map, 'focus-route-line', 'focus-route', {
        'line-color': ['coalesce', ['get', 'color'], COLORS.selectedRoute],
        'line-width': ['interpolate', ['linear'], ['get', 'order'], 0, 6, 1, 5],
        'line-opacity': ['interpolate', ['linear'], ['get', 'order'], 0, 0.86, 1, 0.62],
      })
      ensureLineLayer(map, 'active-route-outline', 'active-route', {
        'line-color': '#0F172A',
        'line-width': 10,
        'line-opacity': 0.34,
      })
      ensureLineLayer(map, 'active-route-line', 'active-route', {
        'line-color': '#22D3EE',
        'line-width': 7,
        'line-opacity': 0.92,
      })
      ensureCircleLayer(map, 'camera-points-layer', 'camera-points', {
        'circle-radius': 5,
        'circle-color': COLORS.fixedCamera,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      })
      ensureCircleLayer(map, 'guidance-points-layer', 'guidance-points', {
        'circle-radius': ['interpolate', ['linear'], ['get', 'order'], 0, 8, 3, 5],
        'circle-color': '#10B981',
        'circle-opacity': 0.82,
        'circle-stroke-color': '#D1FAE5',
        'circle-stroke-width': 2,
      })
      ensureCircleLayer(map, 'hazard-points-layer', 'hazard-points', {
        'circle-radius': 5,
        'circle-color': COLORS.hazard,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      })

      if (darkMode) {
        map.setPaintProperty('basemap', 'raster-saturation', -0.35)
        map.setPaintProperty('basemap', 'raster-brightness-max', 0.82)
      } else if (settings.navigationMinimalMap) {
        map.setPaintProperty('basemap', 'raster-saturation', -0.72)
        map.setPaintProperty('basemap', 'raster-brightness-max', 0.92)
      }
    })

    map.on('dragstart', () => {
      if (!isNavigating || suppressInteractionRef.current) return
      if (useAppStore.getState().navAutoFollow) setNavAutoFollow(false)
    })
    map.on('zoomstart', () => {
      if (!isNavigating || suppressInteractionRef.current) return
      if (useAppStore.getState().navAutoFollow) setNavAutoFollow(false)
    })

    const markerEl = buildCurrentMarkerElement()
    currentMarkerRef.current = new maplibregl.Marker({ element: markerEl, anchor: 'center' })
      .setLngLat(Array.isArray(mapCenter) ? [mapCenter[1], mapCenter[0]] : [126.978, 37.5665])
      .addTo(map)

    mapRef.current = map

    return () => {
      if (suppressTimerRef.current) window.clearTimeout(suppressTimerRef.current)
      currentMarkerRef.current?.remove()
      currentMarkerRef.current = null
      loadedRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    upsertGeoJsonSource(map, 'remaining-route', routeCollection)
    upsertGeoJsonSource(map, 'active-route', activeCollection)
    upsertGeoJsonSource(map, 'focus-route', focusCollection)
    upsertGeoJsonSource(map, 'drive-history', historyCollection)
    upsertGeoJsonSource(map, 'camera-points', cameraCollection)
    upsertGeoJsonSource(map, 'guidance-points', guidanceCollection)
    upsertGeoJsonSource(map, 'hazard-points', hazardCollection)
    upsertGeoJsonSource(map, 'corridor-boundary', corridorBoundaryCollection)
    upsertGeoJsonSource(map, 'corridor-ramp', corridorRampCollection)
    upsertGeoJsonSource(map, 'corridor-connector', corridorConnectorCollection)
    upsertGeoJsonSource(map, 'corridor-lane-center', corridorLaneCenterCollection)
  }, [
    activeCollection,
    cameraCollection,
    corridorBoundaryCollection,
    corridorConnectorCollection,
    corridorLaneCenterCollection,
    corridorRampCollection,
    focusCollection,
    guidanceCollection,
    hazardCollection,
    historyCollection,
    routeCollection,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current || !currentMarkerRef.current || !guidanceLocation) return

    const nextHeading = getRouteLookAheadHeading(
      selectedRoute,
      guidanceLocation,
      resolveDriverHeading(userLocation, locationHistory)
    )
    const previousHeading = smoothedHeadingRef.current
    const headingDelta = getHeadingDelta(nextHeading, previousHeading)
    const smoothing = Math.abs(headingDelta) >= 30 ? 0.94 : 0.82
    const smoothedHeading = previousHeading + (headingDelta * smoothing)
    smoothedHeadingRef.current = smoothedHeading

    currentMarkerRef.current.setLngLat([guidanceLocation.lng, guidanceLocation.lat])
    const arrow = currentMarkerRef.current.getElement().querySelector('[data-arrow]')
    if (arrow) {
      arrow.style.transform = `rotate(${smoothedHeading}deg)`
    }

    if (!navAutoFollow) return

    suppressInteractionRef.current = true
    if (suppressTimerRef.current) window.clearTimeout(suppressTimerRef.current)
    suppressTimerRef.current = window.setTimeout(() => {
      suppressInteractionRef.current = false
    }, 240)

    map.easeTo({
      center: [guidanceLocation.lng, guidanceLocation.lat],
      zoom: cameraState.zoom,
      bearing: smoothedHeading,
      pitch: getNavPitch(cameraState.mode),
      offset: getNavOffset(cameraState.mode),
      duration: 220,
      essential: true,
    })
  }, [
    cameraState.mode,
    cameraState.zoom,
    guidanceLocation,
    locationHistory,
    navAutoFollow,
    selectedRoute,
    userLocation,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current || !Array.isArray(mapCenter)) return
    if (isNavigating) return
    map.easeTo({
      center: [mapCenter[1], mapCenter[0]],
      zoom: mapZoom,
      duration: 400,
      essential: true,
    })
  }, [isNavigating, mapCenter, mapZoom])

  return <div ref={containerRef} className="absolute inset-0" />
}
