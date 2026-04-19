# Problem Solving Log

이 문서는 `이미 해결한 내용`, `그 과정에서 드러난 병목`, `거기서 얻은 인사이트`를 매번 누적하는 운영 로그다.  
핵심은 기능 목록이 아니라, 실제로 무엇을 해결했고 그 해결 방식이 무엇이었는지 기록하는 것이다.

## 기록 규칙

- 각 날짜마다 `실제 반영 포인트`, `재확인된 병목`, `해결 방식`, `다음 액션`을 남긴다.
- 기본적으로 `이미 반영된 것`을 중심으로 쓰고, 미해결 항목은 그 반영 과정에서 다시 확인된 병목으로만 적는다.
- 해결 완료가 아니라도 `부분 완화`, `코드상 준비만 됨`, `미해결`을 구분한다.
- 사용자가 놓치기 쉬운 리스크는 `숨은 리스크`에 별도로 적는다.
- 장애 치명도와 MVP 가치 우선순위가 다를 수 있으면 둘을 분리해서 적는다.

## 2026-04-19

### 실제 반영 포인트

- 서버에 `route corridor` API를 추가했다.
  - `server.js`
  - `POST /api/road/corridor`
  - 현재 route polyline/segmentStats/progressKm를 입력받아 `laneCenter`, `connector`, `rampShape`, `roadBoundary` 레이어를 응답하도록 했다.
  - 아직 NGII 실데이터 기반은 아니고 `route-segment-fallback` 기반 근사 corridor다.

- MapLibre 내비 화면이 corridor 레이어를 실제로 읽도록 연결했다.
  - `src/services/tmapService.js`
  - `src/components/Map/NavigationMapLibreView.jsx`
  - routeId, polyline, segmentStats, progressKm 기준으로 corridor를 가져와 source/layer에 반영하도록 추가했다.

- 내비 화면에 `MapLibre GL JS` 기반 벡터/WebGL 지도를 첫 단계로 도입했다.
  - `src/components/Map/NavigationMapLibreView.jsx`
  - `src/components/Map/MapView.jsx`
  - 내비 중에는 Leaflet 대신 MapLibre가 렌더링되고, 홈 지도에서는 기존 Leaflet을 유지하도록 분리했다.
  - 현재/다음 경로, 지나온 길, 카메라, hazard, upcoming guidance를 MapLibre source/layer로 옮겼다.
  - 번들 부담을 줄이기 위해 내비 시작 시점에만 lazy import되게 분리했다.

- 내비 미니 인셋을 추상 SVG에서 `실제 세그먼트 기반 형상`으로 한 단계 끌어올렸다.
  - `src/components/Navigation/NavigationOverlay.jsx`
  - 현재 세그먼트와 다음 세그먼트를 기반으로 경로형 인셋을 다시 그리게 바꿨다.

- 유도선 색상 문구를 인셋/음성까지 연결했다.
  - `src/components/Navigation/NavigationOverlay.jsx`
  - `extcVoiceCode`가 있는 경우 `분홍색/초록색 유도선을 따라가세요` 문구를 인셋 카드와 300m/100m 음성 안내에 같이 붙였다.

- 카메라 예고를 고속 구간 기준으로 더 이르게 조정했다.
  - `src/components/Navigation/NavigationOverlay.jsx`
  - 기존 `600m/100m` 구조에서 고속/고속제한 구간은 `1.5km/300m/100m`로 확장했고, 상단에 단속 전용 배너를 추가했다.

- 웹 유지형 정석 아키텍처 문서를 새로 고정했다.
  - `docs/web-architecture-checklist-2026-04-19.md`
  - `docs/web-first-architecture-2026-04-19.md`
  - `docs/web-architecture-report-2026-04-19.md`
  - `docs/open-task-matrix-2026-04-16.md`
  - `docs/mvp-forward-roadmap-2026-04-16.md`
  - 웹 유지, MapLibre 전환, corridor geometry, core/enrichment 분리, Railway 역할 경계를 문서에 명시했다.

