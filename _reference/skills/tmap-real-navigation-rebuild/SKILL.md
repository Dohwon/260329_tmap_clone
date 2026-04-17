---
name: tmap-real-navigation-rebuild
description: Rebuild and stabilize the 260329 TMAP Clone Web real-navigation stack when an agent must reproduce the same results we reached in April 2026: live TMAP route priority, route-budget control, invalid-route gates, scenic-road waypointing, actual-only safety data policy, mobile follow stabilization, dev Railway verification, and documentation updates. Use this when working inside TmapCloneWeb and the goal is to restore or extend real driving guidance without falling back to fake simulation behavior.
---

# TMAP Real Navigation Rebuild

## 1. 작업 개요와 목적

이 스킬의 목적은 `TmapCloneWeb/`에서 진행했던 실제 기반 내비게이션 복구 작업을 다른 AI가 같은 순서와 같은 판단 기준으로 재현하게 만드는 것이다.

최종 목표는 아래 다섯 가지를 동시에 만족하는 것이다.

- 실제 TMAP 경로를 우선 사용하고, 실패를 가짜 시뮬레이션으로 숨기지 않는다.
- 경로 요청 1회가 업스트림 다중 호출로 증폭되지 않게 제어한다.
- 안내 시작 직전 malformed route를 걸러서 흰 화면/오버레이 크래시를 막는다.
- 좋은 도로 추천은 `ETA만 증가`시키는 가짜 추천이 아니라 실제 `waypoints` state를 수정하는 추천으로 만든다.
- 카메라, 제한속도, 세그먼트 색, 주행 기록은 `actual-only` 기준으로 표시하고 확실하지 않으면 `정보없음` 또는 미표시로 후퇴한다.

이 스킬은 기능을 새로 만드는 문서가 아니라, 이미 검증된 작업 순서를 재현하는 문서다. 따라서 시행착오와 폐기된 접근은 절차에 넣지 않고 `금지 사항`에만 기록한다.

## 2. 전제 조건

### 필수 입력물

- 저장소 루트: `260329_tmap_clone/`
- 실제 작업 폴더: `TmapCloneWeb/`
- 이 스킬은 빈 프로젝트용이 아니라, 이미 `TmapCloneWeb/` 구조가 존재하는 동일 저장소에서만 사용한다.
- 먼저 읽을 문서:
  - `CLAUDE.md`
  - `TmapCloneWeb/README.md`
  - `TmapCloneWeb/docs/open-task-matrix-2026-04-16.md`
  - `TmapCloneWeb/docs/mvp-forward-roadmap-2026-04-16.md`
  - `TmapCloneWeb/docs/known-limitations.md`
  - `TmapCloneWeb/docs/problem-solving-log.md`
  - 필요 시 `TmapCloneWeb/docs/qa-gate-2026-04-13-real-navigation.md`

### 필수 도구

- 코드 편집 가능 에이전트
- `bash`
- `node`, `npm`
- `git`
- `railway` CLI
- `curl`

### 필수 런타임 / 서비스 조건

- 기본 작업 브랜치는 `development`다. 다른 브랜치에서 작업하면 dev Railway와 결과가 어긋날 수 있다.
- `node_modules`가 없다면 `cd TmapCloneWeb && npm install`이 선행돼야 한다.
- 네트워크 접근이 가능해야 한다. 이 스킬은 Railway, TMAP, Google, 공공 API 응답 확인을 포함한다.
- Railway CLI가 로그인된 상태여야 하고, 현재 디렉터리가 실제 Railway 프로젝트에 link 되어 있어야 한다.
- Railway `development` 환경이 실제 웹 서비스에 연결돼 있어야 한다.
- dev URL이 존재해야 한다. 기준 URL:
  - `https://260329tmapclone-development.up.railway.app`
- TMAP live 검증이 가능하려면 아래 중 하나가 실제로 세팅돼 있어야 한다.
  - `VITE_TMAP_API_KEY`
  - `TMAP_API_KEY`
- 위 키가 없으면 코드 재현은 가능하지만 `live route 성공`, `dev meta/tmap-status=live` 판정은 불가능하다.

### 권장 환경 변수

- 지도: `VITE_MAPTILER_KEY`
- TTS: `GOOGLE_TTS_API_KEY`, `GOOGLE_TTS_VOICE_NAME`
- TTS 영구 캐시: `TTS_CACHE_DIR` + Railway volume mount
- 유가: `OPINET_API_KEY`
- 병원/공공데이터: `DATA_GO_KR_API_KEY`
- 음식점 평점: `GOOGLE_PLACES_API_KEY`

