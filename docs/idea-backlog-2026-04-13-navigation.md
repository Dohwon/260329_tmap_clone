# Navigation Idea Backlog 2026-04-13

## 즉시 개선안

- 진행 방향 기반 안전 운전 모드:
  - 현재 위치 반경 검색이 아니라 `heading + 최근 이동 궤적 + 현재 경로 polyline`을 조합해 전방 600m만 우선 경고
- 음성 우선순위 큐:
  - `회전 임박 > 과속카메라 100m > 구간단속 시작 > 어린이보호구역/방지턱 > 과속 반복 경고` 순으로 재생
- 현재 도로명/제한속도 바:
  - 상단 또는 속도 배지 근처에 `현재 도로명 · 제한속도`를 작게 붙여 실제감 강화
- 안전 알림 mute 규칙:
  - 같은 카메라/같은 위험요소는 통과 전까지 재알림 금지

## 확장 아이디어

- 실데이터 품질 대시보드:
  - 구간별 `speedLimit 없음`, `roadType 불명`, `camera speed 없음` 카운트를 개발용 패널로 노출

## 2026-04-13 반영 완료

- 링크 단위 교통 혼잡도 오버레이:
  - 실제 `segmentStats.averageSpeed/speedLimit/congestionScore`가 있는 정체/서행 링크만 강조
- 실주행 편차 분석:
  - 저장된 드라이브 기록과 안내 경로를 비교해 `경로 이탈`, `실제 선호 우회`, `급감속 구간`을 기록/습관 화면에 반영
- 차선 힌트 정밀화:
  - `guideLane/laneInfo` 패턴 사전을 늘려 `1~2차로 이용`, `우측 2개 차로 유지` 같은 문구를 우선 파싱

## 실험 제안

- 실험 A:
  - 목표: 안전 운전 모드의 오경고를 줄인다
  - 방법: 반경 기준 vs heading cone 기준 vs polyline projection 기준 비교
  - 지표: 10분 주행 중 불필요 경고 횟수
- 실험 B:
  - 목표: 음성 큐가 체감 품질을 높이는지 확인
  - 방법: `cancel-speak` 방식과 `queue-priority` 방식 A/B
  - 지표: 회전 직전 핵심 멘트 누락률
- 실험 C:
  - 목표: 실제값 미표시가 추정값 표시보다 신뢰도에 유리한지 검증
  - 방법: 제한속도 미표시 UI vs 추정값 UI 비교
  - 지표: 사용자 신뢰도 주관 평가

## 우선순위

- P0: 진행 방향 기반 안전 운전 모드
- P0: 음성 큐/우선순위 엔진
- P1: 현재 도로명/제한속도 바
- P1: 실데이터 품질 대시보드
- P2: 드라이브 기록 기반 개인화 안내

[HANDOFF_PACKET]
stage: idea_review
status: COMPLETE
owner: idea-agent-ko
next_owner: user
reentry_owner: implementer-agent-ko
goal: 실제 기반 내비 개선 아이디어를 우선순위와 실험 형태로 정리한다
mvp: 즉시 적용 가능한 개선안과 중장기 확장안을 문서로 남긴다
success_metrics:
  - 즉시 개선안과 확장안이 구분되어 있다
  - 실험 항목이 검증 가능하게 적혀 있다
stop_condition: 아이디어 문서가 작성되면 종료
deliverables:
  - docs/idea-backlog-2026-04-13-navigation.md
blocking_issues:
  - none
qa_focus:
  - 사용자 검토 후 P0 항목부터 구현 착수 가능 여부
loop_reason: none
next_action: 사용자가 아이디어 문서를 보고 우선순위를 확정한다
next_prompt: |
  <user>
  현재 stage: publish_draft
  목표: Navigation Idea Backlog 문서를 검토하고 우선순위를 확정한다.
  입력 산출물: docs/idea-backlog-2026-04-13-navigation.md
  반드시 할 일: P0/P1 중 바로 진행할 항목을 선택하거나 순서를 조정한다.
  완료 후 다음 구현 지시를 내려라.
[/HANDOFF_PACKET]
