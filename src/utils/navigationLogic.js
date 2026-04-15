export function ensureLiveRouteSource(route) {
  if (!route) return route
  return { ...route, source: route.source ?? 'live' }
}

export function shouldUseRawRoutePolyline(route) {
  return route?.source === 'live' || route?.source === 'recorded'
}

export function isUsableLiveRoute(route) {
  return (route?.source === 'live' || route?.source === 'recorded') && Array.isArray(route?.polyline) && route.polyline.length > 1
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

function toPoint(sample) {
  if (Array.isArray(sample) && sample.length >= 2) {
    const lat = Number(sample[0])
    const lng = Number(sample[1])
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  }

  if (sample && Number.isFinite(Number(sample.lat)) && Number.isFinite(Number(sample.lng))) {
    return {
      lat: Number(sample.lat),
      lng: Number(sample.lng),
    }
  }

  return null
}

function getPolylineDistanceKm(polyline = []) {
  if (!Array.isArray(polyline) || polyline.length < 2) return 0
  let total = 0
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = toPoint(polyline[index])
    const end = toPoint(polyline[index + 1])
    if (!start || !end) continue
    total += haversineM(start.lat, start.lng, end.lat, end.lng) / 1000
  }
  return Number(total.toFixed(2))
}

function getPolylineSliceDistanceKm(polyline = [], startIndex = 0, endIndex = 0) {
  if (!Array.isArray(polyline) || polyline.length < 2) return 0
  let total = 0
  for (let index = startIndex; index < Math.min(endIndex, polyline.length - 1); index += 1) {
    const start = toPoint(polyline[index])
    const end = toPoint(polyline[index + 1])
    if (!start || !end) continue
    total += haversineM(start.lat, start.lng, end.lat, end.lng) / 1000
  }
  return Number(total.toFixed(2))
}

function getDistanceToPolylineM(point, polyline = []) {
  const normalizedPoint = toPoint(point)
  if (!normalizedPoint || !Array.isArray(polyline) || polyline.length < 2) return null

  let bestDistanceM = Infinity
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = toPoint(polyline[index])
    const end = toPoint(polyline[index + 1])
    if (!start || !end) continue

    const projection = projectPointToSegment(
      [normalizedPoint.lat, normalizedPoint.lng],
      [start.lat, start.lng],
      [end.lat, end.lng]
    )
    if (projection.distanceM < bestDistanceM) {
      bestDistanceM = projection.distanceM
    }
  }

  return Number.isFinite(bestDistanceM) ? bestDistanceM : null
}

function getProgressKmOnPolylineForPoint(point, polyline = []) {
  const normalizedPoint = toPoint(point)
  if (!normalizedPoint || !Array.isArray(polyline) || polyline.length < 2) return null

  let travelledM = 0
  let bestDistanceM = Infinity
  let bestProgressKm = null

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = toPoint(polyline[index])
    const end = toPoint(polyline[index + 1])
    if (!start || !end) continue

    const segmentLengthM = haversineM(start.lat, start.lng, end.lat, end.lng)
    const projection = projectPointToSegment(
      [normalizedPoint.lat, normalizedPoint.lng],
      [start.lat, start.lng],
      [end.lat, end.lng]
    )

    if (projection.distanceM < bestDistanceM) {
      bestDistanceM = projection.distanceM
      bestProgressKm = (travelledM + (segmentLengthM * projection.ratio)) / 1000
    }
    travelledM += segmentLengthM
  }

  return bestProgressKm
}

function getNearestJunction(point, junctions = [], maxDistanceM = 700) {
  const normalizedPoint = toPoint(point)
  if (!normalizedPoint || !Array.isArray(junctions) || junctions.length === 0) return null

  const matches = junctions
    .map((junction) => ({
      ...junction,
      distanceM: haversineM(normalizedPoint.lat, normalizedPoint.lng, junction.lat, junction.lng),
    }))
    .filter((junction) => Number.isFinite(junction.distanceM) && junction.distanceM <= maxDistanceM)
    .sort((a, b) => a.distanceM - b.distanceM)

  return matches[0] ?? null
}

