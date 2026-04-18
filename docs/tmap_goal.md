# Tmap MVP Harness Goal

## 목표

`TmapCloneWeb/_reference/reverse-requirements-2026-04-18.md`를 다시 읽고, 현재 시점에서 빠진 부분을 찾은 뒤 카테고리별 업무 리스트를 재작성한다. 이후 해결 가능한 항목은 execution harness로 실제 처리하고, 남은 항목은 이유와 함께 보고서로 남긴다.

## 시작 조건

- 첫 스킬: `multi-agent-manager-ko`
- 시작 stage: `execution_planning`
- 중단 시점: 모든 해결 가능한 업무를 마무리했을 때
- 작업 중 사용자 의도 판단 또는 추가 권한이 필요한 항목은 별도 기록만 남기고, 다른 작업을 계속 진행한다.
- 설치, 실행, 검증, 배포에 필요한 권한은 기본적으로 부여된 것으로 간주하고 진행한다.

## 반드시 읽을 입력 파일

- `projects/260329_tmap_clone/TmapCloneWeb/_reference/reverse-requirements-2026-04-18.md`
- `projects/260329_tmap_clone/TmapCloneWeb/docs/mvp-harness-task-board-2026-04-19.md`
- `projects/260329_tmap_clone/TmapCloneWeb/docs/mvp-harness-report-2026-04-19.md`

## 반드시 수행할 일

1. 기준 문서를 다시 읽는다.
2. 현재 시점에서 빠진 부분과 회귀 위험을 찾는다.
3. 우선순위를 정한 업무 리스트를 Markdown 파일로 다시 만든다.
4. 해결 가능한 항목은 execution harness 루프 안에서 실제 코드/설정/문서 변경으로 처리한다.
5. 사용자 판단이 필요한 항목, 외부 시스템 확인이 필요한 항목, 이번 세션에서 해결 불가한 항목은 별도 섹션으로 기록한다.
6. 작업 종료 시 해결/미해결 현황과 이유를 포함한 보고서를 Markdown 파일로 제출한다.

## 업무 리스트 분류 규칙

업무 리스트는 아래 카테고리 안에서만 분류한다.

1. `dev/prod 배포 구조`
2. `검색 속도/품질 개선`
3. `고속/국도/경관도로 추천`
4. `내 위치 추종`
5. `실시간 경로 적용`
6. `안전운전모드/카메라/방지턱`
7. `주유소/병원/맛집/구글평점`
8. `지도 UI 개선`
9. `지도 회전/차선 안내`

각 항목에는 아래를 반드시 적는다.

- 상태: `todo | in_progress | done | partial | blocked`
- 우선순위: `P0 | P1 | P2`
- 시급성: `치명적 | 높음 | 중간 | 낮음`
- 근거
- 작업 내용

## 우선순위 기준

- `P0`: MVP 핵심 경로를 직접 깨거나, 주행/탐색/재탐색이 실패하는 항목
- `P1`: 핵심 경험을 크게 떨어뜨리지만 우회 사용은 가능한 항목
- `P2`: 부가 기능, 운영 편의, 후순위 polish 항목

우선순위는 중요도와 시급성을 함께 반영해서 정한다.

## 이번 세션 우선 처리 원칙

아래 항목을 최우선 `P0` 후보로 먼저 검토한다.

- `/api/tmap/routes` 400 회귀
- UI 체인 호출로 인한 429 가능성
- GPS jump와 지나온 길 trim 품질
- 실시간 경로 적용과 내 위치 추종의 실제 동작 안정화

그 다음 우선순위로 아래를 본다.

- 경관도로 waypoint 실제 반영 검증
- 검색 속도/품질 개선
- dev/prod 배포 구조 점검과 문서 동기화

## 산출물 규칙

아래 산출물은 이번 런에서 반드시 생성 또는 갱신한다.

- `projects/260329_tmap_clone/TmapCloneWeb/docs/mvp-harness-task-board-2026-04-19.md`
- `projects/260329_tmap_clone/TmapCloneWeb/docs/mvp-harness-report-2026-04-19.md`

필요하면 아래도 함께 갱신한다.

- 관련 코드 파일
- 테스트/하네스 파일
- `manager_memory/short-term/active-tasks.md`
- `manager_memory/mid-term/current-initiatives.md`
- `manager_memory/long-term/strategy-roadmap.md`
- `manager_memory/logs/2026-04-19-tmap-harness-followup.md`

## 성공 기준

- 기준 문서 재독 결과가 task board에 카테고리별로 반영되어 있다.
- 업무 리스트에 우선순위와 시급성이 모두 기록되어 있다.
- 해결 가능한 핵심 항목이 최소 1개 이상 실제 코드로 반영되어 있다.
- `node scripts/navigation-harness.mjs`가 PASS한다.
- `npm run build`가 PASS한다.
- 최종 보고서에 각 카테고리별 해결 여부, 해결 방식, 미해결 이유가 기록되어 있다.

## 종료 조건

아래 조건을 만족하면 이번 런을 종료한다.

- 해결 가능한 업무는 모두 처리했거나, 더 진행해도 사용자 의도 확인/외부 시스템 검증/추가 정보가 필요해지는 상태다.
- 남은 업무는 `blocked`, `partial`, `pending` 등으로 정리되어 있고 이유가 적혀 있다.
- task board와 report가 최신 상태다.

## 보고서 필수 포함 항목

최종 보고서에는 아래가 반드시 있어야 한다.

- 9개 카테고리별 해결 상태
- 무엇을 어떻게 해결했는지
- 해결되지 못한 업무와 그 이유
- 사용자 의도 판단 또는 외부 권한/외부 검증이 필요한 항목
- 실행한 검증 명령과 결과

## 하네스 실행 메모

- `HANDOFF_PACKET`만 만들고 종료하지 말고, `READY_FOR_NEXT` 또는 `NEEDS_REWORK`를 적절히 사용해 실제 루프를 이어간다.
- `stage: done`과 `status: COMPLETE`는 모든 해결 가능한 작업이 끝난 마지막에만 사용한다.
- 구현 단계는 반드시 `EXECUTION_PLAN`을 포함한다.
- SQE 단계는 반드시 실행 명령 또는 preview/server 검증을 포함한다.
