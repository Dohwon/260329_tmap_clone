# Web Architecture Checklist 2026-04-19

이 문서는 `웹 유지`를 전제로, 현재 `Leaflet + raster + REST overlay` 구조를 `실제 경로/분기/차선 이해가 가능한 내비 구조`로 전환하기 위한 체크리스트다.

목표는 세 가지다.

- 실제 경로를 기준으로 분기/합류를 이해할 수 있다.
- 운전자 시점에서 현재+다음 경로가 안정적으로 보인다.
- Railway 기반 운영을 유지하면서도 과금/호출량/성능이 통제된다.

## 0. 현재 상태 요약

- [x] TMAP live route, camera, hazard, road-event 프록시가 기본 동작한다.
- [x] 경로 요청 429 보호용 inflight/circuit breaker/최근 성공값 재사용이 일부 들어가 있다.
- [x] 분기 미니 인셋은 들어갔지만 아직 `실제 lane geometry`는 아니다.
- [x] 카메라 음성/배너 예고는 강화되었지만 `TMAP급 분홍/초록 유도선`은 아니다.
- [ ] 지도 엔진은 아직 `Leaflet + raster tile`이라 운전자 시점/회전/차선형상 표현 한계가 남아 있다.
- [ ] 정밀도로지도 corridor 추출 파이프라인은 아직 없다.

## 1. 제품 게이트

### 1-A. 웹 유지 전략 고정

- [x] MVP 기준에서 `웹 유지`를 우선 전략으로 선택
- [x] Railway dev/prod 배포를 유지
- [ ] 내비 전용 화면만 native로 넘길 조건 정의

완료 조건:
- `웹으로 가능한 것`, `웹으로 어려운 것`, `native 전환 조건`이 문서화돼 있다.

### 1-B. 데이터 소스 역할 분리

- [x] TMAP = 경로/TBT/lane meta
- [x] ITS = 공사/돌발/가변속도/VMS 계열
- [x] NGII = 정적 도로/차선/분기 형상
- [ ] 저장/캐시/약관 제약을 운영 문서에 반영

완료 조건:
- 동일 데이터가 어느 계층에서 책임지는지 중복 없이 문서화돼 있다.

## 2. 지도 엔진 전환

### 2-A. Leaflet 제거 범위 확정

- [ ] 홈 지도와 내비 지도의 공용/분리 범위를 정의
- [ ] `MapView.jsx`에서 Leaflet 의존 렌더링 블록을 레이어 단위로 분리
- [ ] 기존 오버레이(카메라/이벤트/맛집/경로/지나온 길)를 MapLibre source/layer로 옮길 대상 정의

완료 조건:
- Leaflet 제거 대상과 유지 대상이 파일 단위로 정리돼 있다.

### 2-B. MapLibre GL JS 도입

- [x] `maplibre-gl` 기반 내비 전용 맵 컴포넌트 추가
- [x] 내비 모드에서만 MapLibre를 우선 사용
- [x] 기존 tile URL/label/fallback 정책을 style source로 재정의

완료 조건:
- 내비 화면에서 Leaflet 대신 MapLibre가 렌더링된다.

### 2-C. 운전자 카메라 상태머신 재구현

- [ ] `북업(home)` / `운전자(nav)` / `수동(manual)` 상태를 지도 엔진 수준으로 분리
- [ ] `bearing`, `pitch`, `center offset`, `zoom`을 guidance distance 기반으로 상태화
- [ ] 수동 조작 후 자동복귀 규칙을 고정

완료 조건:
- 운전자 모드에서 차량은 항상 화면 하단, 진행 방향은 화면 상단으로 유지된다.

## 3. 정밀도로지도 corridor 파이프라인

### 3-A. 원본 데이터 확보

- [ ] NGII 정밀도로지도 확보 절차 정리
- [ ] 필요한 최소 레이어 목록 확정
  - 차로 중심선
  - 차로 경계선
  - 분기/합류 연결부
  - 램프 형상
- [ ] 원본 좌표계/포맷 문서화

완료 조건:
- 최소 레이어 4종을 실제로 적재 가능한 입력 포맷으로 정의했다.

### 3-B. 전처리 ETL

- [ ] SHP/원본 데이터를 GeoJSON/PostGIS용으로 변환
- [ ] road_id / lane_id / connector_id 스키마 설계
- [ ] TMAP route polyline과 spatial join 가능한 키 구조 정리

완료 조건:
- 경로 주변 geometry를 잘라낼 수 있는 저장 스키마가 정리돼 있다.

### 3-C. corridor API

- [ ] `POST /api/road/corridor` 설계
- [ ] 입력:
  - route polyline
  - progressKm
  - radiusM
  - includeLayers
- [ ] 출력:
  - lane centerlines
  - branch/merge connectors
  - ramp outlines
  - road boundary simplification

완료 조건:
- 현재 경로 주변만 잘린 geometry를 클라이언트가 받아볼 수 있다.

## 4. 실제 분기/합류 렌더링

