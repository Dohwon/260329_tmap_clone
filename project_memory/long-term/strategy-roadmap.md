# Strategy Roadmap

## 260329_tmap_clone — 장기 방향

### Phase 1 (현재): MVP 완성
- [x] 기본 지도 화면 (MapKit + 실시간 교통)
- [x] 목적지 검색 (MKLocalSearch)
- [x] 자동차 경로 안내 (MKDirections)
- [x] 즐겨찾기, 더보기 탭
- [ ] 음성 안내 (AVSpeechSynthesizer)

### Phase 2: 서비스 확장
- 대중교통 경로 (버스/지하철 환승 포함)
- 도보/자전거 모드
- 과속 카메라 실시간 알림 (공공데이터포털 API)
- 블랙스팟 경고

### Phase 3: 고도화
- 백그라운드 경로 안내 (CLLocationManager background mode)
- CarPlay 지원
- WidgetKit (홈화면 위젯 — 현재 교통상황, 출근 시간 예측)
- 운전 습관 분석 (CoreMotion)
