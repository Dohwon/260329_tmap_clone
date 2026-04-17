# Known Limitations

이 문서는 현재 제품 한계와 임시 우회안, 이후 해결 방법을 계속 누적 기록하는 로그다.

## 기록 규칙

- 상태는 `open`, `mitigated`, `resolved` 중 하나로 관리한다.
- 해결 전에는 현재 한계와 임시 대응을 적는다.
- 해결 후에는 해결 날짜와 적용 방식, 영향 파일을 같은 항목 아래에 이어서 기록한다.

## 항목

### 2026-04-13 내비 시점/차선 레벨 안내 한계

- 상태: `mitigated`
- 증상: 안내 시작 후 TMAP처럼 차선 단위로 회전 직전 도로 형상과 정확한 진입 차로를 지도 자체에서 완전히 보여주지 못한다.
- 원인: 현재 스택은 `Leaflet + OSM raster tile` 중심이라 벡터 기반 회전 지도, 차선 형상, 정밀 차선 데이터 표현이 제한적이다.
- 임시 대응:
  - 내 차 기준 전방을 더 크게 보이도록 자동 확대/오프셋 강화
  - 지도 채도를 줄여 실제 경로와 유도선을 더 강하게 노출
  - 상단 배너와 별도 초록색 `차선 준비` 영역으로 다음 조작을 우선 안내
- 해결 기록:
  - 2026-04-13: 상단 파란 배너의 중복 차로 문구를 제거하고, 초록색 `차선 준비` 영역만 유지하도록 조정
  - 2026-04-13: 안내 시작 직후 하단 경로 유지 패널을 기본 접힘 상태로 바꿔 지도 시야를 더 확보하고, 위로 스와이프하거나 하단 터치로 다시 펼칠 수 있게 수정
- 관련 파일:
  - `src/components/Map/MapView.jsx`
  - `src/components/Navigation/NavigationOverlay.jsx`
  - `src/utils/navigationLogic.js`

### 2026-04-13 실시간 경로 재탐색 안정성

- 상태: `mitigated`
- 증상: `/api/tmap/routes` 400, `/api/tmap/road/nearestRoad` 403 발생 시 실시간 재탐색이 간헐적으로 누락되거나 폴백 경로가 선택된다.
- 원인 가설:
  - 좌표 스냅 실패 시 nearestRoad 응답이 비정상 종료
  - 경유지/검색 입력이 비는 순간 잘못된 요청 본문이 한번 전송될 수 있음
  - Railway 배포본과 로컬 수정본 사이에 번들 전환 지연이 존재함
- 임시 대응:
  - 라이브 경로 실패 시 폴백 재탐색 유지
  - 입력 삭제와 연료/POI 실패 시 크래시 방어 추가
- 해결 기록:
  - 2026-04-18: preview route 1회당 direct 비교 경로를 2개 상한으로 줄이고, direct 대안이 이미 있으면 추가 `routeSequential30` fan-out을 만들지 않도록 조정
  - 2026-04-18: route 429 직후 즉시 재시도로 quota를 다시 소모하지 않도록 짧은 client-side circuit breaker를 추가
  - 2026-04-18: 같은 key의 최근 정상 경로는 rate-limit 시 재사용하도록 바꾸고, 하네스에 preview 호출 예산 / 429 breaker 회귀 테스트를 추가
- 남은 한계:
  - `/api/tmap/routes` 400은 payload 방어와 로그는 들어갔지만 dev/Railway live 응답 기준 최종 종결 여부는 추가 확인이 필요
  - stale cache 재사용은 사용성 보호용이므로, rate-limit 구간에서는 최신 교통 반영이 잠깐 늦을 수 있음
- 관련 파일:
  - `src/services/tmapService.js`
  - `src/store/appStore.js`
  - `scripts/navigation-harness.mjs`

### 2026-04-13 링크 단위 혼잡도/실주행 분석

