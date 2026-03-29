import Foundation
import MapKit
import Combine

class SearchService: ObservableObject {
    @Published var results: [SearchResult] = []
    @Published var recentSearches: [SearchResult] = []
    @Published var isLoading: Bool = false

    private var searchTask: Task<Void, Never>?

    func search(query: String, near coordinate: CLLocationCoordinate2D?) async {
        guard !query.isEmpty else {
            await MainActor.run { results = [] }
            return
        }

        await MainActor.run { isLoading = true }

        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        if let coord = coordinate {
            let region = MKCoordinateRegion(
                center: coord,
                latitudinalMeters: 5000,
                longitudinalMeters: 5000
            )
            request.region = region
        }

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
        recentSearches.removeAll { $0.id == result.id }
        recentSearches.insert(result, at: 0)
        if recentSearches.count > 20 {
            recentSearches = Array(recentSearches.prefix(20))
        }
    }
}
