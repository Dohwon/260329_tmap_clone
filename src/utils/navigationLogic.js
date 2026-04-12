export function ensureLiveRouteSource(route) {
  if (!route) return route
  return { ...route, source: route.source ?? 'live' }
}

export function shouldUseRawRoutePolyline(route) {
  return route?.source === 'live'
}

export function isUsableLiveRoute(route) {
  return route?.source === 'live' && Array.isArray(route?.polyline) && route.polyline.length > 1
}

export function normalizeSearchOption(option) {
  const raw = String(option ?? '0').trim()
  return /^\d+$/.test(raw) ? String(Number(raw)) : raw
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

  if (ab2 === 0) {
    return { ratio: 0, distanceM: Math.hypot(px - ax, py - ay) }
  }

  const apx = px - ax
  const apy = py - ay
  const ratio = Math.min(1, Math.max(0, (apx * abx + apy * aby) / ab2))
  const closestX = ax + (abx * ratio)
  const closestY = ay + (aby * ratio)
  return {
    ratio,
    distanceM: Math.hypot(px - closestX, py - closestY),
  }
}

export function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function analyzeRouteProgress(route, userLocation) {
  const polyline = route?.polyline ?? []
  if (!userLocation || polyline.length < 2) {
    return {
      progressKm: 0,
      remainingKm: route?.distance ?? 0,
      distanceToRouteM: null,
    }
  }

  let travelledM = 0
  let bestDistanceM = Infinity
  let bestProgressKm = 0

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]
    const end = polyline[index + 1]
    const segmentLengthM = haversineM(start[0], start[1], end[0], end[1])
    const projection = projectPointToSegment([userLocation.lat, userLocation.lng], start, end)

    if (projection.distanceM < bestDistanceM) {
      bestDistanceM = projection.distanceM
      bestProgressKm = (travelledM + (segmentLengthM * projection.ratio)) / 1000
    }
    travelledM += segmentLengthM
  }

  return {
    progressKm: bestProgressKm,
    remainingKm: Math.max(0, (route?.distance ?? 0) - bestProgressKm),
    distanceToRouteM: Number.isFinite(bestDistanceM) ? bestDistanceM : null,
  }
}

export function formatGuidanceDistance(distanceKm) {
  if (distanceKm == null) return '--'
  if (distanceKm < 1) return `${Math.max(10, Math.round((distanceKm * 1000) / 10) * 10)}m`
  return `${distanceKm.toFixed(distanceKm >= 10 ? 0 : 1)}km`
}

export function getTurnInstruction(turnType) {
  const t = Number(turnType)
  if (t === 12) return '좌회전'
  if (t === 13) return '우회전'
  if (t === 14) return '유턴'
  if (t === 16) return '좌측으로 합류'
  if (t === 17) return '우측으로 합류'
  if (t === 18) return '좌측 분기'
  if (t === 19) return '우측 분기'
  if (t >= 100) return '우측 진출'
  return '직진'
}

export function getGuidanceInstruction(guidance) {
  const text = String(guidance?.instructionText ?? guidance?.description ?? '').trim()

  if (text.includes('좌회전')) return '좌회전'
  if (text.includes('우회전')) return '우회전'
  if (text.includes('유턴')) return '유턴'
  if (text.includes('좌측으로 합류')) return '좌측으로 합류'
  if (text.includes('우측으로 합류')) return '우측으로 합류'
  if (text.includes('좌측 분기')) return '좌측 분기'
  if (text.includes('우측 분기')) return '우측 분기'
  if (text.includes('왼쪽 방향')) return '좌측 방향'
  if (text.includes('오른쪽 방향')) return '우측 방향'
  if (text.includes('도시고속도로 입구')) return '도시고속도로 진입'
  if (text.includes('도시고속도로 출구')) return '도시고속도로 진출'
  if (text.includes('지하차도')) return '지하차도 진입'
  if (text.includes('고가차도')) return '고가차도 진입'
  if (text.includes('터널')) return '터널 진입'

  return getTurnInstruction(guidance?.turnType)
}

export function getRemainingEta(route, remainingKm) {
  if (!route?.eta) return null
  const baseDistance = Math.max(route.distance ?? 0, 0.1)
  const nextRemainingKm = remainingKm ?? route.distance ?? 0
  return Math.max(1, Math.ceil(route.eta * (nextRemainingKm / baseDistance)))
}

export function getUpcomingJunction(route, userLocation) {
  const progress = analyzeRouteProgress(route, userLocation)
  const maneuvers = (route?.maneuvers ?? [])
    .map((maneuver) => ({
      ...maneuver,
      remainingDistanceKm: Math.max(0, (maneuver.distanceFromStart ?? 0) - progress.progressKm),
    }))
    .filter((maneuver) => maneuver.remainingDistanceKm > 0.02)
  const junctions = (route?.junctions ?? [])
    .map((junction) => ({
      ...junction,
      remainingDistanceKm: Math.max(0, (junction.distanceFromStart ?? 0) - progress.progressKm),
    }))
    .filter((junction) => junction.remainingDistanceKm > 0.03)

  return {
    progress,
    nextManeuver: maneuvers[0] ?? null,
    nextJunction: junctions[0] ?? null,
  }
}

export function getUpcomingMergeOptions(mergeOptions, progressKm) {
  return (mergeOptions ?? [])
    .map((option) => ({
      ...option,
      remainingDistanceKm: Math.max(0, (option.distanceFromCurrent ?? 0) - progressKm),
    }))
    .filter((option) => option.isCurrent || option.remainingDistanceKm > 0.03)
}
