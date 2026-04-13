import { HIGHWAYS } from '../data/highwayData.js'
import { ensureLiveRouteSource, normalizeSearchOption } from '../utils/navigationLogic.js'

const BASE = '/api/tmap'
const ROAD_KEYWORD_PATTERN = /(고속|국도|jc|ic|분기|인터체인지|나들목|휴게소|톨게이트)/i
// 도로명 주소 패턴: "효행로 250", "강남대로 123번길 45" 등
const ROAD_ADDRESS_PATTERN = /[가-힣]+(?:로|길|대로|avenue)\s*\d+/i
const SEARCH_CACHE = new Map()
const SEARCH_CACHE_TTL = 1000 * 60 * 5
const FAST_SEARCH_PLACES = [
  {
    id: 'fast-gangnam-station',
    name: '강남역',
    address: '서울특별시 강남구 강남대로 지하396',
    lat: 37.4979,
    lng: 127.0276,
    category: '지하철역',
    aliases: ['강남역', '강남', '2호선 강남역', '신분당선 강남역'],
  },
  {
    id: 'fast-yanghwa-bridge',
    name: '양화대교',
    address: '서울특별시 영등포구 양화동',
    lat: 37.5435,
    lng: 126.9016,
    category: '교량',
    aliases: ['양화대교', '양화'],
  },
  {
    id: 'fast-olympic-daero',
    name: '올림픽대로',
    address: '서울특별시 강동구 암사동 일대',
    lat: 37.5306,
    lng: 127.1212,
    category: '도시고속화도로',
    aliases: ['올림픽대로', '올림픽'],
  },
  {
    id: 'fast-gangbyeon',
    name: '강변북로',
    address: '서울특별시 마포구 상암동 일대',
    lat: 37.5697,
    lng: 126.8784,
    category: '도시고속화도로',
    aliases: ['강변북로', '강변'],
  },
  {
    id: 'fast-nambu-terminal',
    name: '남부터미널역',
    address: '서울특별시 서초구 효령로 지하289',
    lat: 37.4849,
    lng: 127.0164,
    category: '지하철역',
    aliases: ['남부터미널', '남부터미널역'],
  },
]

const FALLBACK_SEARCH_PLACES = [
  { id: 'place-seoul', name: '서울역', address: '서울특별시 용산구 한강대로 405', lat: 37.5547, lng: 126.9706, category: '교통' },
  { id: 'place-busan', name: '부산역', address: '부산광역시 동구 중앙대로 206', lat: 35.1151, lng: 129.0410, category: '교통' },
  { id: 'place-daejeon', name: '대전시청', address: '대전광역시 서구 둔산로 100', lat: 36.3504, lng: 127.3845, category: '행정' },
  { id: 'place-haeundae', name: '부산 해운대', address: '부산광역시 해운대구 우동', lat: 35.1631, lng: 129.1635, category: '관광' },
  {
    id: 'place-hogye',
    name: '호계동 959-18',
    address: '경기도 안양시 동안구 흥안대로 109번길 26',
    lat: 37.371313340579,
    lng: 126.95700840682,
    category: '주거',
    aliases: ['흥안대로109번길 26', '흥안대로 109번길 26', '호계동 959-10', '호계동 959-18'],
  },
]

const CATEGORY_META = {
  주유소: { key: 'fuel', seeds: ['GS칼텍스', 'SK에너지', 'S-OIL', '현대오일뱅크'] },
  휴게소: { key: 'rest', seeds: ['덕평휴게소', '문막휴게소', '여주휴게소', '안성휴게소'] },
  주차장: { key: 'parking', seeds: ['공영주차장', '환승주차장', '타워주차장', '민영주차장'] },
  카페: { key: 'cafe', seeds: ['스타벅스', '메가커피', '투썸플레이스', '로컬 카페'] },
  음식점: { key: 'restaurant', seeds: ['한식당', '국밥집', '맛집', '기사식당'] },
  병원: { key: 'hospital', seeds: ['종합병원', '정형외과', '내과', '응급의료센터'] },
  편의점: { key: 'convenience', seeds: ['CU', 'GS25', '세븐일레븐', '이마트24'] },
}

const FUEL_SEARCH_PATTERN = /(주유소|충전소|휘발유|경유|LPG|가스충전|gs칼텍스|sk에너지|s-oil|현대오일뱅크|알뜰주유소)/i
const PARKING_SEARCH_PATTERN = /(주차장|공영주차장|민영주차장|환승주차장|타워주차장|공영|민영|주차타워)/i
const HOSPITAL_SEARCH_PATTERN = /(병원|의원|한의원|치과|클리닉|응급의료센터|응급실|내과|소아과|정형외과|이비인후과|외과|피부과|안과|산부인과|비뇨의학과)/i
const RESTAURANT_SEARCH_PATTERN = /(음식점|맛집|식당|한식|중식|일식|양식|분식|국밥|냉면|칼국수|파스타|치킨|피자|햄버거|고기집|기사식당)/i

function getFuelBenefitConfig(settings = {}) {
  return {
    enabled: Boolean(settings?.fuelBenefitEnabled),
    brand: String(settings?.fuelBenefitBrand ?? '').trim(),
    percent: Number(settings?.fuelBenefitPercent ?? 0),
  }
}

export function getDiscountedFuelPrice(item = {}, settings = {}) {
  const rawPrice = Number(item?.fuelPrice)
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null
  const benefit = getFuelBenefitConfig(settings)
  if (!benefit.enabled || !benefit.brand || !Number.isFinite(benefit.percent) || benefit.percent <= 0) return rawPrice
  const brandText = String(item?.brand ?? item?.name ?? '')
  if (!brandText.includes(benefit.brand)) return rawPrice
  return Math.round(rawPrice * (1 - (benefit.percent / 100)))
}

function applyFuelBenefitMeta(item = {}, settings = {}) {
  const benefit = getFuelBenefitConfig(settings)
  const discountedFuelPrice = getDiscountedFuelPrice(item, settings)
  const benefitApplied = Boolean(
    discountedFuelPrice != null &&
    Number(item?.fuelPrice) > 0 &&
    discountedFuelPrice < Number(item?.fuelPrice)
  )
  return {
    ...item,
    discountedFuelPrice,
    fuelBenefitApplied: benefitApplied,
    fuelBenefitLabel: benefitApplied ? `${benefit.brand} ${benefit.percent}% 할인 적용` : null,
  }
}

function getFuelSortPrice(item = {}, settings = {}) {
  const discounted = getDiscountedFuelPrice(item, settings)
  if (Number.isFinite(discounted) && discounted > 0) return discounted
  const rawPrice = Number(item?.fuelPrice)
  return Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : Infinity
}

function normalizeSearchText(text) {
  return String(text ?? '').toLowerCase().replace(/[\s\-_/.,]/g, '')
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function getNearestPolylinePointIndex(lat, lng, polyline = []) {
  if (!Array.isArray(polyline) || polyline.length === 0) return { index: -1, distanceKm: Infinity }
  let bestIndex = -1
  let bestDistance = Infinity
  for (let index = 0; index < polyline.length; index += 1) {
    const point = polyline[index]
    const distance = haversineKm(lat, lng, point[0], point[1])
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }
  return { index: bestIndex, distanceKm: bestDistance }
}

function getPolylineDistanceBetweenIndices(polyline = [], fromIndex = 0, toIndex = 0) {
  if (!Array.isArray(polyline) || polyline.length < 2 || fromIndex < 0 || toIndex < 0 || toIndex <= fromIndex) return 0
  let total = 0
  for (let index = fromIndex; index < Math.min(polyline.length - 1, toIndex); index += 1) {
    const current = polyline[index]
    const next = polyline[index + 1]
    total += haversineKm(current[0], current[1], next[0], next[1])
  }
  return Number(total.toFixed(1))
}

function normalizeFuelText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/주식회사|㈜|\(주\)|\s+/g, '')
    .replace(/[-_/.,]/g, '')
}

function buildRoadSearchPlaces() {
  return HIGHWAYS.flatMap((road) => [
    {
      id: `${road.id}-start`,
      name: road.startName ?? `${road.name} 시점`,
      address: road.startAddress ?? road.startName,
      lat: road.startCoord[0],
      lng: road.startCoord[1],
      category: road.roadClass === 'national' ? '국도' : '고속도로',
      aliases: [`${road.name} 시점`, `${road.shortName} 시점`, road.startName].filter(Boolean),
    },
    {
      id: `${road.id}-end`,
      name: road.endName ?? `${road.name} 종점`,
      address: road.endAddress ?? road.endName,
      lat: road.endCoord[0],
      lng: road.endCoord[1],
      category: road.roadClass === 'national' ? '국도' : '고속도로',
      aliases: [`${road.name} 종점`, `${road.shortName} 종점`, road.endName].filter(Boolean),
    },
    ...(road.majorJunctions ?? []).map((junction) => ({
      id: `${road.id}-${junction.name}`,
      name: junction.name,
      address: `${road.name} ${junction.name}`,
      lat: junction.coord[0],
      lng: junction.coord[1],
      category: '분기점',
      aliases: [junction.name, `${road.name} ${junction.name}`],
    })),
    ...(road.restStops ?? []).map((stop) => ({
      id: stop.id,
      name: stop.name,
      address: `${road.name} ${stop.name}`,
      lat: stop.coord[0],
      lng: stop.coord[1],
      category: stop.type === 'service' ? '휴게소' : '졸음쉼터',
      aliases: [stop.name, `${road.name} ${stop.name}`],
    })),
  ])
}

