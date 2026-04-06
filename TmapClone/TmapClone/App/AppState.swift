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
    @Published var driverProfile: DriverProfile = .intermediate
    @Published var routePreferences: RoutePreferences = RoutePreferences()
    @Published var preferredColorScheme: ColorScheme? = nil

    @Published var homePlace: FavoritePlace?
    @Published var workPlace: FavoritePlace?

    enum TabItem: Int {
        case home = 0
        case search = 1
        case favorites = 2
        case more = 3
    }

    enum MapStyleOption {
        case standard, satellite, hybrid
    }

    // MARK: - Night Mode

    var isNightMode: Bool {
        let hour = Calendar.current.component(.hour, from: Date())
        return hour >= 21 || hour < 6
    }

    // MARK: - Init

    init() {
        loadHomePlace()
        loadWorkPlace()
    }

    // MARK: - Persistence

    private func loadHomePlace() {
        guard let data = UserDefaults.standard.data(forKey: "homePlace"),
              let place = try? JSONDecoder().decode(FavoritePlace.self, from: data) else {
            return
        }
        homePlace = place
    }

    private func loadWorkPlace() {
        guard let data = UserDefaults.standard.data(forKey: "workPlace"),
              let place = try? JSONDecoder().decode(FavoritePlace.self, from: data) else {
            return
        }
        workPlace = place
    }

    func saveHomePlace(_ place: FavoritePlace) {
        homePlace = place
        if let data = try? JSONEncoder().encode(place) {
            UserDefaults.standard.set(data, forKey: "homePlace")
        }
    }

    func saveWorkPlace(_ place: FavoritePlace) {
        workPlace = place
        if let data = try? JSONEncoder().encode(place) {
            UserDefaults.standard.set(data, forKey: "workPlace")
        }
    }
}
