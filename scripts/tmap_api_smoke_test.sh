#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "${ROOT_DIR}/.env.local" ]]; then
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env.local"
fi

if [[ -z "${TMAP_APP_KEY:-}" ]]; then
  echo "TMAP_APP_KEY is required"
  exit 1
fi

BASE_URL="https://apis.openapi.sk.com"
SEARCH_KEYWORD="${SEARCH_KEYWORD:-서울역}"
START_X="${START_X:-127.0276}"
START_Y="${START_Y:-37.4979}"
END_X="${END_X:-126.9707}"
END_Y="${END_Y:-37.5547}"
TRACE_COORDS="${TRACE_COORDS:-127.0276,37.4979|127.0300,37.5000|127.0330,37.5030|127.0360,37.5060}"

echo ""
echo "[1/5] POI search"
curl -sS -G "${BASE_URL}/tmap/pois" \
  -H "Accept: application/json" \
  -H "appKey: ${TMAP_APP_KEY}" \
  --data-urlencode "version=1" \
  --data-urlencode "searchKeyword=${SEARCH_KEYWORD}" \
  --data-urlencode "searchType=all" \
  --data-urlencode "count=5" \
  --data-urlencode "reqCoordType=WGS84GEO" \
  --data-urlencode "resCoordType=WGS84GEO" \
  | head -c 800 && echo ""

echo ""
echo "[2/5] Route"
curl -sS "${BASE_URL}/tmap/routes?version=1&format=json" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "appKey: ${TMAP_APP_KEY}" \
  --data @- <<EOF
{
  "endRpFlag": "G",
  "reqCoordType": "WGS84GEO",
  "carType": 0,
  "detailPosFlag": "2",
  "resCoordType": "WGS84GEO",
  "sort": "index",
  "startX": ${START_X},
  "startY": ${START_Y},
  "endX": ${END_X},
  "endY": ${END_Y},
  "searchOption": "0"
}
EOF
echo ""

echo ""
echo "[3/5] Route Sequential"
curl -sS "${BASE_URL}/tmap/routes/routeSequential30?version=1&format=json" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "appKey: ${TMAP_APP_KEY}" \
  --data @- <<EOF
{
  "reqCoordType": "WGS84GEO",
  "resCoordType": "WGS84GEO",
  "startName": "출발",
  "startX": "${START_X}",
  "startY": "${START_Y}",
  "startTime": "$(date +%Y%m%d%H%M)",
  "endName": "도착",
  "endX": "${END_X}",
  "endY": "${END_Y}",
  "endPoiId": "",
  "searchOption": "0",
  "carType": "4",
  "viaPoints": [
    {
      "viaPointId": "via-1",
      "viaPointName": "경유지",
      "viaX": "127.1230949776",
      "viaY": "37.4329311337",
      "viaPoiId": "",
      "viaTime": "0"
    }
  ]
}
EOF
echo ""

echo ""
echo "[4/5] nearToRoad"
curl -sS -G "${BASE_URL}/tmap/road/nearToRoad" \
  -H "Accept: application/json" \
  -H "appKey: ${TMAP_APP_KEY}" \
  --data-urlencode "version=1" \
  --data-urlencode "lat=${START_Y}" \
  --data-urlencode "lon=${START_X}" \
  --data-urlencode "radius=80" \
  --data-urlencode "vehicleType=5"
echo ""

echo ""
echo "[5/5] matchToRoads"
curl -sS "${BASE_URL}/tmap/road/matchToRoads?version=1" \
  -H "Accept: application/json" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "appKey: ${TMAP_APP_KEY}" \
  --data-urlencode "responseType=1" \
  --data-urlencode "coords=${TRACE_COORDS}"
echo ""