- 실제 카메라/돌발상황 보강 레이어를 서버에 추가했다.
  - `server.js`
  - `ITS_API_KEY` 기반 `eventInfo` 프록시와 `DATA_GO_KR_API_KEY` 기반 공공 무인단속카메라 프록시를 추가했다.
  - `POST /api/road/actual-meta`
  - `GET /api/road/events/nearby`
  - route polyline/bbox 기준으로 실제 카메라와 ITS 돌발상황을 필터링하는 구조를 넣었다.

- live route에 공공 master camera를 덧붙이는 hydrate 단계를 추가했다.
  - `src/services/tmapService.js`
  - route fetch 후 `hydrateRoutesWithActualMeta()`를 통해
    - TMAP live camera
    - 공공 카메라 master
    - ITS 도로 이벤트
    를 하나의 route에 합치도록 바꿨다.

- 안전운전모드가 학교/방지턱만 보던 상태에서 실제 도로 이벤트를 함께 보게 바꿨다.
  - `src/services/tmapService.js`
  - safety hazard 검색에 `roadwork`, `accident`, `weather`, `disaster`를 추가했다.

- 지도와 음성 안내에도 실제 도로 이벤트를 연결했다.
  - `src/components/Map/MapView.jsx`
  - `src/components/Navigation/NavigationOverlay.jsx`
  - 경로/선택 도로에 공사·사고·기상·재난 마커를 표시하고, 내비 중 가까운 실제 이벤트를 TTS로 알리도록 연결했다.

- TMAP route camera 캐시를 무기한 저장하지 않도록 24시간 TTL을 걸었다.
  - `src/store/appStore.js`
  - TMAP 약관상 장기 축적 리스크를 줄이기 위해 localStorage camera cache를 24시간 기준으로 정리하도록 변경했다.

### 재확인된 병목

- corridor API는 아직 `NGII 실제 차선 geometry`가 아니라 route segment 기반 근사치라 차선 위치 정확도는 제한적이다.
- MapLibre 도입은 시작됐지만 아직 `corridor geometry`, `lane geometry`, `실제 지도 위 분홍/초록 유도선`은 붙지 않았다.
- MapLibre 청크가 커서 내비 시작 시 첫 로드 비용이 크다. 현재는 lazy import로 홈 번들 전파만 막은 상태다.
- 현재 인셋은 실제 세그먼트 기반으로 개선됐지만, 아직 NGII corridor geometry 기반은 아니다.
- 분홍/초록 유도선 문구는 생겼지만 실제 지도 위 lane-level 선 렌더링은 아직 없다.
- 웹 유지 전략은 확정했지만, `Leaflet -> MapLibre`, `corridor API`, `core/enrichment 분리`는 구현이 남아 있다.

- 공공 카메라와 ITS 이벤트는 붙였지만, 전국 단위 `모든 도로/휴게소/공사/차로제어`를 완전히 커버하는 master는 아직 아니다.
- ITS/API 키가 배포 환경에 빠져 있으면 이번 레이어는 자동으로 비활성 상태가 된다.
- 실제 차선 레벨 geometry와 운전자 시점 벡터 렌더링은 여전히 별도 스택 전환 이슈다.

### 해결 방식

- TMAP route 단일 소스에만 의존하지 않고
  - 실시간 route 응답
  - 공공 카메라 master
  - ITS 돌발상황
  을 겹치는 구조로 바꿨다.
- 경로 요청마다 외부 API fan-out이 커지지 않도록 server/runtime cache와 client actual-meta cache를 같이 두었다.
- 안전운전 hazard도 `POI 기반 가짜 위험요소` 중심에서 `실제 운영 이벤트`를 포함하는 방향으로 확장했다.

### 숨은 리스크

- 공공 카메라 표준데이터는 반기 갱신이라, 실시간 단속 on/off 여부까지 100% 보장하지 않는다.
- ITS 이벤트는 실시간성이 높지만, API 키와 기관 운영 상태에 따라 빈 응답이 올 수 있다.
- 현재 actual-meta는 route polyline과 bbox 기반 필터라, 아주 넓은 경로에서는 일부 누락이 생길 수 있다.

### 다음 액션