function clusterBrakingHotspots(events = [], junctions = []) {
  const hotspots = []

  for (const event of events) {
    const existing = hotspots.find((item) => haversineM(item.lat, item.lng, event.lat, event.lng) <= 120)
    if (existing) {
      existing.count += 1
      existing.maxDecelKmh = Math.max(existing.maxDecelKmh, event.speedDropKmh)
      continue
    }

    const nearestJunction = getNearestJunction(event, junctions, 550)
    hotspots.push({
      id: `brake-${hotspots.length}`,
      lat: event.lat,
      lng: event.lng,
      count: 1,
      maxDecelKmh: event.speedDropKmh,
      label: nearestJunction ? `${nearestJunction.name} 부근 급감속` : '급감속 구간',
    })
  }

  return hotspots
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return b.maxDecelKmh - a.maxDecelKmh
    })
    .slice(0, 3)
}

function normalizeLaneText(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/왼쪽/g, '좌측')
    .replace(/오른쪽/g, '우측')
    .replace(/중앙/g, '가운데')
    .replace(/개 차로/g, '개차로')
    .replace(/차선/g, '차로')
    .trim()
}

function getGuidanceSourcePriority(source = '') {
  if (source === 'maneuver') return 0
  if (source === 'junction') return 1
  if (source === 'merge') return 2
  return 3
}

function getGuidanceActionPriority(candidate = {}) {
  const turnType = Number(candidate?.turnType)
  const text = String(candidate?.instructionText ?? candidate?.description ?? '').trim()

  if (turnType === 14 || /유턴/.test(text)) return 0
  if (turnType === 12 || turnType === 13 || /좌회전|우회전/.test(text)) return 1
  if (
    turnType === 16 || turnType === 17 || turnType === 18 || turnType === 19 ||
    turnType >= 100 ||
    JUNCTION_TURN_TYPES.has(turnType) ||
    /합류|분기|진출|램프|IC|JC/.test(text)
  ) {
    return 2
  }
  if (/지하차도|고가차도|터널/.test(text)) return 3
  if (/도착|목적지/.test(text)) return 4
  if (turnType === 11 || /직진/.test(text)) return 8
  return 5
}

function dedupeGuidanceCandidates(candidates = []) {
  const sorted = [...candidates].sort((a, b) => {
    const distanceGap = (a.remainingDistanceKm ?? Infinity) - (b.remainingDistanceKm ?? Infinity)
    if (Math.abs(distanceGap) <= 0.18) {
      const actionGap = getGuidanceActionPriority(a) - getGuidanceActionPriority(b)
      if (actionGap !== 0) return actionGap
    }
    if (Math.abs(distanceGap) > 0.001) return distanceGap
    const sourceGap = getGuidanceSourcePriority(a.source) - getGuidanceSourcePriority(b.source)
    if (sourceGap !== 0) return sourceGap
    return (a.id ?? '').localeCompare(b.id ?? '')
  })

  return sorted.filter((candidate, index, all) => {
    const duplicate = all.slice(0, index).find((prev) => {
      const distanceClose = Math.abs((prev.remainingDistanceKm ?? Infinity) - (candidate.remainingDistanceKm ?? Infinity)) <= 0.05
      const samePoint =
        Number.isFinite(prev.lat) &&
        Number.isFinite(prev.lng) &&
        Number.isFinite(candidate.lat) &&
        Number.isFinite(candidate.lng) &&
        haversineM(prev.lat, prev.lng, candidate.lat, candidate.lng) <= 80
      return distanceClose || samePoint
    })
    return !duplicate
  })
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

export function analyzeRouteProgress(route, userLocation, options = {}) {
  const polyline = route?.polyline ?? []
  if (!userLocation || polyline.length < 2) {
    return {
      progressKm: 0,
      remainingKm: route?.distance ?? 0,
      distanceToRouteM: null,
      matchedLocation: null,
      matchedSegmentIndex: -1,
    }
  }

  const hintProgressKm = Number(options?.nearProgressKm)
  const progressWindowKm = Number(options?.progressWindowKm)
  const hintSegmentIndex = Number(options?.nearSegmentIndex)
  const segmentWindow = Number(options?.segmentWindow)
  const hasHintProgress = Number.isFinite(hintProgressKm)
  const hasProgressWindow = hasHintProgress && Number.isFinite(progressWindowKm) && progressWindowKm > 0
  const hasHintSegment = Number.isFinite(hintSegmentIndex)
  const hasSegmentWindow = hasHintSegment && Number.isFinite(segmentWindow) && segmentWindow >= 1

  let travelledM = 0
  let bestDistanceM = Infinity
  let bestScore = Infinity
  let bestProgressKm = 0
  let bestMatchedLocation = null
  let bestSegmentIndex = -1

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]
    const end = polyline[index + 1]
    const segmentLengthM = haversineM(start[0], start[1], end[0], end[1])
    const projection = projectPointToSegment([userLocation.lat, userLocation.lng], start, end)
    const candidateProgressKm = (travelledM + (segmentLengthM * projection.ratio)) / 1000
    const segmentPenalty = hasSegmentWindow
      ? Math.max(0, Math.abs(index - hintSegmentIndex) - segmentWindow) * 18
      : 0
    const progressPenalty = hasProgressWindow
      ? Math.max(0, Math.abs(candidateProgressKm - hintProgressKm) - progressWindowKm) * 220
      : 0
    const backwardPenalty = hasHintProgress && candidateProgressKm + 0.06 < hintProgressKm
      ? (hintProgressKm - candidateProgressKm) * 240
      : 0
    const score = projection.distanceM + segmentPenalty + progressPenalty + backwardPenalty

    if (score < bestScore || (Math.abs(score - bestScore) <= 6 && projection.distanceM < bestDistanceM)) {
      bestScore = score
      bestDistanceM = projection.distanceM
      bestProgressKm = candidateProgressKm
      bestMatchedLocation = {
        lat: start[0] + ((end[0] - start[0]) * projection.ratio),
        lng: start[1] + ((end[1] - start[1]) * projection.ratio),
      }
      bestSegmentIndex = index
    }
    travelledM += segmentLengthM
  }

  return {
    progressKm: bestProgressKm,
    remainingKm: Math.max(0, (route?.distance ?? 0) - bestProgressKm),
    distanceToRouteM: Number.isFinite(bestDistanceM) ? bestDistanceM : null,
    matchedLocation: bestMatchedLocation,
    matchedSegmentIndex: bestSegmentIndex,
  }
}

