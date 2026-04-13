const highways = [
  {
    id: "1",
    name: "경부고속도로",
    shortName: "경부",
    routeNumber: "1",
    start: [37.4867, 127.024],
    end: [35.1796, 129.0747],
    centerline: [
      [37.3348, 127.1025],
      [36.8151, 127.1139],
      [36.3504, 127.3845],
      [35.8714, 128.6014],
      [35.5384, 129.3114],
    ],
  },
  {
    id: "15",
    name: "서해안고속도로",
    shortName: "서해안",
    routeNumber: "15",
    start: [37.3894, 126.8717],
    end: [34.8118, 126.3922],
    centerline: [
      [36.9921, 126.926],
      [36.7845, 126.4503],
      [35.9677, 126.7369],
      [35.16, 126.854],
    ],
  },
  {
    id: "50",
    name: "영동고속도로",
    shortName: "영동",
    routeNumber: "50",
    start: [37.4563, 126.7052],
    end: [37.7519, 128.8761],
    centerline: [
      [37.2636, 127.0286],
      [37.3422, 127.9202],
      [37.4919, 128.2147],
      [37.6109, 128.725],
    ],
  },
  {
    id: "35",
    name: "중부고속도로",
    shortName: "중부",
    routeNumber: "35",
    start: [37.4891, 127.0512],
    end: [36.3204, 127.4128],
    centerline: [
      [37.5393, 127.2148],
      [37.0075, 127.279],
      [36.8554, 127.4356],
    ],
  },
];

const state = {
  selectedDestination: null,
  routes: [],
  map: null,
  overlays: [],
  routeLayers: [],
  startMarker: null,
  destinationMarker: null,
  guidanceMarker: null,
  guidancePositionMarker: null,
  guidanceProgressLine: null,
  selectionMode: null,
  selectedRouteId: null,
  guidanceRouteId: null,
  guidanceStepIndex: 0,
  guidanceCompleted: false,
  simulationTimer: null,
  simulationRunning: false,
  watchId: null,
  trackingEnabled: false,
};

const els = {
  startLat: document.getElementById("startLat"),
  startLon: document.getElementById("startLon"),
  endLat: document.getElementById("endLat"),
  endLon: document.getElementById("endLon"),
  useCurrentLocationButton: document.getElementById("useCurrentLocationButton"),
  pickStartButton: document.getElementById("pickStartButton"),
  pickEndButton: document.getElementById("pickEndButton"),
  selectionStatus: document.getElementById("selectionStatus"),
  searchKeyword: document.getElementById("searchKeyword"),
  searchButton: document.getElementById("searchButton"),
  searchResults: document.getElementById("searchResults"),
  highwaySelect: document.getElementById("highwaySelect"),
  preferHighway: document.getElementById("preferHighway"),
  allowNarrowRoad: document.getElementById("allowNarrowRoad"),
  preferMountainRoad: document.getElementById("preferMountainRoad"),
  routeButton: document.getElementById("routeButton"),
  sampleTraceButton: document.getElementById("sampleTraceButton"),
  nearRoadButton: document.getElementById("nearRoadButton"),
  matchRoadsButton: document.getElementById("matchRoadsButton"),
  traceCoords: document.getElementById("traceCoords"),
  adherenceSummary: document.getElementById("adherenceSummary"),
  routeCards: document.getElementById("routeCards"),
  guidancePanel: document.getElementById("guidancePanel"),
  guidanceTitle: document.getElementById("guidanceTitle"),
  guidanceBadge: document.getElementById("guidanceBadge"),
  guidanceSummary: document.getElementById("guidanceSummary"),
  guidanceProgressLabel: document.getElementById("guidanceProgressLabel"),
  guidanceRemainingDistance: document.getElementById("guidanceRemainingDistance"),
  guidanceRemainingEta: document.getElementById("guidanceRemainingEta"),
  guidanceProgressFill: document.getElementById("guidanceProgressFill"),
  guidanceInstruction: document.getElementById("guidanceInstruction"),
  guidanceStepList: document.getElementById("guidanceStepList"),
  startGuidanceButton: document.getElementById("startGuidanceButton"),
  refreshGuidanceButton: document.getElementById("refreshGuidanceButton"),
  nextGuidanceButton: document.getElementById("nextGuidanceButton"),
  autoGuidanceButton: document.getElementById("autoGuidanceButton"),
  liveTrackingButton: document.getElementById("liveTrackingButton"),
  stopGuidanceButton: document.getElementById("stopGuidanceButton"),
  centerOriginButton: document.getElementById("centerOriginButton"),
  fitRouteButton: document.getElementById("fitRouteButton"),
  rerouteButton: document.getElementById("rerouteButton"),
  roadStatePill: document.getElementById("roadStatePill"),
  serviceModePill: document.getElementById("serviceModePill"),
  tripEtaLabel: document.getElementById("tripEtaLabel"),
  tripDistanceLabel: document.getElementById("tripDistanceLabel"),
  tripInstructionMini: document.getElementById("tripInstructionMini"),
  logOutput: document.getElementById("logOutput"),
  mapHint: document.getElementById("mapHint"),
};

init();

function init() {
  initMap();
  initHighwayOptions();
  bindEvents();
  drawStartMarker();
  drawDestinationMarker();
  renderHighway();
  renderGuidancePanel();
  requestBrowserLocation({ silent: true });
}

function initMap() {
  state.map = L.map("map").setView([37.4979, 127.0276], 11);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  }).addTo(state.map);
  state.map.on("click", handleMapClick);
}

function initHighwayOptions() {
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "선호 도로 없음";
  els.highwaySelect.append(empty);

  highways.forEach((highway) => {
    const option = document.createElement("option");
    option.value = highway.id;
    option.textContent = `${highway.routeNumber} ${highway.shortName}`;
    els.highwaySelect.append(option);
  });
}

