# TMAP SDK 전환안 2026-04-14

## 목적

- 현재 웹에서 먼저 살려야 하는 최소 기능은 `실시간 위치 추종`, `지나간 경로 삭제`, `실주행 저장`이다.
- TMAP 수준의 내비 품질을 위해서는 브라우저 geolocation + raster 지도 조합만으로는 한계가 있으므로, 실제 안내 엔진은 `TMAP native SDK`로 분리하는 전환안이 필요하다.

## 현재 웹 핫픽스 범위

이번 핫픽스에서 웹 쪽은 아래까지만 책임진다.

- raw GPS를 그대로 경로 진행률에 쓰지 않고, 현재 선택 경로에 투영한 `matched position`을 별도 관리
- 지도에는 `남은 경로`만 표시하고, 실제 지나간 구간은 `실주행 궤적`으로 별도 표시
- 실주행 저장용 샘플 간격을 기존보다 촘촘하게 조정해서 정지/저속/주행 상태를 더 자주 기록
- 이탈 재탐색은 여전히 raw GPS 기준으로 판단해 off-route 감지를 유지

이 조합은 웹에서 당장 네비 기본 역할을 복구하기 위한 임시선이다. 차선 레벨 유도, 회전 직전 교차로 비트맵, SDI 정밀 경고는 native SDK 쪽 책임으로 넘기는 것이 맞다.

## 왜 웹만으로는 TMAP 수준이 안 나오는가

현재 웹 스택의 구조적 한계는 아래 세 가지다.

1. 브라우저 위치 수집은 `raw GPS` 중심이다.
브라우저는 TMAP 안내 엔진이 가진 `matchedLatitude`, `matchedLongitude` 같은 지도 매칭 결과를 직접 주지 않는다.

2. 현재 지도는 `Leaflet + raster tile`이다.
차량 진행 방향 기준 회전, 차선 형상, 분기점 레벨 인셋, 교차로 확대도는 벡터 내비 렌더러가 훨씬 유리하다.

3. 웹 REST 응답만으로는 안내 상태 스트림이 부족하다.
브라우저에서는 `다음 TBT`, `차선`, `SDI`, `안전운전`, `실시간 재탐색 상태`를 native SDK처럼 지속 스트림으로 받기 어렵다.

## 공식 문서 기준으로 native SDK가 주는 데이터

