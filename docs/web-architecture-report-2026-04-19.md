# Web Architecture Report 2026-04-19

이 문서는 `웹 유지형 정석 아키텍처` 요청에 대해 오늘 실제로 무엇을 정리했고, 무엇이 남아 있는지 보고하기 위한 결과 문서다.

## 요청 요약

사용자 요청:

- 앱 전환 전에 `Railway + 웹 배포` 기반으로 최대한 밀어붙인다.
- 그 전제에서 정석 아키텍처를 다시 설계한다.
- 체크리스트를 만들어 실제 작업 단위로 관리한다.
- 결과는 나중에 다른 세션에서도 그대로 이어갈 수 있게 문서화한다.

## 오늘 실제 반영 산출물

### 1. 웹 유지형 실행 체크리스트 작성

- 파일:
  - `docs/web-architecture-checklist-2026-04-19.md`
- 포함 내용:
  - 현재 상태
  - 지도 엔진 전환
  - corridor geometry 파이프라인
  - 실제 분기/합류 렌더링
  - 과금/캐시/운영
  - Railway 역할
  - QA 게이트

### 2. 웹 유지형 정석 아키텍처 초안 작성

- 파일:
  - `docs/web-first-architecture-2026-04-19.md`
- 포함 내용:
  - 데이터 소스 책임 분리
  - 전체 시스템 구조
  - 클라이언트 구조
  - 서버 구조
  - corridor 기반 정밀도로지도 파이프라인
  - Railway 운영 경계
  - 단계별 전환 계획
  - Mermaid 도식

### 3. 기존 운영 문서에 새 태스크 반영

- 파일:
  - `docs/open-task-matrix-2026-04-16.md`
  - `docs/mvp-forward-roadmap-2026-04-16.md`
- 반영 의도:
  - 새 체크리스트와 분리된 문서가 아니라, 기존 운영 문서에서 실제 할 일로 이어지게 연결

## 이번 작업에서 실제로 결정한 것

### 결정 1. 웹 전략 유지

- 지금 바로 native 전환으로 가지 않는다.
- 이유:
  - 현재 MVP 핵심은 `좋은 길 추천`, `실제 경로 안내`, `분기/합류 이해`
  - 이 세 가지는 웹에서도 구조를 바꾸면 상당 수준까지 달성 가능

### 결정 2. Leaflet 계속 덧칠하지 않는다

- 현재 Leaflet+raster 구조는 더 이상 장기 기반이 아니다.
- 앞으로는 `MapLibre GL JS` 기반 전환이 기본 방향이다.

### 결정 3. TMAP, NGII, ITS를 역할별로 분리한다

- TMAP:
  - route, TBT, lane meta
- NGII:
  - 정적 도로/차선/분기 형상
- ITS:
  - 공사, 돌발, VMS, 가변속도

### 결정 4. Railway는 운영 서버 역할에 집중한다

- Railway는 계속 쓴다.
- 하지만 원본 SHP 대용량 배치 처리까지 맡기지 않는다.

## 오늘 체크리스트 기준 완료/미완료

### 완료

- 웹 유지 전략을 문서로 고정했다.
- 데이터 소스 책임 분리를 문서화했다.
- Railway 역할 경계를 문서화했다.
- corridor 기반 구조로 가야 하는 이유와 형태를 문서화했다.
- 단계별 migration phase를 정의했다.

### 미완료

- MapLibre GL JS 실제 도입
- corridor API 실제 구현
- NGII ETL/PostGIS 실제 적재
- 실제 지도 위 유도선 색상 레이어 분리
- lane geometry 기반 차선 렌더링
- route core vs enrichment 런타임 분리 완료

## 남은 핵심 작업 5개

1. `MapLibre GL JS` 내비 맵 도입
2. `corridor geometry API` 구현
3. `NGII 최소 레이어 ETL` 구축
4. `실제 지도 위 분홍/초록 유도선` 렌더링
5. `route core / enrichment` 완전 분리

## 품질 게이트 관점 결론

판정: `CONDITIONAL_PASS`

이유:

- 문서화 목표는 달성했다.
- 앞으로의 구현이 이 문서를 기준으로 진행 가능하다.
- 그러나 실제 제품 품질을 바꾸는 구조 전환 자체는 아직 시작 단계다.

## 다음 실행 순서

1. `docs/web-architecture-checklist-2026-04-19.md` 기준으로 `2-A`, `2-B`, `5-A`부터 구현
2. `MapLibre` 기반 내비 화면 스파이크 작성
3. route core/enrichment를 서버와 클라이언트에서 분리
4. NGII corridor 파이프라인 PoC 착수