1. `MapLibre GL JS` 기반 내비 맵 스파이크 작성
2. corridor를 `NGII 실제 레이어`로 교체하는 ETL/PostGIS PoC 착수
3. route core와 enrichment를 런타임/화면 레벨에서 분리
4. Railway dev에서 MapLibre 내비 추종, corridor 레이어, camera banner + inset 회귀를 다시 확인

## 2026-04-18

### 실제 반영 포인트

- route preview 1회가 업스트림에서 과도하게 증폭되던 흐름을 줄였다.
  - `src/services/tmapService.js`
  - preview 모드는 direct 비교 경로 2개를 상한으로 두고, direct 대안이 이미 있으면 추가 `routeSequential30` fan-out을 만들지 않도록 조정

- `429` 직후 즉시 재시도가 같은 endpoint를 다시 두드리던 흐름을 막았다.
  - `src/services/tmapService.js`
  - 짧은 route circuit breaker를 추가해 rate-limit 직후에는 네트워크 재호출 대신 즉시 차단

- 같은 key의 마지막 정상 경로를 재사용하는 fallback을 넣었다.
  - `src/store/appStore.js`
  - `loadLiveRoutes`에서 `TMAP_ROUTE_RATE_LIMIT`일 때 최근 성공 cache를 재사용하고, UI에는 재시도 가능 시점을 남기도록 연결

- 하네스에 예산 회귀 테스트를 추가했다.
  - `scripts/navigation-harness.mjs`
  - preview 호출 상한과 429 circuit breaker를 로컬에서 바로 깨지게 검증

### 재확인된 병목

- `/api/tmap/routes` 400은 payload 정리와 로그는 들어갔지만, 실제 dev/Railway live 응답 기준 최종 종결 여부는 별도 확인이 필요하다.
- master data 확장은 구조와 일부 대표 노선 보강은 진행됐지만, 전국 단위 완성 상태는 아니다.
- 현재 완화는 `요청 예산 보호 + 마지막 정상 경로 유지`까지고, live upstream quota 자체가 늘어나는 것은 아니다.

### 해결 방식

- preview route는 `비교 가치가 있는 2개 결과`만 남기고, 경유지 기반 fan-out은 direct 비교가 부족할 때만 보조적으로 허용했다.
- `429`는 재시도로 밀어붙이지 않고 짧은 cooldown으로 회로를 잠근 뒤, 같은 키의 최근 성공 경로를 우선 재사용하도록 바꿨다.
- 하네스는 단순 옵션 테스트를 넘어 실제 fetch 호출 수와 breaker 동작을 검증하도록 확장했다.

### 숨은 리스크

- stale cache 재사용은 사용성 보호에는 유리하지만, 아주 최근 교통 변화까지 즉시 반영되는 것은 아니다.
- 현재 breaker는 클라이언트 메모리 상태라 브라우저 새로고침 후에는 다시 초기화된다.

### 다음 액션

1. dev/Railway에서 실제 `/api/tmap/routes` 400/429 로그를 다시 수집해 남은 payload edge case를 닫기
2. 대표 노선 기준 master data 누락 구간을 추가로 채우기
3. live 실기기 주행에서 `navigation-start`, `off-route`, `preset-change` 시 실제 네트워크 호출 수를 다시 확인하기

## 2026-04-16

### 실제 반영 포인트

- `ba5d4b6`
  - 휴게소/비음식점에 Google 평점이 붙는 버그 제거
  - 음식점류 결과에만 Google 평점 보강 제한

- `f169035`
  - `NavigationOverlay` 즉시 크래시 원인 1건 제거
  - live/recorded route가 아닐 때 카메라 개수를 가짜 숫자로 보여주지 않도록 수정

- `ed49b94`
  - 안내 오버레이 회복 로직 보강
  - 자동추종 카메라가 같은 좌표/줌으로 반복 `setView/panTo`를 치지 않도록 방어
  - 활성 route가 비정상일 때 오버레이 렌더가 바로 죽지 않도록 route guard 추가

### 재확인된 병목

