# Road-First Service Model

## 요청 요약
- 목표: 현재 UI가 암시하는 서비스 방향을 정리하고, `선호 도로 기반 네비`를 실제 서비스 모델로 내린다.
- 기준: 일반 네비게이션이 아니라 사용자가 직접 도로를 고르고 그 축을 따라 목적지까지 가는 경험

## 현재 UI가 말하는 서비스 정체성
현재 UI는 이미 일반 네비보다 `로드 셀렉션 네비`에 가깝다.

1. 홈 하단 패널에서 목적지보다 먼저 `고속도로`를 고를 수 있다.  
   근거: [HomeBottomPanel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Home/HomeBottomPanel.swift:107)
2. 도로를 선택하면 지도 카메라와 도로 축이 먼저 강조된다.  
   근거: [MapViewModel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/ViewModels/MapViewModel.swift:174)
3. 경로 미리보기 시트는 `운전 성향`, `경로 선호`, `선호 도로 반영`, `합류 옵션`을 함께 보여준다.  
   근거: [RoutePreviewPanel.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Views/Navigation/RoutePreviewPanel.swift:29)

즉 서비스 핵심 플로우는 아래다.

1. 목적지 검색
2. 선호 도로 선택
3. 선호 도로 축을 반영한 추천 경로 비교
4. 원하는 경로를 선택해 안내 시작

## 현재 부족한 점
- `selectedHighway`는 UI와 추천 점수에는 반영되지만, 아직 실제 경유점 기반 요청으로는 내려가지 않았다.
- `MapKit` 기반 경로 계산은 선호 도로를 강하게 강제하기 어렵다.
- 안내 오버레이는 현재 `정적 경로 미리보기`에 가까워 실제 서비스 단계에는 부족하다.

## 서비스 모델
### 핵심 객체
- `preferredHighway`: 사용자가 주행하고 싶은 도로
- `destination`: 최종 목적지
- `PreferredRoadRoutingPlan`: 선호 도로를 어떤 방식으로 경로 엔진에 전달할지 정의하는 계획
- `RouteWaypoint`: 선호 도로 진입/이탈 또는 회랑 통과를 위한 중간 지점

### 라우팅 모드
- `freeRouting`: 일반 경로
- `recommendedRoad`: 추천 점수만 선호 도로에 가중치
- `corridorViaWaypoint`: 선호 도로 축을 실제 경유점으로 내려 강하게 유도

서비스 가능 수준에서는 `corridorViaWaypoint`가 핵심이다.

## Tmap 요청 매핑 방향
`PreferredRoadPlanner`는 선호 도로를 기준으로 진입점/이탈점 또는 회랑 midpoint를 계산한다.

- 출발지와 가장 가까운 도로 끝점을 `진입점`
- 목적지와 가장 가까운 도로 끝점을 `이탈점`
- 두 점이 사실상 같으면 `midpoint` 하나만 사용

이 waypoint들은 이후 Tmap `경유지` 요청 파라미터로 내려간다.

## 구현 우선순위
1. `PreferredRoadRoutingPlan`을 실제 라우팅 요청 입력으로 채택
2. Tmap 경로 API 호출 시 `viaPoints`로 변환
3. RoutePreview에서 “추천 반영”과 “실제 경유 강제”를 구분해 표기
4. 안내 단계에서 “현재 선호 도로 유지 중/이탈” 상태를 표시