공식 문서 메인: [TMAP API 문서](https://tmapapi.tmapmobility.com/main.html)

공식 업데이트 공지: [2025-06 업데이트](https://tmapapi.tmapmobility.com/popup_update2_2025_06.html)

문서상 확인되는 핵심 포인트는 아래와 같다.

- iOS Navi UI SDK는 `requestRoute`, `continueDrive`, `requestSafeDrive`, `driveGuidePublisher`, `driveStatusPublisher`를 제공한다.
- iOS `TmapDriveGuide`에는 `laneInfo`, `firstTBTInfo`, `firstSDIInfo`, `limitSpeed`, `matchedLatitude`, `matchedLongitude`가 있다.
- iOS `TmapDriveGuideLane`에는 `laneCount`, `laneDistance`, `nLaneTurnInfo`, `nLaneEtcInfo`, `availableTurn`가 있다.
- Flutter UI SDK는 `startTmapDriveGuideStream`, `startTmapDriveStatusStream`, `toNextViaPointRequest`, `clearContinueDriveInfo`, `stopDriving`, `finalizeSDK`를 제공한다.
- iOS ETA SDK는 `startDriving`, `observableEDCData`, `observableRouteData`, `stopDriving`, `toNextViaPointRequest`를 제공한다.

즉 실제 내비 품질을 좌우하는 핵심은 `경로 계산 응답` 하나가 아니라, 주행 중 계속 흘러오는 `drive guide / route data / matched 위치 / lane / TBT / SDI` 스트림이다.

## 권장 구조

권장 방향은 `웹은 계획`, `native는 안내`다.

- 웹:
  - 검색
  - 즐겨찾기/최근 검색
  - 경유지 편집
  - 경로 미리보기
  - 드라이브 기록 조회
- native SDK 앱:
  - 실제 주행 안내
  - 지도 매칭 위치 추종
  - TBT/차선/SDI 음성 및 화면 처리
  - 실시간 재탐색
  - 실제 주행 로그 생성

## iOS 전환안

### 선택안

- 1순위: `TMAP Navi UI SDK`
- 보조: `TMAP ETA SDK`

이유:

- UI SDK는 실제 내비 UI와 drive guide 스트림을 바로 제공하므로, 현재 요구인 `실시간 안내`, `차선`, `안전운전`, `회전 직전 안내`에 가장 가깝다.
- ETA SDK는 커스텀 UI를 만들기 좋지만, 차선/SDI/실시간 안내 화면을 앱이 더 많이 직접 조합해야 한다.

### iOS에서 반드시 받아야 하는 데이터

- `matchedLatitude`, `matchedLongitude`
- `currentRoadName`
- `laneInfo`
- `firstTBTInfo`
- `firstSDIInfo`
- `limitSpeed`
- `speedInKmPerHour`
- `remainDistanceToDestinationInMeter`
- `remainTimeToDestinationInSec`

### iOS 앱 내부 모듈

- `NavigationEngine`
  - TMAP SDK 초기화
  - route request / continue drive / reroute / stop
- `NavigationStateStore`
  - matched 위치
  - 현재 도로명
  - 다음 TBT
  - lane / SDI / speed limit
- `NavigationRenderer`
  - 운전자 기준 지도
  - 차선/안전운전/교차로 화면
- `DriveRecorder`
  - 실제 주행 좌표, 속도, heading, deviation 저장

### 웹과의 연동 방식

- 웹에서 출발지/경유지/목적지를 확정
- 서버 혹은 딥링크로 native 앱에 전달
- native 앱이 `requestRoute` 또는 `startDriving` 시작
- 주행 완료 후 actual drive log만 서버나 로컬 DB에 저장

## Flutter 전환안

### 선택안

- 1순위: `Flutter Navi SDK`
- 보조: `Flutter UI SDK + ETA/EDC stream`

### Flutter에서 반드시 연결할 스트림

- `startTmapDriveGuideStream`
- `startTmapDriveStatusStream`
- 필요 시 `startTmapSDKStatusStream`

### Flutter 앱 상태 설계

- `NavigationBloc` 또는 `Riverpod store`
  - route planning 상태
  - current matched position
  - TBT / lane / SDI 상태
  - reroute 상태
- `MapHost`
  - SDK 뷰 위젯 래핑
  - 확대/오프셋/야간모드/교통 표시 설정
- `DriveSessionRepository`
  - 주행 세션 단위 저장
  - 원본 안내 경로와 실제 주행 경로 분리 저장

### Flutter에서 필요한 화면

- 경로 미리보기 화면
- 실제 안내 화면
- 안전운전 모드 화면
- 주행 기록 상세 화면

## API와 데이터 책임 분리

### 계속 REST/API로 유지할 것

- 검색
- 지오코딩 / ReverseGeocoding
- POI / 유가 / 병원 / 음식점 보강
- 저장된 드라이브 기록 조회

### SDK로 넘겨야 할 것

- matched 위치
- 실시간 안내 상태
- lane / TBT / SDI
- 안전운전 모드
- 재탐색
- 주행 중 제한속도 / 단속 / 교차로 처리

## 마이그레이션 순서

### Phase 1

- 현재 웹 핫픽스로 위치 추종, 지나간 경로 삭제, 실주행 저장 복구
- 저장 포맷을 `plannedRoute`와 `actualDrive` 이중 구조로 고정

### Phase 2

- iOS 또는 Flutter prototype 생성
- SDK 초기화, route request, guide stream 수신만 먼저 연결

### Phase 3

- 웹의 검색/미리보기 결과를 native 앱으로 넘기는 deep link 또는 shared backend 설계
- actual drive log를 공통 저장 포맷으로 통합

### Phase 4

- 차선, SDI, 안전운전, 교차로 인셋, 재탐색을 native 앱으로 완전 이전
- 웹은 planning companion 역할로 축소

## 추천 결론

- 지금 당장 제품 안정화는 웹 핫픽스로 계속 진행하되, `실제 안내 엔진`은 native SDK로 분리하는 것이 맞다.
- iPhone 우선이라면 `iOS Navi UI SDK`가 가장 빠르다.
- 크로스플랫폼 우선이라면 `Flutter Navi SDK`가 현실적이다.
- 현재 사용자 요구인 `차선 위치`, `운전자 기준 회전 지도`, `정밀 안전 알림`, `즉각적인 실제 위치 추종`은 웹에서 흉내 낼 수는 있어도 TMAP 수준으로 맞추려면 SDK 전환이 필요하다.

## 공식 참고 링크

- [TMAP API 문서 메인](https://tmapapi.tmapmobility.com/main.html)
- [TMAP 2025-06 업데이트 공지](https://tmapapi.tmapmobility.com/popup_update2_2025_06.html)
- [TMAP API Guide / Docs / SDK 목록](https://tmapapi.tmapmobility.com/main.html)