### 모델 요구 조건

- 여러 파일에 걸친 상태 관리, 프록시, 프런트엔드 렌더, 배포 확인까지 한 번에 다룰 수 있는 코딩 에이전트여야 한다.
- 단순 코드 생성이 아니라 `하네스 + 빌드 + dev 배포 응답 확인`까지 수행할 수 있어야 한다.

## 3. 단계별 절차

병렬로 할 수 있는 일도 여기서는 재현성을 위해 직렬로 적는다.  
각 단계의 출력은 다음 단계의 입력이다.

### 3-1. 컨텍스트 고정

- `git status --short`로 현재 작업 트리가 깨끗한지 먼저 확인한다. 다른 사람의 변경이 섞여 있으면 덮어쓰지 않는다.
- `CLAUDE.md`, `README`, `open-task-matrix`, `mvp-forward-roadmap`, `known-limitations`, `problem-solving-log`를 읽는다.
- 현재 목표를 `경로 안정화`, `실제값 우선`, `좋은 도로 실제 경유지화`, `dev 검증` 네 묶음으로 압축한다.

출력:

- 우선순위가 고정된 작업 목록
- 수정 대상 파일 후보 목록

다음 단계 입력:

- 어떤 파일을 먼저 열어야 하는지에 대한 결정

### 3-2. 구조 점검

- 아래 파일을 우선 연다.
  - `src/store/appStore.js`
  - `src/services/tmapService.js`
  - `src/components/Navigation/NavigationOverlay.jsx`
  - `src/components/Map/MapView.jsx`
  - `src/utils/navigationLogic.js`
  - `server.js`
  - `scripts/navigation-harness.mjs`
- `isNavigating`, `navAutoFollow`, `startNavigation`, `refreshNavigationRoute`, `/api/tmap` 프록시, scenic 추천, camera parsing, POI 검색 경로를 찾는다.

출력:

- route 시작점, reroute, scenic 추천, overlay 렌더 경로의 실제 연결도

다음 단계 입력:

- 어떤 호출/렌더 흐름이 400/403/429/white screen과 연결되는지에 대한 근거

### 3-3. 경로 요청 예산 제어부터 먼저 고친다

- `src/services/tmapService.js`에서 route 요청을 `preview`와 `navigation`으로 분리한다.
- `navigation` 모드에서는 baseline direct route 1개만 요청하게 만든다.
- `buildSearchOptionAttempts`는 raw와 normalized를 둘 다 보내지 말고 normalized 1개만 남긴다.
- direct route 여러 옵션은 병렬 `Promise.all`이 아니라 순차 시도로 줄인다.
- `429`가 나오면 즉시 예외로 끝내고, 추가 옵션 재시도를 멈춘다.
- generic/road keyword 검색에서 `searchtypCd=B`를 무조건 병렬로 때리지 말고, 필요한 경우에만 보조적으로 호출한다.
- `server.js`에 route/nearestRoad 400·403·429 trace logging을 남긴다.

출력:

- 업스트림 호출 수가 줄어든 route fetch path
- 400/403/429의 최소 추적 로그

다음 단계 입력:

- invalid route가 어떤 형태로 들어오는지 식별 가능한 상태

### 3-4. `nearestRoad` 실패가 안내 시작을 죽이지 않게 만든다

- `src/services/tmapService.js`에서 `nearestRoad`는 좌표 검증 후에만 호출한다.
- 403이 나면 일정 시간 재시도를 막는 circuit breaker를 둔다.
- 스냅 실패 시 `null`을 반환하고 route 자체는 raw 좌표 또는 polyline projection으로 계속 진행한다.

출력:

- `nearestRoad` 실패에도 경로 계산이 끊기지 않는 좌표 처리 정책

다음 단계 입력:

- 안내 시작 전 route validation에 넣을 안전한 입력

### 3-5. 안내 시작 경로 유효성 게이트를 추가한다

- 별도 유틸 파일을 만든다.
  - 권장 파일: `src/utils/routingGuards.js`
- 여기에 아래 두 가지를 둔다.
  - `validateRouteForNavigation(route, userLocation)`
  - `buildScenicAnchorSeeds(suggestion)`