function bindEvents() {
  els.useCurrentLocationButton.addEventListener("click", () => requestBrowserLocation({ silent: false }));
  els.pickStartButton.addEventListener("click", () => setSelectionMode("start"));
  els.pickEndButton.addEventListener("click", () => setSelectionMode("end"));
  els.searchButton.addEventListener("click", searchPois);
  els.routeButton.addEventListener("click", requestRoutes);
  els.nearRoadButton.addEventListener("click", checkNearRoad);
  els.matchRoadsButton.addEventListener("click", checkMatchedRoads);
  els.sampleTraceButton.addEventListener("click", generateSampleTrace);
  els.highwaySelect.addEventListener("change", renderHighway);
  els.startGuidanceButton.addEventListener("click", startGuidance);
  els.refreshGuidanceButton.addEventListener("click", syncGuidanceToOrigin);
  els.nextGuidanceButton.addEventListener("click", () => advanceGuidanceStep({ source: "manual" }));
  els.autoGuidanceButton.addEventListener("click", toggleAutoGuidance);
  els.liveTrackingButton.addEventListener("click", toggleLiveTracking);
  els.stopGuidanceButton.addEventListener("click", stopGuidance);
  els.centerOriginButton.addEventListener("click", centerOnOrigin);
  els.fitRouteButton.addEventListener("click", fitSelectedRoute);
  els.rerouteButton.addEventListener("click", requestRoutes);
  [els.startLat, els.startLon].forEach((input) => input.addEventListener("change", () => {
    drawStartMarker();
    updateSelectionStatus("출발 좌표를 직접 수정했습니다.", "active");
  }));
  [els.endLat, els.endLon].forEach((input) => input.addEventListener("change", () => {
    state.selectedDestination = null;
    drawDestinationMarker();
    updateSelectionStatus("도착 좌표를 직접 수정했습니다.", "active");
  }));
}

function selectedHighway() {
  return highways.find((item) => item.id === els.highwaySelect.value) || null;
}

function currentOrigin() {
  return {
    lat: parseCoordinateValue(els.startLat.value),
    lon: parseCoordinateValue(els.startLon.value),
  };
}

function currentDestination() {
  if (state.selectedDestination) {
    return {
      lat: state.selectedDestination.lat,
      lon: state.selectedDestination.lon,
      name: state.selectedDestination.name,
    };
  }

  return {
    lat: parseCoordinateValue(els.endLat.value),
    lon: parseCoordinateValue(els.endLon.value),
    name: "직접 입력 도착지",
  };
}

async function searchPois() {
  const query = els.searchKeyword.value.trim();
  if (!query) return;

  log(`SEARCH`, `query=${query}`);
  const result = await apiGet("/api/pois", {
    version: "1",
    searchKeyword: query,
    searchType: "all",
    count: "8",
    reqCoordType: "WGS84GEO",
    resCoordType: "WGS84GEO",
  });

  const pois = result?.searchPoiInfo?.pois?.poi || [];
  const normalized = Array.isArray(pois) ? pois : [pois];
  els.searchResults.innerHTML = "";

  normalized.filter(Boolean).forEach((poi) => {
    const lat = Number(poi.frontLat || poi.noorLat || poi.centerLat);
    const lon = Number(poi.frontLon || poi.noorLon || poi.centerLon);
    const item = document.createElement("div");
    item.className = "poi-item";
    item.innerHTML = `
      <strong>${stripHtml(poi.name || "알 수 없음")}</strong>
      <div>${[poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName, poi.roadName].filter(Boolean).join(" ")}</div>
      <button type="button">도착지로 선택</button>
    `;
    item.querySelector("button").addEventListener("click", () => {
      state.selectedDestination = {
        name: stripHtml(poi.name || "알 수 없음"),
        lat,
        lon,
      };
      els.endLat.value = String(lat);
      els.endLon.value = String(lon);
      log("SEARCH", `destination=${state.selectedDestination.name}`);
      drawDestinationMarker();
      fitMapToPoints([currentOrigin(), currentDestination()]);
      updateSelectionStatus(`도착지를 ${state.selectedDestination.name}(으)로 설정했습니다.`, "active");
    });
    els.searchResults.append(item);
  });
}

async function requestRoutes() {
  const origin = requirePoint(currentOrigin(), "출발지");
  const destination = requirePoint(currentDestination(), "도착지");
  if (!origin || !destination) return;
  const highway = selectedHighway();
  const routeRequests = buildRouteRequests(origin, destination, highway);

  setSimulationRunning(false);
  setLiveTracking(false);
  state.guidanceRouteId = null;
  state.guidanceStepIndex = 0;
  state.guidanceCompleted = false;
  clearOverlays();
  renderHighway();
  drawStartMarker();
  drawDestinationMarker();
  els.routeCards.innerHTML = "";
  updateSelectionStatus(`경로를 계산하는 중입니다. 출발 ${origin.lat.toFixed(5)},${origin.lon.toFixed(5)}`, "active");
  const results = await Promise.all(
    routeRequests.map(async (candidate) => {
      try {
        const response = candidate.viaPoints?.length
          ? await apiPost("/api/routes-sequential", candidate.body)
          : await apiPost("/api/routes", candidate.body);
        return parseRouteResponse(response, candidate);
      } catch (error) {
        log("ROUTE", `${candidate.title} failed: ${error.message}`);
        return null;
      }
    })
  );

  state.routes = results.filter(Boolean);
  if (!state.routes.length) {
    stopGuidance({ silent: true });
    updateSelectionStatus("경로를 찾지 못했습니다. 출발지와 도착지를 다시 확인하세요.", "error");
    return;
  }
  renderRoutes();
  updateSelectionStatus(`${state.routes.length}개 경로를 계산했습니다.`, "active");
}

async function checkNearRoad() {
  const origin = requirePoint(currentOrigin(), "출발지");
  if (!origin) return;
  const { lat, lon } = origin;
  const response = await apiGet("/api/near-road", {
    version: "1",
    lat: String(lat),
    lon: String(lon),
    radius: "80",
    vehicleType: "5",
    opt: "0",
  });
  const header = response?.resultData?.header || {};
  els.adherenceSummary.textContent = `nearToRoad: ${header.roadName || "-"} / roadCategory=${header.roadCategory ?? "-"} / linkId=${header.linkId || "-"}`;
  log("ROAD", els.adherenceSummary.textContent);
}

