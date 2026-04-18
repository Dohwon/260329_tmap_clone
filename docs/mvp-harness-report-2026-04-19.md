# MVP Harness Report 2026-04-19

## 범위

- 기준 문서 재독: `TmapCloneWeb/_reference/reverse-requirements-2026-04-18.md`
- 업무 리스트 재편: `TmapCloneWeb/docs/mvp-harness-task-board-2026-04-19.md`
- 이번 세션 구현 범위:
  - `고속/국도/경관도로 추천` 카테고리 중 `특정 도로를 타러 가는 모드`
  - `실시간 경로 적용` 카테고리 중 route 중복 요청 억제와 invalid payload 게이트
  - `지도 회전/차선 안내` 카테고리 중 가까운 안내 우선, 속도표시 보정, 운전자 시점 camera 조정
  - 문서/메모리 파일 업데이트
  - 하네스 + 빌드 검증

## 검증 결과

- `node scripts/navigation-harness.mjs`: PASS
- `npm run build`: PASS
- 참고:
  - 기존 CSS minify warning 1건은 유지
  - chunk size warning 유지

## 추가 반영 (실데이터 레이어)

- `server.js`
  - `ITS_API_KEY` 기반 `GET /api/road/events/nearby`
  - `DATA_GO_KR_API_KEY` 기반 `POST /api/road/actual-meta`
  - route polyline/bbox 기준 실카메라/돌발상황 보강 레이어 추가

- `src/services/tmapService.js`
  - `hydrateRoutesWithActualMeta()` 추가
  - live route에 공공 카메라 master + ITS 도로 이벤트를 병합
  - `searchSafetyHazards()`에 `roadwork/accident/weather/disaster` 확장

- `src/store/appStore.js`
  - TMAP live camera cache 24시간 TTL 적용
  - 선택 도로(`selectedRoad`) actual meta 비동기 보강 추가

- `src/components/Map/MapView.jsx`
  - 경로/선택 도로의 공사·사고·기상·재난 마커 표시

- `src/components/Navigation/NavigationOverlay.jsx`
  - 실제 도로 이벤트를 내비 음성 경고로 안내

## 1. dev/prod 배포 구조

- 해결 상태: `partial`
- 해결 내용:
  - dev/prod는 이번 세션에서 실제 배포까지 수행하지 않고, 관측용 task board와 report에 검증 항목을 명시했다.
  - dev/prod 확인 최소 기준을 `build`, `harness`, `tmap-status`, `simulator env` 축으로 정리했다.
- 미해결:
  - 실제 Railway dev/prod 반영 여부 확인은 이번 세션 범위에서 실행하지 않았다.
- 이유:
  - 사용자 요청의 핵심은 문서 재독과 누락/우선순위 재정리, 그리고 해결 가능한 제품 작업 처리였다.

## 2. 검색 속도/품질 개선

- 해결 상태: `not_started`
- 미해결:
  - 검색 후 첫 route 요청 400
  - origin/destination/waypoint 전환 직후 payload 정합성
  - 백스페이스/삭제 직후 빈 route 요청 차단
- 이유:
  - 이번 세션 우선순위를 MVP target 4인 `특정 도로를 가장 빠르게 타러 가기`에 먼저 집중했다.

## 3. 고속/국도/경관도로 추천

### 3-A. 특정 도로를 “타러 가는” 모드

- 해결 상태: `done`
- 해결 방식:
  - `src/services/tmapService.js`
    - `getRoadDriveOrderedNodes()`
    - `buildRoadDriveEntryCandidates()`
    - `buildRoadDriveWaypoints()`
    를 추가했다.
  - `src/store/appStore.js`
    - `searchRouteAlongRoad()`가 기존의 `시점 waypoint 고정` 방식 대신
      1. 현재 위치 기준 entry candidate 추출
      2. `fetchDirectRoute()`로 각 후보 진입 ETA 평가
      3. 가장 빠른 후보 선택
      4. 선택된 진입점 + 본선 유지용 anchor waypoint 생성
      5. 목적지까지 실제 route 재탐색
    순서로 동작하게 바꿨다.
  - `src/components/Map/HighwayExplorer.jsx`
    - CTA를 `가장 빠른 진입로로 {도로명} 타러 가기`로 수정했다.
- 검증:
  - 하네스에 아래 테스트 추가 후 PASS
    - road drive entry candidates include the road start and nearby entry nodes
    - road drive waypoints keep the chosen entry and downstream anchors

### 3-B. 경관도로 waypoint 반영

- 해결 상태: `partial`
- 해결 내용:
  - 기존 scenic waypoint 반영 로직과 anchor seed 검증은 하네스 PASS 상태를 재확인했다.
- 미해결:
  - 실제 UI에서 scenic 선택 후 map/route panel 노출까지 end-to-end 재검증은 이번 세션에서 별도 하지 않았다.

### 3-C. 앞쪽 우선 추천과 역주행 경고

- 해결 상태: `not_started`
- 이유:
  - current priority를 target 4 구현에 사용했다.

## 4. 내 위치 추종

- 해결 상태: `partial`
- 해결 내용:
  - `src/components/Map/MapView.jsx`
    - auto-follow 재중심 임계값을 낮춰 운전자 위치 추종을 더 자주 수행하게 조정했다.
    - heading smoothing을 빠르게 조정해 방향 전환 반응을 줄였다.
- 미해결:
  - 실제 GPS 점프 필터의 raw sensor 레벨 보정
  - 지나온 길 trim 품질
  - 실주행 저장 정합성
