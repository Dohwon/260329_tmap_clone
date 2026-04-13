# Tmap Route Integration Next Step

## 목표
`선호 도로 기반 네비`를 실제 Tmap 경로 API 요청으로 내리기 위한 다음 구현 단계를 고정한다.

## 이번 단계에서 추가한 것
- [PreferredRoadPlan.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Models/PreferredRoadPlan.swift)
- [PreferredRoadPlanner.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/PreferredRoadPlanner.swift)
- [TmapModels.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Models/TmapModels.swift)
- [TmapAPIClient.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/TmapAPIClient.swift)
- [TmapRouteService.swift](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Services/TmapRouteService.swift)

## 설계 요점
1. `selectedHighway`는 `PreferredRoadRoutingPlan`으로 변환된다.
2. `PreferredRoadPlanner`는 출발지/목적지 기준으로 진입점과 이탈점을 계산한다.
3. 그 waypoint들을 `TmapRouteRequest.viaPoints`로 직렬화한다.
4. 실제 경로 요청은 `POST https://apis.openapi.sk.com/tmap/routes?version=1&format=json` 형태를 사용한다.

## 현재 상태
- 요청 DTO와 API 클라이언트는 추가됨
- `MapViewModel.startNavigation()`은 `TMAPAppKey`가 있으면 `TmapRouteService`를 우선 호출하고, 실패 시 `MapKit`으로 fallback 함
- Tmap GeoJSON은 앱 내부 `AppRoute` 모델로 변환되어 지도에 렌더링됨

## 바로 다음 구현
1. Tmap POI 검색 도입으로 검색 엔진도 통일
2. Tmap 다중 경로 또는 대안 경로 응답을 카드에 연결
3. 선호 도로 유지/이탈 상태를 길안내 단계에 표시
4. 실제 장거리 경로에서 waypoint 전략 검증

## 참고
- 자동차 경로안내: https://skopenapi.readme.io/reference/%EC%9E%90%EB%8F%99%EC%B0%A8-%EA%B2%BD%EB%A1%9C%EC%95%88%EB%82%B4
- 장소(POI) 통합 검색: https://skopenapi.readme.io/reference/%EC%9E%A5%EC%86%8C%ED%86%B5%ED%95%A9%EA%B2%80%EC%83%89