- 상태: `mitigated`
- 증상: 전체 경로에 동일 색 오버레이가 덮이거나, 저장 경로에서 실제 주행 편차를 읽지 못해 사용자가 어디서 벗어났는지 알기 어려웠다.
- 현재 대응:
  - 실제 `segmentStats.averageSpeed/speedLimit/congestionScore`가 있는 링크만 정체/서행 오버레이로 강조
  - 저장 시 실제 주행 궤적과 안내 경로를 비교해 `경로 이탈`, `실제 선호 우회`, `급감속 구간`을 계산해서 기록/운전 습관 화면에 노출
- 남은 한계:
  - 혼잡도 오버레이는 TMAP 응답에 실시간 세그먼트 속도가 없는 구간에서는 비어 보일 수 있다
  - 편차 분석은 현재 저장된 실제 주행 샘플 밀도에 의존하므로, 샘플 간격이 넓으면 짧은 우회는 놓칠 수 있다
- 관련 파일:
  - `src/components/Map/MapView.jsx`
  - `src/store/appStore.js`
  - `src/screens/MoreScreen.jsx`
  - `src/utils/navigationLogic.js`

### 2026-04-13 실제 기반 안전 알림 범위

- 상태: `mitigated`
- 증상: 회전 안내 외에 과속카메라, 구간단속, 어린이보호구역, 방지턱, 과속 상태를 통합해서 알리지 못했다.
- 현재 대응:
  - 내비 중 `과속카메라/구간단속/어린이보호구역/방지턱/과속 상태` 음성 알림 추가
  - 카메라/과속은 경고음과 화면 점멸을 함께 제공
  - 현재 구간 제한속도는 경로 전체 대표값이 아니라 `내 위치에 가장 가까운 실제 segment` 기준으로 표시
  - 안전 운전 모드는 `heading` 기준으로 전방 위험요소를 우선 선택하도록 보정
  - 회전 안내와 안전 알림은 즉시 cancel 대신 짧은 음성 큐로 순서대로 재생
- 남은 한계:
  - 음성 큐는 단순 FIFO라서 `회전 100m` 같은 최우선 멘트 강제 선점 로직은 아직 없음
  - 안전 운전 모드는 아직 `링크/차선 기반`이 아니라 현재 위치 주변 실데이터 + heading 보정 중심임
- 관련 파일:
  - `src/components/Navigation/NavigationOverlay.jsx`
  - `src/screens/HomeScreen.jsx`
  - `src/utils/navigationLogic.js`

### 2026-04-13 벡터 지도/운전자 시점 한계

- 상태: `open`
- 증상: 차량 진행 방향에 맞춘 지도 회전, 차선 레벨 분기 형상, 실제 차로 유도 바는 TMAP 수준으로 구현되지 않았다.
- 원인:
  - 현재 `Leaflet + raster tile` 구조라 벡터 지도 기반 회전/차선 렌더링에 구조적 제약이 있다.
- 현재 대응:
  - 운전자 시점 확대 강화
  - 전방 오프셋 확대
  - 차선 준비 패널 별도 노출
- 해결 방향:
  - 벡터 지도 또는 차선형상 데이터 소스 검토
  - 링크/차로 단위 데이터를 수용하는 렌더링 레이어 분리
- 관련 파일:
  - `src/components/Map/MapView.jsx`
  - `src/components/Navigation/NavigationOverlay.jsx`

### 2026-04-14 음식점 평점/지도 핀 제공 한계

- 상태: `mitigated`
- 증상:
  - 홈 화면에서 주변 맛집 후보를 보여주되, 하단 패널을 키우지 않고 지도 자체에서 바로 선택하고 싶다는 요구가 있었음
  - 음식점 평점은 Google Places 매칭이 안 되는 경우가 있어 일부 후보가 `별점 정보 없음`으로 남음
- 현재 대응:
  - 홈 지도에 `주변 10km 맛집 핑`을 직접 표시
  - 핑 팝업에서 `경로 추가하기` / `목적지 변경하기` 액션 제공
  - 음식점 평점은 `TMAP 후보 -> Google Places 보강` 순서로 붙이고, 실패 시 안전하게 `별점 정보 없음`으로 처리
  - 사용자가 직접 남기는 음식점 평점은 `반경 250m 안 20분 체류` 조건을 만족할 때만 허용