- 이유:
  - 이번 수정은 시점 추종 민감도 조정까지이며, 실제 위치 센서 노이즈 자체를 근본적으로 줄인 것은 아니다.

## 5. 실시간 경로 적용

- 해결 상태: `partial`
- 해결 내용:
  - `src/store/appStore.js`
    - `searchRoute()`에 origin/destination 유효성 게이트를 추가해 좌표가 비어 있는 상태에서는 실제 `/api/tmap/routes` 호출을 막도록 수정했다.
    - 동일 origin/destination/waypoint/roadType 조합은 inflight promise를 재사용하도록 `routeSearchExecutionKey` 기반 중복 억제를 추가했다.
    - 직전 동일 요청은 `1.5초` 동안 기존 route 결과를 재사용하도록 해서 짧은 시간 내 중복 프리뷰 호출을 줄였다.
    - `driverPreset`, `includeScenic`, `includeMountain` 변경은 서버 재요청 대신 `refreshRoutePresentation()`으로 로컬 재정렬/경관 후보 재계산만 수행하게 바꿨다.
  - 하네스 기준으로 아래는 PASS 상태를 재확인했다.
    - route 429 short circuit breaker
    - navigation mode direct route option 1개 유지
    - preview mode direct-route budget 유지
    - malformed route validation gate
- 미해결:
  - 실제 검색/경유지/삭제 시나리오에서 남아 있는 `/api/tmap/routes` 400 원인 전체 고정
  - `merge`, `search sheet`, `navigation overlay` 경로까지 포함한 UI 연쇄 호출 잔여 여부의 dev 배포 검증
- 이유:
  - 이번 세션에서는 코드와 로컬 하네스 기준으로 먼저 차단 로직을 넣었고, 실제 dev 클릭 플로우 E2E까지는 아직 수행하지 않았다.

## 6. 안전운전모드/카메라/방지턱

- 해결 상태: `not_started`
- 미해결:
  - actual-only 카메라 정합성 재검토
  - safety mode의 UI 우선순위 조정

## 7. 주유소/병원/맛집/구글평점

- 해결 상태: `not_started`
- 미해결:
  - MVP 핵심 UI보다 뒤로 밀리는지 배치 재검토
  - 데이터 커버리지/정확도 정리

## 8. 지도 UI 개선

- 해결 상태: `partial`
- 해결 내용:
  - `src/utils/navigationLogic.js`
    - 내비 camera zoom/offset을 전 거리 구간에서 상향 조정해 경로 전방 가시성을 높였다.
  - `src/index.css`
    - 회전 레이어 크기를 확대해 회전 시 빈 여백이 드러나는 문제를 줄였다.
- 미해결:
  - 내비 전용 저채도/베이스맵 전체 미세조정
  - 홈 quick action의 비-MVP 비중 조정

## 9. 지도 회전/차선 안내

- 해결 상태: `partial`
- 해결 내용:
  - `src/utils/navigationLogic.js`
    - 가까운 maneuver가 없는 경우에도 폴리라인 회전각 기반 synthetic guidance를 생성하도록 보완했다.
    - `getEffectiveCurrentSpeedContext()`를 추가해 고속 본선 근처에서 local connector 제한속도 40이 먼저 잡히는 표시를 완화했다.
  - `src/components/Navigation/NavigationOverlay.jsx`
    - 가까운 분기 구간에서 큰 차선 패턴을 보여주는 `분기 확대 안내` 인셋을 추가했다.
    - 제한속도 표시는 raw nearest segment 대신 보정된 speed context를 사용하도록 바꿨다.
  - `src/components/Map/MapView.jsx`
    - 회전 scale/transformOrigin을 조정해 운전자 시점 표현을 강화했다.
- 미해결:
  - north-up / driver-follow / manual 상태머신 전체 재정비
  - 실제 차선 레벨 geometry 기반 렌더링
  - TMAP 수준의 합류 확대도 완전 복제

## 사용자 의도 또는 외부 조건 대기 항목

### A. 진입 후보 ETA 근접 시 선택 UI

- 상태: `pending`
- 이유:
  - 문서에는 `ETA 차이 2분 미만이면 사용자 선택 UI`를 넣었지만, 이번 세션에서는 자동 best-entry 계산까지만 우선 구현했다.
  - 후보 카드/선택 시트는 별도 UI 작업이 필요하다.

### B. 실제 dev/prod 배포 검증

- 상태: `pending`
- 이유:
  - 이번 세션에서는 로컬 build/harness까지만 수행했다.
  - Railway 반영은 별도 실행/확인이 필요하다.

## 수정 파일

- `TmapCloneWeb/_reference/reverse-requirements-2026-04-18.md`
- `TmapCloneWeb/docs/mvp-harness-task-board-2026-04-19.md`
- `TmapCloneWeb/docs/mvp-harness-report-2026-04-19.md`
- `TmapCloneWeb/src/services/tmapService.js`
- `TmapCloneWeb/src/store/appStore.js`
- `TmapCloneWeb/src/components/Map/HighwayExplorer.jsx`
- `TmapCloneWeb/scripts/navigation-harness.mjs`
- `manager_memory/short-term/active-tasks.md`
- `manager_memory/mid-term/current-initiatives.md`
- `manager_memory/long-term/strategy-roadmap.md`
- `manager_memory/logs/2026-04-19-mvp-harness-recheck.md`
