import Foundation
import MapKit
import Combine

class SearchService: ObservableObject {
    @Published var results: [SearchResult] = []
    @Published var recentSearches: [SearchResult] = []
    @Published var isLoading: Bool = false

    private var searchTask: Task<Void, Never>?
    private var debounceTask: Task<Void, Never>?

    func search(query: String, near coordinate: CLLocationCoordinate2D?) async {
        guard !query.isEmpty else {
            await MainActor.run { results = [] }
            return
        }

        await MainActor.run { isLoading = true }

        let koreaCenter = CLLocationCoordinate2D(latitude: 37.5665, longitude: 126.9780)
        let searchCoord = coordinate ?? koreaCenter
        let meters: Double = coordinate == nil ? 200000 : 5000

        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        let region = MKCoordinateRegion(
            center: searchCoord,
            latitudinalMeters: meters,
            longitudinalMeters: meters
        )
        request.region = region

        let search = MKLocalSearch(request: request)
        do {
            let response = try await search.start()
            let mapped = response.mapItems.map { item -> SearchResult in
                SearchResult(
                    name: item.name ?? "알 수 없음",
                    address: item.placemark.thoroughfare ?? item.placemark.locality ?? "",
                    coordinate: item.placemark.coordinate,
                    category: categorize(item)
                )
            }
            await MainActor.run {
                self.results = mapped
                self.isLoading = false
            }
        } catch {
            await MainActor.run { self.isLoading = false }
        }
    }

    func searchWithDebounce(query: String, near coordinate: CLLocationCoordinate2D?) {
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            await search(query: query, near: coordinate)
        }
    }

    func searchNearby(category: MKPointOfInterestCategory, near coordinate: CLLocationCoordinate2D?) async {
        await MainActor.run { isLoading = true }

        let koreaCenter = CLLocationCoordinate2D(latitude: 37.5665, longitude: 126.9780)
        let searchCoord = coordinate ?? koreaCenter
        let meters: Double = coordinate == nil ? 10000 : 3000

        let request = MKLocalSearch.Request()
        request.pointOfInterestFilter = MKPointOfInterestFilter(including: [category])
        request.resultTypes = .pointOfInterest
        let region = MKCoordinateRegion(
            center: searchCoord,
            latitudinalMeters: meters,
            longitudinalMeters: meters
        )
        request.region = region

        let search = MKLocalSearch(request: request)
        do {
            let response = try await search.start()
            let mapped = response.mapItems.map { item -> SearchResult in
                SearchResult(
                    name: item.name ?? "알 수 없음",
                    address: item.placemark.thoroughfare ?? item.placemark.locality ?? "",
                    coordinate: item.placemark.coordinate,
                    category: categorize(item)
                )
            }
            await MainActor.run {
                self.results = mapped
                self.isLoading = false
            }
        } catch {
            await MainActor.run { self.isLoading = false }
        }
    }

    private func categorize(_ item: MKMapItem) -> SearchResult.PlaceCategory {
        guard let categories = item.pointOfInterestCategory else { return .other }
        switch categories {
        case .restaurant, .bakery, .brewery, .foodMarket: return .restaurant
        case .cafe: return .cafe
        case .gasStation: return .gas
        case .parking: return .parking
        case .hospital: return .hospital
        case .pharmacy: return .pharmacy
        case .hotel: return .hotel
        case .store: return .shopping
        default: return .other
        }
    }

    func addToRecent(_ result: SearchResult) {
        recentSearches.removeAll { $0.name == result.name && $0.address == result.address }
        recentSearches.insert(result, at: 0)
        if recentSearches.count > 20 {
            recentSearches = Array(recentSearches.prefix(20))
        }
    }
}
