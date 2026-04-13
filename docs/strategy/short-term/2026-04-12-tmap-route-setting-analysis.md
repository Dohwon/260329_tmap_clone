# Tmap 경로 세팅 분석 보고서

작성일: 2026-04-12  
전략 구간: 단기  
요청: 현재 iOS 네비게이션 앱의 경로 세팅이 왜 제대로 동작하지 않는지 구체적으로 분석하고, Tmap API 기준으로 무엇이 어긋나 있는지 정리한다.

## 1. 요청 요약
- 현재 앱은 `TmapClone` 이라는 이름을 사용하지만 실제 검색과 경로 계산은 Tmap API가 아니라 `MapKit` 기반이다.
- 사용자는 Tmap 기반 네비게이션 UX를 기대하지만, 현재 구현은 Tmap 라우팅 데이터, Tmap POI, Tmap 지도 SDK, Tmap 인증/키 관리와 연결되어 있지 않다.
- 따라서 "경로 세팅이 안 된다"는 체감은 단순 버그 하나보다 제품 정체성과 데이터 소스의 불일치에서 발생할 가능성이 높다.

## 2. 분배 실행 결과 (7개 Agent)

| 역할 Agent | 입력 | 출력 | 상태 |
|---|---|---|---|
| product-planning-lead | 사용자 요구 + 현재 UX | 기대 동작과 실제 동작의 갭 분석 | done |
| system-design-architect | 검색/경로 코드 + Tmap 문서 | 아키텍처 갭과 도입 경계 정리 | done |
| implementation-engineer | 서비스/뷰모델/화면 코드 | 실패 지점과 수정 순서 분석 | done |
| figma-implement-design | 화면 흐름 코드 | 경로 설정 UX 혼란 포인트 정리 | done |
| sqa-quality-tester | 코드 + 상태 흐름 | 재현 시나리오, 오류 처리 리스크 | done |
| outcome-innovation-agent | 구현/테스트 분석 | 차별화 아이디어 및 후속 과제 | done |
| deliverable-alignment-manager | README + 코드 + 요청 | 문서/구현/목표 정합성 점검 | done |

## 3. 현재 코드 구조와 핵심 사실

### product-planning-lead
- 현재 사용자 여정은 `검색 -> 결과 선택 -> MapKit 경로 계산 -> 경로 미리보기 -> 안내 시작` 이다.
- `SearchMainView` 는 검색 결과 선택 즉시 `startNavigation()` 을 호출한다.
- 그러나 사용자는 Tmap 스타일의 도로 선호, 실시간 교통, POI 정확도, 경유지/회피 옵션을 기대한다.
- 현재 UX는 Tmap처럼 보이지만 실제 판단 근거는 Apple 지도 데이터다.

### system-design-architect
- `SearchService` 는 `MKLocalSearch` 로 POI를 찾는다.
- `RouteService` 는 `MKDirections` 로 자동차 경로를 계산한다.
- `MapLayerView` 는 SwiftUI `Map` 위에 `MKRoute.polyline` 을 그린다.
- 즉, 검색, 경로, 렌더링, 요약 모델이 모두 MapKit 타입에 결합되어 있다.
- Tmap API를 붙이려면 최소한 아래 경계를 분리해야 한다.
  - `SearchProvider`: Tmap POI / autocomplete
  - `RoutingProvider`: Tmap 자동차 경로 / 다중 경유지 / 최적화
  - `MapRenderer`: MapKit 유지 여부 또는 Tmap iOS SDK 전환
  - `CoordinateTransformer`: WGS84, EPSG3857, Tmap 요청/응답 좌표 변환
  - `SecretsConfig`: 앱 키와 환경별 설정 분리

### implementation-engineer
- 경로 계산은 [TmapClone/TmapClone/Services/RouteService.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/RouteService.swift:10) 에서 `MKDirections` 를 사용한다.
- 검색은 [TmapClone/TmapClone/Services/SearchService.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/SearchService.swift:13) 에서 `MKLocalSearch` 를 사용한다.
- 네비 시작 진입점은 [TmapClone/TmapClone/ViewModels/MapViewModel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/ViewModels/MapViewModel.swift:65) 이다.
- 경로 선호 옵션 UI는 존재하지만, [TmapClone/TmapClone/Views/Navigation/RoutePreviewPanel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Navigation/RoutePreviewPanel.swift:170) 에서 토글만 바꾸고 실제 재탐색 요청에는 반영되지 않는다.
- `mergeOptions`, 속도카메라, 일부 경로 설명은 실제 데이터가 아니라 mock/generated 값이다.

### figma-implement-design
- 사용자는 "해당도로 선호", "산길도로 선호", "좁은 길 포함" 을 실제 라우팅 조건으로 이해한다.
- 하지만 현재는 시각적으로만 존재하고 결과가 바뀌지 않는다.
- 검색 결과를 누른 뒤 경로가 없으면 명확한 실패 피드백이 없다.
- 즉 UX 관점에서도 "눌렀는데 경로 세팅이 안 됨" 으로 느끼기 쉽다.

## 4. 구조적 문제

