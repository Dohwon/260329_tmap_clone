# Long-Distance Driver Route MVP Plan

## 문서 목적

- 장거리/고속 주행 드라이버를 위한 신규 운전 지도 MVP의 방향을 정리한다.
- 기존 Tmap clone 코드베이스를 기준으로 Claude가 바로 구현에 착수할 수 있도록 화면, 상태, 데이터, 단계별 개발 계획을 명확히 남긴다.
- 이번 문서는 아이디어 검토 결과와 개발 우선순위를 함께 포함한다.

## 한 줄 문제 정의

장거리/고속 주행 드라이버는 단순한 최단시간보다 `막히지 않고`, `갑작스러운 감속이 적고`, `합류/출구를 미리 이해할 수 있는` 경로를 원하지만, 기존 내비는 이를 충분히 설명하지 못한다.

## 타깃 사용자

### 1차 타깃

- 장거리/고속 주행 드라이버
- 고속도로와 국도를 섞어 장시간 운전하는 사용자
- 막히는 길보다 흐름이 좋은 길을 선호하는 사용자
- 과속카메라, 구간단속, 합류 지점을 미리 알고 싶은 사용자

### 보조 타깃

- 와인딩 또는 scenic drive 성향이 있는 드라이버
- 해안도로, 산길도로, 교통량 적은 국도를 선호하지만 불필요한 위험 메시지는 원하지 않는 사용자

## 제품 포지셔닝

- 기존 내비의 중심: `최단시간`, `실시간 빠른 길`
- 본 MVP의 중심: `주행 흐름이 좋은 길`, `설명 가능한 길`, `미리 선택할 수 있는 길`

핵심 메시지는 아래 3개다.

1. 막히지 않고 시원하게 달릴 수 있는 경로를 먼저 보여준다.
2. 다음 합류/출구/카메라/구간단속을 미리 이해하게 해준다.
3. 운전 성향과 선호 도로에 따라 사용자가 길을 고를 수 있게 한다.

## 핵심 가설

1. 장거리 드라이버는 ETA가 조금 늘어나도 흐름이 좋은 길을 선택할 의사가 있다.
2. 출발 전에 `경로 구조`를 설명해주면 사용자는 경로에 대한 불안이 줄어든다.
3. 주행 중 `다음 10km 단위 예고`를 제공하면 합류/감속 스트레스가 줄어든다.
4. `초보/중수/고수` 프리셋은 경로 추천 설명 장치로 유효하다. 단, 위험을 권장하는 문구로 보이지 않게 설명을 붙여야 한다.

## 사용자 프리셋 정의

### 초보

- 넓고 단순한 길 우선
- 합류/분기 수가 적은 경로 우선
- 다소 막히더라도 이해하기 쉬운 길 우선
- 설명 문구 예시: `합류 지점이 적고 단순한 경로를 우선합니다.`

### 중수

- 시간과 흐름의 균형
- 고속도로와 국도 혼합 허용
- 약간 돌아가더라도 막힘이 적은 길 허용
- 설명 문구 예시: `조금 더 유연하게, 정체가 적은 경로를 함께 탐색합니다.`

### 고수

- 좁은 길, 국도, 합류 지점이 많은 길도 허용
- 정체가 적고 흐름이 좋은 경로를 더 강하게 선호
- 해안도로, 산길도로, 와인딩 성향의 국도도 후보에 포함 가능
- 설명 문구 예시: `합류가 많거나 구조가 복잡한 길도 포함해 흐름 좋은 경로를 넓게 탐색합니다.`

## 문제점 정리

### 현재 내비 경험의 불만

1. 실시간 빠른 경로가 떠도 왜 빠른지 구조 설명이 부족하다.
2. 합류/출구를 미리 고를 수 없어 운전자 입장에서 수동 통제가 어렵다.
3. 고속도로 우선 외에 `고속도로+국도`, `흐름 좋은 국도`, `선호 도로` 같은 세밀한 선택이 부족하다.
4. 과속카메라와 구간단속이 경로 설명의 일부가 아니라 개별 경고처럼 느껴진다.
5. 각 도로의 제한속도와 주행 성격을 출발 전에 비교하기 어렵다.

## MVP 범위

### 포함

1. 고속도로/국도 시작-끝 표시
2. 고속도로/국도 합류 및 출구 지점 표시
3. 선호 고속도로/국도 선택
4. 초보/중수/고수 프리셋 기반 경로 추천
5. 과속카메라 및 구간단속 위치/개수/구간 길이 요약
6. 도로별 최고속도 사전 표시
7. 다음 10km 단위의 합류 지점 예고
8. 특정 합류/출구를 택했을 때의 시간 증가, 막힘 정도, 카메라 수 차이 표시
9. 해안도로/산길도로 선호 옵션의 개념 검토용 노출

