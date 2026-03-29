# 260329_tmap_clone

iOS 26 / iPhone 16 Pro 기준 T맵 클론 앱.
SwiftUI + MapKit 기반으로 T맵의 핵심 UI와 기능을 재현합니다.

## 구현된 기능

| 기능 | 상태 |
|------|------|
| 실시간 지도 (교통 정보 오버레이) | ✅ |
| 목적지 검색 (MKLocalSearch) | ✅ |
| 자동차 경로 안내 (대안 경로 포함) | ✅ |
| 경로 안내 모드 (방향 배너 + 통계 바) | ✅ |
| 과속 카메라 지도 표시 | ✅ (목업) |
| 즐겨찾기 (집/회사) | ✅ |
| 더보기 메뉴 | ✅ |
| 음성 안내 | 🔜 |
| 대중교통 경로 | 🔜 |
| 도보/자전거 모드 | 🔜 |

## 구조

```
TmapClone/
├── App/
│   ├── TmapCloneApp.swift    # @main
│   └── AppState.swift        # 전역 상태
├── Models/
│   └── SearchResult.swift    # 데이터 모델
├── Services/
│   ├── LocationService.swift # GPS / 속도
│   ├── RouteService.swift    # 경로 계산
│   └── SearchService.swift   # 장소 검색
├── ViewModels/
│   └── MapViewModel.swift    # 지도 상태
└── Views/
    ├── ContentView.swift     # TabView 루트
    ├── Map/                  # 메인 지도 화면
    ├── Navigation/           # 경로 안내
    ├── Search/               # 검색 탭
    ├── Home/                 # 하단 패널, 즐겨찾기, 더보기
    └── Components/           # 공통 컴포넌트 + 테마
```

## 빌드 요건

- Xcode 26+ (iOS 26 SDK)
- iPhone 16 Pro 시뮬레이터 또는 실기기
- 위치 권한: "앱 사용 중 허용" 이상

## 실행 방법

1. `TmapClone/TmapClone.xcodeproj` 를 Xcode로 열기
2. Team 설정 → 본인 Apple ID 선택
3. Target: iPhone 16 Pro 시뮬레이터
4. `Cmd + R` 실행

## 기술 스택

- **SwiftUI** — 전체 UI
- **MapKit** (iOS 17+ Map API) — 지도, 경로, 검색
- **CoreLocation** — GPS, 속도, 방향
- **Swift 6.0 Concurrency** — async/await