function normalizePoi(poi) {
  const roadAddress = [poi.roadName, poi.firstBuildNo, poi.secondBuildNo].filter(Boolean).join(' ')
  const jibunAddress = [poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName, poi.legalDong, poi.ri, poi.firstNo, poi.secondNo].filter(Boolean).join(' ')
  return {
    id: poi.id ?? poi.poiid ?? `${poi.name}-${poi.frontLat}-${poi.frontLon}`,
    name: poi.name,
    address: [roadAddress, jibunAddress, poi.detailAddrName, poi.address]
      .filter(Boolean)
      .join(' ') || '',
    lat: parseFloat(poi.frontLat ?? poi.noorLat ?? poi.lat),
    lng: parseFloat(poi.frontLon ?? poi.noorLon ?? poi.lng),
    category: poi.bizCatName ?? poi.upperBizName ?? poi.category ?? '',
  }
}

function sanitizeRouteLabel(label, fallback) {
  return String(label ?? fallback ?? '')
    .replace(/[^\p{L}\p{N}\s()\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40) || fallback
}

function buildRouteErrorMessage(res, json) {
  if (res?.status === 429) return 'TMAP 요청이 많아 잠시 후 다시 시도해주세요.'
  return json?.error?.errorMessage ?? json?.error?.code ?? json?.error?.message ?? `TMAP HTTP ${res.status}`
}

function searchFallbackPlaces(keyword, nearLat, nearLng) {
  const normalized = keyword.trim().toLowerCase()
  const compact = normalizeSearchText(normalized)
  const roadPlaces = buildRoadSearchPlaces()
  const fastPool = [...FAST_SEARCH_PLACES, ...FALLBACK_SEARCH_PLACES]
  const basePool = ROAD_KEYWORD_PATTERN.test(keyword) ? [...fastPool, ...roadPlaces] : fastPool

  return basePool
    .filter((place) => {
      const haystack = `${place.name} ${place.address} ${place.category} ${(place.aliases ?? []).join(' ')}`.toLowerCase()
      return normalizeSearchText(haystack).includes(compact)
    })
    .sort((a, b) => {
      const distanceA = nearLat != null && nearLng != null ? haversineKm(nearLat, nearLng, a.lat, a.lng) : 0
      const distanceB = nearLat != null && nearLng != null ? haversineKm(nearLat, nearLng, b.lat, b.lng) : 0
      return distanceA - distanceB
    })
    .slice(0, 15)
}

export function searchInstantPlaceCandidates(keyword, nearLat, nearLng) {
  const trimmedKeyword = String(keyword ?? '').trim()
  if (trimmedKeyword.length < 2) return []
  return searchFallbackPlaces(trimmedKeyword, nearLat, nearLng).slice(0, 10)
}

function getCachedSearch(keyword, nearLat, nearLng) {
  const key = `${normalizeSearchText(keyword)}:${nearLat ?? ''}:${nearLng ?? ''}`
  const cached = SEARCH_CACHE.get(key)
  if (!cached) return null
  if (Date.now() - cached.savedAt > SEARCH_CACHE_TTL) {
    SEARCH_CACHE.delete(key)
    return null
  }
  return cached.results
}

function setCachedSearch(keyword, nearLat, nearLng, results) {
  const key = `${normalizeSearchText(keyword)}:${nearLat ?? ''}:${nearLng ?? ''}`
  SEARCH_CACHE.set(key, { savedAt: Date.now(), results })
}

function isFuelSearchKeyword(keyword = '') {
  return FUEL_SEARCH_PATTERN.test(String(keyword ?? '').trim())
}

function isParkingSearchKeyword(keyword = '') {
  return PARKING_SEARCH_PATTERN.test(String(keyword ?? '').trim())
}

function isHospitalSearchKeyword(keyword = '') {
  return HOSPITAL_SEARCH_PATTERN.test(String(keyword ?? '').trim())
}

function isHospitalPoi(item = {}) {
  return HOSPITAL_SEARCH_PATTERN.test([item?.name, item?.category, item?.address].filter(Boolean).join(' '))
}

function isRestaurantSearchKeyword(keyword = '') {
  return RESTAURANT_SEARCH_PATTERN.test(String(keyword ?? '').trim())
}

export function buildRestaurantRatingKey(item = {}) {
  const lat = Number(item?.lat)
  const lng = Number(item?.lng)
  const base = item?.googlePlaceId || item?.id || item?.name || 'restaurant'
  const latKey = Number.isFinite(lat) ? lat.toFixed(5) : 'na'
  const lngKey = Number.isFinite(lng) ? lng.toFixed(5) : 'na'
  return `restaurant:${base}:${latKey}:${lngKey}`
}

function isRestaurantPoi(item = {}) {
  return RESTAURANT_SEARCH_PATTERN.test([item?.name, item?.category, item?.address].filter(Boolean).join(' '))
}

function scoreFuelKeywordMatch(item, keyword = '') {
  const compactKeyword = normalizeFuelText(keyword)
  const haystack = normalizeFuelText([item?.name, item?.brand, item?.address, item?.category].filter(Boolean).join(' '))
  if (!compactKeyword) return 0
  if (haystack === compactKeyword) return 100
  if (haystack.includes(compactKeyword)) return 70
  if (compactKeyword.includes(haystack)) return 40
  return FUEL_SEARCH_PATTERN.test(keyword) ? 10 : 0
}

function mapRoadType(props = {}) {
  if (JUNCTION_TURN_TYPES.has(Number(props.turnType))) return 'junction'
  const roadTypeCode = Number(props.roadType)
  const roadName = String(props.roadName ?? props.name ?? props.description ?? '')

  if ([4, 5, 6].includes(roadTypeCode)) return 'highway'
  if (/고속도로|도시고속|자동차전용/.test(roadName)) return 'highway'
  if (/국도|번국도|국가지원지방도/.test(roadName)) return 'national'
  return 'local'
}

function estimateSegmentSpeedLimit(props = {}, roadType) {
  const raw = Number(props.speedLimit ?? props.limitSpeed ?? props.maxSpeed ?? props.restrictedSpeed ?? 0)
  const roadName = String(props.roadName ?? props.name ?? props.description ?? '')
  const isSchoolZone = /어린이|스쿨존|보호구역/.test(roadName)

  if (Number.isFinite(raw) && raw > 0) {
    if (isSchoolZone) return 30
    if (roadType === 'local') return Math.min(raw, 60)
    if (roadType === 'national') return Math.min(raw, 90)
    if (roadType === 'highway') return Math.min(raw, 110)
    return raw
  }

  if (isSchoolZone) return 30
  if (roadType === 'local') {
    if (/대로|로|길/.test(roadName)) return 50
    return 40
  }
  if (roadType === 'national') return 80
  if (roadType === 'highway') return 100
  return null
}

function estimateSegmentAverageSpeed(props = {}, roadType, speedLimit) {
  const rawSpeed = Number(props.speed ?? props.avgSpeed ?? props.trafficSpeed ?? 0)
  if (Number.isFinite(rawSpeed) && rawSpeed > 0) {
    const clamped = Number.isFinite(speedLimit) && speedLimit > 0
      ? Math.min(rawSpeed, speedLimit)
      : roadType === 'local'
        ? Math.min(rawSpeed, 60)
        : roadType === 'national'
          ? Math.min(rawSpeed, 90)
          : rawSpeed
    return Math.round(clamped)
  }

  const distance = Number(props.distance ?? 0)
  const time = Number(props.time ?? props.sectionTime ?? 0)
  if (distance > 0 && time > 0) {
    const calculated = Math.max(5, Math.round((distance / time) * 3.6))
    const clamped = Number.isFinite(speedLimit) && speedLimit > 0
      ? Math.min(calculated, speedLimit)
      : roadType === 'local'
        ? Math.min(calculated, 60)
        : roadType === 'national'
          ? Math.min(calculated, 90)
          : calculated
    return clamped
  }

  return null
}

function estimateSegmentCongestionScore(props = {}, averageSpeed, speedLimit) {
  const traffic = String(props.traffic ?? '')
  if (traffic === '2') return 3
  if (traffic === '1') return 2
  if (traffic === '0') return 1

  if (Number.isFinite(averageSpeed) && Number.isFinite(speedLimit) && speedLimit > 0) {
    if (averageSpeed < speedLimit * 0.6) return 3
    if (averageSpeed < speedLimit * 0.8) return 2
  }

  return 1
}

function isSyntheticAddress(address) {
  return /(시점|종점|\d+km 지점|현재 위치 기준)/.test(String(address ?? ''))
}

function isSyntheticName(name) {
  return /(시점|종점|선택한 위치|지도 선택|현재 위치)/.test(String(name ?? ''))
}

function buildNearbyFallback(category, lat, lng) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.주유소
  const offsets = [
    [0.0045, 0.0025],
    [0.0072, -0.0031],
    [-0.0040, 0.0046],
    [0.0094, 0.0065],
    [-0.0068, -0.0038],
    [0.0122, 0.0022],
  ]
  return offsets.map(([latOffset, lngOffset], index) => ({
    id: `${meta.key}-${index}`,
    name: `${meta.seeds[index % meta.seeds.length]} ${index + 1}`,
    address: `${category} · 현재 위치 기준 ${(index + 1) * 300}m`,
    lat: lat + latOffset,
    lng: lng + lngOffset,
    category,
    distanceKm: Number((((index + 1) * 0.3)).toFixed(1)),
  }))
}

