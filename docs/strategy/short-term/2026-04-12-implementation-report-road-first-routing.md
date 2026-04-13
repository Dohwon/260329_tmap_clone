# Implementation Report

## 1. 변경 목적
- 일반 네비가 아닌 `선호 도로 기반 네비`라는 현재 UI 방향을 서비스 모델로 명시한다.
- 선호 도로를 실제 Tmap 경로 요청의 `viaPoints`로 내릴 수 있는 코드 뼈대를 추가한다.
- 경로와 검색 모두를 `TMAP 우선 + MapKit fallback` 구조로 맞춘다.
- 경로 실패/로딩/선호 도로 반영 상태를 UI에서 더 명확히 드러낸다.

## 2. 주요 코드 변경
- 선호 도로 서비스 모델 추가
  - [PreferredRoadPlan.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Models/PreferredRoadPlan.swift)
  - [PreferredRoadPlanner.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/PreferredRoadPlanner.swift)
- Tmap 요청 DTO/클라이언트 뼈대 추가
  - [TmapModels.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Models/TmapModels.swift)
  - [TmapAPIClient.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/TmapAPIClient.swift)
  - [TmapRouteService.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/TmapRouteService.swift)
- Tmap POI 검색 연결
  - [SearchService.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/SearchService.swift)
  - 일반 검색은 `GET /tmap/pois`, 주변 검색은 `GET /tmap/pois/search/around`를 우선 사용
  - 실패 시 MapKit으로 fallback 하며, 결과에 `source`와 `poiID`를 유지
- 대안 경로 카드 확장
  - [TmapRouteService.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/TmapRouteService.swift)
  - [RouteService.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/RouteService.swift)
  - `선호 도로 우선 / 균형 추천 / 빠른길 / 쉬운길` 전략으로 TMAP 다중 요청을 생성
  - 유사 경로는 거리/시간/중간점 기준으로 제거해 카드 중복을 줄임
- 조건 변경 시 경로 재요청
  - [MapViewModel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/ViewModels/MapViewModel.swift)
  - [HomeMapView.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Map/HomeMapView.swift)
  - 경로 시트에서 운전 성향/필터를 바꾸면 `pendingDestination` 기준으로 TMAP 경로를 다시 계산
  - 연속 토글은 250ms 디바운스로 묶어 요청 중복을 줄임
- 주행 중 이탈 감지와 자동 재탐색
  - [MapViewModel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/ViewModels/MapViewModel.swift)
  - [NavigationOverlayView.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Navigation/NavigationOverlayView.swift)
  - 현재 위치와 경로 폴리라인의 최근접 거리를 계산해 120m 이상 이탈이 연속 감지되면 자동 재탐색
  - 재탐색 실패 시 기존 경로를 복원하고 안내를 유지
- 선호 도로 유지 상태 정밀화
  - [TmapAPIClient.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/TmapAPIClient.swift)
  - [MapViewModel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/ViewModels/MapViewModel.swift)
  - TMAP `가까운도로찾기` API로 현재 도로명을 조회하고, 선택한 고속도로와 일치 여부를 판정
  - 기하학적 회랑 거리와 함께 사용해 `접근 중 / 주행 중 / 이탈 징후 / 벗어남` 상태를 안내 오버레이에 노출
- 점열 기반 road matching 보강
  - TMAP `matchToRoads`로 최근 위치 4~8개를 매칭해 선호 도로 회랑과의 평균 거리로 판정을 보정
  - 단건 `nearToRoad` 오탐 가능성이 있는 분기점에서 점열 기반 판정을 우선 반영
- 고속도로 중심선 모델 추가
  - [RouteModels.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Models/RouteModels.swift)
  - [PreferredRoadPlanner.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/PreferredRoadPlanner.swift)
  - [MapViewModel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/ViewModels/MapViewModel.swift)
  - 고속도로별 `start-end` 직선 대신 중심선 좌표열을 두고 진입/이탈 waypoint, 회랑 거리, 카메라 분포 계산에 사용
- UI/상태 개선
  - 경로 로딩/오류 상태 추가
  - 선호 도로 반영 배지 및 경로 재정렬 반영
  - TMAP 앱 키 설정 진단용 `Info.plist` 항목 추가
- Xcode 프로젝트 등록
  - [project.pbxproj](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone.xcodeproj/project.pbxproj)

## 3. 테스트 내역과 결과
- 정적 검토 완료: `SearchResult` 생성 지점, 새 파일의 프로젝트 포함 여부, 상태 흐름 연결 확인
- 한계: 현재 환경에는 `swiftc`와 `xcodebuild`가 없어 실제 컴파일/실행 검증은 수행하지 못함

## 4. 남은 리스크
- Tmap 응답은 현재 `LineString` 중심 수동 파싱이라 응답 형식 변화에 취약하다.
- Tmap POI 응답도 현재 수동 파싱이라 주소/카테고리 필드 변형에 취약하다.
- 대안 경로는 붙었지만, TMAP 응답 특성상 서로 비슷한 경로만 돌아올 수 있다.
- 현재 이탈 판단은 최근접 폴리라인 거리 기반이라, 고가/지하차도 등 입체 교차 구간에서 오탐이 날 수 있다.
- 선호 도로 유지 여부는 `nearToRoad + matchToRoads + 중심선 회랑 거리` 결합 방식이지만, 중심선 좌표가 아직 수작업 앵커 포인트 수준이라 세부 IC/JC 형상을 모두 반영하진 못한다.
- Tmap 검색 실패 시 MapKit fallback 이 동작하므로, 일부 케이스에서는 검색 엔진과 경로 엔진이 다시 어긋날 수 있다.
- 경로 시트에서 옵션을 연속으로 빠르게 바꾸면 TMAP 재요청이 잦아질 수 있다.

## 5. 후속 작업 제안
1. 고속도로별 실제 링크 집합 또는 더 촘촘한 중심선 데이터를 두고 회랑 판정을 고도화
2. 주행 중 다음 maneuver 추정과 단계별 안내 갱신
3. Tmap 응답 파서를 DTO 기반으로 정리
4. 테스트 타깃 추가 및 실제 기기 검증