export function buildRemainingRoutePolyline(route, progressKm = 0, matchedLocation = null) {
  const polyline = route?.polyline ?? []
  if (!Array.isArray(polyline) || polyline.length < 2) return polyline ?? []
  if (!Number.isFinite(Number(progressKm)) || Number(progressKm) <= 0) return polyline

  const targetProgressM = Number(progressKm) * 1000
  let travelledM = 0

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = toPoint(polyline[index])
    const end = toPoint(polyline[index + 1])
    if (!start || !end) continue

    const segmentLengthM = haversineM(start.lat, start.lng, end.lat, end.lng)
    const nextTravelledM = travelledM + segmentLengthM

    if (targetProgressM <= nextTravelledM) {
      const remainM = Math.max(0, targetProgressM - travelledM)
      const ratio = segmentLengthM > 0 ? Math.min(1, Math.max(0, remainM / segmentLengthM)) : 0
      const snappedPoint = matchedLocation && Number.isFinite(Number(matchedLocation.lat)) && Number.isFinite(Number(matchedLocation.lng))
        ? [Number(matchedLocation.lat), Number(matchedLocation.lng)]
        : [
            start.lat + ((end.lat - start.lat) * ratio),
            start.lng + ((end.lng - start.lng) * ratio),
          ]
      return [snappedPoint, ...polyline.slice(index + 1)]
    }

    travelledM = nextTravelledM
  }

  const tail = polyline[polyline.length - 1]
  return tail ? [tail] : []
}

