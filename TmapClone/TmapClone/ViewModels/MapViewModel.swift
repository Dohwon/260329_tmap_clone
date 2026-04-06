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
    @Published var selectedRoute: MKRoute?
    @Published var allRoutes: [MKRoute] = []
    @Published var isTrackingUser: Bool = true
    @Published var compassHeading: Double = 0
    @Published var mapPitch: Double = 0
    @Published var speedCameras: [SpeedCamera] = []
    @Published var nearbyPOIs: [SearchResult] = []
    @Published var routeSummaries: [RouteSummary] = []
    @Published var mergeOptions: [MergeOption] = []
    @Published var layerVisibility: LayerVisibility = LayerVisibility()
    @Published var selectedHighway: KoreanHighway?

    let locationService = LocationService()
    let routeService = RouteService()
    let searchService = SearchService()

    private var cancellables = Set<AnyCancellable>()

    init() {
        locationService.requestPermission()
        setupBindings()
        loadMockSpeedCameras()
    }

    private func setupBindings() {
        locationService.$currentLocation
            .compactMap { $0 }
            .sink { [weak self] location in
                guard let self, self.isTrackingUser else { return }
                self.cameraPosition = .userLocation(fallback: .region(
                    MKCoordinateRegion(
                        center: location.coordinate,
                        span: MKCoordinateSpan(latitudeDelta: 0.006, longitudeDelta: 0.006)
                    )
                ))
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

    func startNavigation(to destination: SearchResult, profile: DriverProfile = .intermediate) async {
        guard let userLoc = locationService.currentLocation else { return }
        await routeService.fetchRoute(from: userLoc.coordinate, to: destination.coordinate)
        if let first = routeService.routes.first {
            selectedRoute = first
            allRoutes = routeService.routes
            routeSummaries = routeService.generateSummaries(from: routeService.routes, profile: profile)
            mergeOptions = generateMockMergeOptions(along: first)
            withAnimation {
                cameraPosition = .rect(first.polyline.boundingMapRect.insetBy(dx: -500, dy: -500))
            }
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

    private func generateMockMergeOptions(along route: MKRoute) -> [MergeOption] {
        let points = route.polyline.points()
        let count = route.polyline.pointCount
        let base = count > 4 ? points[count / 4].coordinate : route.polyline.coordinate
        let mid = count > 2 ? points[count / 2].coordinate : route.polyline.coordinate
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
}