function buildNearbyRestStopFallback(lat, lng, routePolyline = []) {
  return HIGHWAYS.flatMap((road) =>
    (road.restStops ?? []).map((stop) => {
      const routeDistanceKm = distanceKmToPolyline(stop.coord[0], stop.coord[1], routePolyline)
      const distanceKm = Number(haversineKm(lat, lng, stop.coord[0], stop.coord[1]).toFixed(1))
      return {
        id: stop.id,
        name: stop.name,
        address: `${road.name} · ${stop.type === 'service' ? '휴게소' : '졸음쉼터'}`,
        lat: stop.coord[0],
        lng: stop.coord[1],
        category: stop.type === 'service' ? '휴게소' : '졸음쉼터',
        roadName: road.name,
        kmMarker: stop.km ?? null,
        distanceKm,
        routeDistanceKm,
        isRouteCorridor: routeDistanceKm != null ? routeDistanceKm <= 2.2 : false,
      }
    })
  )
    .sort((a, b) => {
      if (a.isRouteCorridor !== b.isRouteCorridor) return a.isRouteCorridor ? -1 : 1
      if ((a.routeDistanceKm ?? Infinity) !== (b.routeDistanceKm ?? Infinity)) {
        return (a.routeDistanceKm ?? Infinity) - (b.routeDistanceKm ?? Infinity)
      }
      return a.distanceKm - b.distanceKm
    })
    .slice(0, 8)
}

function distanceKmToPolyline(lat, lng, polyline = []) {
  if (!Array.isArray(polyline) || polyline.length === 0) return null
  let best = Infinity
  for (let index = 0; index < polyline.length; index += 1) {
    const point = polyline[index]
    const distance = haversineKm(lat, lng, point[0], point[1])
    if (distance < best) best = distance
  }
  return Number.isFinite(best) ? Number(best.toFixed(1)) : null
}

function enrichFuelStops(results, routePolyline = [], settings = {}) {
  const sorted = results.map((result) => {
    const fuelPrice = Number.isFinite(result.fuelPrice) && result.fuelPrice > 0
      ? result.fuelPrice
      : null
    const routeDistanceKm = distanceKmToPolyline(result.lat, result.lng, routePolyline)
    return applyFuelBenefitMeta({
      ...result,
      fuelPrice,
      fuelLabel: result.fuelLabel ?? '휘발유',
      priceSource: Number.isFinite(result.fuelPrice) && result.fuelPrice > 0
        ? (result.priceSource ?? 'opinet')
        : 'unknown',
      routeDistanceKm,
      isRouteCorridor: routeDistanceKm != null ? routeDistanceKm <= 1.5 : false,
    }, settings)
  })
  const routeLowest = sorted
    .filter((item) => item.isRouteCorridor && Number.isFinite(item.fuelPrice))
    .sort((a, b) => getFuelSortPrice(a, settings) - getFuelSortPrice(b, settings))[0] ?? null
  const nearbyLowest = [...sorted]
    .filter((item) => Number.isFinite(item.fuelPrice))
    .sort((a, b) => getFuelSortPrice(a, settings) - getFuelSortPrice(b, settings))[0] ?? null
  return sorted.map((item) => ({
    ...item,
    nearbyLowestFuelPrice: nearbyLowest?.discountedFuelPrice ?? nearbyLowest?.fuelPrice ?? null,
    routeLowestFuelPrice: routeLowest?.discountedFuelPrice ?? nearbyLowest?.discountedFuelPrice ?? routeLowest?.fuelPrice ?? nearbyLowest?.fuelPrice ?? null,
  }))
}

function mergeFuelSearchResults(baseResults = [], liveFuelResults = [], routePolyline = [], keyword = '', nearLat = null, nearLng = null, settings = {}) {
  const liveFuel = [...liveFuelResults]
  const merged = baseResults.map((result) => {
    const matched = liveFuel.find((station) => {
      const distanceKm = haversineKm(result.lat, result.lng, station.lat, station.lng)
      const sameName = normalizeFuelText(result.name).includes(normalizeFuelText(station.name))
        || normalizeFuelText(station.name).includes(normalizeFuelText(result.name))
      return distanceKm <= 0.45 || sameName
    }) ?? null

    if (!matched) {
      return {
        ...result,
        fuelPrice: null,
        fuelLabel: '휘발유',
        priceSource: 'unknown',
      }
    }

    return {
      ...result,
      brand: matched.brand ?? result.brand,
      address: result.address || matched.address,
      lat: matched.lat ?? result.lat,
      lng: matched.lng ?? result.lng,
      fuelPrice: matched.fuelPrice,
      fuelLabel: matched.fuelLabel ?? '휘발유',
      priceSource: matched.priceSource ?? 'opinet',
      distanceKm: nearLat != null && nearLng != null
        ? Number(haversineKm(nearLat, nearLng, matched.lat, matched.lng).toFixed(1))
        : matched.distanceKm ?? result.distanceKm,
    }
  })

  const unmatchedLiveFuel = liveFuel.filter((station) =>
    !merged.some((result) => haversineKm(result.lat, result.lng, station.lat, station.lng) <= 0.2)
  )

  const combined = enrichFuelStops(
    [...merged, ...unmatchedLiveFuel].filter((item, index, all) =>
      all.findIndex((other) => haversineKm(other.lat, other.lng, item.lat, item.lng) <= 0.05) === index
    ),
    routePolyline,
    settings
  )

  return combined.sort((a, b) => {
    const keywordDiff = scoreFuelKeywordMatch(b, keyword) - scoreFuelKeywordMatch(a, keyword)
    if (keywordDiff !== 0) return keywordDiff
    const priceDiff = getFuelSortPrice(a, settings) - getFuelSortPrice(b, settings)
    if (priceDiff !== 0) return priceDiff
    const routeDiff = (a.routeDistanceKm ?? Infinity) - (b.routeDistanceKm ?? Infinity)
    if (routeDiff !== 0) return routeDiff
    return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
  })
}

function estimateParkingFee(poi, index = 0) {
  const name = String(poi?.name ?? '')
  const address = String(poi?.address ?? '')
  const text = `${name} ${address}`

  if (/무료|무료개방/.test(text)) {
    return {
      parkingFeeLabel: '무료',
      parkingFeeSource: 'estimated',
      parkingFeePerHour: 0,
    }
  }

  const base = /공영|환승/.test(text)
    ? 2200
    : /민영|타워|백화점|복합몰/.test(text)
      ? 4600
      : 3200
  const variation = ((index * 11) % 7) * 200
  const perHour = base + variation
  return {
    parkingFeeLabel: `시간당 약 ${perHour.toLocaleString()}원`,
    parkingFeeSource: 'estimated',
    parkingFeePerHour: perHour,
  }
}

function enrichParkingPlaces(results) {
  return results.map((result, index) => ({
    ...result,
    ...estimateParkingFee(result, index),
  }))
}