export function getCurrentRouteSegment(route, userLocation) {
  const segments = route?.segmentStats ?? []
  if (!userLocation || !Array.isArray(segments) || segments.length === 0) return null

  const routeProgress = analyzeRouteProgress(route, userLocation)
  const progressKm = Number(routeProgress?.progressKm)
  let bestSegment = null
  let bestScore = Infinity

  for (const segment of segments) {
    const positions = segment?.positions ?? []
    if (!Array.isArray(positions) || positions.length < 2) continue

    let bestDistanceM = Infinity
    for (let index = 0; index < positions.length - 1; index += 1) {
      const projection = projectPointToSegment(
        [userLocation.lat, userLocation.lng],
        positions[index],
        positions[index + 1]
      )
      bestDistanceM = Math.min(bestDistanceM, projection.distanceM)
    }

    if (!Number.isFinite(bestDistanceM)) continue

    const startProgressKm = Number(segment?.startProgressKm)
    const endProgressKm = Number(segment?.endProgressKm)
    let score = bestDistanceM

    if (Number.isFinite(progressKm) && Number.isFinite(startProgressKm) && Number.isFinite(endProgressKm)) {
      const progressMarginKm = 0.18
      if (progressKm < startProgressKm - progressMarginKm) {
        score += ((startProgressKm - progressKm) * 1800)
      } else if (progressKm > endProgressKm + progressMarginKm) {
        score += ((progressKm - endProgressKm) * 1800)
      } else {
        score -= Math.min(35, bestDistanceM * 0.15)
      }
    }

    if (score < bestScore) {
      bestScore = score
      bestSegment = {
        ...segment,
        distanceToUserM: bestDistanceM,
        routeProgressKm: Number.isFinite(progressKm) ? progressKm : null,
      }
    }
  }

  return bestSegment
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

export function getLaneGuidance(guidance) {
  const text = normalizeLaneText(guidance?.laneHint ?? guidance?.instructionText ?? guidance?.description ?? '')
  if (!text) return null
  const extcVoiceCode = Number(guidance?.extcVoiceCode ?? guidance?.nExtcVoiceCode)

  if (/직\s*좌|좌\s*직/.test(text)) return '직진 또는 좌회전 차로 이용'
  if (/직\s*우|우\s*직/.test(text)) return '직진 또는 우회전 차로 이용'
  if (/좌회전 전용/.test(text)) return '좌회전 전용 차로 진입'
  if (/우회전 전용/.test(text)) return '우회전 전용 차로 진입'
  if (/버스\s*전용/.test(text)) return text.includes('직좌') ? '버스전용 포함 직진 또는 좌회전 차로 주의' : '버스전용차로 주의'
  if (/가감속|포켓/.test(text)) return '포켓차로 끝나기 전 차로 변경'
  if (extcVoiceCode === 65) return '초록 유도 차로 따라가기'
  if (extcVoiceCode === 66) return '분홍 유도 차로 따라가기'
  if (extcVoiceCode === 67) return '파란 유도 차로 따라가기'
  if (extcVoiceCode === 68) return '노란 유도 차로 따라가기'
  if (extcVoiceCode === 90) return '지정 유도 차로 따라가기'

  const directionLaneCount = text.match(/(좌측|우측|가운데)\s*(\d+)개?차로(?:를)?\s*(이용|준비|진입|유지|이동)/)
  if (directionLaneCount) {
    return `${directionLaneCount[1]} ${directionLaneCount[2]}개 차로 ${directionLaneCount[3]}`
  }

  const directionLaneRange = text.match(/(좌측|우측|가운데)\s*(\d+)\s*(?:~|-)\s*(\d+)차로(?:를)?\s*(이용|준비|진입|유지|이동)/)
  if (directionLaneRange) {
    return `${directionLaneRange[1]} ${directionLaneRange[2]}~${directionLaneRange[3]}차로 ${directionLaneRange[4]}`
  }

  const numberedLaneSnippet = text.match(/(\d+\s*(?:~|-)\s*\d+차로|\d+차로)(?:를)?\s*(이용|준비|진입|유지|이동)/)
  if (numberedLaneSnippet) {
    return `${numberedLaneSnippet[1].replace(/\s+/g, '')} ${numberedLaneSnippet[2]}`
  }

  const laneSnippet = text.match(/(좌측|우측|가운데)[^.,]{0,18}차로(?:를)?\s*(이용|준비|진입|유지|이동)?/)
  if (laneSnippet) {
    return laneSnippet[2]
      ? `${laneSnippet[1]} 차로 ${laneSnippet[2]}`
      : `${laneSnippet[1]} 차로`
  }

  if (text.includes('좌측') && text.includes('유지')) return '좌측 차로 유지'
  if (text.includes('우측') && text.includes('유지')) return '우측 차로 유지'
  if (text.includes('가운데') && text.includes('유지')) return '가운데 차로 유지'

  const turnType = Number(guidance?.turnType)
  if (turnType === 12) return '지금 좌측 차로로 이동 준비'
  if (turnType === 13) return '지금 우측 차로로 이동 준비'
  if (turnType === 16 || turnType === 18) return '좌측 차로 유지'
  if (turnType === 17 || turnType === 19) return '우측 차로 유지'
  if (turnType >= 125 && turnType <= 130) {
    return guidance?.afterRoadType === 'highway'
      ? '분기점 진입 차로 미리 준비'
      : '연결 도로 진입 차로 미리 준비'
  }
  return null
}

export function getNavigationCameraState(guidance) {
  const remainingDistanceKm = Number(guidance?.remainingDistanceKm)

  if (!Number.isFinite(remainingDistanceKm)) {
    return {
      mode: 'cruise',
      zoom: 18.8,
      lookAheadOffsetY: -340,
      recenterThresholdM: 28,
      panDuration: 0.22,
      viewDuration: 0.28,
    }
  }

  if (remainingDistanceKm <= 0.04) {
    return {
      mode: 'confirm',
      zoom: 21.6,
      lookAheadOffsetY: -170,
      recenterThresholdM: 16,
      panDuration: 0.18,
      viewDuration: 0.2,
    }
  }

  if (remainingDistanceKm <= 0.12) {
    return {
      mode: 'decision',
      zoom: 21.1,
      lookAheadOffsetY: -150,
      recenterThresholdM: 20,
      panDuration: 0.2,
      viewDuration: 0.22,
    }
  }

  if (remainingDistanceKm <= 0.35) {
    return {
      mode: 'approach',
      zoom: 20.3,
      lookAheadOffsetY: -120,
      recenterThresholdM: 24,
      panDuration: 0.22,
      viewDuration: 0.25,
    }
  }

  if (remainingDistanceKm <= 0.8) {
    return {
      mode: 'prepare',
      zoom: 19.6,
      lookAheadOffsetY: -90,
      recenterThresholdM: 28,
      panDuration: 0.24,
      viewDuration: 0.28,
    }
  }

  return {
    mode: 'cruise',
    zoom: 18.8,
    lookAheadOffsetY: -60,
    recenterThresholdM: 32,
    panDuration: 0.24,
    viewDuration: 0.3,
  }
}

export function analyzeRecordedDrive(recordedPolyline = [], recordedSamples = [], plannedRoute = {}) {
  const actualPolyline = (recordedPolyline ?? []).map(toPoint).filter(Boolean)
  const plannedPolyline = (plannedRoute?.originalRoutePolyline ?? plannedRoute?.polyline ?? []).map(toPoint).filter(Boolean)
  const junctions = plannedRoute?.junctions ?? []
  const samplePoints = (recordedSamples ?? [])
    .map((sample) => {
      const point = toPoint(sample)
      const capturedAt = sample?.capturedAt ? Date.parse(sample.capturedAt) : null
      const speedKmh = Number(sample?.speedKmh)
      return point ? {
        ...point,
        speedKmh: Number.isFinite(speedKmh) ? speedKmh : null,
        capturedAt,
      } : null
    })
    .filter(Boolean)

  const deviations = []
  if (actualPolyline.length >= 2 && plannedPolyline.length >= 2) {
    let activeCluster = null

    for (let index = 0; index < actualPolyline.length; index += 1) {
      const point = actualPolyline[index]
      const distanceM = getDistanceToPolylineM(point, plannedPolyline)
      const isOffRoute = Number.isFinite(distanceM) && distanceM >= 70
      const isBackOnRoute = Number.isFinite(distanceM) && distanceM <= 45

      if (isOffRoute) {
        if (!activeCluster) {
          activeCluster = {
            startIndex: index,
            endIndex: index,
            maxDistanceM: distanceM,
            points: [point],
          }
        } else {
          activeCluster.endIndex = index
          activeCluster.maxDistanceM = Math.max(activeCluster.maxDistanceM, distanceM)
          activeCluster.points.push(point)
        }
        continue
      }

      if (activeCluster && isBackOnRoute) {
        const lengthKm = getPolylineSliceDistanceKm(actualPolyline, activeCluster.startIndex, activeCluster.endIndex)
        if (lengthKm >= 0.18 || activeCluster.maxDistanceM >= 110) {
          const midpoint = activeCluster.points[Math.floor(activeCluster.points.length / 2)] ?? activeCluster.points[0]
          const nearestJunction = getNearestJunction(midpoint, junctions)
          deviations.push({
            id: `deviation-${deviations.length}`,
            lat: midpoint.lat,
            lng: midpoint.lng,
            distanceM: Math.round(activeCluster.maxDistanceM),
            lengthKm,
            label: nearestJunction ? `${nearestJunction.name} 부근 경로 이탈` : '계획 경로 이탈',
            type: nearestJunction ? 'merge_exit' : 'detour',
            suggestedRoadName: nearestJunction?.afterRoadName ?? null,
          })
        }
        activeCluster = null
      }
    }

    if (activeCluster) {
      const midpoint = activeCluster.points[Math.floor(activeCluster.points.length / 2)] ?? activeCluster.points[0]
      const nearestJunction = getNearestJunction(midpoint, junctions)
      deviations.push({
        id: `deviation-${deviations.length}`,
        lat: midpoint.lat,
        lng: midpoint.lng,
        distanceM: Math.round(activeCluster.maxDistanceM),
        lengthKm: getPolylineSliceDistanceKm(actualPolyline, activeCluster.startIndex, activeCluster.endIndex),
        label: nearestJunction ? `${nearestJunction.name} 부근 경로 이탈` : '계획 경로 이탈',
        type: nearestJunction ? 'merge_exit' : 'detour',
        suggestedRoadName: nearestJunction?.afterRoadName ?? null,
      })
    }
  }

  const brakingEvents = []
  for (let index = 1; index < samplePoints.length; index += 1) {
    const previous = samplePoints[index - 1]
    const current = samplePoints[index]
    const prevSpeed = Number(previous.speedKmh)
    const nextSpeed = Number(current.speedKmh)
    const elapsedSec = previous.capturedAt && current.capturedAt
      ? (current.capturedAt - previous.capturedAt) / 1000
      : null
    const speedDropKmh = prevSpeed - nextSpeed

    if (
      Number.isFinite(prevSpeed) &&
      Number.isFinite(nextSpeed) &&
      Number.isFinite(elapsedSec) &&
      elapsedSec > 0 &&
      elapsedSec <= 12 &&
      speedDropKmh >= 12 &&
      prevSpeed >= 25
    ) {
      brakingEvents.push({
        id: `brake-event-${brakingEvents.length}`,
        lat: current.lat,
        lng: current.lng,
        speedDropKmh: Math.round(speedDropKmh),
        fromSpeedKmh: Math.round(prevSpeed),
        toSpeedKmh: Math.round(nextSpeed),
      })
    }
  }

  const brakingHotspots = clusterBrakingHotspots(brakingEvents, junctions)
  const movingSpeeds = samplePoints
    .map((sample) => sample.speedKmh)
    .filter((speed) => Number.isFinite(speed) && speed >= 5)
  const averageMovingSpeedKmh = movingSpeeds.length > 0
    ? Math.round(movingSpeeds.reduce((sum, speed) => sum + speed, 0) / movingSpeeds.length)
    : null
  const maxSpeedKmh = movingSpeeds.length > 0 ? Math.max(...movingSpeeds) : null
  const preferredDetours = deviations
    .filter((item) => item.lengthKm >= 0.18 || item.distanceM >= 80)
    .sort((a, b) => {
      if (b.lengthKm !== a.lengthKm) return b.lengthKm - a.lengthKm
      return b.distanceM - a.distanceM
    })
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      label: item.suggestedRoadName ? `${item.suggestedRoadName} 쪽 우회` : item.label,
      lengthKm: item.lengthKm,
      distanceM: item.distanceM,
    }))

  return {
    deviationCount: deviations.length,
    deviations,
    preferredDetours,
    brakingEventCount: brakingEvents.length,
    brakingHotspots,
    averageMovingSpeedKmh,
    maxSpeedKmh,
    summaryLines: [
      deviations.length > 0
        ? `계획 경로에서 ${deviations.length}회 벗어났습니다.`
        : '안내 경로를 거의 그대로 주행했습니다.',
      preferredDetours[0]
        ? `가장 큰 우회는 ${preferredDetours[0].label} 구간입니다.`
        : '의미 있는 우회 구간은 감지되지 않았습니다.',
      brakingHotspots[0]
        ? `급감속은 ${brakingHotspots[0].label} 등 ${brakingHotspots.length}곳에서 감지됐습니다.`
        : '급감속 패턴은 뚜렷하지 않습니다.',
    ],
  }
}

