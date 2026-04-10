# Current Initiatives

## TmapCloneWeb 장거리 운전자 MVP 안정화

### 현재 상태

- UI 흐름 복구는 대부분 완료
- 로컬 빌드(`npm run build`)는 통과
- 서버 실행(`timeout 3s node server.js`) 확인
- `dev`와 `start` 모두 TMAP 프록시/키 로딩 경로는 복구
- 검색/교통/카메라/합류 선택 일부는 fallback 및 heuristic에 의존

### 중점 과제

1. 실제 T-map API 기반 검색 정확도와 경로 품질 검증
2. GPS 권한/HTTPS/실기기 이동 시나리오 검증
3. 실시간 교통, 단속 카메라, 합류 재탐색을 실데이터로 전환
4. 로컬/배포 환경에서 `TMAP_API_KEY` 주입 경로를 표준화해 live/simulation 전환을 명확히 유지
5. dev/start 환경 모두에서 동일한 `/api/tmap` 프록시와 키 로딩 체계 유지

### 품질 게이트

- 현재 판정: 조건부 통과
- 차단 요소: 실주소/실시간성/실기기 GPS 검증 미완료