- 남은 한계:
  - Google Places 동일 상호 다중지점 환경에서는 가까운 지점이 아닌 다른 지점으로 매칭될 가능성이 남아 있음
  - Google 키 미설정, 할당량 제한, API 응답 지연 시 평점이 비어 보일 수 있음
  - 현재 홈 맛집 핀은 최대 8개, 주변 10km 기준 단순 후보라 사용자가 원하는 모든 맛집을 포괄하지는 못함
- 관련 파일:
  - `src/services/tmapService.js`
  - `src/store/appStore.js`
  - `src/components/Map/MapView.jsx`
  - `src/components/Search/SearchSheet.jsx`

### 2026-04-14 차선 위치 표출/운전자 기준 회전 부족

- 상태: `open`
- 증상:
  - 차선 준비 문구는 있으나 지도 위에 실제 어느 차로를 타야 하는지 위치 자체를 그려주지는 못함
  - 운전자 기준 회전은 적용돼 있지만 TMAP 수준으로 도로 형상과 차선 분기가 자연스럽게 따라오지는 않음
- 현재 대응:
  - 운전자 추종 회전, 전방 오프셋, 내비 시점 확대를 유지
  - 차선 문구는 별도 패널에서만 보여주고 상단 다음 안내와 분리
- 남은 한계:
  - `Leaflet + raster tile` 구조상 벡터 회전 지도/차선 형상/포켓차선 렌더링에 구조적 제약이 큼
  - 현재 구현은 `차선 문구 + 회전 지도 흉내` 수준이며, 실제 차선 위치 표출까지는 데이터 소스와 렌더러 재설계가 필요
- 해결 방향:
  - 차선 레벨 데이터 소스 확보
  - 벡터 지도 또는 별도 렌더 레이어 검토
  - 분기 직전 미니 인셋 또는 차로 강조 레이어 분리
- 관련 파일:
  - `src/components/Map/MapView.jsx`
  - `src/components/Navigation/NavigationOverlay.jsx`
  - `src/utils/navigationLogic.js`

### 2026-04-14 경관도로 추천 기준/경유지 일관성

- 상태: `mitigated`
- 증상:
  - 해안도로/산악도로를 선택해도 실제 경유지 목록에는 보이지 않고 ETA만 늘어나는 경우가 있었음
  - 현재 진행 중인 경로와 무관하게 멀리 떨어진 동쪽 산악도로처럼 `원본 경로선에서 크게 벗어난 후보`가 추천될 수 있었음
  - 추천 도로가 실제 어디로 진입하는지 주소가 부족해 사용자가 TMAP과 비교하기 어려웠음
- 원인:
  - 경관 경로를 임시 route 재계산으로만 처리해 실제 `waypoints` state와 분리돼 있었음
  - 추천 가까움 판단이 원본 메인 경로선이 아니라 현재 결과 경로/샘플 기준으로 흔들릴 수 있었음
  - 경관 진입점은 대표 좌표 중심이라 실제 도로 주소가 바로 노출되지 않았음
- 현재 대응:
  - 경관도로 선택 시 road snap 된 후보를 실제 `waypoints` state에 넣고 재탐색하도록 변경
  - 경관 추천 기준선은 `scenicReferencePolyline`으로 따로 보존한 원본 메인 경로선을 사용
  - 추천 후보는 `원본 경로 앞쪽`, `원본 경로 80km 이내`, `원본 경로선 반경 20km 이내`만 유지
  - 뒤로 돌아가야 하는 후보는 완전 제거하지 않고 빨간 경고와 함께 뒤쪽으로 정렬
  - 추천 카드에 `진입 위치` 주소를 함께 표기
- 남은 한계:
  - 경관도로 데이터 자체가 정적 세그먼트 중심이라, 실제 진입 IC/교차로 명칭까지 항상 TMAP 수준으로 정확히 맞지는 않음
  - road snap 실패 구간은 `roadLabel` 또는 대표점 주소 수준으로만 보일 수 있음
