# Reverse Requirements 2026-04-18

이 문서는 `TmapCloneWeb/`의 현재 소스 코드와 `docs/skills/tmap-real-navigation-rebuild/SKILL.md`를 기준으로,  
"이 결과물을 만들기 위해 원래 무엇이 요구되었어야 하는가"를 역으로 정리한 요구사항 명세다.

원칙:

- 현재 결과물에 존재하는 것만 적는다.
- 추상화하지 않고 코드 수준으로 적는다.
- 구현 절차와 제품 요구를 구분한다.

---

## 1회차 — 역기획 요구사항 명세

## A. 저장소 / 빌드 / 런타임 구성

### RR-001
- 웹 애플리케이션은 `React 18.3.1`, `react-dom 18.3.1`, `zustand 4.5.2`, `leaflet 1.9.4`, `react-leaflet 4.2.1`, `express 5.2.1`, `vite 5.4.8`를 사용해 구현되어야 한다.

### RR-002
- 패키지 매니저는 `npm`이어야 하고, `package.json`에 아래 스크립트가 정의되어야 한다.
  - `npm run dev` → `vite --host`
  - `npm run build` → `vite build`
  - `npm run preview` → `vite preview --host`
  - `npm start` → `node server.js`

### RR-003
- 개발 서버는 `vite.config.js`에서 `loadEnv(mode, process.cwd(), '')`로 환경 변수를 읽고, `@vitejs/plugin-react`를 플러그인으로 로드해야 한다.

### RR-004
- 개발 서버는 `/api/meta/tmap-status` 엔드포인트를 직접 제공해야 하며, 응답 본문은 `{"hasApiKey": boolean, "mode": "live" | "simulation"}` JSON 형식이어야 한다.

### RR-005
- Vite 개발 서버는 `/api/tmap` 요청을 `https://apis.openapi.sk.com/tmap`으로 프록시해야 하고, 프록시 요청 헤더 `appKey`에 `TMAP_API_KEY` 또는 `VITE_TMAP_API_KEY` 값을 넣어야 한다.

### RR-006
- 프로덕션 런타임은 `server.js` 기반의 Express 서버여야 하며, 정적 파일 서비스와 API 프록시를 한 프로세스에서 처리해야 한다.

## B. 서버 사이드 API 프록시 / 외부 연동

### RR-007
- `server.js`는 Node 내장 `fs.existsSync`, `fs.readFileSync`를 사용해 `.env`, `.env.local` 파일을 직접 읽고 `KEY=VALUE` 형식의 로컬 환경 변수를 파싱해야 한다.

### RR-008
- `server.js`는 아래 환경 변수를 읽어야 한다.
  - `TMAP_API_KEY`, `VITE_TMAP_API_KEY`
  - `OPINET_API_KEY`, `VITE_OPINET_API_KEY`
  - `MEDICAL_DATA_API_KEY`, `DATA_GO_KR_API_KEY`, `PUBLIC_DATA_API_KEY`
  - `GOOGLE_PLACES_API_KEY`, `GOOGLE_MAPS_API_KEY`
  - `GOOGLE_TTS_API_KEY`, `GOOGLE_API_KEY`
  - `GOOGLE_TTS_VOICE_NAME`
  - `TTS_CACHE_DIR`

### RR-009
- `server.js`는 Node 내장 `https.request()`를 사용해 아래 외부 서비스로 직접 HTTPS 요청을 전송해야 한다.
  - `apis.openapi.sk.com`
  - `www.opinet.co.kr`
  - `apis.data.go.kr`
  - `places.googleapis.com`
  - `texttospeech.googleapis.com`

### RR-010
- TMAP 프록시 요청 함수는 `Accept: application/json`과 `appKey: <TMAP_KEY>` 헤더를 포함해야 하며, 요청 본문이 있을 때 `Content-Type: application/json`과 `Content-Length`를 명시해야 한다.

### RR-011
- OPI 유가 요청은 `https://www.opinet.co.kr/api/<subPath>?out=json&certkey=<OPINET_KEY>` 형식의 GET 요청으로 전송되어야 한다.

### RR-012
- 공공데이터 병원 요청은 `https://apis.data.go.kr<servicePath>?serviceKey=<MEDICAL_DATA_KEY>` 형식의 GET 요청으로 전송되어야 하고, `Accept: application/xml,text/xml;q=0.9,*/*;q=0.8` 헤더를 포함해야 한다.

### RR-013
- Google Places 요청은 Google API key header에 `GOOGLE_PLACES_KEY` 값을 넣어 전송해야 한다.

### RR-014
- Google TTS 요청은 Google Cloud Text-to-Speech API로 전송되어야 하며, 음성 이름 기본값은 `ko-KR-Chirp3-HD-Despina`여야 한다.

### RR-015
- TTS 캐시는 `crypto.createHash('sha1')`로 텍스트, 음성 이름, 언어 코드, 발화 속도를 해시한 파일명 `<sha1>.mp3`로 저장해야 하며, 디렉터리가 없으면 `fs.mkdirSync(..., { recursive: true })`로 생성해야 한다.

### RR-016
- 서버는 route / nearestRoad 요청에 대해 요청 body를 요약하고, 400/403/429 응답 시 에러 코드와 에러 메시지를 로그에 남겨야 한다.

## C. 전역 상태 / 저장소 / 세션 유지

### RR-017
- 전역 상태는 `src/store/appStore.js`의 Zustand store로 구현되어야 한다.

