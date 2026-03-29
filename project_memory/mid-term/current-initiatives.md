# Current Initiatives

## T맵 클론 iOS 앱 완성도 향상

### 목표
- iOS 26 / iPhone 16 Pro 기준 T맵 UI/UX 완전 재현
- Apple MapKit 기반으로 실시간 교통 정보 및 경로 안내 구현

### 진행 중인 개선 사항
1. **경로 안내 음성**: AVSpeechSynthesizer로 한국어 TTS 구현
2. **대중교통 모드**: MKDirectionsTransportType.transit 기반 경로 제공
3. **과속카메라 데이터**: 공공데이터포털 API 연동
4. **실시간 교통**: MapKit showsTraffic 활용 + 자체 교통 오버레이
5. **즐겨찾기 저장**: UserDefaults 또는 SwiftData 영속화

### 기술 스택
- SwiftUI + MapKit (iOS 26)
- CoreLocation (실시간 위치/속도)
- MKDirections (경로 계산)
- MKLocalSearch (장소 검색)
- AVFoundation (음성 안내)