async function checkMatchedRoads() {
  const coords = els.traceCoords.value.trim();
  if (!coords) return;

  const response = await apiPost("/api/match-roads", { coords });
  const points = response?.resultData?.matchedPoints || [];
  const highway = selectedHighway();
  const averageDistance = highway ? computeAverageDistance(points, highway) : null;
  els.adherenceSummary.textContent = averageDistance == null
    ? `matchToRoads: matchedPoints=${points.length}`
    : `matchToRoads: matchedPoints=${points.length}, preferredDistance≈${averageDistance.toFixed(0)}m`;
  log("ROAD", els.adherenceSummary.textContent);
  drawMatchedPoints(points);
}

function generateSampleTrace() {
  const highway = selectedHighway();
  if (!highway) {
    els.traceCoords.value = `${els.startLon.value},${els.startLat.value}|${els.endLon.value},${els.endLat.value}`;
    updateSelectionStatus("출발지와 도착지 기준 샘플 점열을 만들었습니다.", "active");
    return;
  }

  const trace = highway.centerline.slice(0, 4).map(([lat, lon]) => `${lon},${lat}`);
  els.traceCoords.value = trace.join("|");
  updateSelectionStatus(`${highway.shortName} 기준 샘플 점열을 만들었습니다.`, "active");
}

function buildRouteRequests(origin, destination, highway) {
  const routeBase = {
    endRpFlag: "G",
    reqCoordType: "WGS84GEO",
    carType: 0,
    detailPosFlag: "2",
    resCoordType: "WGS84GEO",
    sort: "index",
    startX: origin.lon,
    startY: origin.lat,
    endX: destination.lon,
    endY: destination.lat,
  };

  const candidates = [];
  if (highway) {
    const corridor = buildCorridorWaypoints(origin, destination, highway);
    candidates.push({
      title: `${highway.shortName} 우선`,
      strategy: "preferredRoad",
      preferredRoadLabel: `${highway.routeNumber} ${highway.shortName}`,
      body: {
        reqCoordType: "WGS84GEO",
        resCoordType: "WGS84GEO",
        startName: "출발",
        startX: String(origin.lon),
        startY: String(origin.lat),
        startTime: makeStartTime(),
        endName: destination.name,
        endX: String(destination.lon),
        endY: String(destination.lat),
        endPoiId: "",
        searchOption: "0",
        carType: "4",
        viaPoints: corridor,
      },
      viaPoints: corridor,
    });
  }

  candidates.push(
    { title: "균형 추천", strategy: "recommended", body: { ...routeBase, searchOption: "0" } },
    { title: "무료 우선", strategy: "free", body: { ...routeBase, searchOption: "1" } },
    { title: "빠른길", strategy: "fastest", body: { ...routeBase, searchOption: "2" } },
    { title: "쉬운길", strategy: "easy", body: { ...routeBase, searchOption: "3" } },
  );

  return candidates;
}

function buildCorridorWaypoints(origin, destination, highway) {
  const points = [highway.start, ...highway.centerline.map(([lat, lon]) => ({ latitude: lat, longitude: lon })), highway.end];
  const entry = closestPoint(origin, points);
  const exit = closestPoint(destination, points);
  if (samePoint(entry, exit)) {
    const mid = points[Math.floor(points.length / 2)];
    return [makeViaPoint(0, `${highway.shortName} 진입축`, mid)];
  }
  return [
    makeViaPoint(0, `${highway.shortName} 진입`, entry),
    makeViaPoint(1, `${highway.shortName} 이탈`, exit),
  ];
}

function makeViaPoint(index, name, point) {
  return {
    viaPointId: `via-${index}`,
    viaPointName: name,
    viaX: String(point.longitude ?? point.lon ?? point[1]),
    viaY: String(point.latitude ?? point.lat ?? point[0]),
    viaPoiId: "",
    viaTime: "0",
  };
}

function parseRouteResponse(response, candidate) {
  const features = response?.features || [];
  const coordinates = [];
  let totalDistance = Number(response?.properties?.totalDistance || 0);
  let totalTime = Number(response?.properties?.totalTime || 0);

  features.forEach((feature) => {
    if (!totalDistance && feature.properties?.totalDistance) {
      totalDistance = Number(feature.properties.totalDistance) || 0;
      totalTime = Number(feature.properties.totalTime) || 0;
    }
    if (feature.geometry?.type === "LineString") {
      feature.geometry.coordinates.forEach((pair) => {
        coordinates.push([pair[1], pair[0]]);
      });
    }
  });

  if (!coordinates.length) return null;
  const steps = parseRouteSteps(features);
  const guidanceMeta = buildGuidanceMeta(coordinates, steps, totalDistance, totalTime);
  return {
    ...candidate,
    routeId: `${candidate.strategy}-${Math.random().toString(36).slice(2, 8)}`,
    coordinates,
    distance: totalDistance,
    eta: totalTime,
    etaLabel: formatArrivalTime(totalTime),
    steps,
    guidanceMeta,
  };
}

function renderRoutes() {
  clearOverlays();
  renderHighway();
  drawStartMarker();
  drawDestinationMarker();
  els.routeCards.innerHTML = "";
  state.routeLayers = [];

  if (!state.routes.length) {
    state.selectedRouteId = null;
    renderGuidancePanel();
    return;
  }

  if (!state.routes.some((route) => route.routeId === state.selectedRouteId)) {
    state.selectedRouteId = state.routes[0].routeId;
  }

  state.routes.forEach((route, index) => {
    const color = routeColor(route, index);
    const polyline = L.polyline(route.coordinates, {
      color,
      weight: 5,
      opacity: 0.38,
    }).addTo(state.map);
    state.overlays.push(polyline);

    const card = document.createElement("div");
    card.className = `route-card ${index === 0 ? "recommended" : ""}`;
    card.innerHTML = `
      ${index === 0 ? '<span class="pill">추천</span>' : ""}
      <strong>${route.title}</strong>
      <div>${formatDistance(route.distance)} · ${formatDuration(route.eta)}</div>
      <div class="muted">${route.preferredRoadLabel || route.strategy} · 도착 ${route.etaLabel}</div>
      <div class="muted">안내 ${route.steps.length || 0}단계</div>
    `;
    card.addEventListener("click", () => selectRoute(route.routeId, { fitBounds: true }));
    polyline.on("click", () => selectRoute(route.routeId, { fitBounds: false }));
    els.routeCards.append(card);
    state.routeLayers.push({ route, polyline, card, color, index });
  });

  const bounds = L.featureGroup(state.overlays).getBounds();
  state.map.fitBounds(bounds, { padding: [30, 30] });
  selectRoute(state.selectedRouteId, { fitBounds: false });
  log("ROUTE", `rendered routes=${state.routes.length}`);
}

