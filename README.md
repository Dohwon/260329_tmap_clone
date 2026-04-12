# Tmap Clone Web

React + Vite 기반의 TMAP 클론 PWA입니다. 실제 TMAP 경로, 검색, 주변 POI, 주행 기록, 고속도로/국도 중심 드라이버 UX를 목표로 개발 중입니다.

## Run

```bash
npm install
npm run build
npm start
```

개발 서버는 `server.js`를 통해 정적 배포와 `/api/tmap`, `/api/fuel` 프록시를 함께 처리합니다.

## Structure

- `server.js`: Railway 배포용 Express 서버와 TMAP/연료 API 프록시
- `src/store/appStore.js`: 전역 상태, 경로 탐색, 안내, 저장 경로 재개
- `src/services/tmapService.js`: TMAP 검색/경로/주변 POI 연동
- `src/components/Map`: 지도, 도로/카메라/속도 레이어
- `src/components/Navigation`: 안내 배너, 실시간 재탐색, 근처 주유소/휴게소/주차장
- `src/components/Route`: 경로 카드, 경유지, 프리셋, 미리보기

## 0413 Changes

- 안내 중 검색을 열 수 있게 변경했고, 검색 결과 선택 시 `경유지 추가` 또는 `목적지 변경`으로 분기되게 수정
- 안내 화면에서 검색 진입점이 두 군데 뜨던 문제를 정리하고 상단 안내 영역만 남김
- 검색 입력 삭제나 API 실패 후 화면이 죽던 문제를 수정
- 국도 데이터에 `restStops`가 없는 경우에도 검색이 크래시하지 않도록 방어 로직 추가
- `주유소/휴게소/주차장` 근처 검색의 실패 내성을 높였고, 휴게소는 고속도로 정적 데이터로 폴백되도록 추가
- `강남역`, `양화대교`, `올림픽대로` 같은 자주 쓰는 검색어는 즉시 후보를 보여주도록 빠른 후보/캐시 로직 보강
- 실제 주행 후 저장된 경로를 그대로 다시 안내할 수 있도록 저장 경로 재개 로직 추가
- 저장 경로는 안내 종료 시점에 실제 주행 궤적이 있으면 실제 주행 polyline 기준으로 저장되도록 수정
- 안내 중 프리셋을 `초보/중수/고수`로 다시 바꿀 수 있게 하고, 저장 경로는 실시간 재탐색 없이 원본 경로를 유지하도록 보정
- 경로 세그먼트별 제한속도/평균속도 정보를 지도에 노출할 수 있도록 TMAP 응답 파서를 확장
- 검색/안내 회귀를 검증하기 위해 `scripts/navigation-harness.mjs`에 검색 크래시 방지 테스트를 추가

## Verification

2026-04-13 기준 로컬에서 아래 검증을 통과했습니다.

```bash
node scripts/navigation-harness.mjs
npm run build
```

배포는 Railway를 사용하며, 빌드 완료 후 퍼블릭 번들 전환이 수 분 지연될 수 있습니다.
