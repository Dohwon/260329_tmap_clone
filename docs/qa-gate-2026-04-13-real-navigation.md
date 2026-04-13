# QA Gate 2026-04-13 Real Navigation

## 테스트 범위

- 라이브 경로의 도로 구분과 구간 색상이 실제 segment 기반으로만 그려지는지
- 현재 구간 제한속도가 경로 대표값이 아니라 현재 위치 인접 segment 기준으로 계산되는지
- 제한속도/평균속도 값이 추정 고정값 대신 실제 응답값 우선으로 노출되는지
- 내비 중 안전 알림이 회전 안내 외에도 카메라/구간단속/어린이보호구역/방지턱/과속을 다루는지
- 빌드/하네스 회귀 여부

## 테스트 결과

- PASS: `node scripts/navigation-harness.mjs`
- PASS: `npm run build`
- PASS: 현재 구간 판단 유틸 `getCurrentRouteSegment` 추가 및 하네스 검증
- PASS: 라이브 경로에서 실제 segment가 없으면 임의의 고속/국도/일반도로 색칠을 하지 않고 단일 경로선만 그리도록 변경
- PASS: 제한속도는 `speed` 추정값이 아니라 `speedLimit/limitSpeed/maxSpeed/restrictedSpeed`만 사용하도록 축소
- PASS: 카메라 제한속도/경로 카드 속도 요약은 실측값 없을 때 `--` 또는 `실값없음`으로 표기하도록 변경
- PASS: 내비 중 카메라/구간단속/어린이보호구역/방지턱/과속에 대한 음성+경고음+점멸 알림 추가
- PASS: 안전 운전 모드는 진행 방향(`heading`) 기준 전방 위험요소를 우선 선택하도록 보정
- PASS: 회전 안내와 안전 알림은 짧은 음성 큐로 순차 재생하도록 보정
- PASS: 실제 `segmentStats`가 있는 정체/서행 링크만 혼잡도 오버레이로 강조하고, 실속/제한속도 팝업을 추가
- PASS: 저장된 실제 주행 경로에서 `경로 이탈`, `실제 선호 우회`, `급감속 구간`을 계산해 드라이브 기록/운전 습관 화면에 노출
- PASS: `guideLane/laneInfo` 패턴 사전을 확대해 `우측 2개 차로 유지`, `1~2차로 이용` 같은 차선 힌트를 실제 문구 우선으로 해석

## 결함/리스크

- FAIL: 지도 자체 회전과 차선 레벨 형상 렌더링은 여전히 미구현이다. 현재 구조는 확대/오프셋/차선 패널 보강 수준이다.
- CONDITIONAL: 안전 운전 모드는 heading 기반으로 개선했지만, 링크/차선 단위의 진짜 전방 예측은 아니다.
- CONDITIONAL: 음성 큐는 추가했지만 우선순위 선점형 큐는 아니라 긴급 멘트 강제 삽입은 아직 없다.
- CONDITIONAL: 실제 TMAP 응답에 제한속도 필드가 비는 구간은 `미표시`로 떨어지므로, 사용자는 일부 구간에서 값이 없는 것으로 볼 수 있다. 이는 추정값보다 안전하지만 UX 공백이 있다.
- CONDITIONAL: 실주행 편차 분석은 샘플 간격과 GPS 정확도에 따라 짧은 이탈이나 세부 차선 변경을 놓칠 수 있다.

## 게이트 판정

- gate_decision: `CONDITIONAL_PASS`
- 판정 사유: 실제값 왜곡 제거, 현재 구간 제한속도, 안전 알림 통합, 진행 방향 필터, 음성 큐, 링크 단위 혼잡도 표시, 실주행 편차 분석까지는 반영됐다. 다만 `운전자 시점 벡터 지도/차선 레벨 렌더링`과 `우선순위 선점형 음성 큐`는 아직 미완료다.

[HANDOFF_PACKET]
stage: sqa_gate
status: READY_FOR_NEXT
owner: qa-agent-ko
next_owner: idea-agent-ko
reentry_owner: implementer-agent-ko
goal: 실제 기반 일반 내비 요구사항 중 구현 가능한 범위를 검증하고 잔여 한계를 분리한다
mvp: 실제값 왜곡 제거와 안전 알림 통합이 빌드/하네스 기준으로 안정적인지 판정한다
success_metrics:
  - 실제값 왜곡 제거 항목이 빌드와 하네스에서 회귀 없이 유지된다
  - 잔여 구조 한계가 문서에 명확히 기록된다
stop_condition: 검증 문서와 게이트 판정이 작성되면 종료
deliverables:
  - QA 판정 문서
  - 잔여 리스크 목록
blocking_issues:
  - 벡터 지도/차선 형상은 현재 지도 스택 한계가 큼
qa_focus:
  - 벡터 지도/차선 레벨 미구현 한계 고지
  - 실제값 미표시 구간의 사용자 이해 가능성
loop_reason: none
next_action: 개선 아이디어 문서와 함께 사용자 검토용 산출물을 정리한다
next_prompt: |
  <idea-agent-ko>
  현재 stage: idea_review
  목표: 실제 기반 내비 개선에서 남은 구조 한계와 다음 실험안을 정리한다.
  입력 산출물: docs/qa-gate-2026-04-13-real-navigation.md, docs/known-limitations.md
  반드시 할 일: 벡터 지도/차선 레벨과 우선순위 음성 큐에 대한 개선 아이디어를 문서화하라.
  완료 후 HANDOFF_PACKET으로 다음 단계에 넘겨라.
[/HANDOFF_PACKET]