### 제외

1. 완전 자동 개인화 추천
2. 음성 기반 대화형 경로 재탐색
3. 와인딩 성향 점수의 정교한 ML 모델링
4. 커뮤니티 제보 기능
5. 법/안전 이슈가 있는 표현을 포함한 직접적 속도 권장 메시지

## 기능 요구사항

### 1. 경로 구조 레이어

- 사용자는 지도에서 `고속도로`, `국도`, `합류`, `출구`, `과속카메라`, `구간단속`, `제한속도` 레이어를 켜고 끌 수 있어야 한다.
- 고속도로와 국도는 시작/끝 지점을 지하철 노선도처럼 이해하기 쉽게 표시해야 한다.
- 전국 전체 과밀 노출이 아니라 현재 경로 중심 노출이 기본이어야 한다.

### 2. 경로 선택 패널

- 각 경로는 시간/거리 외에 아래 요약을 보여줘야 한다.
  - 고속도로 비율
  - 국도 비율
  - 주요 합류 횟수
  - 카메라 개수
  - 구간단속 개수와 총 길이
  - 대표 제한속도
  - 막힘 정도
- 사용자는 경로 탐색 전에 아래 옵션을 조정할 수 있어야 한다.
  - 초보/중수/고수
  - 고속도로만
  - 고속도로+국도
  - 선호 고속도로
  - 선호 국도
  - 해안도로/산길도로 포함 여부

### 3. 합류 지점 사전 선택

- 사용자는 다음 10km 단위 주요 합류/출구 지점을 미리 볼 수 있어야 한다.
- 각 합류 옵션마다 아래 정보를 보여줘야 한다.
  - 현재 기준 추가 시간
  - 정체 수준 변화
  - 카메라 수
  - 구간단속 여부
  - 진입 후 대표 제한속도

### 4. 주행 중 예고 UI

- 주행 중에도 다음 정보를 유지해야 한다.
  - 다음 합류까지 거리
  - 다음 카메라까지 거리
  - 구간단속 시작/종료 및 남은 거리
  - 현재 도로 최고속도
  - 다음 10km 내 선택 가능한 주요 분기

## UX 방향

### 경로를 설명하는 내비

- 경로 이름은 단순히 `빠른길`, `대안1`로 끝나면 안 된다.
- 각 경로는 `왜 이 길을 추천하는지` 한 줄 설명이 있어야 한다.

예시:

- `고속도로 중심, 합류 적음, 카메라 4개`
- `국도 포함, 8분 느리지만 정체 적음`
- `산길도로 포함, 흐름 좋음, 구간단속 적음`

### 초보/중수/고수 프리셋 UX 원칙

- 프리셋은 실력 자극용이 아니라 경로 복잡도 설명 장치로 사용한다.
- 고수 프리셋은 `불법 주행`이나 `과속 권장`으로 읽히면 안 된다.
- 설명은 도로 구조와 합류 복잡도 중심으로 적는다.

### 해안도로/산길도로 옵션 UX 원칙

- `와인딩 추천` 같은 직접적 표현 대신 아래처럼 우회 표현을 사용한다.
  - `해안도로 선호`
  - `산길도로 포함`
  - `풍경 좋은 국도 포함`
- 기본값은 OFF로 둔다.

## 기존 코드 기준 화면 변경 포인트

### 1. Route Preview Panel 확장

대상 파일:

- `TmapClone/TmapClone/Views/Navigation/RoutePreviewPanel.swift`

필수 변경:

- 기존의 시간/거리 중심 리스트를 `설명형 경로 카드`로 확장
- 경로 상단에 프리셋 선택 추가
- 경로 조건 필터 추가
- 각 카드에 경로 요약 지표 추가
- `다음 10km 합류 선택` 드릴다운 진입점 추가

### 2. Map Layer View 확장

대상 파일:

- `TmapClone/TmapClone/Views/Map/MapLayerView.swift`

필수 변경:

- 기존 카메라 annotation 외에 도로 레이어 추가
- 고속도로/국도 시작-끝 marker 추가
- 합류/출구 marker 추가
- 구간단속 zone overlay 추가
- 제한속도 badge overlay 추가

### 3. Navigation Overlay 확장

대상 파일:

