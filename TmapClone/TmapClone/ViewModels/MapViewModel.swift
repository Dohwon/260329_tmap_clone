import SwiftUI
import MapKit
import Combine

@MainActor
class MapViewModel: ObservableObject {
    @Published var cameraPosition: MapCameraPosition = .userLocation(fallback: .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 37.5665, longitude: 126.9780),
            span: MKCoordinateSpan(latitudeDelta: 0.008, longitudeDelta: 0.008)
        )
    ))
    @Published var selectedRoute: AppRoute?
    @Published var allRoutes: [AppRoute] = []
    @Published var isTrackingUser: Bool = true
    @Published var compassHeading: Double = 0
    @Published var mapPitch: Double = 0
    @Published var speedCameras: [SpeedCamera] = []
    @Published var nearbyPOIs: [SearchResult] = []
    @Published var routeSummaries: [RouteSummary] = []
    @Published var mergeOptions: [MergeOption] = []
    @Published var layerVisibility: LayerVisibility = LayerVisibility()
    @Published var selectedHighway: KoreanHighway?
    @Published var routeState: RouteRequestState = .idle
    @Published var alertMessage: String?
    @Published var pendingDestination: SearchResult?
    @Published var preferredRoadPlan: PreferredRoadRoutingPlan?
    @Published var navigationProgress: NavigationProgress?
    @Published var navigationStatusMessage: String = "경로 미리보기"
    @Published var isRerouting: Bool = false
    @Published var preferredRoadAdherence = PreferredRoadAdherence(
        state: .inactive,
        currentRoadName: nil,
        distanceToPreferredRoad: nil
    )

    let locationService: LocationService
    let routeService: RouteService
    let tmapRouteService: TmapRouteService
    let tmapRoadService: TmapRoadService
    let searchService: SearchService
    let preferredRoadPlanner: PreferredRoadPlanner

    private var cancellables = Set<AnyCancellable>()
    private var isNavigationActive = false
    private var activeProfile: DriverProfile = .intermediate
    private var activePreferences: RoutePreferences = RoutePreferences()
    private var activePreferredHighway: KoreanHighway?
    private var offRouteDetections = 0
    private var lastRerouteDate: Date?
    private var rerouteTask: Task<Void, Never>?
    private var roadLookupTask: Task<Void, Never>?
    private var lastRoadCheckDate: Date?
    private var lastRoadCheckLocation: CLLocation?
    private var recentNavigationTrace: [CLLocationCoordinate2D] = []

    init(
        locationService: LocationService = LocationService(),
        routeService: RouteService = RouteService(),
        tmapRouteService: TmapRouteService = TmapRouteService(),
        tmapRoadService: TmapRoadService = TmapRoadService(),
        searchService: SearchService = SearchService(),
        preferredRoadPlanner: PreferredRoadPlanner = PreferredRoadPlanner()
    ) {
        self.locationService = locationService
        self.routeService = routeService
        self.tmapRouteService = tmapRouteService
        self.tmapRoadService = tmapRoadService
        self.searchService = searchService
        self.preferredRoadPlanner = preferredRoadPlanner
        locationService.requestPermission()
        setupBindings()
        loadMockSpeedCameras()
    }

    private func setupBindings() {
        locationService.$currentLocation
            .compactMap { $0 }
            .sink { [weak self] location in
                guard let self else { return }
                if self.isTrackingUser {
                    self.cameraPosition = .userLocation(fallback: .region(
                        MKCoordinateRegion(
                            center: location.coordinate,
                            span: MKCoordinateSpan(latitudeDelta: 0.006, longitudeDelta: 0.006)
                        )
                    ))
                }
                self.handleLocationUpdate(location)
            }
            .store(in: &cancellables)
    }

    func centerOnUser() {
        isTrackingUser = true
        guard let loc = locationService.currentLocation else { return }
        withAnimation(.easeInOut(duration: 0.5)) {
            cameraPosition = .userLocation(fallback: .region(
                MKCoordinateRegion(
                    center: loc.coordinate,
                    span: MKCoordinateSpan(latitudeDelta: 0.006, longitudeDelta: 0.006)
                )
            ))
        }
    }

    func startNavigation(
        to destination: SearchResult,
        profile: DriverProfile = .intermediate,
        preferences: RoutePreferences = RoutePreferences(),
        preferredHighway: KoreanHighway? = nil
    ) async -> Bool {
        pendingDestination = destination
        routeState = .loading
        alertMessage = nil
        DebugLog.log("NAV", "startNavigation destination=\(destination.name) preferred=\(preferredHighway?.displayLabel ?? "-") profile=\(profile.rawValue)")

        guard let userLoc = locationService.currentLocation else {
            clearRoutePreview()
            routeState = authorizationRequiresLocationPermission ? .permissionDenied : .error("현재 위치를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.")
            alertMessage = routeState.message
            return false
        }

        preferredRoadPlan = preferredRoadPlanner.makePlan(
            origin: userLoc.coordinate,
            destination: destination,
            preferredHighway: preferredHighway
        )

        let didFetch: Bool
        if TmapConfiguration.isConfigured {
            do {
                let result = try await tmapRouteService.requestRoutes(
                    origin: userLoc.coordinate,
                    destination: destination,
                    preferences: preferences,
                    preferredHighway: preferredHighway
                )
                preferredRoadPlan = result.preferredPlan
                allRoutes = result.routes
                DebugLog.log("NAV", "TMAP routes loaded count=\(result.routes.count)")
                didFetch = true
            } catch {
                DebugLog.log("NAV", "TMAP route fallback error=\(error.localizedDescription)")
                alertMessage = "TMAP 경로 계산에 실패해 기본 경로로 전환합니다."
                didFetch = await routeService.fetchRoute(from: userLoc.coordinate, to: destination.coordinate)
                allRoutes = routeService.routes
            }
        } else {
            DebugLog.log("NAV", "MapKit route request destination=\(destination.name)")
            didFetch = await routeService.fetchRoute(from: userLoc.coordinate, to: destination.coordinate)
            allRoutes = routeService.routes
        }

        guard didFetch, !allRoutes.isEmpty else {
            clearRoutePreview()
            routeState = routeService.error == "경로를 찾지 못했습니다." ? .empty : .error(routeService.error ?? "경로 계산에 실패했습니다.")
            alertMessage = routeState.message
            return false
        }

        routeSummaries = routeService.generateSummaries(
            from: allRoutes,
            profile: profile,
            preferences: preferences,
            preferredHighway: preferredHighway
        )
        if let recommendedRoute = recommendedRoute(from: routeSummaries) ?? allRoutes.first {
            selectRoute(recommendedRoute)
        }
        DebugLog.log("NAV", "route selection summaries=\(routeSummaries.count) selected=\(selectedRoute?.id.uuidString ?? "-")")
        if preferredHighway != nil && !TmapConfiguration.isConfigured {
            alertMessage = "현재는 선호 도로를 추천 우선순위에 반영합니다. 실제 경유 강제는 TMAP 경유지 연동 단계에서 활성화됩니다."
        }
        routeState = .success
        return true
    }

    func selectRoute(_ route: AppRoute) {
        selectedRoute = route
        mergeOptions = generateMockMergeOptions(along: route)
        let rect = boundingMapRect(for: route.coordinates)
        withAnimation {
            cameraPosition = .rect(rect.insetBy(dx: -500, dy: -500))
        }
    }

    func updateRouteSummaries(
        profile: DriverProfile,
        preferences: RoutePreferences,
        preferredHighway: KoreanHighway? = nil
    ) {
        guard !allRoutes.isEmpty else { return }
        routeSummaries = routeService.generateSummaries(
            from: allRoutes,
            profile: profile,
            preferences: preferences,
            preferredHighway: preferredHighway
        )
        if let recommendedRoute = recommendedRoute(from: routeSummaries) {
            selectRoute(recommendedRoute)
        }
    }

    func refreshRoutePreview(
        profile: DriverProfile,
        preferences: RoutePreferences,
        preferredHighway: KoreanHighway? = nil
    ) async -> Bool {
        guard let destination = pendingDestination else {
            return false
        }

        return await startNavigation(
            to: destination,
            profile: profile,
            preferences: preferences,
            preferredHighway: preferredHighway
        )
    }

    func startActiveNavigation(
        profile: DriverProfile,
        preferences: RoutePreferences,
        preferredHighway: KoreanHighway? = nil
    ) {
        isNavigationActive = true
        activeProfile = profile
        activePreferences = preferences
        activePreferredHighway = preferredHighway
        offRouteDetections = 0
        lastRoadCheckDate = nil
        lastRoadCheckLocation = nil
        recentNavigationTrace = []
        navigationStatusMessage = preferredHighway != nil
            ? "선호 도로 축을 유지하며 안내 중"
            : "경로를 따라 주행 중"
        preferredRoadAdherence = preferredHighway != nil
            ? PreferredRoadAdherence(state: .evaluating, currentRoadName: nil, distanceToPreferredRoad: nil)
            : PreferredRoadAdherence(state: .inactive, currentRoadName: nil, distanceToPreferredRoad: nil)

        if let location = locationService.currentLocation {
            handleLocationUpdate(location)
        }
    }

    func stopActiveNavigation() {
        isNavigationActive = false
        isRerouting = false
        offRouteDetections = 0
        rerouteTask?.cancel()
        rerouteTask = nil
        roadLookupTask?.cancel()
        roadLookupTask = nil
        lastRoadCheckDate = nil
        lastRoadCheckLocation = nil
        recentNavigationTrace = []
        navigationProgress = nil
        navigationStatusMessage = "경로 미리보기"
        preferredRoadAdherence = PreferredRoadAdherence(
            state: .inactive,
            currentRoadName: nil,
            distanceToPreferredRoad: nil
        )
    }

    func togglePreferredHighway(_ highway: KoreanHighway) {
        if selectedHighway?.id == highway.id {
            selectedHighway = nil
            resetToDefaultCameras()
            return
        }
        selectHighway(highway)
    }

    func clearRoutePreview() {
        selectedRoute = nil
        allRoutes = []
        routeSummaries = []
        mergeOptions = []
        preferredRoadPlan = nil
        pendingDestination = nil
        navigationProgress = nil
        lastRoadCheckDate = nil
        lastRoadCheckLocation = nil
        recentNavigationTrace = []
        preferredRoadAdherence = PreferredRoadAdherence(
            state: .inactive,
            currentRoadName: nil,
            distanceToPreferredRoad: nil
        )
        if routeState == .success {
            routeState = .idle
        }
    }

    func dismissAlert() {
        alertMessage = nil
    }

    private var authorizationRequiresLocationPermission: Bool {
        switch locationService.authorizationStatus {
        case .denied, .restricted:
            return true
        default:
            return false
        }
    }

    func selectHighway(_ highway: KoreanHighway) {
        selectedHighway = highway

        // Pan camera to region encompassing highway start/end
        let minLat = min(highway.start.latitude, highway.end.latitude)
        let maxLat = max(highway.start.latitude, highway.end.latitude)
        let minLon = min(highway.start.longitude, highway.end.longitude)
        let maxLon = max(highway.start.longitude, highway.end.longitude)

        let centerLat = (minLat + maxLat) / 2
        let centerLon = (minLon + maxLon) / 2
        let spanLat = (maxLat - minLat) * 1.3 + 0.2
        let spanLon = (maxLon - minLon) * 1.3 + 0.2

        withAnimation(.easeInOut(duration: 0.6)) {
            cameraPosition = .region(MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: centerLat, longitude: centerLon),
                span: MKCoordinateSpan(latitudeDelta: spanLat, longitudeDelta: spanLon)
            ))
        }

        // Load mock speed cameras along the highway
        speedCameras = highway.mockCameras
    }

    private func generateMockMergeOptions(along route: AppRoute) -> [MergeOption] {
        let count = route.coordinates.count
        let fallback = CLLocationCoordinate2D(latitude: 37.5665, longitude: 126.9780)
        let base = count > 4 ? route.coordinates[count / 4] : route.coordinates.first ?? fallback
        let mid = count > 2 ? route.coordinates[count / 2] : route.coordinates.first ?? fallback
        return [
            MergeOption(
                name: "현재 경로 유지",
                coordinate: base,
                distanceFromCurrent: 8500,
                addedTime: 0,
                congestionDelta: 0,
                fixedCameraCount: 2,
                sectionCameraCount: 1,
                dominantSpeedLimit: 110,
                note: "현재 경로 계속"
            ),
            MergeOption(
                name: "국도 진입",
                coordinate: base,
                distanceFromCurrent: 8500,
                addedTime: 420,
                congestionDelta: -1,
                fixedCameraCount: 1,
                sectionCameraCount: 0,
                dominantSpeedLimit: 80,
                note: "+7분, 정체 감소"
            ),
            MergeOption(
                name: "우회 IC",
                coordinate: mid,
                distanceFromCurrent: 13200,
                addedTime: 180,
                congestionDelta: 1,
                fixedCameraCount: 3,
                sectionCameraCount: 1,
                dominantSpeedLimit: 100,
                note: "+3분, 카메라 증가"
            ),
        ]
    }

    private func recommendedRoute(from summaries: [RouteSummary]) -> AppRoute? {
        guard let routeID = summaries.first?.routeID else { return nil }
        return allRoutes.first(where: { $0.id == routeID })
    }

    private func boundingMapRect(for coordinates: [CLLocationCoordinate2D]) -> MKMapRect {
        guard let first = coordinates.first else { return MKMapRect.world }

        let firstPoint = MKMapPoint(first)
        return coordinates.dropFirst().reduce(
            MKMapRect(origin: firstPoint, size: MKMapSize(width: 0, height: 0))
        ) { partial, coordinate in
            partial.union(MKMapRect(origin: MKMapPoint(coordinate), size: MKMapSize(width: 0, height: 0)))
        }
    }

    func enable3DMode() {
        withAnimation(.easeInOut(duration: 0.5)) {
            mapPitch = 60
        }
    }

    func disable3DMode() {
        withAnimation(.easeInOut(duration: 0.5)) {
            mapPitch = 0
        }
    }

    private func loadMockSpeedCameras() {
        speedCameras = [
            SpeedCamera(coordinate: CLLocationCoordinate2D(latitude: 37.5700, longitude: 126.9850), speedLimit: 60, type: .fixed),
            SpeedCamera(coordinate: CLLocationCoordinate2D(latitude: 37.5620, longitude: 126.9720), speedLimit: 80, type: .section),
            SpeedCamera(coordinate: CLLocationCoordinate2D(latitude: 37.5590, longitude: 126.9900), speedLimit: 60, type: .fixed),
        ]
    }

    func resetToDefaultCameras() {
        selectedHighway = nil
        loadMockSpeedCameras()
    }

    private func handleLocationUpdate(_ location: CLLocation) {
        guard isNavigationActive, let selectedRoute else { return }
        appendNavigationTrace(location.coordinate)
        guard let progress = makeNavigationProgress(for: location, route: selectedRoute) else { return }

        navigationProgress = progress
        evaluatePreferredRoadAdherence(with: location)

        if isRerouting {
            navigationStatusMessage = "경로를 다시 찾는 중"
            return
        }

        if progress.isOffRoute {
            offRouteDetections += 1
            navigationStatusMessage = "경로에서 벗어남 \(Int(progress.distanceFromRoute))m"
            if offRouteDetections >= 2 {
                triggerRerouteIfNeeded()
            }
            return
        }

        offRouteDetections = 0
        if let preferredRoadLabel = selectedRoute.preferredRoadLabel {
            navigationStatusMessage = "\(preferredRoadLabel) 축을 유지하며 안내 중"
        } else {
            navigationStatusMessage = "경로를 따라 주행 중"
        }
    }

    private func triggerRerouteIfNeeded() {
        guard !isRerouting else { return }
        guard let destination = pendingDestination else { return }
        if let lastRerouteDate, Date().timeIntervalSince(lastRerouteDate) < 8 {
            return
        }

        let previousRoute = selectedRoute
        let previousRoutes = allRoutes
        let previousSummaries = routeSummaries
        let previousMergeOptions = mergeOptions
        let previousPlan = preferredRoadPlan

        isRerouting = true
        navigationStatusMessage = "이탈 감지, 경로 재탐색 중"
        DebugLog.log("REROUTE", "trigger destination=\(destination.name)")
        rerouteTask?.cancel()
        rerouteTask = Task { [weak self] in
            guard let self else { return }
            let didReroute = await self.startNavigation(
                to: destination,
                profile: self.activeProfile,
                preferences: self.activePreferences,
                preferredHighway: self.activePreferredHighway
            )

            guard !Task.isCancelled else { return }

            if !didReroute {
                self.selectedRoute = previousRoute
                self.allRoutes = previousRoutes
                self.routeSummaries = previousSummaries
                self.mergeOptions = previousMergeOptions
                self.preferredRoadPlan = previousPlan
                self.routeState = .success
                self.navigationStatusMessage = "재탐색 실패, 기존 경로 유지"
                DebugLog.log("REROUTE", "failed keep-previous-route")
            } else {
                self.navigationStatusMessage = "경로를 다시 찾았습니다"
                DebugLog.log("REROUTE", "success routes=\(self.allRoutes.count)")
            }

            self.lastRerouteDate = Date()
            self.isRerouting = false
            self.offRouteDetections = 0
        }
    }

    private func makeNavigationProgress(
        for location: CLLocation,
        route: AppRoute
    ) -> NavigationProgress? {
        guard route.coordinates.count >= 2 else { return nil }
        let routePosition = closestRoutePosition(to: location.coordinate, on: route.coordinates)
        let remainingDistance = routePosition.remainingDistance + location.distance(from: routePosition.projectedLocation)
        let normalizedDistance = min(max(remainingDistance, 0), route.distance)
        let remainingTime = route.distance > 0
            ? route.expectedTravelTime * (normalizedDistance / route.distance)
            : route.expectedTravelTime

        return NavigationProgress(
            remainingDistance: normalizedDistance,
            remainingTime: remainingTime,
            distanceFromRoute: routePosition.distanceFromRoute,
            isOffRoute: routePosition.distanceFromRoute > 120
        )
    }

    private func evaluatePreferredRoadAdherence(with location: CLLocation) {
        guard isNavigationActive else { return }
        guard let highway = activePreferredHighway else {
            preferredRoadAdherence = PreferredRoadAdherence(
                state: .inactive,
                currentRoadName: nil,
                distanceToPreferredRoad: nil
            )
            return
        }

        let geometricDistance = distanceFromPreferredHighway(highway, to: location.coordinate)
        let shouldSkipRoadLookup: Bool
        if let lastRoadCheckDate, let lastRoadCheckLocation {
            let isRecent = Date().timeIntervalSince(lastRoadCheckDate) < 6
            let movedDistance = location.distance(from: lastRoadCheckLocation)
            shouldSkipRoadLookup = isRecent && movedDistance < 40
        } else {
            shouldSkipRoadLookup = false
        }

        guard TmapConfiguration.isConfigured else {
            preferredRoadAdherence = fallbackPreferredRoadAdherence(
                distance: geometricDistance,
                currentRoadName: nil
            )
            return
        }

        if shouldSkipRoadLookup || roadLookupTask != nil {
            if preferredRoadAdherence.currentRoadName == nil {
                preferredRoadAdherence = fallbackPreferredRoadAdherence(
                    distance: geometricDistance,
                    currentRoadName: nil
                )
            }
            return
        }

        roadLookupTask = Task { [weak self] in
            guard let self else { return }
            let roadMatch = try? await self.tmapRoadService.nearestRoad(to: location.coordinate)
            let traceMatch = try? await self.tmapRoadService.matchRoads(for: Array(self.recentNavigationTrace.suffix(8)))
            guard !Task.isCancelled else { return }

            await MainActor.run {
                self.lastRoadCheckDate = Date()
                self.lastRoadCheckLocation = location
                self.preferredRoadAdherence = self.makePreferredRoadAdherence(
                    for: highway,
                    location: location.coordinate,
                    roadMatch: roadMatch,
                    traceMatch: traceMatch
                )
                DebugLog.log(
                    "ROAD",
                    "preferred=\(highway.displayLabel) current=\(roadMatch?.roadName ?? "-") state=\(self.preferredRoadAdherence.shortLabel) tracePoints=\(traceMatch?.matchedPoints.count ?? 0)"
                )
                self.roadLookupTask = nil
            }
        }
    }

    private func makePreferredRoadAdherence(
        for highway: KoreanHighway,
        location: CLLocationCoordinate2D,
        roadMatch: TmapNearbyRoadMatch?,
        traceMatch: TmapMatchedRoadTrace?
    ) -> PreferredRoadAdherence {
        let distance = distanceFromPreferredHighway(highway, to: location)
        let traceDistance = traceMatch.map { averageDistance(from: $0.matchedPoints.map(\.coordinate), to: highway) }
        let preferredDistance = traceDistance ?? distance
        let currentRoadName = roadMatch?.roadName.nilIfEmpty
        let matchedPreferredRoad = roadMatch.map { roadMatchesPreferredHighway($0, highway: highway) } ?? false
        let traceNearPreferredRoad = traceDistance.map { $0 < 180 } ?? false
        let traceApproachingPreferredRoad = traceDistance.map { $0 < 700 } ?? false
        let previousState = preferredRoadAdherence.state

        if matchedPreferredRoad || traceNearPreferredRoad {
            return PreferredRoadAdherence(
                state: .onPreferredRoad,
                currentRoadName: currentRoadName,
                distanceToPreferredRoad: preferredDistance
            )
        }

        if previousState == .onPreferredRoad && preferredDistance < 500 {
            return PreferredRoadAdherence(
                state: .leavingPreferredRoad,
                currentRoadName: currentRoadName,
                distanceToPreferredRoad: preferredDistance
            )
        }

        if traceApproachingPreferredRoad || preferredDistance < 1200 {
            return PreferredRoadAdherence(
                state: .approaching,
                currentRoadName: currentRoadName,
                distanceToPreferredRoad: preferredDistance
            )
        }

        return PreferredRoadAdherence(
            state: .offPreferredRoad,
            currentRoadName: currentRoadName,
            distanceToPreferredRoad: preferredDistance
        )
    }

    private func fallbackPreferredRoadAdherence(
        distance: CLLocationDistance,
        currentRoadName: String?
    ) -> PreferredRoadAdherence {
        let state: PreferredRoadAdherenceState
        if distance < 250 {
            state = .approaching
        } else if distance < 1200 {
            state = .approaching
        } else {
            state = .offPreferredRoad
        }

        return PreferredRoadAdherence(
            state: state,
            currentRoadName: currentRoadName,
            distanceToPreferredRoad: distance
        )
    }

    private func roadMatchesPreferredHighway(
        _ roadMatch: TmapNearbyRoadMatch,
        highway: KoreanHighway
    ) -> Bool {
        let normalizedRoadName = normalizedRoadToken(roadMatch.roadName)
        let normalizedHighwayName = normalizedRoadToken(highway.name)
        let normalizedShortName = normalizedRoadToken(highway.shortName)

        if normalizedRoadName.isEmpty {
            return false
        }

        if normalizedRoadName.contains(normalizedHighwayName) || normalizedRoadName.contains(normalizedShortName) {
            return true
        }

        return false
    }

    private func distanceFromPreferredHighway(
        _ highway: KoreanHighway,
        to coordinate: CLLocationCoordinate2D
    ) -> CLLocationDistance {
        let point = MKMapPoint(coordinate)
        let path = highway.corridorCoordinates
        guard path.count >= 2 else { return .greatestFiniteMagnitude }

        var bestDistance = CLLocationDistance.greatestFiniteMagnitude
        for index in 0..<(path.count - 1) {
            let start = MKMapPoint(path[index])
            let end = MKMapPoint(path[index + 1])
            let projected = projectedPoint(of: point, onSegmentFrom: start, to: end)
            bestDistance = min(bestDistance, MKMetersBetweenMapPoints(point, projected))
        }

        return bestDistance
    }

    private func normalizedRoadToken(_ raw: String) -> String {
        raw
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "-", with: "")
            .lowercased()
    }

    private func appendNavigationTrace(_ coordinate: CLLocationCoordinate2D) {
        if let last = recentNavigationTrace.last {
            let movedDistance = CLLocation(latitude: last.latitude, longitude: last.longitude)
                .distance(from: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude))
            if movedDistance < 8 {
                return
            }
        }

        recentNavigationTrace.append(coordinate)
        if recentNavigationTrace.count > 12 {
            recentNavigationTrace.removeFirst(recentNavigationTrace.count - 12)
        }
    }

    private func averageDistance(
        from coordinates: [CLLocationCoordinate2D],
        to highway: KoreanHighway
    ) -> CLLocationDistance {
        guard !coordinates.isEmpty else { return .greatestFiniteMagnitude }
        let distances = coordinates.map { distanceFromPreferredHighway(highway, to: $0) }
        return distances.reduce(0, +) / Double(distances.count)
    }

    private func closestRoutePosition(
        to coordinate: CLLocationCoordinate2D,
        on coordinates: [CLLocationCoordinate2D]
    ) -> (distanceFromRoute: CLLocationDistance, remainingDistance: CLLocationDistance, projectedLocation: CLLocation) {
        let targetPoint = MKMapPoint(coordinate)
        var bestDistance = CLLocationDistance.greatestFiniteMagnitude
        var bestRemaining = CLLocationDistance.greatestFiniteMagnitude
        var bestProjectedPoint = targetPoint

        for index in 0..<(coordinates.count - 1) {
            let startPoint = MKMapPoint(coordinates[index])
            let endPoint = MKMapPoint(coordinates[index + 1])
            let projection = projectedPoint(of: targetPoint, onSegmentFrom: startPoint, to: endPoint)
            let distance = MKMetersBetweenMapPoints(targetPoint, projection)

            guard distance < bestDistance else { continue }

            var remainingDistance = MKMetersBetweenMapPoints(projection, endPoint)
            if index + 1 < coordinates.count - 1 {
                for segmentIndex in (index + 1)..<(coordinates.count - 1) {
                    let from = MKMapPoint(coordinates[segmentIndex])
                    let to = MKMapPoint(coordinates[segmentIndex + 1])
                    remainingDistance += MKMetersBetweenMapPoints(from, to)
                }
            }

            bestDistance = distance
            bestRemaining = remainingDistance
            bestProjectedPoint = projection
        }

        let projectedLocation = CLLocation(
            latitude: bestProjectedPoint.coordinate.latitude,
            longitude: bestProjectedPoint.coordinate.longitude
        )
        return (bestDistance, bestRemaining, projectedLocation)
    }

    private func projectedPoint(
        of point: MKMapPoint,
        onSegmentFrom start: MKMapPoint,
        to end: MKMapPoint
    ) -> MKMapPoint {
        let dx = end.x - start.x
        let dy = end.y - start.y
        let lengthSquared = dx * dx + dy * dy

        guard lengthSquared > 0 else { return start }

        let t = max(0, min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
        return MKMapPoint(x: start.x + dx * t, y: start.y + dy * t)
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