export function buildDrivingHabitSummary(savedRoutes = []) {
  const drivingRoutes = savedRoutes.filter((route) => route.source !== 'no_movement')
  const totalTrips = drivingRoutes.length
  if (totalTrips === 0) {
    return {
      title: '저장된 주행이 아직 없습니다',
      lines: [
        '경로를 한 번 저장하면 실제 주행 기반으로 편차와 감속 패턴을 분석합니다.',
        '현재는 실제 주행 데이터가 없어서 습관 분석을 만들 수 없습니다.',
      ],
      topDeviation: null,
      topDetour: null,
      topBrake: null,
    }
  }

  const analyzedRoutes = drivingRoutes.map((route) => ({
    ...route,
    routeAnalysis: route.routeAnalysis ?? analyzeRecordedDrive(
      route.polyline ?? [],
      [],
      {
        polyline: route.originalRoutePolyline ?? route.polyline ?? [],
        junctions: route.junctions ?? [],
      }
    ),
  }))

  const totalDistance = analyzedRoutes.reduce((sum, route) => sum + (route.distance ?? 0), 0)
  const avgHighway = Math.round(analyzedRoutes.reduce((sum, route) => sum + (route.highwayRatio ?? 0), 0) / totalTrips)
  const movingSpeedValues = analyzedRoutes
    .map((route) => route.routeAnalysis?.averageMovingSpeedKmh)
    .filter((value) => Number.isFinite(value))
  const avgMovingSpeed = movingSpeedValues.length > 0
    ? Math.round(movingSpeedValues.reduce((sum, value) => sum + value, 0) / movingSpeedValues.length)
    : null

  const countByLabel = (items = []) => {
    const map = new Map()
    items.forEach((item) => {
      const label = item?.label
      if (!label) return
      map.set(label, (map.get(label) ?? 0) + 1)
    })
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
  }

  const topDeviation = countByLabel(analyzedRoutes.flatMap((route) => route.routeAnalysis?.deviations ?? []))[0] ?? null
  const topDetour = countByLabel(analyzedRoutes.flatMap((route) => route.routeAnalysis?.preferredDetours ?? []))[0] ?? null
  const topBrake = countByLabel(analyzedRoutes.flatMap((route) => route.routeAnalysis?.brakingHotspots ?? []))[0] ?? null

  return {
    title: '저장된 경로 기반 운전 습관 분석',
    lines: [
      `총 ${totalTrips}회 실제 주행을 저장했고 누적 ${totalDistance.toFixed(1)}km를 기록했습니다.`,
      avgMovingSpeed != null
        ? `실주행 평균 속도는 ${avgMovingSpeed}km/h이고 평균 고속도로 비율은 ${avgHighway}%입니다.`
        : `평균 고속도로 비율은 ${avgHighway}%입니다.`,
      topDeviation
        ? `가장 자주 벗어난 지점은 ${topDeviation.label} (${topDeviation.count}회)입니다.`
        : '계획 경로 이탈 패턴은 아직 두드러지지 않습니다.',
      topBrake
        ? `급감속은 ${topBrake.label} (${topBrake.count}회)에서 가장 많이 감지됐습니다.`
        : '급감속 다발 구간은 아직 두드러지지 않습니다.',
    ],
    topDeviation,
    topDetour,
    topBrake,
  }
}

