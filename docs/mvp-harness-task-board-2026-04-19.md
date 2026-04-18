# MVP Harness Task Board 2026-04-19

이 문서는 `TmapCloneWeb/_reference/reverse-requirements-2026-04-18.md`를 다시 읽고, 현재 시점에서 빠진 부분과 회귀 위험을 카테고리별로 재정리한 관측용 업무 보드다.

목표:

- 문서 기준 MVP와 현재 구현 상태의 차이를 줄인다.
- 해결 가능한 항목은 하네스로 검증하면서 바로 처리한다.
- 사용자 의도 확인이 필요한 항목은 별도 기록하고 다른 작업을 먼저 진행한다.

상태값:

- `todo`: 아직 미착수
- `in_progress`: 현재 작업 중
- `done`: 이번 세션에서 해결
- `partial`: 일부만 해결
- `blocked`: 사용자 의도/외부 권한/외부 데이터 한계로 보류

## 공통 관측

- `scripts/navigation-harness.mjs`: 현재 PASS
- `npm run build`: 현재 PASS
- 기준 문서상 MVP 핵심은 아래 4개다.
  - 다음 분기점으로 나가면 어디로 이어지는지 설명
  - 초보 운전자용 직진/단순 경로
  - 해안/산악 경관도로를 실제 waypoint로 반영
  - 특정 고속도로/국도를 현재 위치에서 가장 빠르게 타러 가는 진입 경로

## 1. dev/prod 배포 구조

### 1-A. dev/prod 상태 검증 문서와 실제 코드 기준 동기화

- 상태: `todo`
- 우선순위: `P1`
- 시급성: `높음`
- 근거:
  - dev URL live 여부와 시뮬레이터 노출 여부는 QA 루프에서 계속 핵심이다.
  - 현재 앱 로직과 운영 문서가 조금씩 벌어지면 재현성이 깨진다.
- 작업:
  - dev/prod 확인 절차를 task board와 최종 보고서에 반영
  - `VITE_SHOW_SIM_CONTROLS`, `TMAP status`, build 통과 여부를 최소 기준으로 고정

### 1-B. deploy 전용 체크리스트 누락 점검

- 상태: `todo`
- 우선순위: `P2`
- 시급성: `중간`
- 근거:
  - 기능 수정 후 dev 배포 전 확인 포인트가 흩어져 있다.
- 작업:
  - 보고서에 deploy 시 확인해야 할 변수/엔드포인트를 별도 적는다

## 2. 검색 속도/품질 개선

### 2-A. 검색 후 첫 route 요청 400 회귀

- 상태: `todo`
- 우선순위: `P0`
- 시급성: `치명적`
- 근거:
  - 검색 직후 400이 뜨면 MVP 핵심 플로우가 깨진다.
- 작업:
  - destination/origin/waypoint 전환 직후 payload 정합성 확인
  - 삭제/백스페이스 직후 빈 상태 route 요청 차단

### 2-B. 도로/POI 혼합 검색 품질

- 상태: `todo`
- 우선순위: `P1`
- 시급성: `높음`
- 근거:
  - `양화대교`, `올림픽대로`, 도로 시점/종점은 이 앱의 핵심 입력이다.
- 작업:
  - fast candidate 유지
  - 도로명/시점/종점/IC/JC/휴게소 후보의 우선순위 정리

## 3. 고속/국도/경관도로 추천

### 3-A. 특정 도로를 “타러 가는” 모드의 실제 진입 경로

- 상태: `done`
- 우선순위: `P0`
- 시급성: `치명적`
- 근거:
  - 현재 구현은 사실상 시점 waypoint 한 개를 넣는 수준이라 MVP target 4를 충분히 만족하지 못한다.
- 작업:
  - 현재 위치에서 진입 가능한 entry candidate를 뽑고 가장 빠른 후보를 선택
  - 본선을 계속 타게 하기 위한 다중 anchor waypoint 적용
- 이번 세션 반영:
  - `buildRoadDriveEntryCandidates()` 추가
  - `buildRoadDriveWaypoints()` 추가
  - `searchRouteAlongRoad()`가 start waypoint 고정 대신 fastest entry 후보를 평가하도록 변경
  - `HighwayExplorer` CTA를 `가장 빠른 진입로로 ... 타러 가기`로 변경