- 안내 시작 직후 흰 화면 회귀가 완전 종결되지 않음
- 실시간 route 400/403/429의 원인 제거는 아직 미완료
- 운전자 시점 회전과 차선 위치 표출은 TMAP 수준에 못 미침
- 경로 추종과 경로 생성이 불안정한 상태라 `초보/중수/고수` 프리셋 차이가 실제 품질로 이어지지 않음
- MVP 기준으로는 `7. 안전운전/카메라`와 `8. 좋은 도로 추천`이 제품 핵심인데, 현재 문서가 장애 기준으로만 정렬돼 있어 가치 우선순위가 묻힐 수 있었음

### 해결 방식

- 크래시는 먼저 `오버레이 렌더 방어 + 비정상 route 안전 종료`로 차단
- 자동추종은 `동일 좌표/줌 반복 setView`를 막아 렌더 루프를 축소
- 데이터 표시는 `actual-only` 기준으로 바꾸고, 확실하지 않은 값은 `정보없음`으로 후퇴

### 숨은 리스크

- `429`는 완전 해결이 아니다.
  - `src/store/appStore.js`의 `loadLiveRoutes`에 8초 TTL 캐시와 inflight dedupe는 들어가 있다.
  - 하지만 `src/services/tmapService.js`의 `fetchSingleRoute`가 searchOption/body를 바꿔 여러 번 업스트림 호출할 수 있어, 논리적 1회 길찾기가 실제 다중 호출이 될 수 있다.

- 지도는 그냥 켜져만 있어도 네트워크를 쓴다.
  - 현재 `src/components/Map/MapView.jsx`는 `VITE_MAPTILER_KEY`가 있으면 MapTiler 타일을 쓰고, 키가 없을 때만 `tiles.osm.kr`로 폴백한다.
  - 즉 `quota exhaustion`을 런타임에서 감지해 자동으로 OSM으로 내리는 로직은 아직 없다.

- Google TTS 캐시는 코드상 준비만 되어 있다.
  - `server.js`는 `TTS_CACHE_DIR`가 있으면 그 경로에 mp3를 저장한다.
  - 그런데 이 경로가 실제 Railway volume mount를 가리키지 않으면 캐시는 컨테이너 재시작 후 보존되지 않는다.
  - 즉 `볼륨에 영구 저장`은 코드가 지원하지만, 현재 배포 환경이 그렇게 연결돼 있는지는 별도 확인이 필요하다.

- 지금 내비는 완전 오프라인이 아니다.
  - GPS 수집 자체는 브라우저 geolocation으로 로컬 센서를 사용한다.
  - 하지만 route 계산, reroute, reverse geocoding, 안전운전 hazard, POI, 지도 타일은 모두 네트워크를 탄다.
  - 따라서 현재 구조는 `GPS 기반`이면서 동시에 `네트워크 의존형 내비`다.

### 다음 액션

1. `/api/tmap/routes` 400 원인 로깅 고정
2. `nearestRoad` 403을 circuit breaker + raw/polyline fallback으로 우회
3. route 요청 budget을 실제 upstream 호출 수 기준으로 재설계
4. MapTiler quota/runtime 실패 시 OSM tile 자동 폴백 추가
5. Railway TTS cache path를 volume mount로 강제

## 사용자가 놓치기 쉬운 구조적 문제

- `경로를 못 따라간다`와 `초보/중수/고수 차이가 없다`는 사실상 같은 문제다.
  - 기본 route fidelity가 불안정하면 preset 차이는 의미가 없다.

- `직선거리처럼 보인다`는 건 지도 렌더 문제만이 아니라 `matched progress`와 `remaining route trim`의 정합성 문제일 수 있다.

- `네비가 된다`와 `실제로 쓸 수 있다`는 다르다.
  - 실제 제품 단계에서는 `API 예산`, `실패 시 폴백`, `실데이터 정합성`, `모바일 추종 품질`이 기능 수보다 중요하다.

## 2026-04-19 추가

### 실제 반영 포인트

- `3728030`
  - `POST /api/road/corridor` 추가
  - `NavigationMapLibreView.jsx`가 corridor GeoJSON을 읽어 본선/분기/램프/도로 경계 레이어를 직접 렌더링하도록 확장
  - 아직 `NGII 실데이터`가 아니라 `route.segmentStats + polyline` 기반 fallback

