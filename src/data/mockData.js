// 목업 데이터 — Phase 1: 실제 API 없이 UX 흐름 전체 검증용

export const MOCK_ROUTES = [
  {
    id: 'route-1',
    title: '고속도로 중심',
    explanation: '합류 적고 단순한 구조 · 카메라 4개',
    eta: 142,           // 분
    distance: 398,      // km
    highwayRatio: 88,   // %
    nationalRoadRatio: 12,
    mergeCount: 5,
    congestionScore: 2, // 1=원활 2=서행 3=정체
    congestionLabel: '원활',
    fixedCameraCount: 4,
    sectionCameraCount: 2,
    sectionEnforcementDistance: 14, // km
    dominantSpeedLimit: 110,
    tollFee: 18400,
    recommended: true,
    tag: '추천',
    tagColor: 'blue',
    routeColor: '#0064FF',
    polyline: [
      [37.5665, 126.9780],
      [37.4400, 127.1300],
      [37.2000, 127.3500],
      [36.8000, 127.6000],
      [36.4000, 127.8000],
      [36.0000, 128.0000],
      [35.5000, 128.5000],
      [35.1796, 129.0756],
    ]
  },
  {
    id: 'route-2',
    title: '국도 포함',
    explanation: '8분 느리지만 정체 적음 · 카메라 2개',
    eta: 150,
    distance: 412,
    highwayRatio: 55,
    nationalRoadRatio: 45,
    mergeCount: 11,
    congestionScore: 1,
    congestionLabel: '원활',
    fixedCameraCount: 2,
    sectionCameraCount: 1,
    sectionEnforcementDistance: 6,
    dominantSpeedLimit: 80,
    tollFee: 9200,
    recommended: false,
    tag: '정체 적음',
    tagColor: 'green',
    routeColor: '#8E8E93',
    polyline: [
      [37.5665, 126.9780],
      [37.4000, 127.0500],
      [37.1000, 127.2000],
      [36.7000, 127.5000],
      [36.2000, 127.9000],
      [35.8000, 128.3000],
      [35.3000, 128.7000],
      [35.1796, 129.0756],
    ]
  },
  {
    id: 'route-3',
    title: '해안도로 포함',
    explanation: '풍경 좋은 국도 · 흐름 좋음 · 구간단속 없음',
    eta: 168,
    distance: 438,
    highwayRatio: 30,
    nationalRoadRatio: 70,
    mergeCount: 14,
    congestionScore: 1,
    congestionLabel: '원활',
    fixedCameraCount: 3,
    sectionCameraCount: 0,
    sectionEnforcementDistance: 0,
    dominantSpeedLimit: 70,
    tollFee: 4100,
    recommended: false,
    tag: '풍경 좋음',
    tagColor: 'orange',
    routeColor: '#8E8E93',
    polyline: [
      [37.5665, 126.9780],
      [37.3000, 126.8000],
      [36.9000, 126.6000],
      [36.5000, 126.8000],
      [36.1000, 127.2000],
      [35.7000, 128.0000],
      [35.3000, 128.8000],
      [35.1796, 129.0756],
    ]
  }
]

export const MOCK_MERGE_OPTIONS = [
  {
    id: 'merge-1',
    name: '신갈 JC',
    distanceFromCurrent: 8.4,
    addedTime: 0,
    congestionDelta: 0,
    fixedCameraCount: 1,
    sectionCameraCount: 0,
    dominantSpeedLimit: 110,
    isCurrent: true,
    afterRoadType: 'highway',
    afterRoadName: '경부고속도로',
    afterDescription: '현재 경로 유지 · 경부고속도로 계속 주행 · 110km/h 제한',
    afterNextJunction: '오산IC까지 18km 직선 주행',
    congestionPreview: '원활',
  },
  {
    id: 'merge-2',
    name: '오산 IC 진출',
    distanceFromCurrent: 26.5,
    addedTime: 12,
    congestionDelta: -1,
    fixedCameraCount: 0,
    sectionCameraCount: 1,
    dominantSpeedLimit: 80,
    isCurrent: false,
    afterRoadType: 'national',
    afterRoadName: '1번 국도 (경부대로)',
    afterDescription: '국도로 진입 · 신호등 있음 · 구간단속 6km 포함',
    afterNextJunction: '평택 시내 통과 후 38번 국도 합류 가능',
    congestionPreview: '서행',
  },
  {
    id: 'merge-3',
    name: '동탄 JC → 수원신갈',
    distanceFromCurrent: 14.2,
    addedTime: 5,
    congestionDelta: 0,
    fixedCameraCount: 2,
    sectionCameraCount: 0,
    dominantSpeedLimit: 110,
    isCurrent: false,
    afterRoadType: 'highway',
    afterRoadName: '수원신갈~오산고속도로',
    afterDescription: '고속도로 유지 · 오산JC에서 다시 경부 합류 가능',
    afterNextJunction: '오산JC까지 8km · 이후 경부 재합류',
    congestionPreview: '원활',
  },
]

