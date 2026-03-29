import SwiftUI
import MapKit
import Combine

@MainActor
class MapViewModel: ObservableObject {
    @Published var cameraPosition: MapCameraPosition = .userLocation(fallback: .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 37.5665, longitude: 126.9780),
            span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
        )
    ))
    @Published var selectedRoute: MKRoute?
    @Published var allRoutes: [MKRoute] = []
    @Published var isTrackingUser: Bool = true
    @Published var compassHeading: Double = 0
    @Published var mapPitch: Double = 0
    @Published var speedCameras: [SpeedCamera] = []
    @Published var nearbyPOIs: [SearchResult] = []

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
                        span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
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
                    span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                )
            ))
        }
    }

    func startNavigation(to destination: SearchResult) async {
        guard let userLoc = locationService.currentLocation else { return }
        await routeService.fetchRoute(from: userLoc.coordinate, to: destination.coordinate)
        if let first = routeService.routes.first {
            selectedRoute = first
            allRoutes = routeService.routes
            withAnimation {
                cameraPosition = .rect(first.polyline.boundingMapRect.insetBy(dx: -500, dy: -500))
            }
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
}