### 3-B. 경관도로 추천의 실제 waypoint 반영 검증

- 상태: `todo`
- 우선순위: `P0`
- 시급성: `높음`
- 근거:
  - 추천만 뜨고 실제 route state에 반영되지 않으면 target 3이 무너진다.
- 작업:
  - scenic 선택 후 state/route panel/map 모두에서 waypoint 반영 여부 재검증

### 3-C. 앞쪽 우선 추천과 역주행 경고

- 상태: `todo`
- 우선순위: `P1`
- 시급성: `높음`
- 근거:
  - scenic/road 추천이 뒤쪽이나 옆쪽을 먼저 내면 사용자 신뢰가 깨진다.
- 작업:
  - forward corridor 우선 정렬
  - 역주행 필요 시 경고 문구 유지

## 4. 내 위치 추종

### 4-A. GPS 점프와 시뮬레이터 튐 완화

- 상태: `todo`
- 우선순위: `P0`
- 시급성: `치명적`
- 근거:
  - 내 위치 추종이 끊기면 지나온 길 삭제와 재탐색이 모두 망가진다.
- 작업:
  - 급점프 필터 재조정
  - 시뮬레이터와 실기기 보정 분리
- 이번 세션 반영:
  - 운전자 시점 auto-follow 재중심 기준을 더 민감하게 조정
  - 회전 반응 속도와 회전 레이어 scale을 올려 화면이 늦게 따라오는 체감을 줄임

### 4-B. 지나온 길 삭제/실주행 저장 품질

- 상태: `todo`
- 우선순위: `P0`
- 시급성: `치명적`
- 근거:
  - 이 앱은 실제 주행 기반 기록이 핵심이므로 route copy가 아니라 actual history가 남아야 한다.
- 작업:
  - 남은 경로 trim과 drivePathHistory 표시를 다시 점검

## 5. 실시간 경로 적용

### 5-A. `/api/tmap/routes` 400 회귀 제거

- 상태: `partial`
- 우선순위: `P0`
- 시급성: `치명적`
- 근거:
  - route 400은 MVP 전체를 즉시 깨는 장애다.
- 작업:
  - route payload 정규화
  - 빈 waypoint/중복 좌표/invalid origin 차단
- 이번 세션 반영:
  - `searchRoute()` 진입 전 origin/destination 좌표 유효성 게이트 추가
  - invalid 좌표 상태에서는 실제 `/api/tmap/routes` 호출 자체를 막고 상태 메시지로 전환

### 5-B. `nearestRoad` 403 회귀 억제

- 상태: `partial`
- 우선순위: `P0`
- 시급성: `높음`
- 근거:
  - cooldown은 있으나 호출 타이밍과 fallback 체계가 더 검증 필요하다.
- 작업:
  - raw projection fallback 확인
  - 안내 시작 직전과 이탈 판단에서만 호출하는지 재검토

### 5-C. 429 방지용 route budget 제어

- 상태: `partial`
- 우선순위: `P0`
- 시급성: `치명적`
- 근거:
  - short circuit과 inflight dedupe는 들어가 있지만 UI 단의 연쇄 호출 가능성은 여전히 점검 대상이다.
- 작업:
  - 검색/프리셋/merge/scenic에서 연쇄 route 호출 횟수 확인
  - 마지막 성공 경로 재사용 흐름 검증
- 이번 세션 반영:
  - 동일 origin/destination/waypoint/roadType 조합은 `routeSearchExecutionKey` 기준으로 inflight 재사용
  - 직전 동일 요청은 `1.5초` 내 재실행하지 않고 기존 routes를 재사용
  - `driverPreset`, `includeScenic`, `includeMountain` 변경은 서버 route 재호출 대신 로컬 재정렬/경관 재계산으로 전환

## 6. 안전운전모드/카메라/방지턱

### 6-A. actual-only 카메라 정합성

- 상태: `todo`
- 우선순위: `P1`
- 시급성: `높음`
- 근거:
  - route 추천 카드와 실제 주행 카메라 수가 어긋나면 설명력이 떨어진다.
- 작업:
  - live/recorded 외 synthetic camera 표시 경로 재확인

