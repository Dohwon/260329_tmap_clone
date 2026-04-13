# Tmap Route Analysis

## 1. 요청 요약
- 목표: 현재 iOS Tmap clone 프로젝트의 "경로 세팅이 제대로 안됨" 문제를 구조적으로 분석한다.
- 전략 구간: 단기
- 제약: 저장소에 `docs/process/AGENT_WORKFLOW.md`와 템플릿이 없어 동일 포맷은 적용하지 못했고, 현재 저장소 기준으로 통합 분석 문서를 작성했다.

## 2. 분배 실행 결과 (7개 Agent)
| 역할 Agent | 입력 | 출력 | 상태 |
|---|---|---|---|
| product-planning-lead | 사용자 요구, 화면 흐름 | 사용자 여정/요구사항 갭 | done |
| system-design-architect | 검색/경로 서비스 코드 | 아키텍처 갭, 도입 구조 | done |
| implementation-engineer | SwiftUI/MapKit 구현체 | 실제 결함 원인 분석 | done |
| figma-implement-design | 화면 코드 | 경로 설정 UX 혼란 포인트 | done |
| sqa-quality-tester | 코드/상태 흐름 | 재현 시나리오, 리스크 | done |
| outcome-innovation-agent | 구현+리스크 | 후속 개선 아이디어 | done |
| deliverable-alignment-manager | README, 코드, API 문서 | 산출물 정합성 체크 | done |

## 3. 구현/산출물 목록
- 코드 분석 대상
  - `TmapClone/TmapClone/Services/RouteService.swift`
  - `TmapClone/TmapClone/Services/SearchService.swift`
  - `TmapClone/TmapClone/ViewModels/MapViewModel.swift`
  - `TmapClone/TmapClone/Views/Search/SearchMainView.swift`
  - `TmapClone/TmapClone/Views/Map/HomeMapView.swift`
  - `TmapClone/TmapClone/Views/Navigation/RoutePreviewPanel.swift`
- 외부 검증 자료
  - TMAP 소개
  - 장소(POI) 통합 검색
  - 자동차 경로안내

## 4. 핵심 분석
### product-planning-lead
- 현재 동작: 검색 결과 선택 시 `MapKit` 검색 결과 좌표를 목적지로 넣고 바로 `MKDirections` 기반 경로를 조회한다.
- 기대 동작: Tmap 스타일 앱이면 국내 POI 품질, `poiId`/`rpFlag` 기반 목적지 세팅, 교통 기반 옵션, 경유지/우회/톨/속도 카메라 정보가 실제 경로와 연결되어야 한다.
- 요구사항 갭: 현재 앱은 Tmap UI만 흉내 내고 실제 데이터 소스는 Apple MapKit이다. 그래서 국내 도로/POI 품질과 경로 옵션이 Tmap 기대와 다를 수밖에 없다.

### system-design-architect
- 현재 구조는 `SearchService -> MKLocalSearch`, `RouteService -> MKDirections`, `MapViewModel`이 이를 직접 소유하는 단순 구조다.
- Tmap 도입에 필요한 계층이 없다: `APIClient`, `Secrets/AppKey`, `POI DTO`, `Route DTO(GeoJSON)`, `CoordinateMapper`, `RouteDomainModel`.
- 현실적인 1차 구조는 `MapKit 렌더링 유지 + Tmap 검색/경로 API만 교체`다. 지도 SDK까지 한 번에 바꾸면 범위가 급격히 커진다.

### implementation-engineer
- 가장 큰 원인은 "Tmap을 쓰는 앱"이라고 생각하지만 실제 코드는 Tmap API를 전혀 호출하지 않는다는 점이다.
  - `SearchService`는 전부 `MKLocalSearch`다.
  - `RouteService`는 전부 `MKDirections`다.
  - 저장소 전체에 `URLSession`, `appKey`, Tmap endpoint가 없다.
- 경로 옵션 UI는 실제 경로 재탐색과 연결되지 않는다.
  - `RoutePreferenceFilterView`는 토글만 바꾸고,
  - 프로필 변경 시에도 `generateSummaries()`만 다시 돌린다.
  - 요약 카드의 합류 수, 카메라 수, 혼잡도는 API 값이 아니라 하드코딩/추정치다.