### RR-018
- 브라우저 저장소는 `localStorage`를 사용해야 하며, 아래 키 이름을 그대로 사용해야 한다.
  - `tmap_favorites_v3`
  - `tmap_recent_searches_v3`
  - `tmap_saved_routes_v1`
  - `tmap_camera_reports_v1`
  - `tmap_settings_v1`
  - `tmap_restaurant_ratings_v1`

### RR-019
- 기본 즐겨찾기는 `집`, `회사` 두 개여야 하고, 각각 `🏠`, `🏢` 아이콘을 가져야 한다.

### RR-020
- 기본 설정은 아래 값을 가져야 한다.
  - `voiceGuidance: true`
  - `navigationLookAhead: true`
  - `navigationMinimalMap: true`
  - `mapTheme: 'auto'`
  - `showTrafficOnMap: false`
  - `safetyModeEnabled: false`
  - `fuelBenefitEnabled: true`
  - `fuelBenefitBrand: 'SK에너지'`
  - `fuelBenefitPercent: 5`

### RR-021
- 경로 요청 캐시는 메모리 `Map`으로 구현되어야 하고, TTL은 `8000ms`여야 하며, inflight dedupe도 별도 `Map`으로 관리되어야 한다.

## D. 홈 화면 / 지도 공통 UI

### RR-022
- 홈 화면은 `HomeScreenBoundary` 에러 바운더리로 감싸야 하며, 렌더 크래시 시 `"안내 화면 오류"`, `"경로 화면을 복구할 수 없었습니다"`, `"홈으로 복구"` UI를 보여주고 `stopNavigation()`으로 복구해야 한다.

### RR-023
- 홈 화면 상단에는 `"어디로 갈까요?"` 검색 버튼이 있어야 하며, 내비 중이 아니고 route panel이 닫혀 있을 때만 노출해야 한다.

### RR-024
- 홈 화면 오른쪽에는 고정 플로팅 버튼 3개가 있어야 한다.
  - 내 위치 이동
  - 고속도로 탐색
  - 레이어 토글

### RR-025
- 홈 화면은 야간(`19시~06시`) 또는 터널 유사 상태(`speedKmh > 35 && accuracy > 60`)일 때 자동 다크 모드를 사용할 수 있어야 한다.

### RR-026
- 안전 운전 모드 배너는 홈 하단에 붙어야 하며, 모바일 터치 스와이프로 접기/펼치기가 가능해야 한다.

### RR-027
- 안전 운전 모드가 켜져 있고 내비 중이 아닐 때, `window.speechSynthesis`를 사용해 `100미터 앞` 또는 `600미터 앞` 위험 요소 음성을 재생해야 한다.

### RR-028
- 지도는 `react-leaflet` `MapContainer`, `TileLayer`, `Polyline`, `Marker`, `Popup`, `CircleMarker`로 구성되어야 한다.

### RR-029
- 지도 색상은 아래 경로 유형 색을 가져야 한다.
  - 고속도로: `#FF89AC`
  - 국도: `#54C7FC`
  - 일반도로: `#808080`
  - 분기/합류: `#B8FFE9`
  - 유도선: `#FF89AC`

### RR-030
- 현재 위치 마커는 heading 값을 반영한 삼각형 방향 아이콘이어야 하고, 목적지, 카메라, 휴게소, 어린이보호구역, 방지턱, 맛집은 각각 다른 `L.divIcon` 배지 아이콘을 사용해야 한다.

### RR-031
- 홈 화면 레이어 메뉴에는 아래 토글이 있어야 한다.
  - 과속카메라
  - 구간단속
  - 제한속도
  - 합류지점
  - 휴게소/졸음쉼터
  - 정체 구간

## E. 검색 / 출발지 / 목적지 / 경유지

### RR-032
- 검색 패널은 `SearchSheet.jsx`로 구현되어야 하며, 기본 debounce 시간은 `450ms`여야 한다.

### RR-033
- 검색창 placeholder는 `routeSearchTarget === 'origin'`일 때 `"출발지 검색"`, 그 외에는 `"주소, 장소, 고속도로 시점/종점 검색"`이어야 한다.

### RR-034
- 검색 결과가 나오기 전이라도 `강남역`, `양화대교`, `올림픽대로`, `강변북로`, `남부터미널역`은 즉시 후보로 보여줄 수 있어야 한다.

### RR-035
- 검색어가 2글자 미만이면 실제 검색 요청을 보내지 않아야 한다.

### RR-036
- 검색은 `searchInstantPlaceCandidates()` 즉시 후보를 먼저 반영하고, 이후 `searchPOI()` 비동기 결과로 교체해야 한다.

### RR-037
- `searchPOI()`는 아래 동작을 해야 한다.
  - 도로명 주소 패턴이면 `fullAddrGeo`와 POI 검색을 병행
  - 일반 키워드면 `searchtypCd=A`를 우선 사용
  - `searchtypCd=B`는 필요한 경우에만 보조적으로 사용
  - 결과는 중복 좌표를 제거
  - `SEARCH_CACHE` 메모리 캐시에 5분 동안 보관

### RR-038
- 검색 화면에는 내비 중이 아닐 때 출발지/도착지 전환 버튼이 2개 있어야 하며, 출발지 기본 라벨은 `현재 위치`, 보조 라벨은 `GPS 기준 출발`이어야 한다.