- `validateRouteForNavigation`은 최소 아래를 검증한다.
  - `source`가 `live` 또는 `recorded`인가
  - `polyline.length >= 2` 인가
  - polyline 길이가 비정상적으로 짧지 않은가
  - 선언 거리와 polyline 길이가 크게 어긋나지 않는가
  - 현재 위치와 route start가 너무 멀지 않은가
- `appStore.startNavigation` 직전에 이 검증을 걸고, 실패 시 오버레이로 들어가지 말고 route panel로 되돌린다.
- `searchRoute`에서도 `decoratedRoutes.length === 0`이면 즉시 중단하고 scenic/overlay 후속 로직으로 넘어가지 않게 한다.

출력:

- malformed route가 UI 렌더 전에 차단되는 gate

다음 단계 입력:

- 안내 오버레이가 가정하는 `유효한 route` 집합

### 3-6. 안내 오버레이를 안전 계산으로 감싼다

- `src/components/Navigation/NavigationOverlay.jsx`에서 `getGuidancePriority`, `getUpcomingGuidanceList`, `analyzeRouteProgress`, `getCurrentRouteSegment` 계산을 한 곳의 `useMemo` snapshot으로 묶는다.
- 계산 실패 시 빈 상태를 반환하고, 전체 컴포넌트를 죽이지 않게 한다.
- `isNavigating && showRoutePanel` 또는 `!hasActiveRoute`이면 즉시 `null`을 반환하는 조건을 유지한다.

출력:

- route 일부 데이터가 깨져도 화면 전체가 하얗게 죽지 않는 overlay

다음 단계 입력:

- scenic/actual-only 작업을 얹을 수 있는 안정된 안내 UI

### 3-7. 좋은 도로 추천을 실제 waypoint로 바꾼다

- `appStore`의 scenic 추천 로직을 midpoint 기반 추천에서 `entry/exit anchor` 기반 추천으로 바꾼다.
- `detectScenicRoads`는 `segmentMid` 하나만 보지 말고 `buildScenicAnchorSeeds`의 entry/exit를 기준으로:
  - 원본 경로선과의 거리
  - 원본 경로선 위 progress
  - backtrack 여부
  를 계산한다.
- 추천 후보에는 `referencePolyline`을 붙인다.
- `decorateScenicSuggestionsWithEntry`는 실제 road-snap 된 `resolvedWaypoints`를 미리 만들어 `entryAddress`, `exitAddress`를 채운다.
- `applyScenicRoute`는 ETA만 늘리는 로직이 아니라 `resolvedWaypoints`를 실제 `waypoints` state에 병합한 뒤 `searchRoute(destination)`를 다시 호출해야 한다.
- road-snap이 안 되면 마지막 보조 수단으로만 POI 검색을 사용한다.

출력:

- scenic 선택 시 실제 경유지 state가 바뀌는 추천 시스템

다음 단계 입력:

- 경로 카드/추천 다이얼로그에서 보여줄 실제 entry/exit 정보

### 3-8. 앞쪽 우선 추천과 역주행 경고를 고정한다

- scenic 후보는 `원본 경로선` 기준으로만 평가한다.
- `80km 이내`, `원본 경로선 반경 제한`, `앞쪽 progress 우선` 규칙을 유지한다.
- 뒤로 돌아가야 하는 후보는 완전 제거하지 말고 `requiresBacktrack` 표시와 함께 뒤로 정렬한다.
- 카드에는 반드시 `진입 위치 주소`, 가능하면 `진출 위치 주소`도 표시한다.

출력:

- 사용자가 “어디로 들어가는 길인지” 이해 가능한 scenic 추천 카드

다음 단계 입력:

- actual-only 데이터와 결합할 경로 설명 UI

### 3-9. actual-only 데이터 정책을 적용한다

- live/recorded route가 아니면 아래 값은 가짜 숫자를 보여주지 않는다.
  - camera count
  - speed summary
  - segment speed limit
  - congestion overlay
- `src/services/tmapService.js`에서 route 카메라는 `safetyFacilityList` 기반으로만 파싱한다.
- `src/store/appStore.js`의 merge options/preview card에서 추정 카메라 개수를 actual처럼 보이게 하지 않는다.
- 확실하지 않은 값은 `정보없음`, `실값없음`, 또는 미노출로 후퇴한다.

출력:

- 사용자에게 거짓 실제값을 보여주지 않는 데이터 정책

다음 단계 입력:

- QA 하네스와 문서 업데이트에 사용할 판정 기준

### 3-10. 위치 추종과 지나온 길을 보정한다

