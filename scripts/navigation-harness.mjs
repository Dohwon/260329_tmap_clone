import assert from 'node:assert/strict'
import {
  buildRoadDriveEntryCandidates,
  buildRoadDriveWaypoints,
  buildSearchOptionAttempts,
  fetchDirectRoute,
  fetchRoutes,
  getDirectRouteOptionsForMode,
  searchInstantPlaceCandidates,
} from '../src/services/tmapService.js'
import {
  buildScenicAnchorSeeds,
  validateRouteForNavigation,
} from '../src/utils/routingGuards.js'
import {
  analyzeRecordedDrive,
  analyzeRouteProgress,
  buildDrivingHabitSummary,
  ensureLiveRouteSource,
  formatGuidanceDistance,
  getEffectiveCurrentSpeedContext,
  getCurrentRouteSegment,
  getGuidanceInstruction,
  getGuidancePriority,
  getLaneGuidance,
  getRemainingEta,
  getTurnInstruction,
  getUpcomingJunction,
  getUpcomingMergeOptions,
  isUsableLiveRoute,
  normalizeSearchOption,
  shouldUseRawRoutePolyline,
} from '../src/utils/navigationLogic.js'

function run(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function runAsync(name, fn) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function buildMockRouteResponse(searchOption = '0') {
  const highwayPreferred = String(searchOption) === '4'
  return {
    properties: {
      totalDistance: highwayPreferred ? 18200 : 16500,
      totalTime: highwayPreferred ? 760 : 690,
      trafficTime: highwayPreferred ? 140 : 120,
      totalFare: highwayPreferred ? 2500 : 0,
      safetyFacilityList: [],
    },
    features: [
      {
        geometry: {
          type: 'LineString',
          coordinates: highwayPreferred
            ? [[127.0, 37.5], [127.03, 37.53], [127.08, 37.58], [127.1, 37.6]]
            : [[127.0, 37.5], [127.025, 37.525], [127.06, 37.56], [127.1, 37.6]],
        },
        properties: {
          distance: highwayPreferred ? 18200 : 16500,
          roadType: highwayPreferred ? 4 : 2,
          roadName: highwayPreferred ? '경부고속도로' : '국도 1호선',
          roadNo: '1',
          speedLimit: highwayPreferred ? 100 : 80,
          speed: highwayPreferred ? 86 : 63,
        },
      },
      {
        geometry: { type: 'Point', coordinates: [127.03, 37.53] },
        properties: {
          pointType: 'B',
          turnType: 17,
          name: '테스트 분기점',
          description: '테스트 분기점',
        },
      },
    ],
  }
}

const liveRoute = ensureLiveRouteSource({
  id: 'route-live',
  distance: 1.8,
  eta: 6,
  polyline: [
    [37.5, 127.0],
    [37.5, 127.01],
    [37.5, 127.02],
  ],
  junctions: [
    {
      id: 'jct-1',
      name: '첫 분기점',
      distanceFromStart: 0.9,
      turnType: 12,
      afterRoadType: 'highway',
      afterRoadName: '분당내곡로',
    },
  ],
})

const userLocationNearFirstJunction = { lat: 37.5, lng: 127.0062, speedKmh: 42 }

run('live route source is preserved for direct/waypoint routes', () => {
  assert.equal(liveRoute.source, 'live')
  assert.equal(shouldUseRawRoutePolyline(liveRoute), true)
  assert.equal(isUsableLiveRoute(liveRoute), true)
})

run('navigation progress is based on current location, not first junction distance', () => {
  const legacyDistanceKm = liveRoute.junctions[0].distanceFromStart
  const { progress, nextJunction } = getUpcomingJunction(liveRoute, userLocationNearFirstJunction)

  assert.ok(progress.progressKm > 0.5, `expected progress > 0.5km, got ${progress.progressKm}`)
  assert.ok(nextJunction, 'expected an upcoming junction')
  assert.ok(nextJunction.remainingDistanceKm < legacyDistanceKm, 'remaining distance should shrink as driver moves')
  assert.equal(getTurnInstruction(nextJunction.turnType), '좌회전')
  assert.equal(formatGuidanceDistance(nextJunction.remainingDistanceKm), '350m')
})

run('guidance text prefers real TMAP instruction wording when available', () => {
  assert.equal(
    getGuidanceInstruction({
      turnType: 113,
      instructionText: '개포 지하차도에서 전방 도시고속도로 입구 후 분당내곡로를 따라 213m 이동',
    }),
    '도시고속도로 진입'
  )
  assert.equal(
    getGuidanceInstruction({
      turnType: 13,
      instructionText: '정자일로1 사거리에서 금곡동행정복지센터 방면으로 우회전 후 정자일로를 따라 41m 이동',
    }),
    '우회전'
  )
  assert.equal(
    getGuidanceInstruction({
      turnType: 112,
      instructionText: '서안산IC 방면 오른쪽 고속도로 출구입니다',
    }),
    '우측 진출'
  )
  assert.equal(
    getGuidanceInstruction({
      turnType: 17,
      instructionText: '판교JC에서 경부고속도로 방면으로 우측 분기입니다',
    }),
    '우측 분기'
  )
  assert.equal(
    getGuidanceInstruction({
      turnType: 16,
      instructionText: '본선 합류 후 경부고속도로를 따라 이동합니다',
    }),
    '본선 유지'
  )
})

run('nearest guidance is preferred over distant merge actions', () => {
  const route = ensureLiveRouteSource({
    id: 'route-guidance-priority',
    distance: 12,
    eta: 18,
    polyline: [
      [37.5, 127.0],
      [37.5, 127.12],
    ],
    maneuvers: [
      {
        id: 'man-near-left',
        turnType: 12,
        distanceFromStart: 0.08,
        instructionText: '80m 후 좌회전',
      },
    ],
    junctions: [
      {
        id: 'jct-far-merge',
        turnType: 17,
        distanceFromStart: 6.1,
        afterRoadType: 'highway',
        afterRoadName: '경부고속도로',
      },
    ],
  })

  const result = getGuidancePriority(route, { lat: 37.5, lng: 127.0001 }, [
    {
      id: 'merge-far',
      afterRoadType: 'highway',
      afterRoadName: '경부고속도로',
      distanceFromCurrent: 6.1,
    },
  ])

  assert.equal(result.nextAction?.turnType, 12)
})

run('projected guidance point on route is prioritized even without distanceFromStart', () => {
  const route = ensureLiveRouteSource({
    id: 'route-guidance-projection',
    distance: 3,
    eta: 7,
    polyline: [
      [37.5, 127.0],
      [37.5, 127.004],
      [37.5005, 127.004],
    ],
    maneuvers: [
      {
        id: 'man-turn-near',
        turnType: 12,
        lat: 37.5,
        lng: 127.0038,
        instructionText: '곧 좌회전',
      },
    ],
    junctions: [
      {
        id: 'jct-far',
        turnType: 17,
        lat: 37.5005,
        lng: 127.004,
        distanceFromStart: 2.7,
        afterRoadType: 'highway',
      },
    ],
  })

  const result = getGuidancePriority(route, { lat: 37.5, lng: 127.0031 })
  assert.equal(result.nextAction?.id, 'man-turn-near')
  assert.ok((result.nextAction?.remainingDistanceKm ?? 1) < 0.2)
})

run('synthetic close turn beats a far merge when live guidance points are sparse', () => {
  const route = ensureLiveRouteSource({
    id: 'route-synthetic-turn',
    distance: 2.2,
    eta: 6,
    highwayRatio: 0,
    nationalRoadRatio: 0,
    localRoadRatio: 100,
    polyline: [
      [37.5, 127.0],
      [37.5, 127.0025],
      [37.5007, 127.0025],
      [37.5015, 127.0025],
    ],
    maneuvers: [],
    junctions: [
      {
        id: 'jct-far-highway',
        lat: 37.62,
        lng: 127.3,
        turnType: 17,
        distanceFromStart: 61,
        afterRoadType: 'highway',
      },
    ],
  })

  const result = getGuidancePriority(route, { lat: 37.5, lng: 127.0008, speedKmh: 22 })
  assert.ok(result.nextAction, 'expected a nearby guidance action')
  assert.equal(result.nextAction.turnType, 12)
  assert.ok((result.nextAction.remainingDistanceKm ?? 9) < 0.5)
})

run('highway context suppresses local turn guidance in favor of merge and exit guidance', () => {
  const route = ensureLiveRouteSource({
    id: 'route-highway-filter',
    distance: 25,
    eta: 21,
    highwayRatio: 92,
    nationalRoadRatio: 5,
    localRoadRatio: 3,
    polyline: [
      [37.5, 127.0],
      [37.5, 127.03],
      [37.5006, 127.04],
      [37.5012, 127.052],
    ],
    maneuvers: [
      {
        id: 'local-underpass',
        turnType: 13,
        distanceFromStart: 0.18,
        instructionText: '100m 후 지하차도 오른쪽 방향',
      },
    ],
    junctions: [
      {
        id: 'hw-jct',
        turnType: 17,
        lat: 37.5006,
        lng: 127.04,
        distanceFromStart: 0.42,
        afterRoadType: 'highway',
        afterRoadName: '경부고속도로',
      },
    ],
    segmentStats: [
      {
        id: 'seg-highway-main',
        roadType: 'highway',
        speedLimit: 100,
        positions: [
          [37.5, 127.0],
          [37.5, 127.03],
        ],
        startProgressKm: 0,
        endProgressKm: 3,
      },
      {
        id: 'seg-highway-jct',
        roadType: 'junction',
        speedLimit: 80,
        positions: [
          [37.5, 127.03],
          [37.5006, 127.04],
        ],
        startProgressKm: 3,
        endProgressKm: 4.2,
      },
    ],
  })

  const result = getGuidancePriority(route, { lat: 37.5, lng: 127.028, speedKmh: 92 })
  assert.ok(result.nextAction, 'expected a next action in highway context')
  assert.equal(result.nextAction.turnType, 17)
})

run('remaining ETA shrinks with route progress', () => {
  const { progress } = getUpcomingJunction(liveRoute, userLocationNearFirstJunction)
  const remainingEta = getRemainingEta(liveRoute, progress.remainingKm)
  assert.ok(remainingEta < liveRoute.eta, `expected ETA ${remainingEta} < ${liveRoute.eta}`)
})

run('current route segment is selected from the nearest actual segment', () => {
  const route = {
    ...liveRoute,
    segmentStats: [
      {
        id: 'seg-local',
        roadType: 'local',
        speedLimit: 50,
        positions: [
          [37.5, 127.0],
          [37.5, 127.008],
        ],
      },
      {
        id: 'seg-highway',
        roadType: 'highway',
        speedLimit: 100,
        positions: [
          [37.5, 127.008],
          [37.5, 127.02],
        ],
      },
    ],
  }
  const currentSegment = getCurrentRouteSegment(route, { lat: 37.5, lng: 127.004, speedKmh: 32 })
  assert.ok(currentSegment, 'expected a current segment')
  assert.equal(currentSegment.id, 'seg-local')
  assert.equal(currentSegment.speedLimit, 50)
})

run('effective speed context prefers the near highway segment over a short local connector', () => {
  const route = ensureLiveRouteSource({
    id: 'route-speed-context',
    distance: 8,
    eta: 9,
    highwayRatio: 82,
    nationalRoadRatio: 10,
    localRoadRatio: 8,
    polyline: [
      [37.5, 127.0],
      [37.5, 127.002],
      [37.5, 127.01],
    ],
    segmentStats: [
      {
        id: 'seg-local-ramp',
        roadType: 'local',
        speedLimit: 40,
        positions: [
          [37.5, 127.0],
          [37.5, 127.0018],
        ],
        startProgressKm: 0,
        endProgressKm: 0.18,
      },
      {
        id: 'seg-highway-main',
        roadType: 'highway',
        speedLimit: 100,
        positions: [
          [37.5, 127.0018],
          [37.5, 127.01],
        ],
        startProgressKm: 0.18,
        endProgressKm: 1.2,
      },
    ],
  })

  const context = getEffectiveCurrentSpeedContext(route, { lat: 37.5, lng: 127.0012, speedKmh: 84 })
  assert.equal(context.displaySpeedLimit, 100)
  assert.equal(context.primaryRoadType, 'highway')
})

run('lane guidance prefers explicit laneInfo patterns when available', () => {
  assert.equal(
    getLaneGuidance({
      laneHint: '우측 2개 차로 유지 후 분기점 진입',
      turnType: 19,
    }),
    '우측 2개 차로 유지'
  )
  assert.equal(
    getLaneGuidance({
      laneHint: '1~2차로 이용하여 우회전',
      turnType: 13,
    }),
    '1~2차로 이용'
  )
})

run('recorded drive analysis finds deviations and braking hotspots from actual samples', () => {
  const analysis = analyzeRecordedDrive(
    [
      [37.5, 127.0],
      [37.5002, 127.002],
      [37.5006, 127.006],
      [37.5008, 127.01],
    ],
    [
      { lat: 37.5, lng: 127.0, speedKmh: 72, capturedAt: '2026-04-13T00:00:00.000Z' },
      { lat: 37.5002, lng: 127.002, speedKmh: 68, capturedAt: '2026-04-13T00:00:04.000Z' },
      { lat: 37.5006, lng: 127.006, speedKmh: 44, capturedAt: '2026-04-13T00:00:08.000Z' },
      { lat: 37.5008, lng: 127.01, speedKmh: 28, capturedAt: '2026-04-13T00:00:12.000Z' },
    ],
    {
      polyline: [
        [37.5, 127.0],
        [37.5, 127.01],
      ],
      junctions: [
        { id: 'jct-1', name: '테스트 JC', lat: 37.5006, lng: 127.006, afterRoadName: '국도 1호선' },
      ],
    }
  )

  assert.ok(analysis.deviationCount >= 1, 'expected off-route deviation')
  assert.ok(analysis.brakingEventCount >= 1, 'expected braking event')
  assert.ok(analysis.preferredDetours.length >= 1, 'expected preferred detour summary')
})

run('driving habit summary aggregates recorded-route deviation patterns', () => {
  const summary = buildDrivingHabitSummary([
    {
      id: 'saved-1',
      source: 'recorded',
      distance: 12.5,
      highwayRatio: 78,
      polyline: [
        [37.5, 127.0],
        [37.5004, 127.004],
      ],
      originalRoutePolyline: [
        [37.5, 127.0],
        [37.5, 127.004],
      ],
      junctions: [{ id: 'jct-1', name: '테스트 JC', lat: 37.5003, lng: 127.003 }],
      routeAnalysis: {
        averageMovingSpeedKmh: 61,
        deviations: [{ label: '테스트 JC 부근 경로 이탈' }],
        preferredDetours: [{ label: '국도 1호선 쪽 우회' }],
        brakingHotspots: [{ label: '테스트 JC 부근 급감속' }],
      },
    },
  ])

  assert.equal(summary.topDeviation?.label, '테스트 JC 부근 경로 이탈')
  assert.equal(summary.topDetour?.label, '국도 1호선 쪽 우회')
  assert.equal(summary.topBrake?.label, '테스트 JC 부근 급감속')
})

run('merge options are also rebased from current progress', () => {
  const options = getUpcomingMergeOptions([
    { id: 'merge-current', name: '현재 경로 유지', distanceFromCurrent: 0.9, isCurrent: true },
    { id: 'merge-alt', name: '우회 경로', distanceFromCurrent: 1.4, afterRoadType: 'national' },
  ], 0.55)

  assert.equal(options[0].remainingDistanceKm.toFixed(2), '0.35')
  assert.equal(options[1].remainingDistanceKm.toFixed(2), '0.85')
})

run('TMAP searchOption is normalized to the numeric string format the API accepts', () => {
  assert.equal(normalizeSearchOption('00'), '0')
  assert.equal(normalizeSearchOption('04'), '4')
  assert.equal(normalizeSearchOption('10'), '10')
})

run('route request search options do not duplicate raw and normalized values', () => {
  assert.deepEqual(buildSearchOptionAttempts('00'), ['0'])
  assert.deepEqual(buildSearchOptionAttempts('04'), ['4'])
  assert.deepEqual(buildSearchOptionAttempts('10'), ['10'])
})

run('navigation mode requests only the baseline direct route option', () => {
  assert.equal(getDirectRouteOptionsForMode('mixed', 'navigation').length, 1)
  assert.equal(getDirectRouteOptionsForMode('highway_only', 'navigation')[0].searchOption, '04')
  assert.equal(getDirectRouteOptionsForMode('national_road', 'navigation')[0].searchOption, '00')
})

run('preview mode still keeps alternative direct route options for comparison', () => {
  assert.equal(getDirectRouteOptionsForMode('mixed', 'preview').length, 2)
  assert.equal(getDirectRouteOptionsForMode('highway_only', 'preview').length, 2)
})

await runAsync('preview route search stays within the direct-route budget without extra via fan-out', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url: String(url), payload })
    return {
      ok: true,
      status: 200,
      json: async () => buildMockRouteResponse(payload?.searchOption),
    }
  }

  try {
    const routes = await fetchRoutes(37.5, 127.0, 37.6, 127.1, {
      roadType: 'mixed',
      routeRequestMode: 'preview',
    })

    assert.equal(routes.length, 1)
    assert.equal(calls.filter((call) => call.url.includes('/routes?version=1')).length, 1)
    assert.equal(calls.some((call) => call.url.includes('/routeSequential30')), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

await runAsync('route 429 opens a short circuit breaker so immediate retries do not hit the network again', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return {
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'too many requests' } }),
    }
  }

  try {
    await assert.rejects(() => fetchDirectRoute(37.5, 127.0, 37.6, 127.1))
    await assert.rejects(() => fetchDirectRoute(37.5, 127.0, 37.6, 127.1))
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

run('navigation route validation blocks malformed routes before overlay render', () => {
  const invalid = validateRouteForNavigation({
    id: 'invalid-route',
    source: 'live',
    distance: 12,
    polyline: [[37.5, 127.0]],
  }, { lat: 37.5, lng: 127.0 })
  assert.equal(invalid.ok, false)

  const valid = validateRouteForNavigation({
    id: 'valid-route',
    source: 'live',
    distance: 1.6,
    polyline: [
      [37.5, 127.0],
      [37.5005, 127.006],
      [37.501, 127.012],
    ],
  }, { lat: 37.5, lng: 127.0 })
  assert.equal(valid.ok, true)
})

run('scenic suggestions derive concrete entry and exit anchors from real segment data', () => {
  const anchors = buildScenicAnchorSeeds({
    id: 'scenic-demo',
    name: '서해안 태안반도 해안',
    roadLabel: '국도 77호선 태안반도',
    viaPoints: [
      { lat: 36.82, lng: 126.14, name: '만리포' },
      { lat: 36.57, lng: 126.30, name: '꽃지해안' },
    ],
  })

  assert.equal(anchors.length, 2)
  assert.equal(anchors[0].role, 'entry')
  assert.equal(anchors[1].role, 'exit')
  assert.equal(anchors[0].name, '만리포')
  assert.equal(anchors[1].name, '꽃지해안')
})

run('instant search does not crash on roads without rest stop arrays', () => {
  const results = searchInstantPlaceCandidates('국도', 37.5, 127.0)
  assert.ok(Array.isArray(results), 'expected array results')
})

run('instant search returns fast candidates for known places', () => {
  const results = searchInstantPlaceCandidates('양화대교', 37.54, 126.9)
  assert.ok(results.some((item) => item.name === '양화대교'), 'expected 양화대교 in results')
})

run('road drive entry candidates include the road start and nearby entry nodes', () => {
  const road = {
    id: 'test-road',
    name: '테스트고속도로',
    roadClass: 'expressway',
    totalKm: 100,
    startName: '테스트 시점',
    endName: '테스트 종점',
    startAddress: '서울',
    endAddress: '부산',
    startCoord: [37.0, 127.0],
    endCoord: [36.0, 128.0],
    majorJunctions: [
      { name: '가까운IC', coord: [36.75, 127.25], km: 28 },
      { name: '중간JC', coord: [36.5, 127.5], km: 55 },
      { name: '먼IC', coord: [36.25, 127.75], km: 82 },
    ],
  }
  const origin = { lat: 36.74, lng: 127.24 }
  const candidates = buildRoadDriveEntryCandidates(origin, road, 'forward', 3)

  assert.ok(candidates.length >= 2)
  assert.equal(candidates[0].id, 'test-road-start')
  assert.ok(candidates.some((item) => item.name === '가까운IC'))
})

run('road drive waypoints keep the chosen entry and downstream anchors', () => {
  const road = {
    id: 'test-road',
    name: '테스트국도',
    roadClass: 'national',
    totalKm: 120,
    startName: '시점',
    endName: '종점',
    startAddress: 'A',
    endAddress: 'B',
    startCoord: [37.0, 127.0],
    endCoord: [36.0, 128.0],
    majorJunctions: [
      { name: 'IC-1', coord: [36.8, 127.2], km: 20 },
      { name: 'IC-2', coord: [36.6, 127.4], km: 40 },
      { name: 'IC-3', coord: [36.3, 127.7], km: 80 },
    ],
  }
  const entry = {
    id: 'test-road-junction-1',
    name: 'IC-2',
    lat: 36.6,
    lng: 127.4,
    km: 40,
  }

  const waypoints = buildRoadDriveWaypoints(road, entry, 'forward')
  assert.ok(waypoints.length >= 1)
  assert.equal(waypoints[0].roadDriveRole, 'entry')
  assert.equal(waypoints[0].name, 'IC-2')
  assert.ok(waypoints.every((item) => item.roadDriveRoadId === 'test-road'))
})

if (process.exitCode) {
  console.error('navigation harness failed')
} else {
  console.log('navigation harness passed')
}