### RR-039
- 내비 중 검색 결과를 선택하면 즉시 길안내를 시작하지 말고 `경유지 추가` 또는 `목적지 변경` 분기 UI를 거쳐야 한다.

### RR-040
- 음식점 검색 결과를 선택하면 일반 경로 선택이 아니라 음식점 상세 카드가 먼저 열려야 한다.

### RR-041
- 주유소 검색 결과와 근처 주유소 결과에는 `근방 최저`, `경로상 최저`, 할인 적용가 기준 빠른 선택이 있어야 한다.

### RR-042
- 출발지는 `routeOrigin` 상태로 별도 저장되어야 하며, 선택 시 목적지가 이미 있으면 즉시 `searchRoute(destination)`를 다시 호출해야 한다.

## F. 실제 경로 탐색 / Route Preview

### RR-043
- route preview panel은 `showRoutePanel === true`일 때만 렌더되어야 한다.

### RR-044
- route preview는 `TMAP 실시간` 또는 `시뮬레이션` 상태 배지를 표시해야 한다.

### RR-045
- `TMAP 실시간 경로 적용 중` / `TMAP 실시간 경로 미적용` 상태 박스를 route panel에 표시해야 한다.

### RR-046
- route panel은 `TMAP 대비 n분 빠름/느림` 비교 문구를 표시할 수 있어야 한다.

### RR-047
- route card는 아래 속성을 표시해야 한다.
  - 제목
  - ETA
  - 거리 km
  - 정체 상태
  - 난이도
  - 도로 구성 바
  - 고속/국도/일반도로 비율
  - 카메라 개수
  - 속도 요약

### RR-048
- route card 속도 요약은 최고/평균 속도를 모두 알 때 `최고/평균`, 하나만 알 때 `--/평균` 또는 `최고/--`, 둘 다 없을 때 `실값없음`으로 표시해야 한다.

### RR-049
- live route 또는 recorded route가 아닐 때 카메라 개수는 `정보없음`으로 표시해야 한다.

### RR-050
- route panel에는 `PresetSelector`, `RouteFilterBar`, `WaypointSheet`, `MergeOptionsSheet`가 연결되어야 한다.

### RR-051
- 안내 시작 버튼은 `isUsableLiveRoute(selectedRoute)`가 참일 때만 활성화되어야 한다.

### RR-052
- 시뮬레이터는 `import.meta.env.VITE_SHOW_SIM_CONTROLS === 'true'`일 때만 보여야 하고, 속도 버튼 `시뮬 60`, `시뮬 100`, `시뮬 200`을 가져야 한다.

## G. 경로 예산 제어 / live route 정책

### RR-053
- route 요청은 `preview`와 `navigation` 모드로 구분되어야 한다.

### RR-054
- `navigation` 모드에서는 direct route baseline 1개만 요청해야 한다.

### RR-055
- `preview` 모드에서는 roadType에 따라 2개 수준의 비교 route를 유지해야 한다.

### RR-056
- `buildSearchOptionAttempts('00')`는 `['0']`, `'04'`는 `['4']`, `'10'`은 `['10']`만 반환해야 한다.

### RR-057
- `fetchSingleRoute()`는 첫 요청 body와 fallback body를 순차적으로 시도해야 하며, 429가 발생하면 추가 재시도를 중단해야 한다.

### RR-058
- `fetchRouteByWaypoints()`는 출발지나 목적지와 80m 이내로 겹치는 waypoint를 제거해야 하며, 모두 제거되면 direct route로 폴백해야 한다.

### RR-059
- `nearestRoad` 스냅은 좌표가 유효할 때만 호출해야 하고, 403이 반복되면 5분 동안 재호출을 막아야 한다.

### RR-060
- live route cache key는 origin/destination 좌표, dedupe 된 waypoint 좌표, roadType, allowNarrowRoads, routeRequestMode를 포함해야 한다.

## H. 안내 시작 게이트 / 오버레이 방어

### RR-061
- `validateRouteForNavigation()`은 아래를 검증해야 한다.
  - route source가 `live` 또는 `recorded`
  - `polyline.length >= 2`
  - polyline 총 길이 `>= 0.05km`
  - 선언 거리와 polyline 길이의 큰 불일치 없음
  - 현재 위치와 route 시작점이 `8km` 이내

### RR-062
- `startNavigation()`은 route가 unusable 하거나 validation 실패면 안내를 시작하지 않고, `tmapStatus.lastError`를 설정한 뒤 route panel을 다시 열어야 한다.

### RR-063
- 안내 오버레이는 내부 계산 실패 시 전체 컴포넌트를 크래시시키지 말고 빈 snapshot 상태로 복구해야 한다.

### RR-064
- `showRoutePanel === true` 또는 active route가 없을 때 `NavigationOverlay`는 `null`을 반환해야 한다.

## I. 운전자 시점 / 자동 추종 / 지도 제어

### RR-065
- 내비 중 지도 자동 추종은 `navAutoFollow` 상태로 제어되어야 한다.

### RR-066
- 안내 시작 시 지도는 `mapZoom: 18` 수준으로 현재 위치에 포커싱해야 한다.

### RR-067
- 자동 추종 시 `getLookAheadCenter()`를 사용해 차량 위치보다 화면 위쪽에 전방을 더 보이게 해야 한다.

### RR-068
- 지도 회전은 사용자 heading 또는 route look-ahead heading을 사용해 `.map-rotation-layer`에 CSS `rotate()`를 적용하는 방식이어야 한다.

