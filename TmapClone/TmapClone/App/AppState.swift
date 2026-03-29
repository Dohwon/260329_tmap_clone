import SwiftUI
import MapKit
import Combine

class AppState: ObservableObject {
    @Published var selectedTab: TabItem = .home
    @Published var isNavigating: Bool = false
    @Published var showSearchSheet: Bool = false
    @Published var showRouteSheet: Bool = false
    @Published var currentLocation: CLLocationCoordinate2D?
    @Published var destination: SearchResult?
    @Published var routeInfo: RouteInfo?
    @Published var trafficEnabled: Bool = true
    @Published var mapStyle: MapStyleOption = .standard

    enum TabItem: Int {
        case home = 0
        case search = 1
        case favorites = 2
        case more = 3
    }

    enum MapStyleOption {
        case standard, satellite, hybrid
    }
}
