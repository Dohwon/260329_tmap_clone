import { HIGHWAYS } from '../src/data/highwayData.js'

const DEFAULT_BASE_URL = 'https://260329tmapclone-development.up.railway.app'
const baseUrl = String(process.env.PREWARM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
const selectedIds = String(process.env.PREWARM_ROAD_IDS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const limit = Math.max(0, Number(process.env.PREWARM_LIMIT || 0))

function log(status, detail = '') {
  console.log(`${status}${detail ? ` ${detail}` : ''}`)
}

function uniqueCoords(points = []) {
  return points.filter((coord, index, all) =>
    Array.isArray(coord)
    && coord.length >= 2
    && all.findIndex((other) =>
      Array.isArray(other)
      && other.length >= 2
      && Math.abs(other[0] - coord[0]) < 0.0005
      && Math.abs(other[1] - coord[1]) < 0.0005
    ) === index
  )
}

function buildRoadPath(road) {
  return uniqueCoords([
    road.startCoord,
    ...((road.entryNodes ?? []).map((node) => node.coord ?? [node.lat, node.lng])),
    ...((road.mainlineAnchors ?? []).map((node) => node.coord ?? [node.lat, node.lng])),
    ...((road.majorJunctions ?? []).map((junction) => junction.coord)),
    road.endCoord,
  ])
}

async function prewarmRoad(road) {
  const polyline = buildRoadPath(road)
  if (polyline.length < 2) {
    return { ok: false, road, detail: 'polyline missing' }
  }

  const response = await fetch(`${baseUrl}/api/road/actual-meta`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      routes: [{
        routeId: `prewarm-${road.id}`,
        roads: [{
          name: road.name,
          number: road.number,
          roadClass: road.roadClass,
          aliases: road.aliases ?? [],
        }],
        polyline,
        includeRoadsideStops: true,
        includeCameras: true,
        includeEvents: false,
      }],
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    return {
      ok: false,
      road,
      detail: payload?.error?.message ?? payload?.error?.code ?? `HTTP ${response.status}`,
    }
  }

  const item = Array.isArray(payload?.items) ? payload.items[0] : null
  return {
    ok: true,
    road,
    detail: `cameras=${Array.isArray(item?.cameras) ? item.cameras.length : 0}, restStops=${Array.isArray(item?.restStops) ? item.restStops.length : 0}`,
  }
}

const targets = HIGHWAYS
  .filter((road) => selectedIds.length === 0 || selectedIds.includes(road.id))
  .slice(0, limit > 0 ? limit : HIGHWAYS.length)

log('PREWARM_START', `baseUrl=${baseUrl} roads=${targets.length}`)

let pass = 0
let fail = 0
for (const road of targets) {
  try {
    const result = await prewarmRoad(road)
    if (result.ok) {
      pass += 1
      log('PASS', `${road.id} ${road.name} ${result.detail}`)
    } else {
      fail += 1
      log('WARN', `${road.id} ${road.name} ${result.detail}`)
    }
  } catch (error) {
    fail += 1
    log('WARN', `${road.id} ${road.name} ${error instanceof Error ? error.message : String(error)}`)
  }
}

log('PREWARM_DONE', `pass=${pass} fail=${fail}`)