### RR-069
- 사용자가 지도 dragstart 또는 zoomstart를 일으키면 자동 추종은 즉시 꺼져야 한다.

### RR-070
- 자동 추종은 동일 좌표/동일 줌에 대해 `setView` 또는 `panTo`를 반복 호출하지 않도록 마지막 follow target을 기억해야 한다.

### RR-071
- 내비 중 저채도 지도 모드를 사용할 수 있어야 하며, tile pane의 `filter`와 `opacity`를 조정해 비경로 영역 채도를 줄여야 한다.

## J. 위치 추종 / 지나온 길 / 저장 경로

### RR-072
- 현재 위치 추종은 raw GPS 위치와 별도로 `navigationMatchedLocation`, `navigationMatchedSegmentIndex`, `navigationProgressKm`를 상태로 저장해야 한다.

### RR-073
- 안내 시작 시 `drivePathHistory`와 `driveSampleHistory`를 현재 위치 기준으로 초기화해야 한다.

### RR-074
- 지도에는 남은 경로와 실제 지나온 주행 궤적을 별도 polyline으로 렌더해야 한다.

### RR-075
- 실제 주행 저장은 안내 경로가 아니라 `drivePathHistory` 기준으로 저장해야 한다.

### RR-076
- 저장된 경로는 `recorded` source로 다시 열 수 있어야 하고, `resumeSavedRoute()` 호출 시 route panel 없이 바로 route 상태를 복원할 수 있어야 한다.

### RR-077
- `MoreScreen`은 저장된 경로를 기반으로 `analyzeRecordedDrive()`와 `buildDrivingHabitSummary()`를 사용해 운전 습관 요약을 생성해야 한다.

## K. 안내 문구 / 음성 / 안전 알림

### RR-078
- 안내 시작 시 `"안내를 시작합니다."` 음성이 자동 재생되어야 한다.

### RR-079
- 다음 guidance는 거리 기준으로 `100m`, `300m`, `700m` 구간 음성 알림을 재생해야 한다.

### RR-080
- 음성 재생은 먼저 `/api/tts/google`에 POST 요청을 보내고, 실패 시 `window.speechSynthesis`로 폴백해야 한다.

### RR-081
- 음성 큐는 최대 4개 길이로 관리되어야 하며, 재생 중이면 다음 멘트를 대기시켜야 한다.

### RR-082
- 카메라 근접 시 경고음과 함께 음성을 재생해야 하고, 600m / 100m 기준으로 다른 문구를 사용해야 한다.

### RR-083
- 어린이보호구역, 방지턱 같은 안전 위험 요소도 600m / 100m 기준 음성 안내를 제공해야 한다.

### RR-084
- 내비 중 카메라 120m 이내 통과 후에는 `showCameraReport` 팝업을 띄워 사용자가 제보할 수 있어야 한다.

### RR-085
- 상단 배너 제목은 다음 조작이 있으면 `"<거리> 후 <조작>"`, 없으면 목적지 이름이어야 한다.

### RR-086
- 차선 문구는 상단 배너가 아니라 별도 차선 안내 영역에서 표시되어야 한다.

## L. 차선 / 분기 / Merge Option

### RR-087
- `laneInfo` 또는 `guideLane` 텍스트를 기반으로 `우측 2개 차로 유지`, `좌측 2개 차로 유지`, `1~2차로 이용` 같은 차선 문구를 파싱해야 한다.

### RR-088
- `MergeOptionsSheet`는 평균속도, 교통상황, 카메라, 제한속도 mini stat 4개를 보여줘야 한다.

### RR-089
- merge option의 카메라 값은 현재 actual route 외에는 `실값없음`으로 표시해야 한다.

### RR-090
- merge option은 현재 경로 유지, 고속 본선 연결, 국도 연결 등의 비교 옵션을 가질 수 있어야 한다.

### RR-091
- merge option은 `difficulty`, `timeSaving`, `maintainKm`, `afterRoadType`, `afterRoadName`, `afterDescription`, `afterNextJunction` 속성을 가져야 한다.

## M. 좋은 도로 추천 / Scenic

### RR-092
- scenic 데이터는 `src/data/scenicRoads.js`의 정적 segment 데이터로 유지되어야 하며, 각 항목은 `segmentStart`, `segmentEnd`, `segmentMid`, `roadLabel`, `viaPoints`, `detourMinutes`, `stars`를 가져야 한다.

### RR-093
- scenic anchor는 `viaPoints`의 첫 점을 entry, 마지막 점을 exit로 사용하고, 없으면 `segmentStart`, `segmentEnd`를 사용해야 한다.

### RR-094
- scenic 후보는 원본 route polyline 기준으로 `progressKm`, `routeDistanceKm`, `requiresBacktrack`를 계산해야 한다.

### RR-095
- scenic 후보는 최대 6개까지만 유지해야 하고, `routeDistanceKm <= 20`, `encounteredProgressKm <= 80` 조건을 만족해야 한다.

### RR-096
- scenic 후보에는 `recommendationMode`, `noScenicWithin30Km`, `actualWaypointReady`, `entryAddress`, `exitAddress`, `resolvedWaypoints` 속성이 채워져야 한다.

### RR-097
- scenic 선택 시 `resolvedWaypoints`를 `waypoints` 상태에 실제로 병합하고, route order 기준으로 정렬한 뒤 목적지 재탐색을 실행해야 한다.