### 6-B. safety mode의 부가 기능화

- 상태: `todo`
- 우선순위: `P2`
- 시급성: `중간`
- 근거:
  - safety mode는 중요하지만 현재 MVP 본질은 아니다.
- 작업:
  - 메인 UI를 밀어내지 않도록 우선순위/배치 유지

## 7. 주유소/병원/맛집/구글평점

### 7-A. 부가 안내가 MVP UI를 밀어내지 않게 정리

- 상태: `todo`
- 우선순위: `P2`
- 시급성: `중간`
- 근거:
  - 현재 MVP 기준에서는 부가 정보가 route preview보다 앞서면 안 된다.
- 작업:
  - 홈/route panel/내비 overlay에서 부가 안내 노출 순서 재점검

### 7-B. 데이터 커버리지 품질 점검

- 상태: `todo`
- 우선순위: `P2`
- 시급성: `중간`
- 근거:
  - 병원/맛집/유가는 편의 기능이며 커버리지 편차가 있다.
- 작업:
  - 최종 보고서에 데이터 한계와 현재 fallback 방식을 기록

## 8. 지도 UI 개선

### 8-A. 경로선 우선 가시성

- 상태: `partial`
- 우선순위: `P1`
- 시급성: `높음`
- 근거:
  - 현재 색상/저채도는 일부 반영됐지만 실제 운전자 시야 기준으로는 추가 조정 여지가 있다.
- 작업:
  - 내비 중 non-route 요소 대비 route/guide/drive-history 가독성 확인
- 이번 세션 반영:
  - 내비 camera zoom/offset을 전 구간에서 더 공격적으로 상향
  - 회전 시 빈 영역 노출을 줄이기 위해 회전 레이어 크기 확대

### 8-B. 홈 화면의 비-MVP quick action 정리

- 상태: `todo`
- 우선순위: `P2`
- 시급성: `중간`
- 근거:
  - 홈 화면 하단이 부가 기능 중심으로 커질수록 MVP 메시지가 흐려진다.
- 작업:
  - 향후 route-first 구조로 재정리 후보 기록

## 9. 지도 회전/차선 안내

### 9-A. 운전자 시점 상태머신 안정화

- 상태: `partial`
- 우선순위: `P1`
- 시급성: `높음`
- 근거:
  - 화면 전체 회전의 어색함과 auto-follow 복귀 조건이 아직 불안정하다.
- 작업:
  - north-up / driver-follow / manual state를 다시 점검
- 이번 세션 반영:
  - `getNavigationCameraState()`를 더 근거리 확대 중심으로 조정
  - follow 재중심 임계값을 낮춰 내 위치 중심 추종을 더 자주 수행
  - 회전 smoothing을 빠르게 바꿔 방향 전환 반응 속도 개선

### 9-B. 차선 힌트와 분기 인셋 정밀화

- 상태: `partial`
- 우선순위: `P1`
- 시급성: `높음`
- 근거:
  - 현재 lane parser는 있지만 image2 수준의 분기 이해를 주기엔 부족하다.
- 작업:
  - 포켓차선/직좌/버스전용/분기 인셋 후속 작업 유지
- 이번 세션 반영:
  - maneuver/junction가 약한 경우 폴리라인 회전각 기반 synthetic guidance 후보 추가
  - 가까운 분기 시점에 대형 `분기 확대 안내` 인셋 추가
  - 고속 본선 근처에서 local connector 제한속도 40이 먼저 잡히는 경우를 줄이기 위해 `getEffectiveCurrentSpeedContext()` 추가

## 사용자 의도 또는 외부 조건 대기

### B-01. 도로 진입 후보 선택 UI

- 상태: `blocked`
- 이유:
  - 진입 후보 ETA 차이가 근접할 때 자동 선택 대신 사용자 선택 UI를 보여주는 기준은 문서에 추가했지만, 이번 세션에서는 자동 best-entry 계산까지 우선 구현한다.
  - 후보 선택 시각화는 추가 UI 작업이 필요하다.

### B-02. 실제 배포 검증

- 상태: `blocked`
- 이유:
  - 로컬 빌드/하네스는 가능하지만 dev/prod 반영 여부는 실제 배포 시점에 다시 확인해야 한다.