async function fetchHospitalHoursMeta(results = []) {
  const targets = results
    .filter((item) => isHospitalPoi(item))
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      name: item.name,
      address: item.address,
      lat: item.lat,
      lng: item.lng,
    }))

  if (targets.length === 0) return new Map()

  const params = new URLSearchParams({
    meta: 'hospitalHours',
    items: JSON.stringify(targets),
  })
  const res = await fetch(`/api/meta/tmap-status?${params}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) return new Map()
  const json = await res.json().catch(() => ({}))
  const items = Array.isArray(json?.items) ? json.items : []
  return new Map(items.map((item) => [item.sourceId, item.hospital]).filter(([, hospital]) => Boolean(hospital)))
}

async function fetchRestaurantRatingsMeta(results = []) {
  const targets = results
    .filter((item) => isRestaurantPoi(item))
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      name: item.name,
      address: item.address,
      lat: item.lat,
      lng: item.lng,
    }))

  if (targets.length === 0) return new Map()

  const res = await fetch('/api/meta/tmap-status', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      meta: 'restaurantRatings',
      items: targets,
    }),
  })

  if (!res.ok) return new Map()
  const json = await res.json().catch(() => ({}))
  const items = Array.isArray(json?.items) ? json.items : []
  return new Map(items.map((item) => [item.sourceId, item.restaurant]).filter(([, restaurant]) => Boolean(restaurant)))
}

async function enrichHospitalPlaces(results = []) {
  const hospitalMap = await fetchHospitalHoursMeta(results).catch(() => new Map())
  if (hospitalMap.size === 0) return results

  return results.map((result) => {
    const meta = hospitalMap.get(result.id)
    if (!meta) return result
    return {
      ...result,
      hospitalHoursSource: meta.source ?? 'public-medical-data',
      isOpenNow: meta.isOpenNow,
      todayHoursLabel: meta.todayHoursLabel,
      saturdayOpen: meta.saturdayOpen,
      sundayOpen: meta.sundayOpen,
      dutyTel1: meta.dutyTel1,
      dutyDivNam: meta.dutyDivNam,
    }
  })
}

function attachRouteCorridorMeta(results = [], routePolyline = [], corridorKm = 10) {
  return results.map((result) => {
    const routeDistanceKm = distanceKmToPolyline(result.lat, result.lng, routePolyline)
    return {
      ...result,
      routeDistanceKm,
      isRouteCorridor: routeDistanceKm != null ? routeDistanceKm <= corridorKm : false,
    }
  })
}

async function enrichRestaurantPlaces(results = [], routePolyline = []) {
  const withKeys = attachRouteCorridorMeta(results, routePolyline, 10).map((result) => ({
    ...result,
    restaurantRatingKey: buildRestaurantRatingKey(result),
  }))
  const restaurantMap = await fetchRestaurantRatingsMeta(withKeys).catch(() => new Map())

  return withKeys
    .map((result) => {
      const meta = restaurantMap.get(result.id)
      if (!meta) {
        return {
          ...result,
          googleRating: null,
          googleUserRatingCount: null,
          googleOpenNow: null,
          googleMapsUri: null,
          googleRatingSource: 'unavailable',
        }
      }
      return {
        ...result,
        googlePlaceId: meta.placeId ?? null,
        googleRating: Number.isFinite(Number(meta.rating)) ? Number(meta.rating) : null,
        googleUserRatingCount: Number.isFinite(Number(meta.userRatingCount)) ? Number(meta.userRatingCount) : null,
        googleOpenNow: typeof meta.openNow === 'boolean' ? meta.openNow : null,
        googleMapsUri: meta.googleMapsUri ?? null,
        googleRatingSource: meta.source ?? 'google-places',
      }
    })
    .sort((a, b) => {
      if (a.isRouteCorridor !== b.isRouteCorridor) return a.isRouteCorridor ? -1 : 1
      const ratingDiff = (Number(b.googleRating) || -1) - (Number(a.googleRating) || -1)
      if (ratingDiff !== 0) return ratingDiff
      const reviewDiff = (Number(b.googleUserRatingCount) || -1) - (Number(a.googleUserRatingCount) || -1)
      if (reviewDiff !== 0) return reviewDiff
      const routeDiff = (a.routeDistanceKm ?? Infinity) - (b.routeDistanceKm ?? Infinity)
      if (routeDiff !== 0) return routeDiff
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    })
}

async function fetchNearbyFuelFromApi(lat, lng, routePolyline = [], options = {}) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(options.radius ?? 5000),
    productCode: String(options.productCode ?? 'B027'),
    limit: String(options.limit ?? 8),
  })
  if (options.keyword) params.set('keyword', String(options.keyword))
  const res = await fetch(`/api/fuel/nearby?${params}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody?.error?.message ?? errorBody?.error?.code ?? `HTTP ${res.status}`)
  }
  const json = await res.json()
  return enrichFuelStops(json.items ?? [], routePolyline, options.settings)
}

async function fetchFuelSearchResults(keyword, nearLat, nearLng, routePolyline = [], settings = {}) {
  if (!Number.isFinite(nearLat) || !Number.isFinite(nearLng)) return []
  const liveFuel = await fetchNearbyFuelFromApi(nearLat, nearLng, routePolyline, {
    radius: 5000,
    limit: 10,
    keyword,
    settings,
  }).catch(() => [])

  if (liveFuel.length === 0) return []
  const ranked = [...liveFuel].sort((a, b) => {
    const keywordDiff = scoreFuelKeywordMatch(b, keyword) - scoreFuelKeywordMatch(a, keyword)
    if (keywordDiff !== 0) return keywordDiff
    const priceDiff = getFuelSortPrice(a, settings) - getFuelSortPrice(b, settings)
    if (priceDiff !== 0) return priceDiff
    const routeDiff = (a.routeDistanceKm ?? Infinity) - (b.routeDistanceKm ?? Infinity)
    if (routeDiff !== 0) return routeDiff
    return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
  })
  return ranked
}

async function fetchRestStopFuelPrices(stops = []) {
  if (!Array.isArray(stops) || stops.length === 0) return []
  const res = await fetch('/api/fuel/rest-prices', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      productCode: 'B027',
      stops: stops.map((stop) => ({
        id: stop.id,
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
      })),
    }),
  })
  if (!res.ok) return []
  const json = await res.json().catch(() => ({}))
  return Array.isArray(json?.items) ? json.items : []
}

function getUpcomingRouteRestStops(routePolyline = [], userLocation = null, limit = 2) {
  if (!userLocation || !Array.isArray(routePolyline) || routePolyline.length < 2) return []
  const currentProjection = getNearestPolylinePointIndex(userLocation.lat, userLocation.lng, routePolyline)
  if (currentProjection.index < 0) return []

  return HIGHWAYS.flatMap((road) =>
    (road.restStops ?? []).map((stop) => {
      const stopProjection = getNearestPolylinePointIndex(stop.coord[0], stop.coord[1], routePolyline)
      if (stopProjection.index < 0) return null
      if (stopProjection.distanceKm > 1.8) return null
      if (stopProjection.index <= currentProjection.index + 2) return null
      return {
        id: stop.id,
        name: stop.name,
        roadName: road.name,
        type: stop.type,
        kmMarker: stop.km ?? null,
        lat: stop.coord[0],
        lng: stop.coord[1],
        distanceFromCurrentKm: getPolylineDistanceBetweenIndices(routePolyline, currentProjection.index, stopProjection.index),
      }
    })
  )
    .filter(Boolean)
    .sort((a, b) => a.distanceFromCurrentKm - b.distanceFromCurrentKm)
    .slice(0, limit)
}

export async function fetchUpcomingFuelContext(routePolyline = [], userLocation = null, settings = {}) {
  if (!userLocation || !Array.isArray(routePolyline) || routePolyline.length < 2) {
    return { nextRouteFuel: null, nextRestFuelStops: [] }
  }

  const liveFuel = await fetchNearbyFuelFromApi(userLocation.lat, userLocation.lng, routePolyline, {
    radius: 5000,
    limit: 8,
    settings,
  }).catch(() => [])

  const nextRouteFuel = liveFuel
    .filter((item) => item.isRouteCorridor)
    .sort((a, b) => {
      const priceDiff = getFuelSortPrice(a, settings) - getFuelSortPrice(b, settings)
      if (priceDiff !== 0) return priceDiff
      const routeDiff = (a.routeDistanceKm ?? Infinity) - (b.routeDistanceKm ?? Infinity)
      if (routeDiff !== 0) return routeDiff
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    })[0] ?? null

  const upcomingStops = getUpcomingRouteRestStops(routePolyline, userLocation, 2)
  const restFuelMatches = await fetchRestStopFuelPrices(upcomingStops).catch(() => [])
  const nextRestFuelStops = upcomingStops.map((stop) => {
    const matched = restFuelMatches.find((item) => item.stopId === stop.id)?.station ?? null
    return {
      ...stop,
      fuelStation: matched ? applyFuelBenefitMeta(matched, settings) : null,
    }
  })

  return {
    nextRouteFuel,
    nextRestFuelStops,
  }
}

function buildSearchOptionAttempts(option) {
  const raw = String(option ?? '00').trim()
  return [...new Set([raw, normalizeSearchOption(raw)].filter(Boolean))]
}

export async function fetchTmapStatus() {
  try {
    const res = await fetch('/api/meta/tmap-status')
    if (!res.ok) throw new Error('TMAP 상태 조회 실패')
    return await res.json()
  } catch {
    const hasLocalKey = Boolean(import.meta.env.VITE_TMAP_API_KEY || import.meta.env.TMAP_API_KEY)
    return { hasApiKey: hasLocalKey, mode: hasLocalKey ? 'live' : 'simulation' }
  }
}