### RR-098
- scenic road-snap이 실패하면 마지막 보조 수단으로만 `searchPOI()`를 사용해야 하며, 그마저 실패하면 오류 메시지를 표시해야 한다.

### RR-099
- ScenicRoadDialog는 아래 정보를 표시해야 한다.
  - 해안도로/산악도로 구분
  - 현재 경로 ETA
  - scenic 경유 ETA
  - 추가 시간
  - 진입 주소
  - 진출 주소
  - 경유 포인트 칩
  - 역주행 경고 메시지

## N. 도로 탐색 / 홈 도로 데이터

### RR-100
- `src/data/highwayData.js`에는 실제 고속도로/국도 마스터 데이터가 있어야 하며, 각 도로는 `id`, `roadClass`, `number`, `name`, `shortName`, `color`, `totalKm`, `startName`, `endName`, `startAddress`, `endAddress`, `startCoord`, `endCoord`, `majorJunctions`, `restStops`를 가져야 한다.

### RR-101
- 홈/검색/고속도로 탐색에서 도로 검색 후보는 시점, 종점, IC/JC, 휴게소까지 포함해 생성되어야 한다.

### RR-102
- 도로별 휴게소는 `coord`가 없으면 `km`와 anchor node 보간으로 좌표를 계산해야 한다.

### RR-103
- `MoreScreen`의 도로 정보 패널은 `HIGHWAYS` 전체를 기반으로 평균속도와 혼잡 상태를 계산해 가까운 도로부터 정렬해야 한다.

### RR-104
- 고속도로/국도/도로 정보 메뉴는 외부 링크가 아니라 내부 데이터 기반 요약과 지도 연결을 제공해야 한다. 단, 버스/지하철은 외부 링크를 열 수 있다.

## O. 주유소 / 주차장 / 병원 / 맛집

### RR-105
- 주유소 가격 정렬은 `getDiscountedFuelPrice()`로 계산한 할인 적용가를 사용할 수 있어야 한다.

### RR-106
- 할인 적용 기준은 `settings.fuelBenefitBrand`, `settings.fuelBenefitPercent`를 사용해야 하고, 기본값은 `SK에너지 5%`여야 한다.

### RR-107
- 주유소, 휴게소, 주차장, 카페, 음식점, 병원, 편의점은 각각 다른 seed/meta 키워드로 nearby 후보를 만들 수 있어야 한다.

### RR-108
- 맛집은 `Google Places` 평점 보강 대상이고, 휴게소/주유소/병원은 Google 맛집 평점 보강 대상이 아니어야 한다.

### RR-109
- 음식점 상세 카드에는 Google 평점, 리뷰 수, 영업중 여부, 사용자 평점 입력 가능 여부를 표시해야 한다.

### RR-110
- 사용자 평점 입력은 반경 250m 안에서 20분 이상 머물렀을 때만 허용되어야 한다.

### RR-111
- 병원과 주차장 후보는 각각 영업 메타 또는 요금 메타를 추가로 보강할 수 있어야 한다.

## P. 더보기 화면 / 외부 연결 / 안전 토글

### RR-112
- `MoreScreen` 메뉴는 최소 아래 섹션을 가져야 한다.
  - 드라이브
  - 근처 찾기
  - 교통 정보
  - 안전
  - 설정

### RR-113
- 더보기의 `안전 운전 모드`는 홈 이동 버튼이 아니라 실제 토글 스위치여야 한다.

### RR-114
- 더보기의 `실시간 버스`는 `https://map.naver.com/p?menu=transit`을 새 창으로 열어야 한다.

### RR-115
- 더보기의 `지하철 노선도`는 `https://map.naver.com/p?menu=subway`를 새 창으로 열어야 한다.

### RR-116
- 더보기의 `긴급 신고`는 `tel:` 링크 또는 별도 패널을 통해 긴급 전화 연결이 가능해야 한다.

### RR-117
- 더보기의 `과속카메라 정보` 버튼은 지도 레이어를 켜고 가까운 도로를 선택한 뒤 홈 탭으로 돌아가야 한다.

## Q. 테스트 / 검증 / 배포 절차

### RR-118
- `scripts/navigation-harness.mjs`는 Node ESM 스크립트여야 하며, `assert/strict`를 사용해 실행 결과를 `PASS`/`FAIL` 문자열로 출력해야 한다.

### RR-119
- 하네스는 최소 아래 테스트를 포함해야 한다.
  - live route source 보존
  - navigation progress가 현재 위치 기준으로 줄어드는지
  - 안내 문구 우선순위
  - 현재 세그먼트 판별
  - 차선 문구 파싱
  - recorded drive 분석
  - searchOption normalization
  - navigation 모드 route option 1개
  - preview 모드 route option 다중 유지
  - navigation route validation
  - scenic anchor 생성
  - instant search known place 후보

### RR-120
- dev 배포 검증은 아래 명령을 기준으로 해야 한다.
  - `railway status`
  - `railway up`
  - `curl -I -sS https://260329tmapclone-development.up.railway.app/`
  - `curl -sS https://260329tmapclone-development.up.railway.app/api/meta/tmap-status`

### RR-121
- dev 검증 성공 조건은 아래 둘을 모두 만족하는 것이다.
  - `/` HTTP 200
  - `/api/meta/tmap-status`가 `{"hasApiKey":true,"mode":"live"}` 반환