- `appStore`에서 `navigationMatchedLocation`, `navigationMatchedSegmentIndex`, `navigationProgressKm`, `drivePathHistory`, `driveSampleHistory`를 분리 관리한다.
- 지도에는 `남은 경로`와 `실제 지나온 주행 궤적`을 분리 렌더한다.
- raw GPS jump 필터는 `거리 + heading + 최근 속도` 조합으로 보정한다.
- 오프루트 재탐색은 raw GPS가 아니라 `matched progress`와 함께 판단한다.

출력:

- 지나온 길이 실제 궤적으로 저장되고, 남은 경로 trim이 가능한 상태

다음 단계 입력:

- 하네스와 실제 모바일 QA에서 확인할 주행 추종 품질

### 3-11. 하네스와 빌드 검증을 고정한다

- `scripts/navigation-harness.mjs`에 최소 아래 테스트를 유지한다.
  - searchOption normalization 중복 제거
  - navigation 모드 1개 route option
  - preview 모드 다중 option 유지
  - invalid route validation
  - scenic anchor entry/exit 생성
  - known place instant search
- 실행:

```bash
cd TmapCloneWeb
node scripts/navigation-harness.mjs
npm run build
```

출력:

- 회귀 여부가 바로 판단 가능한 테스트 결과

다음 단계 입력:

- dev 배포 전 최종 코드 상태

### 3-12. dev Railway 배포와 응답 확인

- Railway가 `development` 환경에 연결돼 있는지 확인한다.

```bash
cd TmapCloneWeb
railway status
railway up
curl -I -sS https://260329tmapclone-development.up.railway.app/
curl -sS https://260329tmapclone-development.up.railway.app/api/meta/tmap-status
```

- 기대 결과:
  - `/` 응답 `200`
  - `/api/meta/tmap-status` 응답에서 `hasApiKey: true`, `mode: live`
- 만약 `hasApiKey: false` 또는 `mode: simulation`이면 코드는 배포됐더라도 live 검증은 실패로 판정한다. 원인은 대개 환경 변수 누락 또는 Railway link 오류다.

출력:

- 사용자가 실제로 확인 가능한 dev 배포본

다음 단계 입력:

- 문서화와 최종 판정

### 3-13. 문서 갱신

- 수정 후 아래 문서를 함께 갱신한다.
  - `TmapCloneWeb/docs/problem-solving-log.md`
  - `TmapCloneWeb/docs/known-limitations.md`
  - 필요 시 `TmapCloneWeb/docs/open-task-matrix-2026-04-16.md`
  - 필요 시 `TmapCloneWeb/docs/mvp-forward-roadmap-2026-04-16.md`
  - `TmapCloneWeb/README.md`

- 원칙:
  - 해결된 것은 `problem-solving-log`
  - 아직 구조 한계가 큰 것은 `known-limitations`
  - 남은 실행 태스크는 `open-task-matrix`, `mvp-forward-roadmap`

출력:

- 코드와 문서가 분리되지 않은 상태

## 4. 금지 사항

아래는 실제로 실패했거나 재현성을 해치는 접근이다. 절차에 넣지 말고 금지한다.

- live route 실패를 `simulation route`로 자동 대체해 “되는 것처럼” 보이게 하지 말 것.
  - 왜 안 되는가: 사용자는 실제 경로가 적용됐다고 오해하고, 이후 카메라/속도/차선/추종 품질 문제의 원인을 파악할 수 없다.

- `searchOption` raw 값과 normalized 값을 둘 다 업스트림에 보내지 말 것.
  - 왜 안 되는가: 논리적 1회 길찾기가 실제 다중 호출로 증폭돼 429를 만든다.

- navigation 시작 시 direct route 여러 옵션을 병렬로 동시에 호출하지 말 것.
  - 왜 안 되는가: preview 비교에는 유효하지만 내비 시작 시에는 route budget만 낭비하고 실패 확률을 높인다.

- generic keyword 검색에서 `searchtypCd=A`와 `B`를 무조건 병렬 호출하지 말 것.
  - 왜 안 되는가: `음식점`, `주유소`, 도로명, 도로 주소 같은 키워드는 업종 검색이 불필요하거나 400을 유발할 수 있다.

- `nearestRoad` 403이 났다고 route start 자체를 막지 말 것.
  - 왜 안 되는가: 스냅 실패는 좌표 보정 실패일 뿐이고, route raw 좌표 자체는 유효할 수 있다.