### sqa-quality-tester
1. 치명: Tmap 앱/서비스를 표방하지만 실제 경로 계산 엔진은 Apple `MKDirections` 이다. 한국 도로 기준 결과 차이가 날 수밖에 없다.
2. 높음: 경로 실패 시 `RouteService.error` 는 세팅되지만 어떤 화면에서도 노출되지 않는다. 사용자는 실패 원인을 알 수 없다.
3. 높음: [HomeMapView](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Map/HomeMapView.swift:98) 는 `showRouteSheet && !allRoutes.isEmpty` 일 때만 시트를 띄운다. 실패 시 `showRouteSheet` 는 `true` 가 되어도 실제 UI는 안 보여서 무반응처럼 보인다.
4. 높음: 출발지는 항상 현재 위치뿐이며 출발지/경유지 편집 플로우가 없다.
5. 중간: 경로 요약값 일부가 mock 규칙이라 실제 교통/카메라/합류 복잡도를 반영하지 않는다.
6. 중간: 테스트 타깃이 없어 실패 케이스, 위치 권한 거부, 검색 0건, 경로 0건 상태를 검증하지 못한다.

재현 시나리오:
- 위치 권한이 없거나 실내에서 GPS가 늦게 잡히면 `startNavigation()` 이 조용히 종료될 수 있다.
- MapKit 이 특정 한국 POI를 부정확하게 찾거나 대안 경로를 충분히 주지 않으면 Tmap 기대와 다른 결과가 나온다.
- 경로 실패 시 에러 배너가 없어서 사용자는 버튼이 먹지 않는다고 판단한다.

## 5. Tmap 공식 문서 대비 갭
- Tmap 공식 문서는 `API > 경로안내`, `다중 경유지 안내`, `경유지 최적화`, `POI 검색` 을 별도 영역으로 제공한다.
- 같은 문서에서 `iOS_Swift` 샘플에 `자동차 경로안내`, `명칭(POI) 통합 검색`, `TMapApi.invokeRoute` 계열이 노출된다.
- 따라서 Tmap 기준 구현이라면 최소한 POI 검색과 경로 계산 중 하나는 Tmap 소스로 바뀌어야 한다.
- 사용자가 준 `puzzle/sample/puzzlePoi` 근처는 Puzzle API 계열 샘플 영역이다. 장소 혼잡도/랭킹류 데이터에 가깝고, 핵심 자동차 경로 API의 중심 문서는 아니다.

## 6. 추천 아키텍처
1. `SearchService` 를 `SearchProvider` 프로토콜 뒤로 숨긴다.
2. `RouteService` 를 `RoutingProvider` 프로토콜 뒤로 숨긴다.
3. `SearchResult`, `RouteInfo`, `RouteSummary` 를 MapKit 비독립 모델로 바꾼다.
4. 1차는 지도 렌더링은 MapKit 유지, 검색/경로만 Tmap REST 또는 iOS SDK로 교체한다.
5. 2차에서 필요하면 Tmap iOS SDK 또는 ETA SDK 전환을 검토한다.
6. 앱 키는 `xcconfig` 또는 환경별 설정 파일로 분리하고 Git 추적에서 제외한다.

## 7. 마이그레이션 순서
1. `RouteService` 를 `MapKitRouteService` 로 이름 변경한다.
2. `TmapRouteService` 와 `TmapSearchService` 인터페이스를 추가한다.
3. `routePreferences` 를 실제 Tmap 요청 파라미터에 매핑한다.
4. 실패 시 토스트/배너/빈 상태 메시지를 노출한다.
5. 출발지/도착지/경유지 편집 모델을 추가한다.
6. mock 기반 `mergeOptions`, 카메라, 요약 규칙을 실제 응답 기반으로 대체한다.

## 8. 연계성 검토 결과

### deliverable-alignment-manager
- README 는 이미 [README.md](/home/silogood/work/12.tmap/260329_tmap_clone/README.md:4) 에서 `SwiftUI + MapKit 기반` 이라고 밝히고 있다.
- 즉 문서와 코드는 일치하지만, 사용자의 현재 목표인 "Tmap API 기반 네비 앱" 과는 불일치한다.
- 이름은 `TmapClone` 이지만 구현 수준은 "Tmap UI를 닮은 MapKit 앱" 이다.

## 9. Innovation 제안

### outcome-innovation-agent
1. 운전 성향을 실제 라우팅 프로필로 연결해 초보/중수/고수별 경로 추천을 차별화한다.
2. 합류 복잡도, 차선 변경 빈도, 톨게이트 수를 별도 점수로 계산해 Tmap 스타일 추천 이유를 강화한다.
3. Puzzle API 는 메인 경로 계산이 아니라 목적지 혼잡도 보조 정보로 붙인다.
4. ETA SDK 도입 시 실제 주행 중 다음 경유지 전환과 상태 이벤트를 활용한다.
5. 실패 분석 로그를 남겨 "검색 실패 / 경로 실패 / 권한 부족 / 키 인증 실패" 를 분리 추적한다.

## 10. 다음 액션
- 1순위: `SearchProvider` / `RoutingProvider` 추상화 추가
- 2순위: Tmap POI + 자동차 경로 API를 붙인 최소 vertical slice 구현
- 3순위: 실패 UI와 로그 추가
- 4순위: 경유지/회피 옵션 실제 반영
- 5순위: mock 요약 제거 및 실제 응답 기반 카드 구성

## 참고
- 이 저장소에는 `docs/process/AGENT_WORKFLOW.md` 와 `docs/templates/work-item-template.md` 파일이 없어서, 스킬 요구 형식을 최대한 보존한 자체 문서 구조로 기록했다.