- 관련 파일:
  - `src/store/appStore.js`
  - `src/components/Navigation/ScenicRoadDialog.jsx`
  - `src/services/tmapService.js`

### 2026-04-14 웹 실시간 위치 추종/실주행 기록 한계

- 상태: `mitigated`
- 증상:
  - 내 위치가 경로를 즉시 따라가지 못해 지나간 구간이 지워지지 않고 전체 경로가 남아 보였음
  - 실제 주행 저장용 샘플이 너무 듬성해서 안내 경로와 다른 실제 이동을 충분히 기록하지 못했음
- 원인:
  - 진행률 계산과 지도 표시가 raw GPS 기준으로 느슨하게 연결돼 있었고, 경로에 투영한 matched 위치를 별도 상태로 관리하지 않았음
  - 주행 기록 샘플 기준이 8m~15m 수준이라 저속/도심 구간에서 실제 움직임을 놓치기 쉬웠음
- 현재 대응:
  - 현재 경로에 투영한 `navigationMatchedLocation`, `navigationProgressKm`를 별도 상태로 관리
  - 지도에는 남은 경로만 표시하고, 실제 지나간 구간은 별도 실주행 궤적으로 표시
  - 실주행 저장 샘플 간격을 더 촘촘하게 조정
  - off-route 재탐색은 raw GPS 기준으로 유지
- 남은 한계:
  - 브라우저 geolocation 자체가 OS 절전, 기기 센서, 권한 상태에 따라 업데이트 주기가 흔들릴 수 있음
  - matched 위치는 앱 내부 map-matching 엔진이 아니라 polyline 투영 기반이라, 복층도로/근접 평행도로에서는 native SDK보다 부정확할 수 있음
- 해결 방향:
  - 웹은 최소 내비 복구 수준까지만 유지
  - 실제 안내 엔진은 native SDK로 전환
  - 상세 설계는 `docs/tmap-sdk-migration-plan-2026-04-14.md` 참고
- 관련 파일:
  - `src/store/appStore.js`
  - `src/components/Map/MapView.jsx`
  - `src/components/Navigation/NavigationOverlay.jsx`
  - `src/hooks/useGeolocation.js`
  - `src/utils/navigationLogic.js`

### 2026-04-15 도로 탐색 휴게소/카메라 마스터 데이터 정확도

- 상태: `mitigated`
- 증상:
  - 특정 고속도로를 실제 주행했을 때 휴게소가 누락되거나, 홈/도로 탐색 화면 카메라 위치가 실제와 다르게 보일 수 있었음
  - 특히 도로 탐색용 카메라는 실제 개수/위치가 아니라 분기점 사이 중간점 보간으로 생성되던 구간이 있었음
- 원인:
  - `도로 탐색/추천` 계층은 일부 수동 휴게소 데이터와 synthetic camera fallback이 섞여 있었음
  - 휴게소 검색도 실제 데이터가 비면 generic seed fallback으로 가짜 후보를 만들 수 있었음
- 해결 기록:
  - 2026-04-15: 도로 탐색 카메라는 `road.cameras` 명시 데이터 또는 실제 경로 `safetyFacilityList`가 있을 때만 노출하도록 변경
  - 2026-04-15: 휴게소는 명시 데이터 + km 앵커 보간만 허용하고, generic 휴게소 fallback은 제거
  - 2026-04-15: 서해안고속도로 휴게소 마스터 데이터를 `행담도/서산/홍성/대천/서천/군산/고창고인돌/함평천지` 기준으로 보강
- 남은 한계:
  - 아직 모든 도로의 휴게소/카메라 마스터 데이터가 완전한 것은 아니며, 데이터가 없는 노선은 비어 보일 수 있음
  - 도로 탐색용 혼잡/속도 요약에는 일부 추정 로직이 남아 있어, 휴게소/카메라처럼 전 구간 actual-only로 정리하는 추가 작업이 필요함
- 관련 파일:
  - `src/data/highwayData.js`
  - `src/services/tmapService.js`
  - `src/store/appStore.js`
  - `src/components/Map/MapView.jsx`
  - `src/components/Navigation/NavigationOverlay.jsx`