export function getGuidancePriority(route, userLocation, mergeOptions = []) {
  const { progress } = getUpcomingJunction(route, userLocation)
  const actions = getUpcomingGuidanceList(route, userLocation, mergeOptions, 4)
  const nextAction = actions.find((action) => {
    const priority = getGuidanceActionPriority(action)
    return priority <= 3 && Number(action?.remainingDistanceKm) <= 1.6
  }) ?? actions[0] ?? null
  const nextManeuver = actions.find((action) => action.source === 'maneuver') ?? null
  const nextJunction = actions.find((action) => action.source === 'junction') ?? null
  const nextMergeOption = actions.find((action) => action.source === 'merge') ?? null

  return {
    progress,
    nextAction,
    nextManeuver,
    nextJunction,
    nextMergeOption,
  }
}

export function getRemainingEta(route, remainingKm) {
  if (!route?.eta) return null
  const baseDistance = Math.max(route.distance ?? 0, 0.1)
  const nextRemainingKm = remainingKm ?? route.distance ?? 0
  return Math.max(1, Math.ceil(route.eta * (nextRemainingKm / baseDistance)))
}

export function getUpcomingJunction(route, userLocation) {
  const progress = analyzeRouteProgress(route, userLocation)
  const routePolyline = route?.polyline ?? []
  const maneuvers = (route?.maneuvers ?? [])
    .map((maneuver) => ({
      ...maneuver,
      projectedDistanceKm: getProgressKmOnPolylineForPoint(maneuver, routePolyline),
    }))
    .map((maneuver) => ({
      ...maneuver,
      remainingDistanceKm: Math.max(
        0,
        ((maneuver.projectedDistanceKm ?? maneuver.distanceFromStart ?? 0) - progress.progressKm)
      ),
    }))
    .filter((maneuver) => maneuver.remainingDistanceKm > 0.005)
    .sort((a, b) => a.remainingDistanceKm - b.remainingDistanceKm)
  const junctions = (route?.junctions ?? [])
    .map((junction) => ({
      ...junction,
      projectedDistanceKm: getProgressKmOnPolylineForPoint(junction, routePolyline),
    }))
    .map((junction) => ({
      ...junction,
      remainingDistanceKm: Math.max(
        0,
        ((junction.projectedDistanceKm ?? junction.distanceFromStart ?? 0) - progress.progressKm)
      ),
    }))
    .filter((junction) => junction.remainingDistanceKm > 0.01)
    .sort((a, b) => a.remainingDistanceKm - b.remainingDistanceKm)

  return {
    progress,
    nextManeuver: maneuvers[0] ?? null,
    nextJunction: junctions[0] ?? null,
  }
}