async function fetchPoiSearch(keyword, nearLat, nearLng, searchtypCd = 'A') {
  const params = new URLSearchParams({
    version: '1',
    searchKeyword: keyword,
    searchType: 'all',
    searchtypCd,
    page: '1',
    resCoordType: 'WGS84GEO',
    reqCoordType: 'WGS84GEO',
    multiPoint: 'N',
    poiGroupYn: 'N',
    count: '20',
    ...(nearLat != null && nearLng != null ? { centerLat: String(nearLat), centerLon: String(nearLng) } : {}),
  })
  const res = await fetch(`${BASE}/pois?${params}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}))
    throw new Error(errJson?.error?.errorMessage ?? errJson?.error?.code ?? `HTTP ${res.status}`)
  }
  const json = await res.json()
  const pois = json?.searchPoiInfo?.pois?.poi ?? []
  return pois.map(normalizePoi).filter((poi) => Number.isFinite(poi.lat) && Number.isFinite(poi.lng))
}

async function fetchFullAddrGeo(keyword) {
  const params = new URLSearchParams({
    version: '1',
    fullAddr: keyword,
    coordType: 'WGS84GEO',
    addressFlag: 'F00',
    page: '1',
    count: '15',
  })
  const res = await fetch(`${BASE}/geo/fullAddrGeo?${params}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const coordinates = json?.coordinateInfo?.coordinate ?? []
  return coordinates
    .map((item, index) => ({
      id: `fulladdr-${index}-${item.newLat ?? item.lat}`,
      name: item.fullAddress ?? item.roadName ?? keyword,
      address: item.fullAddress ?? keyword,
      lat: parseFloat(item.newLat ?? item.lat),
      lng: parseFloat(item.newLon ?? item.lon),
      category: '주소',
    }))
    .filter((poi) => Number.isFinite(poi.lat) && Number.isFinite(poi.lng))
}

export async function searchPOI(keyword, nearLat, nearLng, options = {}) {
  const trimmedKeyword = String(keyword ?? '').trim()
  const routePolyline = options.routePolyline ?? []
  const fuelSettings = options.fuelSettings ?? {}
  const includeFuelMeta = options.includeFuelMeta ?? isFuelSearchKeyword(trimmedKeyword)
  const includeParkingMeta = options.includeParkingMeta ?? isParkingSearchKeyword(trimmedKeyword)
  const includeHospitalMeta = options.includeHospitalMeta ?? isHospitalSearchKeyword(trimmedKeyword)
  const includeRestaurantMeta = options.includeRestaurantMeta ?? isRestaurantSearchKeyword(trimmedKeyword)
  if (trimmedKeyword.length < 2) return []

  const cached = getCachedSearch(trimmedKeyword, nearLat, nearLng)
  if (cached) {
    const cachedWithDistance = cached.map((item) => ({
      ...item,
      distanceKm: nearLat != null && nearLng != null
        ? Number(haversineKm(nearLat, nearLng, item.lat, item.lng).toFixed(1))
        : item.distanceKm,
    }))
    if (includeFuelMeta) {
      const liveFuelResults = await fetchFuelSearchResults(trimmedKeyword, nearLat, nearLng, routePolyline, fuelSettings).catch(() => [])
      return mergeFuelSearchResults(
        cachedWithDistance,
        liveFuelResults,
        routePolyline,
        trimmedKeyword,
        nearLat,
        nearLng,
        fuelSettings
      )
    }
    if (includeParkingMeta) {
      return enrichParkingPlaces(cachedWithDistance)
    }
    if (includeHospitalMeta || cachedWithDistance.some((item) => isHospitalPoi(item))) {
      return enrichHospitalPlaces(cachedWithDistance)
    }
    if (includeRestaurantMeta || cachedWithDistance.some((item) => isRestaurantPoi(item))) {
      return enrichRestaurantPlaces(cachedWithDistance, routePolyline)
    }
    return cachedWithDistance
  }

  const localFastResults = searchFallbackPlaces(trimmedKeyword, nearLat, nearLng)
  const compactKeyword = normalizeSearchText(trimmedKeyword)
  const exactLocalResults = localFastResults.filter((item) => {
    const fields = [item.name, item.address, ...(item.aliases ?? [])]
      .map((value) => normalizeSearchText(value))
      .filter(Boolean)
    return fields.some((value) => value === compactKeyword || value.startsWith(compactKeyword))
  })

  const hasExactLocalMatch = exactLocalResults.some((item) => {
    const fields = [item.name, ...(item.aliases ?? [])]
      .map((value) => normalizeSearchText(value))
      .filter(Boolean)
    return fields.some((value) => value === compactKeyword)
  })

  if (exactLocalResults.length >= 3 || hasExactLocalMatch || (exactLocalResults.length > 0 && trimmedKeyword.length <= 6)) {
    const fastResults = exactLocalResults.slice(0, 10)
    setCachedSearch(trimmedKeyword, nearLat, nearLng, fastResults)
    const fastResultsWithDistance = fastResults.map((item) => ({
      ...item,
      distanceKm: nearLat != null && nearLng != null
        ? Number(haversineKm(nearLat, nearLng, item.lat, item.lng).toFixed(1))
        : item.distanceKm,
    }))
    if (includeFuelMeta) {
      const liveFuelResults = await fetchFuelSearchResults(trimmedKeyword, nearLat, nearLng, routePolyline, fuelSettings).catch(() => [])
      return mergeFuelSearchResults(
        fastResultsWithDistance,
        liveFuelResults,
        routePolyline,
        trimmedKeyword,
        nearLat,
        nearLng,
        fuelSettings
      )
    }
    if (includeParkingMeta) {
      return enrichParkingPlaces(fastResultsWithDistance)
    }
    if (includeHospitalMeta || fastResultsWithDistance.some((item) => isHospitalPoi(item))) {
      return enrichHospitalPlaces(fastResultsWithDistance)
    }
    if (includeRestaurantMeta || fastResultsWithDistance.some((item) => isRestaurantPoi(item))) {
      return enrichRestaurantPlaces(fastResultsWithDistance, routePolyline)
    }
    return fastResultsWithDistance
  }

  const isRoadAddress = ROAD_ADDRESS_PATTERN.test(trimmedKeyword)
  let results = []

  if (isRoadAddress) {
    // 도로명/지번 주소: fullAddrGeo 우선, POI 병렬 시도
    const [addrResults, poiResults] = await Promise.all([
      fetchFullAddrGeo(trimmedKeyword).catch(() => []),
      fetchPoiSearch(trimmedKeyword, nearLat, nearLng).catch(() => []),
    ])
    const combined = [...addrResults, ...poiResults]
    const unique = combined.filter((item, index, all) =>
      all.findIndex((other) => Math.abs(other.lat - item.lat) < 0.0001 && Math.abs(other.lng - item.lng) < 0.0001) === index
    )
    if (unique.length > 0) results = unique
  } else {
    // 건물명/업체명: POI 검색 (전체 + 업종 병렬)
    const [poiAll, poiBiz] = await Promise.all([
      fetchPoiSearch(trimmedKeyword, nearLat, nearLng, 'A').catch(() => []),
      fetchPoiSearch(trimmedKeyword, nearLat, nearLng, 'B').catch(() => []),
    ])
    // 중복 제거 (id 기준)
    const seen = new Set()
    const combined = [...poiAll, ...poiBiz].filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    if (combined.length > 0) {
      results = combined
    } else {
      // POI 결과 없으면 fullAddrGeo도 시도
      const addrResults = await fetchFullAddrGeo(trimmedKeyword).catch(() => [])
      if (addrResults.length > 0) results = addrResults
    }
  }

  if (results.length === 0) {
    results = localFastResults
  } else if (localFastResults.length > 0) {
    const merged = [...localFastResults, ...results]
    results = merged.filter((item, index, all) =>
      all.findIndex((other) => Math.abs(other.lat - item.lat) < 0.0001 && Math.abs(other.lng - item.lng) < 0.0001) === index
    )
  }

  const finalResults = results.slice(0, 15)
  setCachedSearch(trimmedKeyword, nearLat, nearLng, finalResults)
  const finalResultsWithDistance = finalResults.map((item) => ({
    ...item,
    distanceKm: nearLat != null && nearLng != null
      ? Number(haversineKm(nearLat, nearLng, item.lat, item.lng).toFixed(1))
      : item.distanceKm,
  }))
  if (includeFuelMeta) {
    const liveFuelResults = await fetchFuelSearchResults(trimmedKeyword, nearLat, nearLng, routePolyline, fuelSettings).catch(() => [])
    return mergeFuelSearchResults(
      finalResultsWithDistance,
      liveFuelResults,
      routePolyline,
      trimmedKeyword,
      nearLat,
      nearLng,
      fuelSettings
    )
  }
  if (includeParkingMeta) {
    return enrichParkingPlaces(finalResultsWithDistance)
  }
  if (includeHospitalMeta || finalResultsWithDistance.some((item) => isHospitalPoi(item))) {
    return enrichHospitalPlaces(finalResultsWithDistance)
  }
  if (includeRestaurantMeta || finalResultsWithDistance.some((item) => isRestaurantPoi(item))) {
    return enrichRestaurantPlaces(finalResultsWithDistance, routePolyline)
  }
  return finalResultsWithDistance
}

async function fetchRouteCorridorRestaurants(lat, lng, routePolyline = []) {
  if (!Array.isArray(routePolyline) || routePolyline.length < 2) {
    const nearby = await searchPOI('음식점', lat, lng, { includeRestaurantMeta: true })
    return nearby
      .map((item) => ({
        ...item,
        routeDistanceKm: item.distanceKm ?? null,
        isRouteCorridor: Number.isFinite(Number(item.distanceKm)) ? Number(item.distanceKm) <= 10 : false,
      }))
      .filter((item) => item.isRouteCorridor)
      .sort((a, b) => {
        const ratingDiff = (Number(b.googleRating) || -1) - (Number(a.googleRating) || -1)
        if (ratingDiff !== 0) return ratingDiff
        const reviewDiff = (Number(b.googleUserRatingCount) || -1) - (Number(a.googleUserRatingCount) || -1)
        if (reviewDiff !== 0) return reviewDiff
        return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
      })
      .slice(0, 18)
  }

  const sampleIndexes = [...new Set([
    0,
    Math.floor(routePolyline.length * 0.2),
    Math.floor(routePolyline.length * 0.45),
    Math.floor(routePolyline.length * 0.7),
    routePolyline.length - 1,
  ])].filter((index) => index >= 0 && index < routePolyline.length)

  const searchResults = await Promise.all(
    sampleIndexes.map((index) => {
      const point = routePolyline[index]
      return fetchPoiSearch('음식점', point[0], point[1], 'B').catch(() => [])
    })
  )

  const seen = new Set()
  const merged = searchResults
    .flat()
    .filter((item) => {
      const key = item.id ?? `${item.name}-${item.lat}-${item.lng}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((item) => ({
      ...item,
      distanceKm: Number(haversineKm(lat, lng, item.lat, item.lng).toFixed(1)),
    }))

  const corridorOnly = attachRouteCorridorMeta(merged, routePolyline, 10)
    .filter((item) => item.isRouteCorridor)
    .slice(0, 18)

  return enrichRestaurantPlaces(corridorOnly, routePolyline)
}

export async function searchNearbyPOIs(category, lat, lng, options = {}) {
  const routePolyline = options.routePolyline ?? []
  const fuelSettings = options.fuelSettings ?? {}
  if (category === '주유소') {
    try {
      const liveFuel = await fetchNearbyFuelFromApi(lat, lng, routePolyline, { settings: fuelSettings })
      if (liveFuel.length > 0) return liveFuel
    } catch {
      // 오피넷 미설정/실패 시 TMAP+추정가 폴백
    }
  }

  if (category === '휴게소') {
    const restStops = buildNearbyRestStopFallback(lat, lng, routePolyline)
    if (restStops.length > 0) return restStops
  }

  if (category === '음식점') {
    const restaurants = await fetchRouteCorridorRestaurants(lat, lng, routePolyline).catch(() => [])
    if (restaurants.length > 0) return restaurants
    const fallbackRestaurants = buildNearbyFallback('음식점', lat, lng)
    return enrichRestaurantPlaces(fallbackRestaurants, routePolyline)
  }

  const results = await searchPOI(category, lat, lng, {
    routePolyline,
    includeRestaurantMeta: category === '음식점',
    fuelSettings,
  })
  if (results.length > 0) {
    const enriched = results
      .map((result) => ({
        ...result,
        distanceKm: Number(haversineKm(lat, lng, result.lat, result.lng).toFixed(1)),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
    if (category === '주유소') return enrichFuelStops(enriched, routePolyline, fuelSettings)
    if (category === '음식점') return enrichRestaurantPlaces(enriched, routePolyline)
    return enriched
  }
  const fallback = buildNearbyFallback(category, lat, lng)
  if (category === '주유소') return enrichFuelStops(fallback, routePolyline, fuelSettings)
  if (category === '주차장') return enrichParkingPlaces(fallback)
  return fallback
}

export async function searchSafetyHazards(lat, lng) {
  const [schools, kindergartens, bumps] = await Promise.all([
    fetchPoiSearch('초등학교', lat, lng, 'A').catch(() => []),
    fetchPoiSearch('유치원', lat, lng, 'A').catch(() => []),
    fetchPoiSearch('방지턱', lat, lng, 'A').catch(() => []),
  ])

  const schoolHazards = [...schools, ...kindergartens]
    .slice(0, 8)
    .map((poi) => ({
      id: `school-${poi.id}`,
      name: poi.name,
      address: poi.address,
      lat: poi.lat,
      lng: poi.lng,
      type: 'school_zone',
      distanceKm: Number(haversineKm(lat, lng, poi.lat, poi.lng).toFixed(1)),
      speedLimit: 30,
      alertText: `${poi.name} 인근 어린이보호구역 주의`,
    }))

  const bumpHazards = bumps
    .slice(0, 6)
    .map((poi) => ({
      id: `bump-${poi.id}`,
      name: poi.name,
      address: poi.address,
      lat: poi.lat,
      lng: poi.lng,
      type: 'speed_bump',
      distanceKm: Number(haversineKm(lat, lng, poi.lat, poi.lng).toFixed(1)),
      speedLimit: null,
      alertText: `${poi.name || '방지턱'} 인근 감속`,
    }))

  return [...schoolHazards, ...bumpHazards]
    .filter((item, index, all) =>
      all.findIndex((other) => other.type === item.type && Math.abs(other.lat - item.lat) < 0.00015 && Math.abs(other.lng - item.lng) < 0.00015) === index
    )
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

export async function fetchRoutes(startLat, startLng, endLat, endLng, preferences = {}) {
  const start = { lat: startLat, lng: startLng, name: '출발' }
  const dest = { lat: endLat, lng: endLng, name: '도착' }
  const { roadType = 'mixed' } = preferences

  // roadType에 따라 기본 탐색 옵션 조정
  // highway_only → 고속 우선을 베이스라인으로, national_road → 국도 포함 우선
  const directOpts = roadType === 'highway_only'
    ? [
        { searchOption: '04', title: '고속도로 우선', tag: '추천', tagColor: 'blue', isBaseline: true },
        { searchOption: '00', title: '추천 경로', tag: '추천경로', tagColor: 'blue' },
      ]
    : roadType === 'national_road'
      ? [
          { searchOption: '00', title: '추천 경로', tag: '추천', tagColor: 'blue', isBaseline: true },
          { searchOption: '10', title: '최단거리', tag: '최단', tagColor: 'orange' },
        ]
      : [
          { searchOption: '00', title: '추천 경로', tag: '추천', tagColor: 'blue', isBaseline: true },
          { searchOption: '04', title: '고속도로 우선', tag: '고속', tagColor: 'blue' },
        ]
  const directResults = await Promise.allSettled(
    directOpts.map((opt) => fetchSingleRoute(startLat, startLng, endLat, endLng, opt))
  )
  const routes = directResults
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => ({ ...r.value, source: 'live' }))

  if (routes.length === 0) {
    const failed = directResults.find((r) => r.status === 'rejected')
    throw failed?.reason ?? new Error('경로를 찾을 수 없습니다')
  }

  // Step 2: 기본 경로의 IC/JC 분기점을 경유지로 삼아 실제로 다른 경로 생성
  const baseRoute = routes[0]
  const junctions = baseRoute?.junctions ?? []

  if (junctions.length >= 2) {
    // 1/3 지점 분기점 경유 → 다른 경로 강제
    const viaA = junctions[Math.floor(junctions.length * 0.35)]
    // 2/3 지점 분기점 경유 → 또 다른 경로
    const viaB = junctions[Math.floor(junctions.length * 0.65)]

    const viaResults = await Promise.allSettled([
      fetchRouteByWaypoints(start, dest, [viaA], {
        id: `route-via-a`,
        searchOption: '00',
        title: `${viaA.name} 경유`,
        tag: `${viaA.name}`,
        tagColor: 'green',
      }),
      junctions.length >= 4
        ? fetchRouteByWaypoints(start, dest, [viaB], {
            id: `route-via-b`,
            searchOption: '00',
            title: `${viaB.name} 경유`,
            tag: `${viaB.name}`,
            tagColor: 'orange',
          })
        : Promise.reject(new Error('skip')),
    ])

    for (const r of viaResults) {
      if (r.status === 'fulfilled' && r.value) {
        routes.push({ ...r.value, source: 'live' })
      }
    }
  }

  // 중복 제거: ETA가 2분 미만 차이이고 거리도 1km 미만 차이면 같은 경로로 간주
  return routes.filter((route, index, all) =>
    all.findIndex((other) =>
      Math.abs(other.eta - route.eta) < 2 && Math.abs((other.distance ?? 0) - (route.distance ?? 0)) < 1
    ) === index
  )
}

export async function fetchRouteByWaypoints(start, destination, wayPoints = [], option = {}) {
  const startTime = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  let lastMessage = 'TMAP 경유 경로 응답 실패'

  for (const searchOption of buildSearchOptionAttempts(option.searchOption ?? '00')) {
    const body = {
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      startName: sanitizeRouteLabel(start.name, '출발'),
      startX: String(start.lng),
      startY: String(start.lat),
      startTime,
      endName: sanitizeRouteLabel(destination.name, '도착'),
      endX: String(destination.lng),
      endY: String(destination.lat),
      searchOption,
      carType: '0',
      viaPoints: wayPoints.map((point, index) => ({
        viaPointId: point.id ?? `via-${index}`,
        viaPointName: sanitizeRouteLabel(point.name, `경유지 ${index + 1}`),
        viaX: String(point.lng),
        viaY: String(point.lat),
        viaTime: String(point.viaTime ?? 0),
      })),
    }

    const res = await fetch(`${BASE}/routes/routeSequential30?version=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const json = await res.json()
      return parseRouteResponse(json, { ...option, searchOption })
    }

    try {
      const json = await res.json()
      lastMessage = buildRouteErrorMessage(res, json)
    } catch {
      lastMessage = res.status === 429 ? 'TMAP 요청이 많아 잠시 후 다시 시도해주세요.' : `TMAP HTTP ${res.status}`
    }

    if (res.status === 429) {
      throw new Error(lastMessage)
    }
  }

  throw new Error(lastMessage)
}

export async function fetchDirectRoute(startLat, startLng, endLat, endLng, option = {}) {
  return fetchSingleRoute(startLat, startLng, endLat, endLng, { searchOption: '00', ...option })
}

export async function snapToNearestRoad(lat, lng) {
  const params = new URLSearchParams({
    version: '1',
    lat: String(lat),
    lon: String(lng),
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
  })
  try {
    const res = await fetch(`${BASE}/road/nearestRoad?${params}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const json = await res.json()
    const coord = json?.resultData?.coordinate
    if (!coord) return null
    return { lat: parseFloat(coord.lat), lng: parseFloat(coord.lon) }
  } catch {
    return null
  }
}

async function fetchSingleRoute(startLat, startLng, endLat, endLng, option) {
  let lastMessage = 'TMAP 경로 응답 실패'
  for (const searchOption of buildSearchOptionAttempts(option.searchOption)) {
    const bodies = [
      {
        startX: String(startLng),
        startY: String(startLat),
        endX: String(endLng),
        endY: String(endLat),
        endRpFlag: 'G',
        carType: 0,
        detailPosFlag: '2',
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption,
        sort: 'index',
        trafficInfo: 'Y',
      },
      {
        startX: String(startLng),
        startY: String(startLat),
        endX: String(endLng),
        endY: String(endLat),
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption,
      },
    ]

    for (const body of bodies) {
      const res = await fetch(`${BASE}/routes?version=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const json = await res.json()
        return parseRouteResponse(json, { ...option, searchOption })
      }

      try {
        const json = await res.json()
        lastMessage = buildRouteErrorMessage(res, json)
      } catch {
        lastMessage = res.status === 429 ? 'TMAP 요청이 많아 잠시 후 다시 시도해주세요.' : `TMAP HTTP ${res.status}`
      }

      if (res.status === 429) {
        throw new Error(lastMessage)
      }
    }
  }

  throw new Error(lastMessage)
}

