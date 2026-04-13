import assert from 'node:assert/strict'
import { searchInstantPlaceCandidates } from '../src/services/tmapService.js'
import {
  analyzeRecordedDrive,
  analyzeRouteProgress,
  buildDrivingHabitSummary,
  ensureLiveRouteSource,
  formatGuidanceDistance,
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

run('instant search does not crash on roads without rest stop arrays', () => {
  const results = searchInstantPlaceCandidates('국도', 37.5, 127.0)
  assert.ok(Array.isArray(results), 'expected array results')
})

run('instant search returns fast candidates for known places', () => {
  const results = searchInstantPlaceCandidates('양화대교', 37.54, 126.9)
  assert.ok(results.some((item) => item.name === '양화대교'), 'expected 양화대교 in results')
})

if (process.exitCode) {
  console.error('navigation harness failed')
} else {
  console.log('navigation harness passed')
}