function renderHighway() {
  const highway = selectedHighway();
  if (!highway) return;
  const points = [highway.start, ...highway.centerline, highway.end].map(normalizeLatLng);
  const polyline = L.polyline(points, { color: "#0d9b56", weight: 4, dashArray: "10 10", opacity: 0.9 }).addTo(state.map);
  state.overlays.push(polyline);
}

function drawStartMarker() {
  if (state.startMarker) {
    state.map.removeLayer(state.startMarker);
    state.startMarker = null;
  }
  const origin = currentOrigin();
  if (!isValidPoint(origin)) return;
  state.startMarker = L.marker([origin.lat, origin.lon]).addTo(state.map).bindPopup("출발지");
}

function drawDestinationMarker() {
  if (state.destinationMarker) {
    state.map.removeLayer(state.destinationMarker);
    state.destinationMarker = null;
  }
  const destination = currentDestination();
  if (!isValidPoint(destination)) return;
  state.destinationMarker = L.marker([destination.lat, destination.lon]).addTo(state.map).bindPopup(destination.name);
}

function drawGuidanceMarker(step, title) {
  if (state.guidanceMarker) {
    state.map.removeLayer(state.guidanceMarker);
    state.guidanceMarker = null;
  }
  if (!step || !isValidPoint(step.coordinate)) return;

  state.guidanceMarker = L.circleMarker([step.coordinate.lat, step.coordinate.lon], {
    radius: 8,
    color: "#111827",
    fillColor: "#0e8a74",
    fillOpacity: 0.92,
    weight: 3,
  }).addTo(state.map);
  state.guidanceMarker.bindPopup(title || step.description);
}

function clearGuidanceMapLayers() {
  ["guidanceMarker", "guidancePositionMarker", "guidanceProgressLine"].forEach((key) => {
    if (state[key]) {
      state.map.removeLayer(state[key]);
      state[key] = null;
    }
  });
}

function drawGuidanceProgress(route, snapshot, { panToCurrent = false } = {}) {
  if (state.guidancePositionMarker) {
    state.map.removeLayer(state.guidancePositionMarker);
    state.guidancePositionMarker = null;
  }
  if (state.guidanceProgressLine) {
    state.map.removeLayer(state.guidanceProgressLine);
    state.guidanceProgressLine = null;
  }
  if (!route || !snapshot?.location) return;

  const traveledCoordinates = route.coordinates.slice(0, snapshot.coordinateIndex + 1);
  if (traveledCoordinates.length >= 2) {
    state.guidanceProgressLine = L.polyline(traveledCoordinates, {
      color: "#111827",
      weight: 7,
      opacity: 0.9,
      lineCap: "round",
    }).addTo(state.map);
  }

  state.guidancePositionMarker = L.circleMarker([snapshot.location.lat, snapshot.location.lon], {
    radius: 9,
    color: "#ffffff",
    fillColor: "#1f2a2a",
    fillOpacity: 0.95,
    weight: 3,
  }).addTo(state.map);
  state.guidancePositionMarker.bindPopup(`현재 위치 · ${Math.round(snapshot.ratio * 100)}%`);

  if (panToCurrent) {
    state.map.panTo([snapshot.location.lat, snapshot.location.lon], { animate: true, duration: 0.4 });
  }
}

function drawMatchedPoints(points) {
  points.forEach((point) => {
    const matched = point.matchedLocation;
    if (!matched) return;
    const marker = L.circleMarker([Number(matched.latitude), Number(matched.longitude)], {
      radius: 4,
      color: "#111827",
      fillColor: "#111827",
      fillOpacity: 0.8,
    }).addTo(state.map);
    state.overlays.push(marker);
  });
}

function clearOverlays() {
  state.overlays.forEach((overlay) => state.map.removeLayer(overlay));
  state.overlays = [];
  state.routeLayers = [];
  clearGuidanceMapLayers();
}

function selectRoute(routeId, { fitBounds }) {
  const entry = state.routeLayers.find((item) => item.route.routeId === routeId);
  if (!entry) return;

  state.selectedRouteId = routeId;
  if (state.guidanceRouteId && state.guidanceRouteId !== routeId) {
    setSimulationRunning(false);
    state.guidanceRouteId = null;
    state.guidanceStepIndex = 0;
  }
  state.routeLayers.forEach((item) => {
    const isSelected = item.route.routeId === routeId;
    item.polyline.setStyle({
      color: item.color,
      weight: isSelected ? 8 : item.route.strategy === "preferredRoad" ? 6 : 4,
      opacity: isSelected ? 0.95 : 0.28,
    });
    item.card.classList.toggle("selected", isSelected);
  });

  if (fitBounds) {
    state.map.fitBounds(entry.polyline.getBounds(), { padding: [30, 30] });
  }

  renderGuidancePanel();
  updateMapHud();
  updateSelectionStatus(`선택 경로: ${entry.route.title} · ${formatDistance(entry.route.distance)} · ${formatDuration(entry.route.eta)}`, "active");
  log("ROUTE", `selected=${entry.route.title}`);
}

function routeColor(route, index) {
  if (route.strategy === "preferredRoad") return "#0d9b56";
  if (route.strategy === "fastest") return "#3b7ddd";
  if (route.strategy === "easy") return "#c76b29";
  if (route.strategy === "free") return "#7a5af8";
  return index === 0 ? "#0e8a74" : "#5f6b7a";
}

function parseRouteSteps(features) {
  return features
    .filter((feature) => feature.geometry?.type === "Point" && feature.properties?.description)
    .map((feature) => ({
      description: feature.properties.description,
      pointType: feature.properties.pointType || "N",
      name: feature.properties.name || "",
      coordinate: {
        lat: Number(feature.geometry.coordinates?.[1]),
        lon: Number(feature.geometry.coordinates?.[0]),
      },
    }))
    .filter((step) => isValidPoint(step.coordinate));
}

function selectedRoute() {
  return state.routes.find((route) => route.routeId === state.selectedRouteId) || null;
}

function guidanceRoute() {
  return state.routes.find((route) => route.routeId === state.guidanceRouteId) || null;
}