- `mergeOptions`, `speedCameras`도 현재 경로 기반 실데이터가 아니라 mock이다.

### figma-implement-design
- 사용자는 "경로 설정"을 바꿨다고 느끼지만 실제로는 요약 라벨만 바뀐다.
- 검색 결과를 누른 뒤 실패해도 별도 오류 안내가 없어 "아무 일도 안 일어남"처럼 보일 수 있다.
- Route sheet는 `allRoutes`가 비어 있으면 뜨지 않는데, 호출 실패 이유를 화면에 노출하지 않는다.

## 5. SQA 검증 결과
- Critical: 위치가 아직 확보되지 않으면 `startNavigation()`이 조용히 return 한다. 사용자 메시지 없음.
- Critical: 경로 조회 실패 시 `RouteService.error`는 세팅되지만 어떤 화면도 이를 소비하지 않는다.
- High: 목적지 선택 후 `showRouteSheet = true`를 호출하지만, `HomeMapView`는 `allRoutes.isEmpty`이면 sheet를 렌더링하지 않아 실패가 숨겨진다.
- High: `RoutePreferences`와 운전 성향은 실제 API 파라미터(`searchOption`, `carType`, 톨 옵션 등)로 전달되지 않는다.
- Medium: `RouteInfo`는 `turnType`, 실제 교통 지연, 요금, RP/POI 메타데이터를 사용하지 않는다.

### 재현 시나리오
1. 앱 실행 직후 위치 권한 승인 전 목적지 검색/선택
2. 검색 결과 선택
3. 경로 시트가 안 뜨거나, 안내 시작 전 실제 옵션 반영이 없음을 확인

## 6. 연계성 검토 결과
- README는 "T맵 클론"이라고 설명하지만, 구현은 아직 `MapKit clone` 단계다.
- 화면 레이블은 Tmap 네비게이션 개념을 사용하지만, 서비스 계층은 이에 대응하는 도메인 모델을 제공하지 않는다.
- 공식 문서상 TMAP은 POI 검색, 자동차 경로안내, 다중 경유지, 경유지 최적화, SDK를 제공하며 네비게이션 API는 별도 계약 대상이다. 현재 저장소에는 해당 계약/키 처리 흔적이 없다.

## 7. Innovation 제안
1. 1단계: `MapKit` 지도는 유지하고 `POI + routes`만 Tmap REST API로 교체한다.
2. 2단계: `SearchResult`를 `poiId`, `rpFlag`, `addressType`, `roadNameAddress`, `legalDong`까지 담는 모델로 확장한다.
3. 3단계: `RoutePreferences`를 Tmap `searchOption`, `tollgateFareOption`, `carType`에 실제 매핑한다.
4. 4단계: 실패 시나리오를 화면에 드러내는 "위치 대기", "경로 없음", "계약/앱키 오류" 상태 UI를 추가한다.
5. 5단계: 이후 필요하면 TMAP iOS SDK 또는 TMAP 연동 기능으로 내비 실행 경험을 강화한다.

## 결론
- 지금 경로 세팅이 제대로 안 되는 1차 원인은 버그 하나라기보다, "Tmap UX"와 "MapKit 데이터"가 섞여 있는 구조적 불일치다.
- 바로 손대야 할 우선순위는 아래 3개다.
  1. `SearchService`를 Tmap POI 검색으로 교체
  2. `RouteService`를 Tmap 자동차 경로 API 기반으로 교체
  3. 실패/권한/빈 경로 상태를 UI에 명시

## 참고 링크
- https://skopenapi.readme.io/reference/t-map-%EC%86%8C%EA%B0%9C
- https://skopenapi.readme.io/reference/%EC%9E%A5%EC%86%8C%ED%86%B5%ED%95%A9%EA%B2%80%EC%83%89
- https://skopenapi.readme.io/reference/%EC%9E%90%EB%8F%99%EC%B0%A8-%EA%B2%BD%EB%A1%9C%EC%95%88%EB%82%B4