export function getUpcomingGuidanceList(route, userLocation, mergeOptions = [], limit = 3) {
  const progress = analyzeRouteProgress(route, userLocation)
  const routePolyline = route?.polyline ?? []
  const maneuverCandidates = (route?.maneuvers ?? [])
    .map((maneuver) => ({
      ...maneuver,
      source: 'maneuver',
      projectedDistanceKm: getProgressKmOnPolylineForPoint(maneuver, routePolyline),
    }))
    .map((maneuver) => ({
      ...maneuver,
      remainingDistanceKm: Math.max(
        0,
        ((maneuver.projectedDistanceKm ?? maneuver.distanceFromStart ?? 0) - progress.progressKm)
      ),
    }))
    .filter((maneuver) => maneuver.remainingDistanceKm > 0.005)

  const junctionCandidates = (route?.junctions ?? [])
    .map((junction) => ({
      ...junction,
      source: 'junction',
      projectedDistanceKm: getProgressKmOnPolylineForPoint(junction, routePolyline),
    }))
    .map((junction) => ({
      ...junction,
      remainingDistanceKm: Math.max(
        0,
        ((junction.projectedDistanceKm ?? junction.distanceFromStart ?? 0) - progress.progressKm)
      ),
    }))
    .filter((junction) => junction.remainingDistanceKm > 0.01)

  const mergeCandidates = (mergeOptions ?? [])
    .map((option) => ({
      ...option,
      source: 'merge',
      turnType: option.afterRoadType === 'highway' ? 17 : 19,
      instructionText: `${option.name}에서 ${option.afterRoadName ?? (option.afterRoadType === 'highway' ? '고속도로' : '국도')} 방향`,
      laneHint: option.afterRoadType === 'highway' ? '우측 차로 준비' : '진행 방향 차로 준비',
      remainingDistanceKm: Math.max(0, (option.distanceFromCurrent ?? 0) - progress.progressKm),
    }))
    .filter((option) => option.remainingDistanceKm > 0.01 && !option.isCurrent)

  return dedupeGuidanceCandidates([
    ...maneuverCandidates,
    ...junctionCandidates,
    ...mergeCandidates,
  ]).slice(0, limit)
}

export function getUpcomingMergeOptions(mergeOptions, progressKm) {
  return (mergeOptions ?? [])
    .map((option) => ({
      ...option,
      remainingDistanceKm: Math.max(0, (option.distanceFromCurrent ?? 0) - progressKm),
    }))
    .filter((option) => option.isCurrent || option.remainingDistanceKm > 0.03)
}