function startGuidance() {
  const route = selectedRoute();
  if (!route) {
    updateSelectionStatus("먼저 안내할 경로를 선택하세요.", "error");
    return;
  }

  setSimulationRunning(false);
  setLiveTracking(false);
  state.guidanceRouteId = route.routeId;
  state.guidanceStepIndex = 0;
  state.guidanceCompleted = false;
  renderGuidancePanel({ panToCurrent: true });
  updateMapHud();
  updateSelectionStatus(`${route.title} 경로로 안내를 시작했습니다.`, "active");
  log("GUIDE", `start=${route.title}`);
}

function stopGuidance({ silent = false } = {}) {
  const route = guidanceRoute();
  setSimulationRunning(false);
  setLiveTracking(false);
  state.guidanceRouteId = null;
  state.guidanceStepIndex = 0;
  state.guidanceCompleted = false;
  renderGuidancePanel();
  updateMapHud();
  if (!silent && route) {
    updateSelectionStatus(`${route.title} 안내를 종료했습니다.`, "active");
    log("GUIDE", `stop=${route.title}`);
  }
}

function advanceGuidanceStep({ source = "manual" } = {}) {
  const route = guidanceRoute();
  if (!route) {
    updateSelectionStatus("안내 중인 경로가 없습니다.", "error");
    return;
  }
  if (!route.steps.length) {
    updateSelectionStatus("이 경로에는 안내 지점이 없습니다.", "error");
    return;
  }

  if (state.guidanceCompleted) {
    updateSelectionStatus("이미 도착 처리된 경로입니다. 다시 시작하려면 안내 시작을 누르세요.", "active");
    return;
  }

  if (state.guidanceStepIndex >= route.steps.length - 1) {
    state.guidanceCompleted = true;
    setSimulationRunning(false);
    renderGuidancePanel({ panToCurrent: true });
    updateSelectionStatus(`${route.title} 경로 도착 테스트를 완료했습니다.`, "active");
    log("GUIDE", `arrived=${route.title}`);
    return;
  }

  state.guidanceStepIndex = Math.min(state.guidanceStepIndex + 1, route.steps.length - 1);
  renderGuidancePanel({ panToCurrent: true });
  const step = route.steps[state.guidanceStepIndex];
  if (source === "manual") {
    updateSelectionStatus(`${route.title} · 단계 ${state.guidanceStepIndex + 1}/${route.steps.length}`, "active");
  }
  log("GUIDE", `step=${state.guidanceStepIndex} ${step.description}`);
}