- 작업 중
  - `route core / enrichment` 상태 분리
  - `tmapStatus`는 길찾기 코어 상태로 유지
  - `enrichmentStatus.nearby/restaurants/safety`를 분리해 부가정보 실패가 길찾기 실패처럼 보이지 않도록 정리

### 해결 방식

- 길찾기 코어와 부가정보를 같은 배너에서 섞어 보여주던 구조를 store 채널 단위로 분리
- `openNearbyCategory`, `refreshHomeRestaurantPins`, `refreshSafetyHazards`, `NavigationOverlay`의 근처/맛집 로드를 각 enrichment 채널로 보고
- `RoutePreviewPanel.jsx`에서 `핵심 길찾기`와 `부가정보` 상태를 별도 카드로 렌더링

### 숨은 리스크

- 지금 단계는 `상태 분리`까지이고, 실제 네트워크 fan-out 절감은 아직 완전하지 않다.
- `searchNearbyPOIs` 내부는 여전히 category별로 여러 upstream을 순차/병렬 호출할 수 있다.
- 즉 `부가정보 장애가 길찾기를 망치지 않게`는 개선됐지만, `부가정보 예산 자체 축소`는 다음 단계 작업이다.

### 다음 액션

1. `searchNearbyPOIs`를 category별 lazy 전략으로 더 쪼개기
2. `quota safe mode`를 붙여 enrichment를 단계적으로 꺼지게 만들기
3. NGII 최소 레이어 확보 후 corridor fallback을 실제 geometry로 교체하기

## 2026-04-19 추가 2

### 실제 반영 포인트

- `searchNearbyPOIs`, `searchSafetyHazards`에 enrichment safe mode를 추가했다.
- 같은 채널에서 반복 실패가 2회 누적되면 3분 동안 네트워크 enrichment 호출을 쉬고 로컬 fallback만 사용한다.
- 적용 채널은 `fuel`, `restaurants`, `nearby`, `safety`다.

### 해결 방식

- route core는 그대로 두고 enrichment만 메모리 circuit breaker로 제어
- 안전정보는 빈 목록 fallback, 주변 검색은 category별 fallback 결과를 우선 사용
- repeated failure를 무조건 재시도하지 않도록 top-level service 함수에서 차단

### 숨은 리스크

- 현재 safe mode는 브라우저 메모리 상태라 새로고침하면 초기화된다.
- API provider별 quota가 아니라 `채널 단위 반복 실패` 기준이다.
- 즉 근본적인 quota telemetry는 아직 없고, 지금 단계는 `실패 폭주 방지`에 가깝다.

## 2026-04-19 추가 3

### 실제 반영 포인트

- `NavigationMapLibreView.jsx`에 `north-up / nav / manual` 카메라 상태머신을 넣었다.
- 사용자가 드래그/줌하면 `manual`로 전환되고 6초 뒤 자동으로 `nav`로 복귀한다.
- 경로 패널이 열리면 `north-up`으로 내리고, 패널이 닫히면 짧은 지연 뒤 다시 운전자 시점으로 복귀한다.
- 카메라 적용은 `recenterThresholdM + bearing/zoom/pitch delta` 기준으로 억제해 불필요한 `easeTo`를 줄였다.

### 해결 방식

- 기존 `navAutoFollow` 불리언 하나로 제어하던 구조를 지도 엔진 내부 모드로 확장
- `guidance distance`에서 계산한 zoom/pitch/offset을 `nav` 모드에서만 적용
- `manual` 상태에서는 현재 지도를 유지하고, 위치 마커만 계속 갱신

### 숨은 리스크

- 아직 `북업(home)`은 내비 화면 내부 north-up 기준이다. 홈 지도의 별도 MapLibre 상태머신은 아니다.
- camera smoothing은 heading 기반이라 lane geometry가 없는 구간에서는 여전히 TMAP만큼 정밀하지 않다.
- `easeTo` 억제로 흔들림은 줄지만, 저사양 기기에서 raster base + 대형 chunk 비용은 여전히 남아 있다.