// TMAP pointType=N 이면서 start/end가 아닌 안내 포인트는 가능한 한 모두 배너 후보로 유지한다.
const JUNCTION_TURN_TYPES = new Set([125, 126, 127, 128, 129, 130])

function parseRouteResponse(json, option) {
  const features = json?.features ?? []
  if (!features.length) return null

  const summary = json?.properties ?? features[0]?.properties ?? {}
  const polyline = []
  let highwayDist = 0
  let nationalDist = 0
  let localDist = 0
  let mergeCount = 0
  const junctions = [] // 실제 IC/JC 분기점
  const maneuvers = [] // 일반 좌회전/우회전 포함 실제 안내 포인트
  const liveSegmentStats = []
  let accumulatedDist = 0
  let currentRoadName = ''  // 현재 통과 중인 도로명
  let currentRoadNo = ''    // 현재 도로번호

  function getDistanceFromStartKm() {
    return Math.max(0, Math.round(accumulatedDist / 100) / 10)
  }

  for (let fi = 0; fi < features.length; fi++) {
    const feature = features[fi]
    if (feature.geometry?.type === 'LineString') {
      for (const coord of feature.geometry.coordinates) {
        polyline.push([coord[1], coord[0]])
      }
      const props = feature.properties ?? {}
      const dist = props.distance ?? 0
      // 도로명 업데이트 (있으면)
      if (props.roadName) currentRoadName = props.roadName
      if (props.roadNo) currentRoadNo = props.roadNo

      const positions = feature.geometry.coordinates.map((coord) => [coord[1], coord[0]])
      const roadType = mapRoadType(props)
      const speedLimit = estimateSegmentSpeedLimit(props, roadType)
      const averageSpeed = estimateSegmentAverageSpeed(props, roadType, speedLimit)
      const congestionScore = estimateSegmentCongestionScore(props, averageSpeed, speedLimit)

      if (positions.length > 1) {
        const startPoint = positions[0]
        const endPoint = positions[positions.length - 1]
        liveSegmentStats.push({
          id: `live-segment-${liveSegmentStats.length}`,
          name: currentRoadName || props.roadName || props.description || (roadType === 'highway' ? '고속도로 본선' : roadType === 'national' ? '국도 구간' : '일반도로'),
          positions,
          roadType,
          speedLimit,
          averageSpeed,
          congestionScore,
          center: [
            (startPoint[0] + endPoint[0]) / 2,
            (startPoint[1] + endPoint[1]) / 2,
          ],
        })
      }

      if (roadType === 'highway') highwayDist += dist
      else if (roadType === 'local') localDist += dist
      else nationalDist += dist

      // LineString turnType으로도 분기점 추출 가능
      if (JUNCTION_TURN_TYPES.has(props.turnType)) {
        mergeCount += 1
        const firstCoord = feature.geometry.coordinates[0]
        if (firstCoord) {
          // 다음 LineString 피처의 도로명 = 이 분기점 이후 도로
          const nextFeature = features.slice(fi + 1).find(f => f.geometry?.type === 'LineString')
          const afterRoadName = nextFeature?.properties?.roadName ?? currentRoadName
          const afterRoadNo = nextFeature?.properties?.roadNo ?? currentRoadNo
          const afterRoadType = mapRoadType(props) === 'highway' ? 'highway' : 'national'
          junctions.push({
            id: `jct-${junctions.length}`,
            name: props.description ?? props.name ?? `분기점 ${junctions.length + 1}`,
            lat: firstCoord[1],
            lng: firstCoord[0],
            turnType: props.turnType,
            distanceFromStart: getDistanceFromStartKm(),
            afterRoadType,
            afterRoadName: afterRoadName
              ? (afterRoadNo ? `${afterRoadName} (${afterRoadNo}호선)` : afterRoadName)
              : (afterRoadType === 'highway' ? '고속도로' : '국도'),
          })
        }
      }
      accumulatedDist += dist
    } else if (feature.geometry?.type === 'Point') {
      // Point 피처(전환점) 에서 분기점 정보 보완
      const props = feature.properties ?? {}
      const turnType = Number(props.turnType)
      const pointType = String(props.pointType ?? '').toUpperCase()
      const isGuidePoint = turnType > 0 && ![200, 201].includes(turnType) && pointType !== 'S' && pointType !== 'E'
      if (isGuidePoint && (props.name || props.description || props.nextRoadName)) {
        const [lng, lat] = feature.geometry.coordinates
        const nextFeature = features.slice(fi + 1).find(f => f.geometry?.type === 'LineString')
        const afterRoadName = nextFeature?.properties?.roadName ?? ''
        const afterRoadNo = nextFeature?.properties?.roadNo ?? ''
        const afterRoadType = mapRoadType(nextFeature?.properties ?? {}) === 'highway'
          ? 'highway' : 'national'
        const maneuver = {
          id: `man-${maneuvers.length}`,
          name: props.name ?? props.description ?? `안내 ${maneuvers.length + 1}`,
          lat,
          lng,
          turnType,
          distanceFromStart: getDistanceFromStartKm(),
          afterRoadType,
          instructionText: props.description ?? '',
          laneHint: props.guideLane ?? props.laneInfo ?? props.lane ?? props.guideInfo ?? '',
          nextRoadName: props.nextRoadName ?? '',
          afterRoadName: afterRoadName
            ? (afterRoadNo ? `${afterRoadName} (${afterRoadNo}호선)` : afterRoadName)
            : (afterRoadType === 'highway' ? '고속도로' : '국도'),
        }
        const isDupManeuver = maneuvers.some((item) => Math.abs(item.lat - lat) < 0.0002 && Math.abs(item.lng - lng) < 0.0002)
        if (!isDupManeuver) {
          maneuvers.push(maneuver)
        }
        if (JUNCTION_TURN_TYPES.has(Number(props.turnType))) {
          const isDupJunction = junctions.some((item) => Math.abs(item.lat - lat) < 0.0002 && Math.abs(item.lng - lng) < 0.0002)
          if (!isDupJunction) {
            mergeCount += 1
            junctions.push({
              ...maneuver,
              id: `jct-${junctions.length}`,
            })
          }
        }
      }
    }
  }

  const totalDistance = summary.totalDistance ?? highwayDist + nationalDist + localDist
  const totalTime = summary.totalTime ?? 0
  const trafficTime = summary.trafficTime ?? 0
  const totalFare = summary.totalFare ?? 0
  const totalDist = highwayDist + nationalDist + localDist || totalDistance
  const highwayRatio = Math.round((highwayDist / totalDist) * 100) || 0
  const nationalRoadRatio = Math.round((nationalDist / totalDist) * 100) || 0
  const localRoadRatio = Math.max(0, 100 - highwayRatio - nationalRoadRatio)
  const congestionScore = trafficTime / Math.max(totalTime, 1) > 0.3 ? 3 : trafficTime / Math.max(totalTime, 1) > 0.1 ? 2 : 1
  const actualSegmentSpeedLimits = liveSegmentStats
    .map((segment) => Number(segment.speedLimit))
    .filter((speed) => Number.isFinite(speed) && speed > 0)
  const actualSegmentAverageSpeeds = liveSegmentStats
    .map((segment) => Number(segment.averageSpeed))
    .filter((speed) => Number.isFinite(speed) && speed > 0)
  const averageSpeed = actualSegmentAverageSpeeds.length > 0
    ? Math.round(actualSegmentAverageSpeeds.reduce((sum, speed) => sum + speed, 0) / actualSegmentAverageSpeeds.length)
    : totalTime > 0
      ? Math.max(5, Math.round((totalDistance / totalTime) * 3.6))
      : null
  const dominantSpeedLimit = actualSegmentSpeedLimits.length > 0
    ? Math.max(...actualSegmentSpeedLimits)
    : null

  // TMAP safetyFacilityList에서 실제 카메라 위치 추출
  const safetyList = summary.safetyFacilityList ?? []
  const cameras = []
  for (let i = 0; i < safetyList.length; i++) {
    const cam = safetyList[i]
    const isSection = String(cam.type) === '2'
    const lat = parseFloat(cam.lat ?? cam.noorLat ?? cam.startLat)
    const lng = parseFloat(cam.lon ?? cam.noorLon ?? cam.startLon)
    if (!isFinite(lat) || !isFinite(lng)) continue
    const base = {
      id: `cam-${i}`,
      coord: [lat, lng],
      type: isSection ? 'section_start' : 'fixed',
      speedLimit: parseInt(cam.speed ?? cam.speedLimit ?? 0, 10) || null,
      label: isSection ? '구간단속' : '지점단속',
    }
    cameras.push(base)
    if (isSection && cam.endLat) {
      base.endCoord = [parseFloat(cam.endLat), parseFloat(cam.endLon)]
      base.sectionLength = parseFloat(cam.distance ?? '5')
      cameras.push({
        ...base,
        id: `cam-${i}-end`,
        coord: base.endCoord,
        type: 'section_end',
        label: '구간단속 종료',
      })
    }
  }

  // 실제 카메라 기반 집계 (없으면 거리 기반 추정)
  const totalKm = totalDistance / 1000
  const hwKm = highwayDist / 1000
  const fixedCameraCount = cameras.filter(c => c.type === 'fixed').length
  const sectionCameraCount = cameras.filter(c => c.type === 'section_start').length
  const sectionEnforcementDistance = cameras
    .filter((camera) => camera.type === 'section_start')
    .reduce((sum, camera) => sum + (Number(camera.sectionLength) || 0), 0)

  const segmentStats = liveSegmentStats.length > 0
    ? liveSegmentStats
    : []

  return ensureLiveRouteSource({
    id: option.id ?? `route-${option.searchOption}`,
    title: option.title,
    explanation: buildExplanation(highwayRatio, mergeCount, congestionScore, option.isBaseline),
    eta: Math.ceil(totalTime / 60),
    distance: Math.round(totalDistance / 100) / 10,
    highwayRatio,
    nationalRoadRatio,
    localRoadRatio,
    mergeCount,
    maneuvers,
    congestionScore,
    congestionLabel: ['', '원활', '서행', '정체'][congestionScore],
    fixedCameraCount,
    sectionCameraCount,
    sectionEnforcementDistance: Number(sectionEnforcementDistance.toFixed(1)),
    dominantSpeedLimit,
    maxSpeedLimit: dominantSpeedLimit,
    averageSpeed,
    tollFee: totalFare,
    recommended: option.isBaseline === true || option.searchOption === '2',
    tag: option.tag,
    tagColor: option.tagColor,
    routeColor: option.isBaseline === true ? '#0064FF' : '#8E8E93',
    isBaseline: option.isBaseline === true,
    polyline,
    segmentStats,
    junctions, // 실제 IC/JC 분기점 목록
    cameras,   // 실제 과속카메라 위치 (TMAP safetyFacilityList 기반)
  })
}

