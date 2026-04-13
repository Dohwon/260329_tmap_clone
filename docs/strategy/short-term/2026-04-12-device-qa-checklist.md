# Device QA Checklist

## 1. 목적
- iPhone 또는 iOS Simulator가 생겼을 때 바로 검증할 수 있는 최소 시나리오를 정리한다.
- 현재 안드로이드 환경에서는 실행이 불가능하므로, 콘솔 로그와 API 응답을 함께 확인하는 절차를 남긴다.

## 2. 사전 준비
- [Info.plist](/home/silogood/work/12.tmap/260329_tmap_clone/TmapClone/TmapClone/Info.plist)의 `TMAPAppKey` 설정
- Xcode Debug Console 활성화
- 위치 권한 `앱 사용 중 허용`
- `DebugLog` 출력 확인

## 3. 핵심 시나리오
1. 검색
- 목적지 검색 결과가 표시된다.
- 실패 시 `TMAP fallback` 또는 오류 메시지가 보인다.

2. 경로 비교
- 고속도로를 선택한 뒤 목적지를 고르면 경로 카드가 2개 이상 보인다.
- `선호 도로 우선 / 균형 추천 / 빠른길 / 쉬운길` 중 일부가 실제로 구분된다.

3. 안내 시작
- `안내 시작` 후 남은 거리, 남은 시간, 현재 속도, 선호 도로 상태가 표시된다.
- Debug Console에 `NAV`, `ROUTE`, `ROAD` 로그가 출력된다.

4. 경로 이탈
- 일부러 경로에서 벗어나면 `이탈 m` 상태가 보인다.
- 2회 이상 연속 감지 시 `REROUTE` 로그와 함께 재탐색이 실행된다.

5. 선호 도로 유지
- 선택한 고속도로에 진입하면 `선호 도로 주행 중`으로 바뀐다.
- 진출 또는 이탈 시 `이탈 징후` 또는 `벗어남`으로 바뀐다.

## 4. 실패 기준
- 경로 카드가 1개만 반복 표시된다.
- 선호 도로를 타도 상태가 계속 `접근 중`에 머문다.
- 짧은 이탈에도 재탐색이 과도하게 반복된다.
- `TMAP` 호출 실패 후 조용히 멈추고 사용자 메시지가 없다.

## 5. 비실기기 검증
- [scripts/tmap_api_smoke_test.sh](/home/silogood/work/12.tmap/260329_tmap_clone/scripts/tmap_api_smoke_test.sh) 실행
- `TMAP_APP_KEY=... bash scripts/tmap_api_smoke_test.sh`
- `POI / routes / nearToRoad / matchToRoads` 응답이 정상인지 먼저 확인