- route validation 없이 `NavigationOverlay`를 먼저 렌더하지 말 것.
  - 왜 안 되는가: malformed route가 들어오면 overlay 내부 계산에서 흰 화면/복구 불가 상태가 재발한다.

- scenic 추천을 `segmentMid` 하나만으로 waypoint화하지 말 것.
  - 왜 안 되는가: ETA는 늘어나는데 실제 state에 경유지가 안 찍히거나, 어디로 들어가는지 모르는 추천이 된다.

- merge option이나 preview 카드에서 추정 카메라 수를 actual처럼 보여주지 말 것.
  - 왜 안 되는가: 사용자 신뢰를 깨고, MVP 핵심인 “왜 이 길인지 실제 데이터로 설명” 원칙을 훼손한다.

- `Leaflet + raster tile` 구조에서 TMAP 수준의 차선 형상/벡터 회전 지도를 “이미 구현 가능하다”고 가정하지 말 것.
  - 왜 안 되는가: 현재 스택으로는 차선 레벨 형상과 벡터 회전 지도의 정보량이 부족하다. 흉내는 가능하지만 동일 구현은 구조적으로 어렵다.

- 현재 웹 내비를 오프라인 내비라고 설명하지 말 것.
  - 왜 안 되는가: GPS 수집은 로컬이지만 route, reroute, reverse geocode, POI, safety, tile은 네트워크 의존이다.

- TTS 캐시가 Railway volume에 연결되지 않았는데 “영구 캐시 완료”라고 가정하지 말 것.
  - 왜 안 되는가: 컨테이너 재시작 후 캐시가 사라질 수 있어, 과금/지연 문제가 재발한다.

## 5. 판정 기준

이 스킬이 성공했다고 판정하려면 최소 아래 조건을 만족해야 한다.

### 코드/테스트

- `node scripts/navigation-harness.mjs` 통과
- `npm run build` 통과

### 경로/안내

- 안내 시작 전 invalid route가 차단되고, 흰 화면 대신 복구 가능한 상태로 돌아간다.
- navigation 시작 시 route 요청 수가 preview보다 적고, 업스트림 호출 폭증이 줄어든다.
- `nearestRoad` 403이 떠도 route 자체는 계속 진행된다.
- scenic 추천을 선택하면 실제 `waypoints` state에 경유지가 반영된다.
- scenic 카드에 진입 위치 주소가 보인다.

### actual-only

- live/recorded route가 아닐 때 카메라/속도/정체 값은 가짜 숫자가 아니라 `정보없음` 또는 미표시로 떨어진다.
- merge option의 카메라 수는 current actual route 외에는 추정값을 actual처럼 보이지 않는다.

### 배포

- dev URL이 200을 반환한다.
- `/api/meta/tmap-status`가 `hasApiKey: true`, `mode: live`를 반환한다.

### 문서

- 해결한 내용은 `problem-solving-log`
- 아직 구조적으로 열린 항목은 `known-limitations`
- 남은 작업은 `open-task-matrix`, `mvp-forward-roadmap`
  로 분리 기록된다.

## 6. 변경 이력

### 2026-04-13

- 실시간 경로, 세그먼트 색상, 현재 구간 제한속도, 안전 알림, 음성 큐, 차선 힌트 사전이 처음 정리됐다.
- `node scripts/navigation-harness.mjs`, `npm run build`를 기본 게이트로 고정했다.

### 2026-04-14

- scenic 추천을 ETA만 늘리는 임시 처리에서 `실제 waypoint 추가 -> 재탐색` 구조로 전환했다.
- 원본 경로선 기준 추천, 역주행 경고, 진입 위치 주소 표기를 추가했다.
- 음식점 평점은 음식점만 Google Places 보강하도록 분리했다.

### 2026-04-15

- 휴게소/카메라 master data를 실제 도로 기준으로 보강했고, synthetic camera fallback을 줄이기 시작했다.
- 서해안고속도로 대표 휴게소 데이터가 보강됐다.

### 2026-04-16

- route 400/403/429 대응이 실제 병목으로 재정의됐다.
- request budget, `nearestRoad` circuit breaker, invalid route gate, overlay guard, scenic actual anchor, actual-only camera policy가 핵심 과제로 고정됐다.

### 2026-04-18

- 이 스킬 문서를 작성했다.
- 다른 AI가 같은 저장소에서 같은 결과를 재현할 수 있도록 절차, 금지 사항, 판정 기준을 일원화했다.