### RR-122
- 변경 후 문서는 아래 위치에 분리 기록되어야 한다.
  - 해결 사항 → `docs/problem-solving-log.md`
  - 구조 한계 → `docs/known-limitations.md`
  - 남은 작업 → `docs/open-task-matrix-2026-04-16.md`
  - MVP 가치 순서 → `docs/mvp-forward-roadmap-2026-04-16.md`

---

## 2회차 — 숨은 요구 탐지

## A. ★ 사용자가 명시적으로 요청하지 않았을 가능성이 높은 항목

- ★ RR-004: Vite 개발 서버의 `/api/meta/tmap-status` 자체 제공
- ★ RR-015: SHA-1 기반 mp3 캐시 파일명 규칙과 로컬 파일 캐시 구조
- ★ RR-018: `localStorage` 키 이름을 버전 접미사까지 고정한 요구
- ★ RR-022: `HomeScreenBoundary` 에러 바운더리와 `"홈으로 복구"` UI
- ★ RR-034: `강남역`, `양화대교`, `올림픽대로`, `강변북로`, `남부터미널역` fast candidate 하드코딩
- ★ RR-052: `VITE_SHOW_SIM_CONTROLS`에 따라 60/100/200 시뮬레이터 버튼 노출
- ★ RR-057: `fetchSingleRoute()`의 다단계 fallback body 정책
- ★ RR-060: live route cache key에 routeRequestMode까지 포함하는 규칙
- ★ RR-063: 안내 오버레이 계산을 `useMemo` snapshot으로 감싸는 크래시 방어
- ★ RR-084: 카메라 통과 후 제보 팝업을 120m 기준으로 띄우는 동작
- ★ RR-118: 하네스가 `PASS`/`FAIL` 문자열을 출력해야 한다는 형식 요구
- ★ RR-120: `railway status`, `railway up`, `curl` 2종으로 dev 검증하는 절차

위 항목들은 현재 결과물에는 분명 존재하지만, 원 사용자가 처음부터 직접 요청했다기보다 구현 안정화 과정에서 추가된 요구일 가능성이 높다.

## B. 추상 표현을 구체화한 항목

- "외부 API와 통신한다"는 표현을 사용하지 않고 아래처럼 구체화했다.
  - Node 내장 `https.request()`로 `apis.openapi.sk.com`, `www.opinet.co.kr`, `apis.data.go.kr`, `places.googleapis.com`, `texttospeech.googleapis.com`에 요청
- "로컬 저장소를 쓴다"는 표현을 사용하지 않고 아래처럼 구체화했다.
  - `localStorage` 키 이름 `tmap_favorites_v3`, `tmap_recent_searches_v3`, `tmap_saved_routes_v1`, `tmap_camera_reports_v1`, `tmap_settings_v1`, `tmap_restaurant_ratings_v1`
- "실시간 상태를 보여준다"는 표현을 사용하지 않고 아래처럼 구체화했다.
  - `/api/meta/tmap-status`가 `hasApiKey`, `mode` JSON을 반환하고 route panel이 `TMAP 실시간 경로 적용 중` 또는 `TMAP 실시간 경로 미적용` 문구를 렌더
- "지도는 운전자 시점이다"는 표현을 사용하지 않고 아래처럼 구체화했다.
  - `.map-rotation-layer`에 CSS `rotate()`를 적용하고 `getLookAheadCenter()`로 전방 오프셋 중심을 계산

## C. 스킬 문서와 요구사항 목록 대조

### 스킬 문서에는 있지만 요구사항에는 넣지 않은 것

아래 항목은 제품 결과물이 아니라 재현 절차이므로 요구사항 본문에서 제외하거나 배포/검증 항목으로만 축소했다.

- `git status --short`로 작업 트리 청결 확인
- `CLAUDE.md`, `README`, task matrix, roadmap, limitations, problem-solving-log를 먼저 읽는 절차
- 기본 작업 브랜치를 `development`로 강제하는 절차
- Railway CLI 로그인/link 확인 절차
- "다른 사람 변경을 덮어쓰지 않는다" 같은 협업 규칙

### 요구사항에는 있지만 스킬 문서에는 직접 쓰지 않은 것

아래 항목은 현재 결과물에는 존재하지만, 스킬 문서는 `real navigation rebuild`에 초점을 맞춘 절차 문서라 세부 제품 요구로 직접 열거하지 않았다.

- 홈 화면 우측 플로팅 버튼 3종 구성
- 안전 운전 모드 배너의 터치 접기/펼치기 UI
- 외부 링크 메뉴(`네이버 버스`, `네이버 지하철`)
- 더보기 메뉴 섹션 구조
- 맛집 사용자 평점 입력 제약 조건
- 주유 할인 기본값 `SK에너지 5%`
- Leaflet 마커 배지 아이콘별 색상과 라벨
- route card의 난이도 배지, 도로 구성 바, 거리/정체 표시

### 재현 불일치 여부

- 현재 기준으로 큰 불일치는 없다.
- 다만 스킬 문서는 "어떻게 복구할 것인가" 중심이고, 이 문서는 "무엇이 구현되어 있어야 하는가" 중심이다.
- 따라서 같은 항목이라도 서술 단위가 다르다.

---

## 3회차 — 기능군 / 우선순위 재편

재편 원칙:

