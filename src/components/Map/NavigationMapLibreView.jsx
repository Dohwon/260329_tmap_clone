import React, { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import useAppStore from '../../store/appStore'
import { fetchRouteCorridor } from '../../services/tmapService'
import {
  buildRemainingRoutePolyline,
  getNavigationCameraRestoreDelay,
  getCurrentRouteSegment,
  getGuideLineMeta,
  resolveNavigationCameraMode,
  getGuidancePriority,
  getNavigationCameraState,
  getUpcomingGuidanceList,
  haversineM,
  shouldUseRawRoutePolyline,
} from '../../utils/navigationLogic'
import { validateRouteForNavigation } from '../../utils/routingGuards'

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

const MANUAL_RECENTER_DELAY_MS = 6000
const NORTH_UP_RESTORE_DELAY_MS = 250

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

function mapFeatureCollection(collection, extraProperties = {}, idPrefix = 'feature') {
  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return { type: 'FeatureCollection', features: [] }
  }

  return {
    type: 'FeatureCollection',
    features: collection.features
      .filter((feature) => feature?.geometry)
      .map((feature, index) => ({
        ...feature,
        id: feature.id ?? `${idPrefix}-${index}`,
        properties: {
          ...(feature.properties ?? {}),
          ...extraProperties,
        },
      })),
  }
}

