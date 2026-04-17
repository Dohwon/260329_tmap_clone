# Problem Solving Log

이 문서는 `이미 해결한 내용`, `그 과정에서 드러난 병목`, `거기서 얻은 인사이트`를 매번 누적하는 운영 로그다.  
핵심은 기능 목록이 아니라, 실제로 무엇을 해결했고 그 해결 방식이 무엇이었는지 기록하는 것이다.

## 기록 규칙

- 각 날짜마다 `실제 반영 포인트`, `재확인된 병목`, `해결 방식`, `다음 액션`을 남긴다.
- 기본적으로 `이미 반영된 것`을 중심으로 쓰고, 미해결 항목은 그 반영 과정에서 다시 확인된 병목으로만 적는다.
- 해결 완료가 아니라도 `부분 완화`, `코드상 준비만 됨`, `미해결`을 구분한다.
- 사용자가 놓치기 쉬운 리스크는 `숨은 리스크`에 별도로 적는다.
- 장애 치명도와 MVP 가치 우선순위가 다를 수 있으면 둘을 분리해서 적는다.

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