- 원본 요구사항 번호 `RR-001 ~ RR-122`는 유지한다.
- 여기서는 "무엇부터 반드시 살아 있어야 하는가" 기준으로만 다시 묶는다.
- `P0`는 지금 서비스가 네비게이션으로 성립하기 위해 즉시 필요한 항목이다.
- `P1`은 MVP 차별화와 사용성 완성도를 높이는 항목이다.
- `P2`는 운영 효율, 고도화, 부가 경험에 해당한다.

## P0 — 네비게이션 성립에 필요한 핵심 요구

### FG-01. 실제 경로 탐색과 요청 안정성

- 우선순위: `P0`
- 목적: 직선거리 금지, 실제 경로 미리보기, 안내 시작 전 경로 유효성 확보, 400/403/429 회귀 방지
- 포함 요구:
  - `RR-004`, `RR-005`, `RR-008`, `RR-009`, `RR-010`, `RR-016`
  - `RR-021`
  - `RR-043`, `RR-044`, `RR-045`, `RR-049`, `RR-051`
  - `RR-053`, `RR-054`, `RR-055`, `RR-056`, `RR-057`, `RR-058`, `RR-059`, `RR-060`
- 판정 기준:
  - 경로 조회 1회에서 불필요한 중복 호출 없이 실제 route preview가 열린다.
  - `429`가 발생해도 추가 폭주 요청이 이어지지 않는다.
  - `nearestRoad 403`이 발생해도 무한 재시도하지 않는다.

### FG-02. 안내 시작 게이트와 크래시 방어

- 우선순위: `P0`
- 목적: 안내 시작 시 흰 화면, 오류 overlay, unusable route 진입을 막는다.
- 포함 요구:
  - `RR-022`
  - `RR-061`, `RR-062`, `RR-063`, `RR-064`
- 판정 기준:
  - 안내 시작 시 route validation 실패면 홈이 아니라 route panel로 복귀한다.
  - overlay 계산 실패가 전체 앱 크래시로 번지지 않는다.

### FG-03. 내 위치 추종, 지나온 길, 실주행 저장

- 우선순위: `P0`
- 목적: 사용자의 실제 움직임을 놓치지 않고, 지나온 길과 남은 길을 분리하며, 실주행 기준으로 기록을 남긴다.
- 포함 요구:
  - `RR-065`, `RR-066`, `RR-067`, `RR-069`, `RR-070`
  - `RR-072`, `RR-073`, `RR-074`, `RR-075`, `RR-076`, `RR-077`
- 판정 기준:
  - 현재 위치가 경로 진행에 맞춰 따라오고, 남은 경로가 줄어든다.
  - 지나온 길은 안내 경로 복사본이 아니라 `drivePathHistory` 기반으로 남는다.

### FG-04. 검색, 출발지, 목적지, 경유지의 핵심 플로우

- 우선순위: `P0`
- 목적: 출발지 지정, 목적지 검색, 안내 중 경유지 추가/목적지 변경까지 최소 플로우를 보장한다.
- 포함 요구:
  - `RR-032`, `RR-033`, `RR-035`, `RR-036`, `RR-037`
  - `RR-038`, `RR-039`, `RR-042`
- 판정 기준:
  - 출발지와 목적지를 분리해서 지정할 수 있다.
  - 안내 중 검색 결과 선택 시 즉시 길안내가 아니라 분기 UI가 열린다.

### FG-05. 다음 안내, 음성, 안전 경고의 최소 세트

- 우선순위: `P0`
- 목적: 단순 경로선만 보여주는 수준을 넘어서, 실제 주행 중 다음 행동을 알 수 있게 만든다.
- 포함 요구:
  - `RR-078`, `RR-079`, `RR-080`, `RR-081`
  - `RR-082`, `RR-083`
  - `RR-085`, `RR-086`
- 판정 기준:
  - 안내 시작 음성이 나오고, 다음 안내가 거리 구간별로 나온다.
  - 상단 배너는 목적지가 아니라 "다음 조작" 중심으로 동작한다.

### FG-06. Dev/Prod 검증과 회귀 확인

- 우선순위: `P0`
- 목적: dev 배포 상태에서 live mode 여부와 앱 기본 진입 가능 여부를 즉시 검증한다.
- 포함 요구:
  - `RR-118`, `RR-119`, `RR-120`, `RR-121`
- 판정 기준:
  - dev URL 루트가 `200`을 반환하고, `tmap-status`가 `live`를 반환한다.
  - navigation harness 핵심 테스트가 `PASS`로 유지된다.

## P1 — MVP 경쟁력과 체감 품질을 높이는 요구

### FG-07. 운전자 시점 지도와 시야 정리

- 우선순위: `P1`
- 목적: 운전자 시점 회전, 전방 오프셋, 저채도 배경으로 실제 길을 더 잘 보이게 만든다.
- 포함 요구:
  - `RR-068`, `RR-071`
  - `RR-028`, `RR-029`, `RR-030`, `RR-031`
- 판정 기준:
  - 경로선과 유도선이 배경보다 우선적으로 읽힌다.
  - 사용자가 지도 조작 시 auto-follow가 적절히 해제된다.

### FG-08. 차선, 분기, 합류 판단 고도화

- 우선순위: `P1`
- 목적: 직진/좌우회전뿐 아니라 차선 유지, 본선 연결, 국도 전환 등 분기 판단을 보조한다.
- 포함 요구:
  - `RR-087`, `RR-088`, `RR-089`, `RR-090`, `RR-091`
- 판정 기준:
  - laneInfo/guideLane이 있는 구간에서는 차선 문구가 별도 영역에 나온다.
  - 분기 비교 옵션에서 현재 경로 유지와 대체 연결을 읽을 수 있다.