- `TmapClone/TmapClone/Views/Navigation/NavigationOverlayView.swift`

필수 변경:

- 다음 합류 예고 bar 추가
- 다음 카메라/구간단속 정보 추가
- 제한속도 표시 추가
- 선택 가능한 다음 분기 카드 또는 bottom sheet 추가

### 4. Home Map View 진입 흐름 변경

대상 파일:

- `TmapClone/TmapClone/Views/Map/HomeMapView.swift`

필수 변경:

- 목적지 선택 후 바로 단순 route panel을 띄우는 구조를 고도화
- route panel 진입 전에 경로 조건 preset을 기억할 수 있도록 상태 연결
- 우측 floating button 중 map 버튼을 레이어 토글 진입점으로 재활용

### 5. App State / View Model / Service 확장

대상 파일:

- `TmapClone/TmapClone/App/AppState.swift`
- `TmapClone/TmapClone/ViewModels/MapViewModel.swift`
- `TmapClone/TmapClone/Services/RouteService.swift`

필수 변경:

- `driverProfile`
- `routePreferences`
- `preferredRoads`
- `visibleLayers`
- `routeSummaries`
- `mergeOptions`
- `cameraZones`
- `roadSegments`

위 상태와 모델을 추가해야 한다.

## 제안 데이터 모델

### DriverProfile

- `beginner`
- `intermediate`
- `expert`

### RoutePreferences

- 고속도로만 여부
- 고속도로+국도 허용 여부
- 선호 고속도로 목록
- 선호 국도 목록
- 해안도로 선호 여부
- 산길도로 포함 여부

### RouteSummary

- routeId
- title
- eta
- distance
- highwayRatio
- nationalRoadRatio
- mergeCount
- congestionScore
- fixedCameraCount
- sectionCameraCount
- sectionEnforcementDistance
- dominantSpeedLimit
- explanation

### MergeOption

- mergeId
- name
- coordinate
- distanceFromCurrent
- addedTime
- congestionDelta
- fixedCameraCount
- sectionCameraCount
- dominantSpeedLimit
- note

### RoadSegment

- segmentId
- roadName
- roadType
- speedLimit
- isHighway
- isNationalRoad
- isScenic
- isMountainRoad
- startPoint
- endPoint

## 추천 점수 로직 초안

경로 추천은 단일 ETA 정렬이 아니라 아래 다중 점수 구조로 바꾼다.

### 기본 점수

- ETA score
- congestion score
- merge complexity score
- camera burden score
- speed continuity score
- route preference match score

### 프리셋별 가중치

#### 초보

- merge complexity 가중치 높음
- speed continuity 중간
- ETA 낮음

#### 중수

- ETA와 congestion 균형
- route preference match 중간

#### 고수

- congestion, speed continuity, preference match 가중치 높음
- merge complexity 패널티 완화

## 개발 단계 계획

## Phase 0. 기획 확정

목표:

- 프리셋, 레이어, 경로 카드, 합류 옵션의 정보 구조 확정

작업:

1. 초보/중수/고수 설명 문구 확정
2. 경로 카드 필수 지표 확정
3. 다음 10km 합류 옵션 UI 스케치
4. 안전 리스크가 있는 표현 제거

완료 기준:

- 디자이너/개발자/기획자가 동일한 용어로 합의

## Phase 1. 프런트엔드 목업 구현

목표:

- 현재 clone 앱에서 동작하는 정적/목업 기반 UX 구현

작업:

1. RoutePreviewPanel 확장
2. 프리셋 토글 UI 추가
3. 지도 레이어 토글 UI 추가
4. NavigationOverlay에 카메라/합류/제한속도 예고 영역 추가
5. mock RouteSummary, MergeOption, RoadSegment 데이터 주입

완료 기준:

- 실제 API 없이도 경로 구조 UX를 끝까지 체험 가능

## Phase 2. 데이터 모델 및 상태 연결

목표:

- 단순 `MKRoute` 중심 구조를 `설명 가능한 경로 구조`로 전환

작업:

1. AppState에 사용자 선호 상태 추가
2. MapViewModel에 route summary, layer visibility, merge preview 상태 추가
3. RouteService 출력 모델 확장
4. mock speed camera 구조를 fixed/section camera zone으로 세분화

완료 기준:

- View가 MKRoute 직접 접근 없이 RouteSummary 기반으로도 동작 가능

## Phase 3. 실제 경로 계산 보강

목표:

- 경로별 설명 지표를 실데이터 또는 보강 데이터로 계산

작업:

