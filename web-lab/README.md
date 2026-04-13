# Web Lab

브라우저에서 `TMAP API + 선호 도로 로직`을 검증하는 보조 도구입니다.

## 실행

`.env.local`에 `TMAP_APP_KEY`를 넣거나, 실행 시 환경변수로 넘깁니다.

```bash
python3 scripts/tmap_web_proxy.py
```

또는

```bash
TMAP_APP_KEY=your_app_key python3 scripts/tmap_web_proxy.py
```

기본 주소:

```text
http://127.0.0.1:4173
```

같은 네트워크의 안드로이드 폰에서 접속하려면 Mac/리눅스 머신의 IP로 접속합니다.

예:

```text
http://192.168.0.10:4173
```

안드로이드 폰에서 `http://<PC_IP>:4173`로 접속한 경우 브라우저 보안 정책 때문에 `현재 위치로 시작`이 막힐 수 있습니다. 이 경우 웹 랩의 `지도에서 출발지 선택` 버튼으로 시작점을 직접 찍어야 합니다.

## 용도

- POI 검색
- 경로 요청
- `nearToRoad`
- `matchToRoads`
- 선호 도로 중심선 기준 거리 확인

## 제한

- iOS SwiftUI 앱 자체를 실행하는 것이 아니라, API와 핵심 로직을 웹에서 재현하는 검증 도구입니다.
- TMAP `appKey`는 브라우저에 노출하지 않도록 프록시가 필요합니다.
- `navigator.geolocation`은 일반적으로 `https` 또는 `localhost` 같은 secure context에서만 안정적으로 동작합니다.
