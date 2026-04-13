# Tmap Route Setting Analysis

## 요청 요약
- 목표: 현재 iOS Tmap clone 프로젝트의 경로 세팅 문제를 코드와 공식 문서 기준으로 구체 분석
- 범위: 검색, 목적지 선택, 경로 계산, 경로 미리보기, 안내 시작 흐름
- 전략 구간: 단기
- 제약: 이 환경에는 `xcodebuild`가 없어 정적 분석 중심으로 판단

## 사전 확인 메모
- 스킬 지침에 나온 `docs/process/AGENT_WORKFLOW.md`와 `docs/templates/work-item-template.md`는 현재 저장소에 없습니다.
- 따라서 본 문서는 저장소 현황에 맞춘 대체 산출물입니다.

## 분배 매트릭스
| 역할 Agent | 입력 | 출력 | 상태 |
|---|---|---|---|
| product-planning-lead | 사용자 요구, 현재 UX | 기대 동작 vs 현재 동작 분석 | done |
| system-design-architect | 코드 구조, Tmap 공식 문서 | 아키텍처 갭 및 마이그레이션 방향 | done |
| implementation-engineer | 서비스/뷰모델/화면 코드 | 실제 원인 분석 | done |
| figma-implement-design | Search/Route/Navigation UI | UX 혼란 포인트 | done |
| sqa-quality-tester | 코드, 상태 흐름 | 결함/리스크 분석 | done |
| outcome-innovation-agent | 구현+QA 결과 | 후속 개선 아이디어 | done |
| deliverable-alignment-manager | README, 코드, 사용자 목표 | 정합성 검토 | done |

## 핵심 결론
현재 문제의 1차 원인은 "Tmap API 연동 버그"가 아니라, 아직 검색과 경로 엔진이 `Tmap`이 아닌 `MapKit`이라는 점입니다.

- README도 현재 구현을 `SwiftUI + MapKit` 기반으로 명시합니다. [README.md](/home/silogood/work/12.tmap/260329_tmap_clone/README.md:3)
- 검색은 `MKLocalSearch`를 사용합니다. [SearchService.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/SearchService.swift:13)
- 경로 계산은 `MKDirections`를 사용합니다. [RouteService.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/RouteService.swift:10)
- 목적지 선택 직후 즉시 경로 탐색을 시작합니다. [SearchMainView.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Search/SearchMainView.swift:89)
- 경로 시트는 `allRoutes`가 비어 있으면 아예 보이지 않습니다. [HomeMapView.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Map/HomeMapView.swift:98)

즉, 현재 앱은 "Tmap 스타일 UI를 씌운 MapKit 라우팅 앱"에 더 가깝습니다.

## 코드 레벨 진단
### 1. 경로 옵션이 실제 라우팅에 반영되지 않음
- `RoutePreferences`에는 `preferHighway`, `preferMountainRoad`, `allowNarrowRoad`가 있지만 실제 API 요청에 연결되지 않습니다. [RouteModels.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Models/RouteModels.swift:27)
- `RoutePreviewPanel`은 토글 UI만 바꾸고, 운전 성향 변경도 경로 재탐색이 아니라 카드 설명만 다시 만듭니다. [RoutePreviewPanel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Navigation/RoutePreviewPanel.swift:170), [HomeMapView.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Map/HomeMapView.swift:124)

### 2. 실패 상태가 사용자에게 보이지 않음
- `RouteService.error`는 설정되지만 화면에서 소비되지 않습니다. [RouteService.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/RouteService.swift:31)
- `MapViewModel.startNavigation()`은 현재 위치가 없으면 조용히 종료합니다. [MapViewModel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/ViewModels/MapViewModel.swift:65)
- 호출부는 `showRouteSheet = true`를 세팅하지만, 실제 시트는 `allRoutes.isEmpty == false`여야만 보입니다. [SearchMainView.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Search/SearchMainView.swift:93), [HomeMapView.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Map/HomeMapView.swift:98)

### 3. 경로 부가 정보가 실데이터가 아님
- `generateSummaries()`의 합류 수, 카메라 수, 정체 점수는 실제 응답이 아니라 인덱스 기반 추정치입니다. [RouteService.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/RouteService.swift:39)
- `mergeOptions`도 선택 경로별 재계산이 아니라 첫 경로 기준 목업입니다. [MapViewModel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/ViewModels/MapViewModel.swift:68), [MapViewModel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/ViewModels/MapViewModel.swift:104)

## 공식 문서 대조
T MAP 공식 포털은 2026-04-12 기준으로 다음 구성을 노출합니다.

- 메인 가이드는 `iOS_Swift`, `Navi_iOS`, `API`를 별도 카테고리로 제공하고, `TData` 아래에 경로 요청과 POI 검색 기능을 안내합니다.  
  출처: https://tmapapi.tmapmobility.com/main.html
- 같은 포털은 API 섹션에 `POI 검색`, `경로안내`, `다중 경유지안내`, `경유지 최적화`, `PUZZLE API`를 분리해 둡니다.  
  출처: https://tmapapi.tmapmobility.com/main.html

이 정보로 볼 때, 사용자 목표인 "Tmap을 사용하는 네비 앱"에 맞추려면 최소한 아래 2개가 필요합니다.
- `POI 검색`: 목적지 후보를 Tmap 데이터로 받아야 함
- `경로안내`: 자동차 경로를 Tmap 엔진으로 계산해야 함

현재 코드는 둘 다 아직 미연동입니다.

## SQA 관점 우선순위
1. 치명: 경로/검색 엔진이 Tmap이 아니라 `MapKit`
2. 치명: 옵션 토글이 실제 경로 계산에 반영되지 않음
3. 높음: 실패/권한/API 오류 시 사용자 피드백 없음
4. 높음: 목업 데이터가 실제 길안내 신뢰를 떨어뜨림
5. 중간: 테스트 타깃 부재로 회귀 방지 장치 없음

## 권장 다음 액션
1. `RoutingProvider`와 `POISearchProvider` 추상화 계층을 도입합니다.
2. `MapKitRouteService` / `TmapRouteService`, `MapKitSearchService` / `TmapPOISearchService`로 분리합니다.
3. `RoutePreferences`를 실제 Tmap 경로 요청 파라미터에 연결합니다.
4. `RouteState`를 도입해 `idle/loading/success/empty/error/permissionDenied`를 UI에 노출합니다.
5. 그 다음 단계에서 `Navi_iOS` 또는 Tmap 길안내 흐름과 재탐색을 붙입니다.

## 참고 소스
- T MAP 공식 포털: https://tmapapi.tmapmobility.com/main.html
- 사용자 제공 참조: https://tmapapi.tmapmobility.com/main.html#puzzle/sample/puzzlePoi