### 4-A. 미니 인셋 실제 geometry화

- [x] 현재+다음 세그먼트 기반 실제 경로형 인셋 시도
- [ ] corridor geometry 기반 본선/램프 분리 렌더링
- [ ] junction anchor와 lane group 기준으로 확대 뷰 고정

완료 조건:
- 인셋이 더 이상 추상 화살표가 아니라 실제 분기 형상처럼 보인다.

### 4-B. 유도선 체계

- [x] extcVoiceCode 기반 색상 문구 노출
- [x] `분홍색/초록색 유도선을 따라가세요` 음성/카드 반영
- [ ] 실제 지도 위 polyline도 같은 유도선 색상으로 분리 렌더링
- [ ] 본선 유지선과 진출선의 색/두께 규칙 고정

완료 조건:
- 배너/인셋/지도 위 유도선이 같은 의미 체계를 공유한다.

### 4-C. 차선 수준 표현

- [ ] lane count 추정이 아니라 실제 lane geometry를 우선 표시
- [ ] 포켓차선/가감속차로/버스전용/직좌/직우 패턴을 lane group에 매핑
- [ ] 차선이 부족한 구간은 문구 fallback만 남기고 가짜 형상은 숨김

완료 조건:
- 실제 데이터가 있는 구간에서는 차선 위치가 보이고, 없는 구간은 과장 없이 축소 표시한다.

## 5. 과금/호출량/캐시 통제

### 5-A. route/core vs enrichment 분리

- [ ] route 탐색과 enrichment(맛집/병원/주유/hazard)를 서로 분리
- [ ] route core 실패 없이 enrichment만 떨어질 수 있게 구조 재분리
- [ ] UI에서 `핵심 길찾기`, `부가정보` 상태를 구분 표기

완료 조건:
- 맛집/병원/유가 API 장애가 길찾기를 망치지 않는다.

### 5-B. corridor cache

- [ ] corridor API 응답에 route hash 기반 TTL 캐시 적용
- [ ] 동일 route + progress bucket 요청 재사용
- [ ] Railway 메모리/디스크 캐시 정책 정리

완료 조건:
- 지도 이동만으로 corridor 생성이 중복 호출되지 않는다.

### 5-C. quota safe mode

- [ ] MapTiler/TMAP/Google TTS/Places 예산 임계치 정의
- [ ] 임계치 근접 시 enrichment 단계 하향
- [ ] fallback 순서:
  - TTS mp3 cache
  - browser TTS
  - OSM/기본 타일
  - 부가정보 비활성

완료 조건:
- 무료 티어 초과 직전에 앱 전체가 죽지 않고 기능 단계만 낮아진다.

## 6. Railway 운영

### 6-A. dev/prod 배포 체크

- [x] development -> dev Railway / main -> prod Railway 분리
- [x] dev 시뮬레이터 env 분리
- [ ] deploy 후 자동 smoke checklist 실행

완료 조건:
- 배포 후 dev에서 내비 시작, 시뮬레이터, 지도, TTS, route 200 여부를 바로 점검할 수 있다.

### 6-B. 대용량 지도 데이터 운영 경계

- [ ] Railway에 원본 SHP를 직접 두지 않는 규칙 고정
- [ ] 전처리 결과만 Railway가 서빙하게 역할 분리
- [ ] PostGIS/외부 스토리지 책임 범위 정리

완료 조건:
- Railway가 운영 API 서버로만 동작하고, 무거운 배치 역할과 섞이지 않는다.

## 7. QA 게이트

### 7-A. 시나리오 QA

- [ ] 고속도로 본선 유지
- [ ] 우측 진출
- [ ] 좌측/우측 분기
- [ ] IC 합류
- [ ] 지하차도/고가차도/터널
- [ ] 포켓차선
- [ ] 구간단속 시작/종료

완료 조건:
- 각 시나리오에서 배너, 인셋, 유도선, 음성이 서로 모순되지 않는다.

### 7-B. 성능 QA

- [ ] iPhone Safari 기준 프레임 드랍/카메라 지연 측정
- [ ] route 1회 요청당 upstream fan-out 측정
- [ ] corridor 응답 용량/렌더 시간 측정

완료 조건:
- 운전자 모드에서 추종이 체감상 늦지 않고, route fan-out이 통제된다.

## 오늘 반영 결과

- [x] 카메라 예고를 `1.5km / 300m / 100m`까지 확장
- [x] 카메라 상단 배너 추가
- [x] 미니 인셋을 실제 세그먼트 기반 경로형으로 변경
- [x] `분홍색/초록색 유도선을 따라가세요` 문구를 인셋/음성에 반영

## 이번 체크리스트에서 아직 미완료인 핵심 5개

1. `2-B`
MapLibre GL JS 내비 맵 도입
2. `3-C`
Railway 뒤의 corridor geometry API 구축
3. `4-B`
실제 지도 위 유도선 색상 분리 렌더링
4. `4-C`
lane geometry 기반 차선 표현
5. `5-A`
core route와 enrichment 분리