function buildGuideOverlayCollections({
  guidance,
  guideLineMeta,
  corridorData,
  driverFocusSegments = [],
  activeSegmentPath = [],
}) {
  if (!guidance || !guideLineMeta) {
    return {
      guideRouteCollection: { type: 'FeatureCollection', features: [] },
      guideMainlineCollection: { type: 'FeatureCollection', features: [] },
    }
  }

  const remainingDistanceKm = Number(guidance?.remainingDistanceKm)
  if (!Number.isFinite(remainingDistanceKm) || remainingDistanceKm > 0.9) {
    return {
      guideRouteCollection: { type: 'FeatureCollection', features: [] },
      guideMainlineCollection: { type: 'FeatureCollection', features: [] },
    }
  }

  const connectorCollection = corridorData?.layers?.connector
  const laneCenterCollection = corridorData?.layers?.laneCenter
  const hasConnector = Array.isArray(connectorCollection?.features) && connectorCollection.features.length > 0
  const hasLaneCenter = Array.isArray(laneCenterCollection?.features) && laneCenterCollection.features.length > 0

  const guideRouteCollection = hasConnector
    ? mapFeatureCollection(connectorCollection, { guideColor: guideLineMeta.color, role: 'guide-route' }, 'guide-route')
    : {
        type: 'FeatureCollection',
        features: driverFocusSegments
          .slice(0, 2)
          .map((segment, index) => buildLineFeature(`guide-route-${segment.id ?? index}`, segment.positions, {
            guideColor: guideLineMeta.color,
            role: 'guide-route',
          }))
          .filter(Boolean),
      }

  const guideMainlineCollection = hasLaneCenter
    ? mapFeatureCollection(laneCenterCollection, { guideColor: '#E5E7EB', role: 'guide-mainline' }, 'guide-mainline')
    : {
        type: 'FeatureCollection',
        features: activeSegmentPath.length > 1
          ? [buildLineFeature('guide-mainline-active', activeSegmentPath, {
              guideColor: '#E5E7EB',
              role: 'guide-mainline',
            })].filter(Boolean)
          : [],
      }

  return { guideRouteCollection, guideMainlineCollection }
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

function getNavOffset(cameraState = {}) {
  const offsetY = Number(cameraState?.lookAheadOffsetY)
  if (Number.isFinite(offsetY)) return [0, offsetY]
  return [0, -420]
}

function getNorthUpCamera(guidanceLocation, mapZoom = 17.4) {
  return {
    center: [guidanceLocation.lng, guidanceLocation.lat],
    zoom: Math.max(16.6, Math.min(18.4, Number(mapZoom) || 17.4)),
    bearing: 0,
    pitch: 0,
    offset: [0, 0],
    duration: 280,
  }
}

function normalizeBearingDeg(value = 0) {
  return ((Number(value) % 360) + 360) % 360
}

function shouldApplyCamera(lastCamera, nextCamera, thresholdM = 8) {
  if (!lastCamera || !nextCamera) return true
  const [lastLng, lastLat] = lastCamera.center ?? []
  const [nextLng, nextLat] = nextCamera.center ?? []
  if (
    !Number.isFinite(lastLat) || !Number.isFinite(lastLng) ||
    !Number.isFinite(nextLat) || !Number.isFinite(nextLng)
  ) {
    return true
  }

  const movedM = haversineM(lastLat, lastLng, nextLat, nextLng)
  const zoomDiff = Math.abs(Number(lastCamera.zoom ?? 0) - Number(nextCamera.zoom ?? 0))
  const pitchDiff = Math.abs(Number(lastCamera.pitch ?? 0) - Number(nextCamera.pitch ?? 0))
  const bearingDiff = Math.abs(getHeadingDelta(
    normalizeBearingDeg(nextCamera.bearing ?? 0),
    normalizeBearingDeg(lastCamera.bearing ?? 0)
  ))
  const offsetXDiff = Math.abs(Number(lastCamera.offset?.[0] ?? 0) - Number(nextCamera.offset?.[0] ?? 0))
  const offsetYDiff = Math.abs(Number(lastCamera.offset?.[1] ?? 0) - Number(nextCamera.offset?.[1] ?? 0))

  return (
    movedM >= thresholdM ||
    zoomDiff >= 0.08 ||
    pitchDiff >= 1.5 ||
    bearingDiff >= 3 ||
    offsetXDiff >= 8 ||
    offsetYDiff >= 8
  )
}

export default function NavigationMapLibreView({ darkMode = false }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const loadedRef = useRef(false)
  const currentMarkerRef = useRef(null)
  const suppressInteractionRef = useRef(false)
  const suppressTimerRef = useRef(null)
  const manualRestoreTimerRef = useRef(null)
  const lastCameraRef = useRef(null)
  const smoothedHeadingRef = useRef(0)
  const lastPreviewFitRouteIdRef = useRef(null)
  const [corridorData, setCorridorData] = useState(null)
  const [cameraMode, setCameraMode] = useState('nav')

  const {
    mapCenter,
    mapZoom,
    routes,
    selectedRouteId,
    driveRouteSnapshot,
    userLocation,
    locationHistory,
    drivePathHistory,
    navigationMatchedLocation,
    navigationProgressKm,
    mergeOptions,
    navAutoFollow,
    setNavAutoFollow,
    isNavigating,
    showRoutePanel,
    settings,
    safetyHazards,
    destination,
    routeOrigin,
  } = useAppStore()

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? driveRouteSnapshot ?? null
  const routeValidity = useMemo(() => validateRouteForNavigation(selectedRoute, null), [selectedRoute])
  const safeRoute = routeValidity.ok ? routeValidity.route : null
  const otherRoutes = useMemo(
    () => routes.filter((route) => route.id !== selectedRouteId),
    [routes, selectedRouteId]
  )
  const guidanceLocation = navigationMatchedLocation ?? userLocation
  const currentRouteSegment = useMemo(
    () => getCurrentRouteSegment(safeRoute, guidanceLocation),
    [guidanceLocation, safeRoute]
  )
  const currentGuidance = useMemo(
    () => getGuidancePriority(safeRoute, guidanceLocation, mergeOptions).nextAction ?? null,
    [guidanceLocation, mergeOptions, safeRoute]
  )
  const guideLineMeta = useMemo(() => getGuideLineMeta(currentGuidance), [currentGuidance])
  const currentSegmentIndex = useMemo(() => {
    if (!safeRoute?.segmentStats?.length || !currentRouteSegment?.id) return -1
    return safeRoute.segmentStats.findIndex((segment) => segment.id === currentRouteSegment.id)
  }, [currentRouteSegment?.id, safeRoute?.segmentStats])
  const driverFocusSegments = useMemo(() => {
    if (!isNavigating) return []
    const segments = safeRoute?.segmentStats ?? []
    if (segments.length === 0) return []
    const startIndex = Math.max(0, currentSegmentIndex)
    return segments
      .slice(startIndex, startIndex + 3)
      .filter((segment) => Array.isArray(segment?.positions) && segment.positions.length > 1)
  }, [currentSegmentIndex, safeRoute?.segmentStats])
  const remainingRoutePath = useMemo(() => {
    if (!safeRoute) return []
    if (!isNavigating) {
      return Array.isArray(safeRoute.polyline) ? safeRoute.polyline : []
    }
    const trimmed = buildRemainingRoutePolyline(
      safeRoute,
      navigationProgressKm,
      navigationMatchedLocation ?? userLocation,
      { recentHistory: drivePathHistory }
    )
    if (trimmed.length < 2) return trimmed
    return shouldUseRawRoutePolyline(safeRoute) ? trimmed : trimmed
  }, [navigationMatchedLocation, navigationProgressKm, safeRoute, userLocation])
  const activeSegmentPath = useMemo(() => {
    const positions = currentRouteSegment?.positions
    if (!Array.isArray(positions) || positions.length < 2) return []
    return positions
  }, [currentRouteSegment])
  const upcomingDriverGuidance = useMemo(() => {
    if (!safeRoute || !guidanceLocation) return []
    return getUpcomingGuidanceList(safeRoute, guidanceLocation, mergeOptions, 4)
      .filter((item) =>
        Number.isFinite(Number(item?.lat)) &&
        Number.isFinite(Number(item?.lng)) &&
        Number(item?.remainingDistanceKm) <= 2.5
      )
  }, [guidanceLocation, mergeOptions, safeRoute])
  const cameraState = useMemo(() => getNavigationCameraState(currentGuidance), [
    currentGuidance?.id,
    currentGuidance?.remainingDistanceKm,
    currentGuidance?.turnType,
  ])
  const effectiveCameraMode = useMemo(() => (
    resolveNavigationCameraMode({
      isNavigating,
      showRoutePanel,
      navAutoFollow,
      cameraMode,
    })
  ), [cameraMode, isNavigating, navAutoFollow, showRoutePanel])
  const shouldShowRecenterButton = isNavigating && effectiveCameraMode === 'manual'
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
    features: (safeRoute?.cameras ?? [])
      .filter((camera) => Array.isArray(camera?.coord) && camera.coord.length >= 2)
      .filter((camera) => !guidanceLocation || haversineM(guidanceLocation.lat, guidanceLocation.lng, camera.coord[0], camera.coord[1]) <= 2500)
      .slice(0, 12)
      .map((camera) => buildPointFeature(`camera-${camera.id}`, camera.coord, { type: camera.type ?? 'fixed' }))
      .filter(Boolean),
  }), [guidanceLocation, safeRoute?.cameras])

  const otherRoutesCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: !isNavigating
      ? otherRoutes
        .map((route) => buildLineFeature(`preview-route-${route.id}`, route.polyline, {
          color: buildRouteSegmentColor(route?.highwayRatio >= 50 ? 'highway' : route?.nationalRoadRatio >= 40 ? 'national' : 'local'),
        }))
        .filter(Boolean)
      : [],
  }), [isNavigating, otherRoutes])

  const destinationCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: destination
      ? [buildPointFeature('destination-point', [destination.lat, destination.lng], { type: 'destination' })].filter(Boolean)
      : [],
  }), [destination])

  const originCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: !isNavigating && routeOrigin
      ? [buildPointFeature('origin-point', [routeOrigin.lat, routeOrigin.lng], { type: 'origin' })].filter(Boolean)
      : [],
  }), [isNavigating, routeOrigin])

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
  const { guideRouteCollection, guideMainlineCollection } = useMemo(() => (
    buildGuideOverlayCollections({
      guidance: currentGuidance,
      guideLineMeta,
      corridorData,
      driverFocusSegments,
      activeSegmentPath,
    })
  ), [activeSegmentPath, corridorData, currentGuidance, driverFocusSegments, guideLineMeta])

  useEffect(() => {
    if (!safeRoute?.id || !Array.isArray(safeRoute?.polyline) || safeRoute.polyline.length < 2) {
      setCorridorData(null)
      return
    }

    let cancelled = false
    fetchRouteCorridor({
      routeId: safeRoute.id,
      polyline: safeRoute.polyline,
      segmentStats: safeRoute.segmentStats ?? [],
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
  }, [corridorProgressBucket, navigationProgressKm, safeRoute?.id, safeRoute?.polyline, safeRoute?.segmentStats])

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
      upsertGeoJsonSource(map, 'preview-routes', otherRoutesCollection)
      upsertGeoJsonSource(map, 'active-route', activeCollection)
      upsertGeoJsonSource(map, 'focus-route', focusCollection)
      upsertGeoJsonSource(map, 'drive-history', historyCollection)
      upsertGeoJsonSource(map, 'camera-points', cameraCollection)
      upsertGeoJsonSource(map, 'guidance-points', guidanceCollection)
      upsertGeoJsonSource(map, 'hazard-points', hazardCollection)
      upsertGeoJsonSource(map, 'destination-point', destinationCollection)
      upsertGeoJsonSource(map, 'origin-point', originCollection)
      upsertGeoJsonSource(map, 'corridor-boundary', corridorBoundaryCollection)
      upsertGeoJsonSource(map, 'corridor-ramp', corridorRampCollection)
      upsertGeoJsonSource(map, 'corridor-connector', corridorConnectorCollection)
      upsertGeoJsonSource(map, 'corridor-lane-center', corridorLaneCenterCollection)
      upsertGeoJsonSource(map, 'guide-mainline', guideMainlineCollection)
      upsertGeoJsonSource(map, 'guide-route', guideRouteCollection)

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
      ensureLineLayer(map, 'preview-routes-line', 'preview-routes', {
        'line-color': ['coalesce', ['get', 'color'], COLORS.routeLocal],
        'line-width': 4,
        'line-opacity': 0.28,
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
      ensureLineLayer(map, 'guide-mainline-line', 'guide-mainline', {
        'line-color': ['coalesce', ['get', 'guideColor'], '#E5E7EB'],
        'line-width': 8,
        'line-opacity': 0.72,
      })
      ensureLineLayer(map, 'guide-mainline-dash', 'guide-mainline', {
        'line-color': '#94A3B8',
        'line-width': 3,
        'line-opacity': 0.64,
        'line-dasharray': [1.1, 1.5],
      })
      ensureLineLayer(map, 'guide-route-outline', 'guide-route', {
        'line-color': '#0F172A',
        'line-width': 14,
        'line-opacity': 0.34,
      })
      ensureLineLayer(map, 'guide-route-line', 'guide-route', {
        'line-color': ['coalesce', ['get', 'guideColor'], COLORS.navigationGuide],
        'line-width': 10,
        'line-opacity': 0.98,
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
      ensureCircleLayer(map, 'destination-point-layer', 'destination-point', {
        'circle-radius': 8,
        'circle-color': '#0064FF',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
      })
      ensureCircleLayer(map, 'origin-point-layer', 'origin-point', {
        'circle-radius': 7,
        'circle-color': '#111827',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
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
      if (manualRestoreTimerRef.current) window.clearTimeout(manualRestoreTimerRef.current)
      setCameraMode('manual')
      if (useAppStore.getState().navAutoFollow) setNavAutoFollow(false)
    })
    map.on('zoomstart', () => {
      if (!isNavigating || suppressInteractionRef.current) return
      if (manualRestoreTimerRef.current) window.clearTimeout(manualRestoreTimerRef.current)
      setCameraMode('manual')
      if (useAppStore.getState().navAutoFollow) setNavAutoFollow(false)
    })

    const markerEl = buildCurrentMarkerElement()
    currentMarkerRef.current = new maplibregl.Marker({ element: markerEl, anchor: 'center' })
      .setLngLat(Array.isArray(mapCenter) ? [mapCenter[1], mapCenter[0]] : [126.978, 37.5665])
      .addTo(map)

    mapRef.current = map

    return () => {
      if (suppressTimerRef.current) window.clearTimeout(suppressTimerRef.current)
      if (manualRestoreTimerRef.current) window.clearTimeout(manualRestoreTimerRef.current)
      currentMarkerRef.current?.remove()
      currentMarkerRef.current = null
      loadedRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isNavigating) {
      setCameraMode('north-up')
      lastCameraRef.current = null
      if (manualRestoreTimerRef.current) window.clearTimeout(manualRestoreTimerRef.current)
      return
    }
    if (showRoutePanel) {
      setCameraMode('north-up')
      return
    }
    if (manualRestoreTimerRef.current) window.clearTimeout(manualRestoreTimerRef.current)
    const restoreDelayMs = getNavigationCameraRestoreDelay({
      cameraMode,
      isNavigating,
      navAutoFollow,
      showRoutePanel,
      manualDelayMs: MANUAL_RECENTER_DELAY_MS,
      northUpDelayMs: NORTH_UP_RESTORE_DELAY_MS,
    })
    if (restoreDelayMs != null) {
      manualRestoreTimerRef.current = window.setTimeout(() => {
        setCameraMode('nav')
        setNavAutoFollow(true)
      }, restoreDelayMs)
    }
    return () => {
      if (manualRestoreTimerRef.current) window.clearTimeout(manualRestoreTimerRef.current)
    }
  }, [cameraMode, isNavigating, navAutoFollow, setNavAutoFollow, showRoutePanel])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    upsertGeoJsonSource(map, 'remaining-route', routeCollection)
    upsertGeoJsonSource(map, 'preview-routes', otherRoutesCollection)
    upsertGeoJsonSource(map, 'active-route', activeCollection)
    upsertGeoJsonSource(map, 'focus-route', focusCollection)
    upsertGeoJsonSource(map, 'drive-history', historyCollection)
    upsertGeoJsonSource(map, 'camera-points', cameraCollection)
    upsertGeoJsonSource(map, 'guidance-points', guidanceCollection)
    upsertGeoJsonSource(map, 'hazard-points', hazardCollection)
    upsertGeoJsonSource(map, 'destination-point', destinationCollection)
    upsertGeoJsonSource(map, 'origin-point', originCollection)
    upsertGeoJsonSource(map, 'corridor-boundary', corridorBoundaryCollection)
    upsertGeoJsonSource(map, 'corridor-ramp', corridorRampCollection)
    upsertGeoJsonSource(map, 'corridor-connector', corridorConnectorCollection)
    upsertGeoJsonSource(map, 'corridor-lane-center', corridorLaneCenterCollection)
    upsertGeoJsonSource(map, 'guide-mainline', guideMainlineCollection)
    upsertGeoJsonSource(map, 'guide-route', guideRouteCollection)
  }, [
    activeCollection,
    cameraCollection,
    corridorBoundaryCollection,
    corridorConnectorCollection,
    corridorLaneCenterCollection,
    corridorRampCollection,
    destinationCollection,
    focusCollection,
    guideMainlineCollection,
    guideRouteCollection,
    guidanceCollection,
    hazardCollection,
    historyCollection,
    originCollection,
    otherRoutesCollection,
    routeCollection,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current || isNavigating || !safeRoute?.id) return
    if (!Array.isArray(safeRoute.polyline) || safeRoute.polyline.length < 2) return
    if (lastPreviewFitRouteIdRef.current === safeRoute.id) return

    const bounds = safeRoute.polyline.reduce((acc, point) => {
      if (!Array.isArray(point) || point.length < 2) return acc
      return acc.extend([point[1], point[0]])
    }, new maplibregl.LngLatBounds(
      [safeRoute.polyline[0][1], safeRoute.polyline[0][0]],
      [safeRoute.polyline[0][1], safeRoute.polyline[0][0]]
    ))

    lastPreviewFitRouteIdRef.current = safeRoute.id
    map.fitBounds(bounds, {
      padding: { top: 120, right: 40, bottom: 260, left: 40 },
      duration: 0,
      essential: true,
    })
  }, [isNavigating, safeRoute?.id, safeRoute?.polyline])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current || !currentMarkerRef.current || !guidanceLocation) return

    const nextHeading = getRouteLookAheadHeading(
      safeRoute,
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

    if (effectiveCameraMode === 'manual') return

    const nextCamera = effectiveCameraMode === 'north-up'
      ? getNorthUpCamera(guidanceLocation, mapZoom)
      : {
          center: [guidanceLocation.lng, guidanceLocation.lat],
          zoom: cameraState.zoom,
          bearing: smoothedHeading,
          pitch: getNavPitch(cameraState.mode),
          offset: getNavOffset(cameraState),
          duration: Math.max(180, Math.round(Number(cameraState.viewDuration ?? 0.28) * 1000)),
        }

    const thresholdM = effectiveCameraMode === 'north-up'
      ? 14
      : Number(cameraState.recenterThresholdM ?? 8)
    if (!shouldApplyCamera(lastCameraRef.current, nextCamera, thresholdM)) return

    suppressInteractionRef.current = true
    if (suppressTimerRef.current) window.clearTimeout(suppressTimerRef.current)
    suppressTimerRef.current = window.setTimeout(() => {
      suppressInteractionRef.current = false
    }, 240)
    lastCameraRef.current = nextCamera

    map.easeTo({
      center: nextCamera.center,
      zoom: nextCamera.zoom,
      bearing: nextCamera.bearing,
      pitch: nextCamera.pitch,
      offset: nextCamera.offset,
      duration: nextCamera.duration,
      essential: true,
    })
  }, [
    cameraMode,
    cameraState.mode,
    cameraState.recenterThresholdM,
    cameraState.viewDuration,
    cameraState.zoom,
    effectiveCameraMode,
    guidanceLocation,
    locationHistory,
    mapZoom,
    navAutoFollow,
    safeRoute,
    showRoutePanel,
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

  if (!safeRoute && isNavigating) {
    return (
      <div className="absolute inset-0 bg-[#D8E4DE] flex items-center justify-center">
        <div className="rounded-3xl bg-white/95 shadow-xl border border-gray-200 px-5 py-4 text-center max-w-xs">
          <div className="text-sm font-bold text-red-500">안내 경로 복구 중</div>
          <div className="text-xs text-gray-600 mt-2">
            유효한 경로를 다시 확인하고 있습니다. 잠시 후 미리보기로 복귀합니다.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      {shouldShowRecenterButton && (
        <button
          onClick={() => {
            lastCameraRef.current = null
            setCameraMode('nav')
            setNavAutoFollow(true)
          }}
          className="absolute right-4 bottom-36 z-20 rounded-full bg-white/96 border border-slate-200 px-3 py-2 shadow-lg text-[12px] font-bold text-slate-800 active:bg-slate-50"
        >
          운전자 시점 복귀
        </button>
      )}
    </div>
  )
}