function syncGuidanceToOrigin() {
  const route = guidanceRoute();
  if (!route) {
    updateSelectionStatus("먼저 경로 안내를 시작하세요.", "error");
    return;
  }
  const origin = requirePoint(currentOrigin(), "출발지");
  if (!origin || !route.steps.length) return;

  let bestIndex = 0;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  route.steps.forEach((step, index) => {
    const distance = haversine(origin.lat, origin.lon, step.coordinate.lat, step.coordinate.lon);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  state.guidanceStepIndex = bestIndex;
  state.guidanceCompleted = false;
  renderGuidancePanel({ panToCurrent: true });
  updateMapHud();
  updateSelectionStatus(`현재 위치 기준으로 안내를 ${Math.round(bestDistance)}m 근처 지점에 맞췄습니다.`, "active");
  log("GUIDE", `sync=${route.title} step=${bestIndex} distance=${Math.round(bestDistance)}`);
}

function renderGuidancePanel({ panToCurrent = false } = {}) {
  const selected = selectedRoute();
  const guiding = guidanceRoute();
  const activeRoute = guiding || selected;
  const isGuiding = Boolean(guiding);
  const isCompleted = isGuiding && state.guidanceCompleted;

  els.guidanceBadge.classList.toggle("hidden", !isGuiding);
  els.startGuidanceButton.disabled = !selected;
  els.refreshGuidanceButton.disabled = !isGuiding;
  els.nextGuidanceButton.disabled = !isGuiding;
  els.stopGuidanceButton.disabled = !isGuiding;
  els.autoGuidanceButton.disabled = !isGuiding || isCompleted;
  els.liveTrackingButton.disabled = !isGuiding;
  els.nextGuidanceButton.textContent = isCompleted ? "도착 완료됨" : "다음 안내";
  els.autoGuidanceButton.textContent = state.simulationRunning ? "자동 진행 중지" : "자동 진행";
  els.liveTrackingButton.textContent = state.trackingEnabled ? "실시간 추적 중지" : "실시간 추적";

  if (!activeRoute) {
    els.guidanceTitle.textContent = "안내 전";
    els.guidanceSummary.textContent = "경로를 하나 선택한 뒤 안내를 시작하세요.";
    els.guidanceProgressLabel.textContent = "0%";
    els.guidanceRemainingDistance.textContent = "-";
    els.guidanceRemainingEta.textContent = "-";
    els.guidanceProgressFill.style.width = "0%";
    els.guidanceInstruction.textContent = "다음 안내가 없습니다.";
    els.guidanceStepList.innerHTML = "";
    clearGuidanceMapLayers();
    updateMapHud();
    return;
  }

  const stepIndex = Math.min(state.guidanceStepIndex, Math.max(activeRoute.steps.length - 1, 0));
  const currentStep = activeRoute.steps[stepIndex];
  const snapshot = guidanceSnapshot(activeRoute, stepIndex, isCompleted);
  els.guidanceTitle.textContent = activeRoute.title;
  els.guidanceSummary.textContent = `${formatDistance(activeRoute.distance)} · ${formatDuration(activeRoute.eta)} · 도착 ${activeRoute.etaLabel} · ${isCompleted ? "도착 완료" : isGuiding ? `안내 단계 ${stepIndex + 1}/${Math.max(activeRoute.steps.length, 1)}` : "선택됨"}`;
  els.guidanceProgressLabel.textContent = `${Math.round(snapshot.ratio * 100)}%`;
  els.guidanceRemainingDistance.textContent = formatDistance(snapshot.remainingDistance);
  els.guidanceRemainingEta.textContent = formatDuration(snapshot.remainingEta);
  els.guidanceProgressFill.style.width = `${Math.max(0, Math.min(100, snapshot.ratio * 100))}%`;
  els.guidanceInstruction.textContent = isCompleted
    ? "도착했습니다. 이 상태로 도착 테스트를 확인할 수 있습니다."
    : currentStep
      ? currentStep.description
      : "안내 지점이 없어 요약만 표시합니다.";

  drawGuidanceProgress(activeRoute, snapshot, { panToCurrent: panToCurrent && isGuiding });
  drawGuidanceMarker(isCompleted ? null : currentStep, activeRoute.title);
  renderGuidanceSteps(activeRoute.steps, stepIndex, isCompleted);
  updateMapHud({ route: activeRoute, snapshot, currentStep, isGuiding, isCompleted });
}

function renderGuidanceSteps(steps, currentIndex, isCompleted) {
  if (!steps.length) {
    els.guidanceStepList.innerHTML = "";
    return;
  }

  const start = Math.max(0, currentIndex - 1);
  const end = Math.min(steps.length, start + 4);
  els.guidanceStepList.innerHTML = steps.slice(start, end).map((step, offset) => {
    const index = start + offset;
    const active = index === currentIndex && !isCompleted;
    const completed = isCompleted || index < currentIndex;
    const label = step.pointType === "E" ? "도착" : `단계 ${index + 1}`;
    return `<div class="guidance-step ${active ? "active" : ""} ${completed ? "completed" : ""}"><strong>${label}</strong><div>${step.description}</div></div>`;
  }).join("");
}

function handleMapClick(event) {
  if (!state.selectionMode) return;

  const { lat, lng } = event.latlng;
  if (state.selectionMode === "start") {
    els.startLat.value = lat.toFixed(6);
    els.startLon.value = lng.toFixed(6);
    drawStartMarker();
    updateSelectionStatus(`지도 탭으로 출발지를 설정했습니다. ${lat.toFixed(5)}, ${lng.toFixed(5)}`, "active");
    log("MAP", `start=${lat.toFixed(6)},${lng.toFixed(6)}`);
  } else {
    state.selectedDestination = null;
    els.endLat.value = lat.toFixed(6);
    els.endLon.value = lng.toFixed(6);
    drawDestinationMarker();
    updateSelectionStatus(`지도 탭으로 도착지를 설정했습니다. ${lat.toFixed(5)}, ${lng.toFixed(5)}`, "active");
    log("MAP", `destination=${lat.toFixed(6)},${lng.toFixed(6)}`);
  }

  setSelectionMode(null);
  fitMapToPoints([currentOrigin(), currentDestination()]);
}

function setSelectionMode(mode) {
  state.selectionMode = mode;
  els.mapHint.classList.toggle("hidden", !mode);
  if (!mode) {
    els.mapHint.textContent = "";
    return;
  }
  els.mapHint.textContent = mode === "start" ? "지도에서 출발지를 탭하세요." : "지도에서 도착지를 탭하세요.";
  updateSelectionStatus(mode === "start" ? "지도에서 출발지를 고르는 중입니다." : "지도에서 도착지를 고르는 중입니다.", "active");
}

function requestBrowserLocation({ silent }) {
  if (!navigator.geolocation) {
    if (!silent) {
      updateSelectionStatus("이 브라우저는 위치 정보를 지원하지 않습니다.", "error");
    }
    return;
  }

  updateSelectionStatus("현재 위치를 확인하는 중입니다.", "active");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      applyLivePosition(position.coords.latitude, position.coords.longitude, {
        pan: true,
        statusMessage: `현재 위치를 출발지로 설정했습니다. ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`,
      });
      log("LOCATION", `origin=${position.coords.latitude.toFixed(6)},${position.coords.longitude.toFixed(6)}`);
    },
    (error) => {
      log("LOCATION", `failed=${error.message}`);
      if (!silent) {
        updateSelectionStatus(`현재 위치를 가져오지 못했습니다. ${error.message}`, "error");
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 8000,
    }
  );
}

function toggleLiveTracking() {
  if (!guidanceRoute()) {
    updateSelectionStatus("먼저 경로 안내를 시작하세요.", "error");
    return;
  }
  setLiveTracking(!state.trackingEnabled);
}

function setLiveTracking(shouldTrack) {
  if (state.watchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
  state.trackingEnabled = false;

  if (!shouldTrack) {
    renderGuidancePanel();
    return;
  }
  if (!navigator.geolocation) {
    updateSelectionStatus("이 브라우저는 실시간 위치 추적을 지원하지 않습니다.", "error");
    renderGuidancePanel();
    return;
  }

  state.watchId = navigator.geolocation.watchPosition(
    (position) => {
      applyLivePosition(position.coords.latitude, position.coords.longitude, { pan: true, syncGuidance: true });
      log("TRACK", `origin=${position.coords.latitude.toFixed(6)},${position.coords.longitude.toFixed(6)}`);
    },
    (error) => {
      updateSelectionStatus(`실시간 위치 추적을 시작하지 못했습니다. ${error.message}`, "error");
      log("TRACK", `failed=${error.message}`);
      setLiveTracking(false);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    }
  );
  state.trackingEnabled = true;
  updateSelectionStatus("실시간 위치 추적을 시작했습니다.", "active");
  log("TRACK", "on");
  renderGuidancePanel();
}

function applyLivePosition(lat, lon, { pan = false, syncGuidance = false, statusMessage = null } = {}) {
  els.startLat.value = Number(lat).toFixed(6);
  els.startLon.value = Number(lon).toFixed(6);
  drawStartMarker();

  const route = guidanceRoute();
  if (syncGuidance && route?.steps?.length) {
    let bestIndex = 0;
    let bestDistance = Number.MAX_SAFE_INTEGER;
    route.steps.forEach((step, index) => {
      const distance = haversine(lat, lon, step.coordinate.lat, step.coordinate.lon);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    state.guidanceStepIndex = bestIndex;
    state.guidanceCompleted = false;
    renderGuidancePanel({ panToCurrent: pan });
    updateSelectionStatus(statusMessage || `실시간 위치 기준 단계 ${bestIndex + 1}/${route.steps.length}로 갱신했습니다.`, "active");
    return;
  }

  if (pan) {
    fitMapToPoints([currentOrigin(), currentDestination()]);
  }
  renderGuidancePanel({ panToCurrent: pan });
  if (statusMessage) {
    updateSelectionStatus(statusMessage, "active");
  }
}

function toggleAutoGuidance() {
  if (!guidanceRoute()) {
    updateSelectionStatus("먼저 경로 안내를 시작하세요.", "error");
    return;
  }
  if (state.guidanceCompleted) {
    updateSelectionStatus("도착 완료 상태입니다. 다시 시작한 뒤 자동 진행을 사용하세요.", "active");
    return;
  }
  setSimulationRunning(!state.simulationRunning);
}

function setSimulationRunning(shouldRun) {
  if (state.simulationTimer) {
    window.clearInterval(state.simulationTimer);
    state.simulationTimer = null;
  }
  state.simulationRunning = false;

  if (shouldRun) {
    const route = guidanceRoute();
    if (!route || state.guidanceCompleted) {
      renderGuidancePanel();
      return;
    }
    state.simulationRunning = true;
    state.simulationTimer = window.setInterval(() => {
      if (!guidanceRoute() || state.guidanceCompleted) {
        setSimulationRunning(false);
        return;
      }
      advanceGuidanceStep({ source: "simulation" });
    }, 1800);
    updateSelectionStatus("자동 진행 시뮬레이션을 시작했습니다.", "active");
    log("GUIDE", "auto=on");
  } else {
    if (state.simulationTimer) {
      window.clearInterval(state.simulationTimer);
      state.simulationTimer = null;
    }
    if (state.guidanceRouteId) {
      updateSelectionStatus("자동 진행 시뮬레이션을 멈췄습니다.", "active");
      log("GUIDE", "auto=off");
    }
  }

  renderGuidancePanel();
}

function guidanceSnapshot(route, stepIndex, isCompleted) {
  const meta = route.guidanceMeta || buildGuidanceMeta(route.coordinates, route.steps, route.distance, route.eta);
  const defaultLocation = route.coordinates[0] ? { lat: route.coordinates[0][0], lon: route.coordinates[0][1] } : null;
  if (!meta.pathLength) {
    return {
      ratio: isCompleted ? 1 : 0,
      traveledDistance: isCompleted ? meta.totalDistance : 0,
      remainingDistance: isCompleted ? 0 : meta.totalDistance,
      remainingEta: isCompleted ? 0 : route.eta,
      coordinateIndex: 0,
      location: defaultLocation,
    };
  }

  const boundedStepIndex = Math.max(0, Math.min(stepIndex, route.steps.length - 1));
  const coordinateIndex = isCompleted
    ? route.coordinates.length - 1
    : (meta.stepCoordinateIndices[boundedStepIndex] ?? 0);
  const pathDistance = meta.cumulativeDistances[coordinateIndex] || 0;
  const pathRatio = meta.pathLength > 0 ? pathDistance / meta.pathLength : 0;
  const ratio = isCompleted ? 1 : Math.max(0, Math.min(1, pathRatio));
  const traveledDistance = Math.round(meta.totalDistance * ratio);
  const remainingDistance = Math.max(0, meta.totalDistance - traveledDistance);
  const remainingEta = Math.max(0, Math.round((route.eta || meta.totalTime || 0) * (1 - ratio)));
  const coordinate = route.coordinates[coordinateIndex] || route.coordinates[0] || [Number.NaN, Number.NaN];
  return {
    ratio,
    traveledDistance,
    remainingDistance,
    remainingEta,
    coordinateIndex,
    location: { lat: coordinate[0], lon: coordinate[1] },
  };
}

function buildGuidanceMeta(coordinates, steps, apiDistance, apiEta) {
  const cumulativeDistances = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    const prev = coordinates[index - 1];
    const current = coordinates[index];
    cumulativeDistances[index] = cumulativeDistances[index - 1] + haversine(prev[0], prev[1], current[0], current[1]);
  }
  const pathLength = cumulativeDistances[cumulativeDistances.length - 1] || 0;
  const totalDistance = apiDistance > 0 ? apiDistance : pathLength;
  const totalTime = apiEta > 0 ? apiEta : 0;
  const stepCoordinateIndices = steps.map((step) => nearestCoordinateIndex(step.coordinate, coordinates));
  return { cumulativeDistances, pathLength, totalDistance, totalTime, stepCoordinateIndices };
}

function nearestCoordinateIndex(point, coordinates) {
  if (!isValidPoint(point) || !coordinates.length) return 0;
  let bestIndex = 0;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  coordinates.forEach((coordinate, index) => {
    const distance = haversine(point.lat, point.lon, coordinate[0], coordinate[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function fitMapToPoints(points) {
  const validPoints = points.filter(isValidPoint);
  if (!validPoints.length) return;
  if (validPoints.length === 1) {
    state.map.setView([validPoints[0].lat, validPoints[0].lon], 13);
    return;
  }
  const bounds = L.latLngBounds(validPoints.map((point) => [point.lat, point.lon]));
  state.map.fitBounds(bounds, { padding: [40, 40] });
}

function centerOnOrigin() {
  const origin = requirePoint(currentOrigin(), "출발지");
  if (!origin) return;
  state.map.setView([origin.lat, origin.lon], 14, { animate: true });
  updateSelectionStatus("출발지 중심으로 지도를 이동했습니다.", "active");
}

function fitSelectedRoute() {
  const route = selectedRoute();
  if (!route?.coordinates?.length) {
    fitMapToPoints([currentOrigin(), currentDestination()]);
    return;
  }
  const bounds = L.latLngBounds(route.coordinates.map((point) => [point[0], point[1]]));
  state.map.fitBounds(bounds, { padding: [40, 40] });
  updateSelectionStatus(`${route.title} 경로 전체를 화면에 맞췄습니다.`, "active");
}

function preferredRoadStatus(point, highway) {
  if (!point || !highway) {
    return { label: "선호 도로 없음", mode: "neutral" };
  }
  const path = [highway.start, ...highway.centerline, highway.end].map((candidate) => ({
    lat: candidate.latitude ?? candidate[0],
    lon: candidate.longitude ?? candidate[1],
  }));
  const distance = distanceToPath(point, path);
  if (distance <= 120) {
    return { label: `${highway.shortName} 유지 중`, mode: "good", detail: `${Math.round(distance)}m` };
  }
  if (distance <= 280) {
    return { label: `${highway.shortName} 접근 중`, mode: "watch", detail: `${Math.round(distance)}m` };
  }
  return { label: `${highway.shortName} 벗어남`, mode: "danger", detail: `${Math.round(distance)}m` };
}

function updateMapHud(context = {}) {
  const route = context.route || guidanceRoute() || selectedRoute();
  const snapshot = context.snapshot || (route ? guidanceSnapshot(route, state.guidanceStepIndex, Boolean(state.guidanceRouteId) && state.guidanceCompleted) : null);
  const currentStep = context.currentStep || (route && route.steps.length ? route.steps[Math.min(state.guidanceStepIndex, route.steps.length - 1)] : null);
  const roadStatus = preferredRoadStatus(snapshot?.location, selectedHighway());

  els.roadStatePill.textContent = roadStatus.detail ? `${roadStatus.label} · ${roadStatus.detail}` : roadStatus.label;
  els.roadStatePill.className = `chip ${roadStatus.mode}`;
  els.serviceModePill.textContent = context.isGuiding || guidanceRoute() ? "실주행 시뮬레이션" : route ? "경로 비교 중" : "Road-first navigation";

  if (!route) {
    els.tripEtaLabel.textContent = "도착 정보 없음";
    els.tripDistanceLabel.textContent = "경로를 선택하면 ETA와 잔여 거리를 표시합니다.";
    els.tripInstructionMini.textContent = "목적지와 선호 도로를 고르면 실제 안내 흐름을 테스트할 수 있습니다.";
    return;
  }

  const isCompleted = context.isCompleted ?? (Boolean(state.guidanceRouteId) && state.guidanceCompleted);
  els.tripEtaLabel.textContent = isCompleted ? "도착 완료" : `${route.etaLabel} 도착 예정`;
  els.tripDistanceLabel.textContent = snapshot
    ? `${formatDistance(snapshot.remainingDistance)} 남음 · ${formatDuration(snapshot.remainingEta)} 남음`
    : `${formatDistance(route.distance)} · ${formatDuration(route.eta)}`;
  els.tripInstructionMini.textContent = isCompleted
    ? "선택 경로의 도착 상태입니다. 다시 시작하거나 다른 경로를 비교할 수 있습니다."
    : currentStep?.description || `${route.title} 기준으로 경로와 선호 도로 상태를 검토 중입니다.`;
}

function requirePoint(point, label) {
  if (isValidPoint(point)) return point;
  updateSelectionStatus(`${label} 좌표가 비어 있거나 잘못됐습니다. 현재 위치 버튼이나 지도 선택을 사용하세요.`, "error");
  log("VALIDATION", `${label} invalid`);
  return null;
}

function isValidPoint(point) {
  return Number.isFinite(point?.lat)
    && Number.isFinite(point?.lon)
    && point.lat >= -90
    && point.lat <= 90
    && point.lon >= -180
    && point.lon <= 180;
}

function updateSelectionStatus(message, tone = "muted") {
  els.selectionStatus.textContent = message;
  els.selectionStatus.className = "summary";
  if (tone) {
    els.selectionStatus.classList.add(tone);
  }
}

function parseCoordinateValue(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return Number.NaN;
  return Number.parseFloat(trimmed);
}

function closestPoint(anchor, candidates) {
  return candidates.reduce((best, current) => {
    const bestDistance = haversine(anchor.lat ?? anchor.latitude, anchor.lon ?? anchor.longitude, best.latitude ?? best.lat ?? best[0], best.longitude ?? best.lon ?? best[1]);
    const currentDistance = haversine(anchor.lat ?? anchor.latitude, anchor.lon ?? anchor.longitude, current.latitude ?? current.lat ?? current[0], current.longitude ?? current.lon ?? current[1]);
    return currentDistance < bestDistance ? current : best;
  });
}

function samePoint(lhs, rhs) {
  const lhsLat = lhs.latitude ?? lhs.lat ?? lhs[0];
  const lhsLon = lhs.longitude ?? lhs.lon ?? lhs[1];
  const rhsLat = rhs.latitude ?? rhs.lat ?? rhs[0];
  const rhsLon = rhs.longitude ?? rhs.lon ?? rhs[1];
  return Math.abs(lhsLat - rhsLat) < 0.0001 && Math.abs(lhsLon - rhsLon) < 0.0001;
}

function computeAverageDistance(points, highway) {
  if (!points.length) return null;
  const path = [highway.start, ...highway.centerline, highway.end].map((point) => ({
    lat: point.latitude ?? point[0],
    lon: point.longitude ?? point[1],
  }));
  const values = points
    .map((point) => point.matchedLocation)
    .filter(Boolean)
    .map((matched) => distanceToPath({ lat: Number(matched.latitude), lon: Number(matched.longitude) }, path));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distanceToPath(point, path) {
  let best = Number.MAX_SAFE_INTEGER;
  for (let index = 0; index < path.length - 1; index += 1) {
    best = Math.min(best, distanceToSegment(point, path[index], path[index + 1]));
  }
  return best;
}

function distanceToSegment(p, a, b) {
  const x = p.lon;
  const y = p.lat;
  const x1 = a.lon;
  const y1 = a.lat;
  const x2 = b.lon;
  const y2 = b.lat;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
  const proj = { lat: y1 + dy * t, lon: x1 + dx * t };
  return haversine(p.lat, p.lon, proj.lat, proj.lon);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeLatLng(point) {
  if (Array.isArray(point)) return point;
  return [point.latitude, point.longitude];
}

function formatDistance(meters) {
  if (!meters) return "-";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

function formatDuration(seconds) {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function formatArrivalTime(seconds) {
  if (!seconds) return "-";
  const arrival = new Date(Date.now() + seconds * 1000);
  return arrival.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function makeStartTime() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ];
  return parts.join("");
}

function stripHtml(text) {
  return String(text || "").replace(/<[^>]+>/g, "").trim();
}

function log(category, message) {
  const line = `[${new Date().toLocaleTimeString("ko-KR", { hour12: false })}] ${category} ${message}`;
  els.logOutput.textContent = `${line}\n${els.logOutput.textContent}`.trim();
}

async function apiGet(path, query) {
  const url = new URL(path, window.location.origin);
  Object.entries(query || {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}