export const MOCK_SPEED_CAMERAS = [
  { id: 'cam-1', lat: 37.2800, lng: 127.4500, speedLimit: 110, type: 'fixed', label: '고정' },
  { id: 'cam-2', lat: 36.9000, lng: 127.7000, speedLimit: 100, type: 'section_start', label: '구간시작', sectionLength: 8.2 },
  { id: 'cam-3', lat: 36.8200, lng: 127.7800, speedLimit: 100, type: 'section_end', label: '구간종료' },
  { id: 'cam-4', lat: 36.3000, lng: 128.0500, speedLimit: 110, type: 'fixed', label: '고정' },
]

export const MOCK_NEXT_SEGMENTS = [
  { km: 0,   roadName: '경부고속도로', type: 'highway', speedLimit: 110, congestion: 1 },
  { km: 8.4, roadName: '신갈 JC',     type: 'junction', speedLimit: 110, congestion: 1 },
  { km: 22,  roadName: '경부고속도로', type: 'highway', speedLimit: 110, congestion: 2 },
  { km: 34,  roadName: '오산 IC',      type: 'exit',    speedLimit: 80,  congestion: 1 },
  { km: 44,  roadName: '구간단속 시작', type: 'section', speedLimit: 100, congestion: 1 },
]

export const MOCK_RECENT_SEARCHES = [
  { id: 1, name: '부산 해운대구', address: '부산광역시 해운대구', lat: 35.1631, lng: 129.1635 },
  { id: 2, name: '대전 둔산동', address: '대전광역시 서구 둔산동', lat: 36.3504, lng: 127.3845 },
  { id: 3, name: '대구 동성로', address: '대구광역시 중구 동성로', lat: 35.8714, lng: 128.5944 },
]

export const MOCK_FAVORITES = [
  { id: 1, name: '집', address: '서울시 강남구 테헤란로', icon: '🏠', lat: 37.5065, lng: 127.0536 },
  { id: 2, name: '회사', address: '서울시 중구 을지로', icon: '🏢', lat: 37.5665, lng: 126.9780 },
]

export const CONGESTION_INFO = {
  1: { label: '원활', color: '#00C851', bg: '#E8F9F0' },
  2: { label: '서행', color: '#FF9500', bg: '#FFF4E5' },
  3: { label: '정체', color: '#FF3B30', bg: '#FFF0EF' },
}

export const PRESET_INFO = {
  beginner: {
    label: '초보',
    icon: '🟢',
    description: '합류 지점이 적고 단순한 경로를 우선합니다.',
    weights: { mergeComplexity: 3, eta: 1, congestion: 2 }
  },
  intermediate: {
    label: '중수',
    icon: '🔵',
    description: '조금 더 유연하게, 정체가 적은 경로를 함께 탐색합니다.',
    weights: { mergeComplexity: 2, eta: 2, congestion: 2 }
  },
  expert: {
    label: '고수',
    icon: '🟠',
    description: '합류가 많거나 구조가 복잡한 길도 포함해 흐름 좋은 경로를 넓게 탐색합니다.',
    weights: { mergeComplexity: 1, eta: 2, congestion: 3 }
  }
}
