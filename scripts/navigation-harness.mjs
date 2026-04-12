import assert from 'node:assert/strict'
import {
  analyzeRouteProgress,
  ensureLiveRouteSource,
  formatGuidanceDistance,
  getGuidanceInstruction,
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

run('remaining ETA shrinks with route progress', () => {
  const { progress } = getUpcomingJunction(liveRoute, userLocationNearFirstJunction)
  const remainingEta = getRemainingEta(liveRoute, progress.remainingKm)
  assert.ok(remainingEta < liveRoute.eta, `expected ETA ${remainingEta} < ${liveRoute.eta}`)
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

if (process.exitCode) {
  console.error('navigation harness failed')
} else {
  console.log('navigation harness passed')
}