1. 도로 segment 분해 로직 추가
2. highway/national road 비율 계산
3. 카메라/구간단속 집계
4. 합류/출구 포인트 집계
5. 프리셋별 추천 점수 계산

완료 기준:

- 최소 2~3개 대안 경로에 대해 설명형 카드 생성 가능

## Phase 4. 다음 10km 합류 선택 기능

목표:

- 사용자가 주행 중 또는 출발 전에 가까운 분기를 이해하고 선택 가능

작업:

1. 다음 10km 범위의 주요 합류/출구 계산
2. 분기별 ETA/정체/카메라 비교
3. 주행 중 분기 선택 UI 연결

완료 기준:

- `이 합류를 타면 몇 분 증가, 정체는 감소, 카메라는 몇 개`가 표시됨

## Phase 5. 고급 도로 취향 옵션

목표:

- 해안도로/산길도로/풍경 좋은 국도 선호 옵션 실험

작업:

1. scenic road flag 정의
2. 고수 프리셋 또는 별도 옵션에 연결
3. 추천 메시지 안전성 검토

완료 기준:

- 위험한 인상을 주지 않으면서도 도로 취향 옵션이 전달됨

## 90일 실행안

### 1-2주차

- 정보 구조 확정
- mock 데이터 모델 정의
- RoutePreviewPanel 개편

### 3-4주차

- 지도 레이어 및 카메라/합류 marker 구현
- NavigationOverlay 예고 UI 구현

### 5-6주차

- AppState / ViewModel / RouteService 상태 확장
- RouteSummary 기반 렌더링 전환

### 7-9주차

- 경로 설명 점수 계산
- 다음 10km 합류 옵션 로직 구현

### 10-12주차

- 고급 도로 선호 옵션 실험
- 사용자 테스트
- 용어/설명/우선순위 조정

## 리스크와 대응

### 1. 데이터 소스 리스크

리스크:

- MapKit 기본 응답만으로는 고속도로/국도/합류/카메라 구조가 충분하지 않을 수 있다.

대응:

- MVP 1차는 mock/보강 데이터로 UX 검증
- 이후 별도 도로 메타데이터 소스 연결 검토

### 2. 정보 과밀 리스크

리스크:

- 경로 카드와 지도에 정보가 너무 많아질 수 있다.

대응:

- 기본은 요약만 노출
- 상세는 drill-down
- 지도는 현재 경로 기준 레이어 우선

### 3. 안전 메시지 리스크

리스크:

- 고수, 와인딩, 산길 관련 표현이 위험 주행 권장처럼 보일 수 있다.

대응:

- 표현을 도로 구조와 취향 중심으로 제한
- 속도 관련 직접 권장 문구 배제

## 성공 지표 초안

### 정성

- 사용자가 `왜 이 길을 추천하는지 이해된다`고 답하는 비율
- 합류/카메라에 대한 불안 감소 피드백

### 정량

- 경로 선택 패널 체류 시간
- 기본 추천 경로 외 대안 경로 선택 비율
- 선호 도로 설정 사용률
- 주행 중 다음 합류 카드 열람률

## 즉시 구현 우선순위

### P0

1. 초보/중수/고수 프리셋 UI
2. 설명형 경로 카드
3. 카메라/구간단속/제한속도 요약
4. 다음 10km 합류 옵션 목업

### P1

1. 고속도로/국도 시작-끝 레이어
2. 실제 합류/출구 지점 계산
3. 선호 고속도로/국도 저장

### P2

1. 해안도로/산길도로 선호 옵션
2. scenic route 추천 고도화

## Claude 구현 가이드

Claude는 아래 순서로 작업하는 것이 적절하다.

1. `RouteSummary`, `MergeOption`, `RoutePreferences`, `DriverProfile` 모델 추가
2. `AppState`, `MapViewModel`, `RouteService` 상태 확장
3. `RoutePreviewPanel`을 설명형 카드 구조로 개편
4. `MapLayerView`에 레이어 토글 및 marker 추가
5. `NavigationOverlayView`에 합류/카메라/제한속도 예고 추가
6. mock 데이터를 넣어 UX 전체 흐름 검증
7. 이후 실제 계산 로직과 외부 데이터 연결

## 최종 판단

이 MVP의 승부처는 `더 빨리 도착하게 하는 기능`이 아니라 `운전자가 미리 이해하고 통제할 수 있는 경로를 제공하는 UX`다. 구현 우선순위도 ETA 정확도보다 `경로 설명력`, `합류 예고`, `카메라/제한속도 가시성`에 두는 것이 맞다.