### FG-09. 좋은 도로 추천의 실제 waypoint화

- 우선순위: `P1`
- 목적: 해안도로/산악도로 추천이 단순 카드가 아니라 실제 waypoint로 붙어 경로에 반영되게 한다.
- 포함 요구:
  - `RR-092`, `RR-093`, `RR-094`, `RR-095`, `RR-096`, `RR-097`, `RR-098`, `RR-099`
- 판정 기준:
  - scenic 선택 후 시간만 늘어나는 것이 아니라 실제 경유지가 route state에 반영된다.
  - 역주행 필요 시 경고가 나온다.

### FG-10. 고속도로/국도/도로 마스터 데이터 기반 탐색

- 우선순위: `P1`
- 목적: 도로 추천, 휴게소, 시점/종점, IC/JC, 내부 도로 정보를 실제 데이터 기반으로 제공한다.
- 포함 요구:
  - `RR-100`, `RR-101`, `RR-102`, `RR-103`, `RR-104`
- 판정 기준:
  - 도로 검색 시 시점/종점/휴게소/IC 후보가 일관되게 나온다.
  - 더보기 도로 정보가 외부 링크 의존 없이 내부 데이터로 정렬된다.

### FG-11. 맛집/주유소/병원/주차장 실사용 정보

- 우선순위: `P1`
- 목적: 주행 중 실제 선택에 도움이 되는 주변 시설 메타를 보여준다.
- 포함 요구:
  - `RR-040`, `RR-041`
  - `RR-105`, `RR-106`, `RR-107`, `RR-108`, `RR-109`, `RR-110`, `RR-111`
- 판정 기준:
  - 주유소는 할인 적용가 기준 빠른 선택이 가능하다.
  - 맛집은 Google 평점/리뷰 수/영업중 여부를 카드로 확인할 수 있다.
  - 병원/주차장은 가능한 메타가 붙는다.

### FG-12. 홈 / 더보기 사용성 완성

- 우선순위: `P1`
- 목적: 홈에서 필요한 진입 버튼과 더보기의 핵심 액션을 자연스럽게 사용하게 한다.
- 포함 요구:
  - `RR-023`, `RR-024`, `RR-025`, `RR-026`, `RR-027`
  - `RR-112`, `RR-113`, `RR-114`, `RR-115`, `RR-116`, `RR-117`
- 판정 기준:
  - 안전 운전 모드는 실제 토글로 동작한다.
  - 홈/더보기에서 자주 쓰는 동작이 별도 우회 없이 가능하다.

## P2 — 운영, 최적화, 부가 경험

### FG-13. 상태 저장, 즐겨찾기, 최근 검색, 설정 유지

- 우선순위: `P2`
- 목적: 사용자의 습관과 설정을 세션 간 유지한다.
- 포함 요구:
  - `RR-017`, `RR-018`, `RR-019`, `RR-020`
- 판정 기준:
  - 새로고침 후에도 즐겨찾기, 최근 검색, 설정이 유지된다.

### FG-14. 시뮬레이터와 내부 테스트 편의성

- 우선순위: `P2`
- 목적: 실제 운전 없이도 경로 추종, 속도 변화, 재탐색을 반복 검증한다.
- 포함 요구:
  - `RR-052`
- 판정 기준:
  - dev 환경에서만 시뮬레이터가 보이고, `60/100/200` 속도 전환이 가능하다.

### FG-15. 카메라 제보와 사후 참여 기능

- 우선순위: `P2`
- 목적: 실시간 주행 이후 사용자 입력으로 안전 데이터를 보완한다.
- 포함 요구:
  - `RR-084`
- 판정 기준:
  - 카메라 통과 후 적절한 제보 UI가 뜬다.

### FG-16. 경로 카드 시각 정보와 비교 표현

- 우선순위: `P2`
- 목적: route panel을 정보 밀도 높게 구성해 선택 전 비교 판단을 돕는다.
- 포함 요구:
  - `RR-046`, `RR-047`, `RR-048`, `RR-050`
- 판정 기준:
  - route card만 보고 ETA, 정체, 도로 비율, 속도 요약을 비교할 수 있다.

### FG-17. Fast candidate와 탐색 체감 속도 최적화

- 우선순위: `P2`
- 목적: 자주 찾는 키워드에 대한 체감 속도를 개선한다.
- 포함 요구:
  - `RR-034`
- 판정 기준:
  - 특정 핵심 키워드는 실제 API 응답 전에도 후보가 즉시 뜬다.

## 우선 처리 순서 제안

현재 코드베이스 기준 권장 처리 순서는 아래와 같다.

1. `FG-01` 실제 경로 탐색과 요청 안정성
2. `FG-02` 안내 시작 게이트와 크래시 방어
3. `FG-03` 내 위치 추종, 지나온 길, 실주행 저장
4. `FG-05` 다음 안내, 음성, 안전 경고의 최소 세트
5. `FG-04` 검색, 출발지, 목적지, 경유지의 핵심 플로우
6. `FG-09` 좋은 도로 추천의 실제 waypoint화
7. `FG-10` 고속도로/국도/도로 마스터 데이터 기반 탐색
8. `FG-08` 차선, 분기, 합류 판단 고도화
9. `FG-11` 맛집/주유소/병원/주차장 실사용 정보
10. `FG-07` 운전자 시점 지도와 시야 정리
