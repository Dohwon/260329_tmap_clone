function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function normalizeCoordPair(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return null
  const lat = Number(coord[0])
  const lng = Number(coord[1])
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null
}

function sanitizePolyline(polyline = []) {
  return (polyline ?? [])
    .map((point) => normalizeCoordPair(point))
    .filter(Boolean)
}

function getPolylineDistanceKm(polyline = []) {
  if (!Array.isArray(polyline) || polyline.length < 2) return 0
  let total = 0
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]
    const end = polyline[index + 1]
    total += haversineKm(start[0], start[1], end[0], end[1])
  }
  return Number(total.toFixed(2))
}

function sanitizeRoutePointEntries(entries = [], { allowDistanceOnly = false } = {}) {
  return (entries ?? [])
    .map((entry) => {
      const coord = normalizeCoordPair(entry?.coord)
      const lat = Number(entry?.lat ?? coord?.[0])
      const lng = Number(entry?.lng ?? coord?.[1])
      const distanceFromStart = Number(entry?.distanceFromStart)
      const remainingDistanceKm = Number(entry?.remainingDistanceKm)
      const hasCoord = Number.isFinite(lat) && Number.isFinite(lng)
      if (!hasCoord && !allowDistanceOnly) return null
      if (!hasCoord && allowDistanceOnly && !Number.isFinite(distanceFromStart) && !Number.isFinite(remainingDistanceKm)) return null
      return {
        ...entry,
        lat: hasCoord ? lat : null,
        lng: hasCoord ? lng : null,
        coord: hasCoord ? [lat, lng] : null,
        distanceFromStart: Number.isFinite(distanceFromStart) ? distanceFromStart : null,
        remainingDistanceKm: Number.isFinite(remainingDistanceKm) ? remainingDistanceKm : null,
      }
    })
    .filter(Boolean)
}

export function buildScenicAnchorSeeds(suggestion) {
  if (!suggestion) return []
  const viaPoints = Array.isArray(suggestion.viaPoints) ? suggestion.viaPoints : []
  const entrySeed = viaPoints[0]
    ? {
        id: `${suggestion.id}-entry`,
        role: 'entry',
        name: viaPoints[0].name ?? `${suggestion.name} 진입`,
        address: viaPoints[0].address ?? suggestion.roadLabel ?? suggestion.name,
        lat: viaPoints[0].lat,
        lng: viaPoints[0].lng,
      }
    : (Array.isArray(suggestion.segmentStart) && suggestion.segmentStart.length >= 2
      ? {
          id: `${suggestion.id}-entry`,
          role: 'entry',
          name: `${suggestion.name} 진입`,
          address: suggestion.roadLabel ?? suggestion.name,
          lat: suggestion.segmentStart[0],
          lng: suggestion.segmentStart[1],
        }
      : null)
  const exitSeed = viaPoints.length > 1
    ? {
        id: `${suggestion.id}-exit`,
        role: 'exit',
        name: viaPoints[viaPoints.length - 1].name ?? `${suggestion.name} 진출`,
        address: viaPoints[viaPoints.length - 1].address ?? suggestion.roadLabel ?? suggestion.name,
        lat: viaPoints[viaPoints.length - 1].lat,
        lng: viaPoints[viaPoints.length - 1].lng,
      }
    : (Array.isArray(suggestion.segmentEnd) && suggestion.segmentEnd.length >= 2
      ? {
          id: `${suggestion.id}-exit`,
          role: 'exit',
          name: `${suggestion.name} 진출`,
          address: suggestion.roadLabel ?? suggestion.name,
          lat: suggestion.segmentEnd[0],
          lng: suggestion.segmentEnd[1],
        }
      : null)

  return [entrySeed, exitSeed]
    .filter(Boolean)
    .filter((seed) => Number.isFinite(seed.lat) && Number.isFinite(seed.lng))
}

export function validateRouteForNavigation(route, userLocation = null) {
  const polyline = sanitizePolyline(route?.polyline)
  if (!(route?.source === 'live' || route?.source === 'recorded')) {
    return { ok: false, reason: '실시간 경로 소스가 아닙니다.' }
  }
  if (polyline.length < 2) {
    return { ok: false, reason: '경로 선형 데이터가 부족합니다.' }
  }

  const polylineDistanceKm = getPolylineDistanceKm(polyline)
  if (!Number.isFinite(polylineDistanceKm) || polylineDistanceKm < 0.05) {
    return { ok: false, reason: '경로 길이가 비정상입니다.' }
  }

  const declaredDistanceKm = Number(route?.distance)
  if (
    Number.isFinite(declaredDistanceKm) &&
    declaredDistanceKm > 0 &&
    polylineDistanceKm > Math.max(2, declaredDistanceKm * 4)
  ) {
    return { ok: false, reason: '경로 거리와 폴리라인 길이가 크게 어긋납니다.' }
  }

  if (userLocation) {
    const start = polyline[0]
    if (Array.isArray(start) && haversineKm(userLocation.lat, userLocation.lng, start[0], start[1]) > 8) {
      return { ok: false, reason: '출발지와 현재 위치가 너무 멀어 안내를 시작할 수 없습니다.' }
    }
  }

  return {
    ok: true,
    route: {
      ...route,
      polyline,
      maneuvers: sanitizeRoutePointEntries(route?.maneuvers, { allowDistanceOnly: true }),
      junctions: sanitizeRoutePointEntries(route?.junctions, { allowDistanceOnly: true }),
      cameras: sanitizeRoutePointEntries(route?.cameras).map((camera) => ({
        ...camera,
        endCoord: normalizeCoordPair(camera.endCoord),
      })),
    },
  }
}