function buildExplanation(highwayRatio, mergeCount, congestionScore, isBaseline) {
  const parts = []
  if (isBaseline) parts.push('TMAP 기준')
  parts.push(highwayRatio >= 70 ? '고속도로 중심' : highwayRatio >= 40 ? '고속+국도 혼합' : '국도 위주')
  parts.push(mergeCount <= 4 ? '합류 단순' : `합류 ${mergeCount}회`)
  parts.push(congestionScore === 3 ? '정체 구간 포함' : congestionScore === 2 ? '서행 구간 있음' : '흐름 양호')
  return parts.join(' · ')
}

function isCoordString(str) {
  return /^-?\d{1,3}\.\d+[,\s]+-?\d{1,3}\.\d+$/.test((str ?? '').trim())
}

export async function reverseGeocode(lat, lng) {
  const params = new URLSearchParams({
    version: '1',
    lat: String(lat),
    lon: String(lng),
    coordType: 'WGS84GEO',
    addressType: 'A04',
    newAddressExtend: 'Y',
  })
  try {
    const res = await fetch(`${BASE}/geo/reversegeocoding?${params}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error('역지오코딩 실패')
    const json = await res.json()
    const addressInfo = json?.addressInfo ?? {}
    // 법정동+지번 우선 (예: 호계동 959-18)
    const legalDong = addressInfo.legalDong || addressInfo.lowerAddrName || ''
    const bunji = addressInfo.bunji || addressInfo.firstNo
      ? [addressInfo.firstNo, addressInfo.secondNo].filter(Boolean).join('-')
      : ''
    const jibunAddr = [legalDong, bunji].filter(Boolean).join(' ')
    // 좌표 문자열처럼 보이면 무시
    const candidates = [addressInfo.bunjiAddress, jibunAddr, addressInfo.fullAddress, addressInfo.roadAddress]
    const addr = candidates.find((c) => c && !isCoordString(c))
    return addr || null
  } catch {
    // fallback: 가장 가까운 알려진 장소
    const nearest = [...FALLBACK_SEARCH_PLACES].sort(
      (a, b) => haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng)
    )[0]
    return nearest?.name ?? nearest?.address ?? null
  }
}

export async function enrichDestinationTarget(target, options = {}) {
  if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return target

  const next = { ...target }
  const preferRoadSnap = options.preferRoadSnap ?? true
  if (preferRoadSnap) {
    const snapped = await snapToNearestRoad(next.lat, next.lng).catch(() => null)
    if (snapped) {
      const distanceKm = haversineKm(next.lat, next.lng, snapped.lat, snapped.lng)
      if (distanceKm <= 0.12) {
        next.originalLat = next.lat
        next.originalLng = next.lng
        next.lat = snapped.lat
        next.lng = snapped.lng
      }
    }
  }

  const shouldResolveAddress = !next.address || isSyntheticAddress(next.address)
  if (shouldResolveAddress) {
    const resolvedAddress = await reverseGeocode(next.lat, next.lng).catch(() => null)
    if (resolvedAddress) {
      next.address = resolvedAddress
      if (!next.name || isSyntheticName(next.name)) {
        next.name = resolvedAddress
      }
    }
  }

  if (!next.name) {
    next.name = next.address || '선택한 위치'
  }

  return next
}
