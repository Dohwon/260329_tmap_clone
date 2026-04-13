import Foundation
import MapKit
import Combine

class SearchService: ObservableObject {
    @Published var results: [SearchResult] = []
    @Published var recentSearches: [SearchResult] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private var searchTask: Task<Void, Never>?
    private var debounceTask: Task<Void, Never>?
    private let tmapAPIClient = TmapAPIClient()

    func search(query: String, near coordinate: CLLocationCoordinate2D?) async {
        guard !query.isEmpty else {
            await MainActor.run {
                results = []
                errorMessage = nil
            }
            return
        }

        await MainActor.run {
            isLoading = true
            errorMessage = nil
        }

        do {
            let mapped = try await searchResults(query: query, near: coordinate)
            await MainActor.run {
                self.results = mapped
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.results = []
                self.isLoading = false
                self.errorMessage = "검색 중 문제가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요."
            }
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
        await MainActor.run {
            isLoading = true
            errorMessage = nil
        }

        do {
            let mapped = try await nearbyResults(category: category, near: coordinate)
            await MainActor.run {
                self.results = mapped
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.results = []
                self.isLoading = false
                self.errorMessage = "주변 장소를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
            }
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

    func clearResults() {
        results = []
        errorMessage = nil
    }

    private func searchResults(
        query: String,
        near coordinate: CLLocationCoordinate2D?
    ) async throws -> [SearchResult] {
        if TmapConfiguration.isConfigured {
            do {
                DebugLog.log("SEARCH", "TMAP search query=\(query)")
                return try await searchWithTmap(query: query, near: coordinate)
            } catch {
                DebugLog.log("SEARCH", "TMAP search fallback query=\(query) error=\(error.localizedDescription)")
                return try await searchWithMapKit(query: query, near: coordinate)
            }
        }

        DebugLog.log("SEARCH", "MapKit search query=\(query)")
        return try await searchWithMapKit(query: query, near: coordinate)
    }

    private func nearbyResults(
        category: MKPointOfInterestCategory,
        near coordinate: CLLocationCoordinate2D?
    ) async throws -> [SearchResult] {
        if TmapConfiguration.isConfigured, let tmapCategory = tmapCategoryName(for: category) {
            do {
                DebugLog.log("SEARCH", "TMAP nearby category=\(tmapCategory)")
                return try await searchNearbyWithTmap(
                    categoryName: tmapCategory,
                    fallbackCategory: category,
                    near: coordinate
                )
            } catch {
                DebugLog.log("SEARCH", "TMAP nearby fallback category=\(tmapCategory)")
                return try await searchNearbyWithMapKit(category: category, near: coordinate)
            }
        }

        DebugLog.log("SEARCH", "MapKit nearby category=\(category.rawValue)")
        return try await searchNearbyWithMapKit(category: category, near: coordinate)
    }

    private func searchWithMapKit(
        query: String,
        near coordinate: CLLocationCoordinate2D?
    ) async throws -> [SearchResult] {
        let koreaCenter = CLLocationCoordinate2D(latitude: 37.5665, longitude: 126.9780)
        let searchCoord = coordinate ?? koreaCenter
        let meters: Double = coordinate == nil ? 200000 : 5000

        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.region = MKCoordinateRegion(
            center: searchCoord,
            latitudinalMeters: meters,
            longitudinalMeters: meters
        )

        let response = try await MKLocalSearch(request: request).start()
        return response.mapItems.map { item in
            SearchResult(
                name: item.name ?? "알 수 없음",
                address: item.placemark.thoroughfare ?? item.placemark.locality ?? "",
                coordinate: item.placemark.coordinate,
                category: categorize(item),
                poiID: nil,
                source: .mapKit
            )
        }
    }

    private func searchNearbyWithMapKit(
        category: MKPointOfInterestCategory,
        near coordinate: CLLocationCoordinate2D?
    ) async throws -> [SearchResult] {
        let koreaCenter = CLLocationCoordinate2D(latitude: 37.5665, longitude: 126.9780)
        let searchCoord = coordinate ?? koreaCenter
        let meters: Double = coordinate == nil ? 10000 : 3000

        let request = MKLocalSearch.Request()
        request.pointOfInterestFilter = MKPointOfInterestFilter(including: [category])
        request.resultTypes = .pointOfInterest
        request.region = MKCoordinateRegion(
            center: searchCoord,
            latitudinalMeters: meters,
            longitudinalMeters: meters
        )

        let response = try await MKLocalSearch(request: request).start()
        return response.mapItems.map { item in
            SearchResult(
                name: item.name ?? "알 수 없음",
                address: item.placemark.thoroughfare ?? item.placemark.locality ?? "",
                coordinate: item.placemark.coordinate,
                category: categorize(item),
                poiID: nil,
                source: .mapKit
            )
        }
    }

    private func searchWithTmap(
        query: String,
        near coordinate: CLLocationCoordinate2D?
    ) async throws -> [SearchResult] {
        var queryItems = [
            URLQueryItem(name: "version", value: "1"),
            URLQueryItem(name: "searchKeyword", value: query),
            URLQueryItem(name: "searchType", value: "all"),
            URLQueryItem(name: "page", value: "1"),
            URLQueryItem(name: "count", value: "20"),
            URLQueryItem(name: "reqCoordType", value: "WGS84GEO"),
            URLQueryItem(name: "resCoordType", value: "WGS84GEO"),
            URLQueryItem(name: "multiPoint", value: "N"),
            URLQueryItem(name: "poiGroupYn", value: "N")
        ]

        if let coordinate {
            queryItems.append(URLQueryItem(name: "searchtypCd", value: "R"))
            queryItems.append(URLQueryItem(name: "centerLon", value: String(coordinate.longitude)))
            queryItems.append(URLQueryItem(name: "centerLat", value: String(coordinate.latitude)))
            queryItems.append(URLQueryItem(name: "radius", value: "10"))
        } else {
            queryItems.append(URLQueryItem(name: "searchtypCd", value: "A"))
        }

        let data = try await tmapAPIClient.getJSONData(
            path: "/tmap/pois",
            queryItems: queryItems
        )
        return try parseTmapPOIs(data: data, fallbackCategory: nil)
    }

    private func searchNearbyWithTmap(
        categoryName: String,
        fallbackCategory: MKPointOfInterestCategory,
        near coordinate: CLLocationCoordinate2D?
    ) async throws -> [SearchResult] {
        let koreaCenter = CLLocationCoordinate2D(latitude: 37.5665, longitude: 126.9780)
        let searchCoord = coordinate ?? koreaCenter
        let radius = coordinate == nil ? "10" : "3"

        let data = try await tmapAPIClient.getJSONData(
            path: "/tmap/pois/search/around",
            queryItems: [
                URLQueryItem(name: "version", value: "1"),
                URLQueryItem(name: "centerLon", value: String(searchCoord.longitude)),
                URLQueryItem(name: "centerLat", value: String(searchCoord.latitude)),
                URLQueryItem(name: "categories", value: categoryName),
                URLQueryItem(name: "page", value: "1"),
                URLQueryItem(name: "count", value: "20"),
                URLQueryItem(name: "radius", value: radius),
                URLQueryItem(name: "reqCoordType", value: "WGS84GEO"),
                URLQueryItem(name: "resCoordType", value: "WGS84GEO"),
                URLQueryItem(name: "multiPoint", value: "N"),
                URLQueryItem(name: "sort", value: "distance")
            ]
        )

        return try parseTmapPOIs(
            data: data,
            fallbackCategory: placeCategory(for: fallbackCategory)
        )
    }

    private func parseTmapPOIs(
        data: Data,
        fallbackCategory: SearchResult.PlaceCategory?
    ) throws -> [SearchResult] {
        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let searchPoiInfo = json["searchPoiInfo"] as? [String: Any],
            let pois = searchPoiInfo["pois"] as? [String: Any]
        else {
            throw TmapAPIError.invalidResponse
        }

        let rawPOIs: [[String: Any]]
        if let poiArray = pois["poi"] as? [[String: Any]] {
            rawPOIs = poiArray
        } else if let poiObject = pois["poi"] as? [String: Any] {
            rawPOIs = [poiObject]
        } else {
            rawPOIs = []
        }

        return rawPOIs.compactMap { poi in
            guard let coordinate = coordinate(from: poi) else { return nil }
            return SearchResult(
                name: normalizedName(from: poi),
                address: address(from: poi),
                coordinate: coordinate,
                category: category(from: poi, fallback: fallbackCategory),
                poiID: stringValue(in: poi, keys: ["id", "pkey"]),
                source: .tmap
            )
        }
    }

    private func coordinate(from poi: [String: Any]) -> CLLocationCoordinate2D? {
        let latitude = doubleValue(in: poi, keys: ["frontLat", "noorLat", "centerLat"])
        let longitude = doubleValue(in: poi, keys: ["frontLon", "noorLon", "centerLon"])

        guard let latitude, let longitude else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    private func normalizedName(from poi: [String: Any]) -> String {
        let rawName = stringValue(in: poi, keys: ["name", "upperAddrName"]) ?? "알 수 없음"
        return rawName.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func address(from poi: [String: Any]) -> String {
        if let address = nonEmptyString(in: poi, keys: ["roadName"]), !address.isEmpty {
            let roadAddress = [
                nonEmptyString(in: poi, keys: ["upperAddrName"]),
                nonEmptyString(in: poi, keys: ["middleAddrName"]),
                nonEmptyString(in: poi, keys: ["lowerAddrName"]),
                address,
                nonEmptyString(in: poi, keys: ["firstBuildNo"]),
                nonEmptyString(in: poi, keys: ["secondBuildNo"])
            ]
            .compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)

            if !roadAddress.isEmpty {
                return roadAddress
            }
        }

        let parcelAddress = [
            nonEmptyString(in: poi, keys: ["addr"]),
            nonEmptyString(in: poi, keys: ["upperAddrName"]),
            nonEmptyString(in: poi, keys: ["middleAddrName"]),
            nonEmptyString(in: poi, keys: ["lowerAddrName"]),
            nonEmptyString(in: poi, keys: ["detailAddrName", "detailAddrname"]),
            nonEmptyString(in: poi, keys: ["firstNo"]),
            nonEmptyString(in: poi, keys: ["secondNo"])
        ]
        .compactMap { $0 }
        .joined(separator: " ")
        .trimmingCharacters(in: .whitespaces)

        return parcelAddress
    }

    private func category(
        from poi: [String: Any],
        fallback: SearchResult.PlaceCategory?
    ) -> SearchResult.PlaceCategory {
        let text = [
            nonEmptyString(in: poi, keys: ["upperBizName"]),
            nonEmptyString(in: poi, keys: ["middleBizName"]),
            nonEmptyString(in: poi, keys: ["lowerBizName"]),
            nonEmptyString(in: poi, keys: ["detailBizName"])
        ]
        .compactMap { $0 }
        .joined(separator: " ")

        if text.contains("주유") || text.contains("충전") { return .gas }
        if text.contains("주차") { return .parking }
        if text.contains("병원") || text.contains("의원") { return .hospital }
        if text.contains("약국") { return .pharmacy }
        if text.contains("카페") || text.contains("커피") { return .cafe }
        if text.contains("음식") || text.contains("식당") || text.contains("맛집") { return .restaurant }
        if text.contains("편의점") { return .convenience }
        if text.contains("은행") || text.contains("ATM") { return .bank }
        if text.contains("호텔") || text.contains("숙박") { return .hotel }
        if text.contains("쇼핑") || text.contains("마트") { return .shopping }
        if text.contains("관광") || text.contains("공원") { return .attraction }

        return fallback ?? .other
    }

    private func tmapCategoryName(for category: MKPointOfInterestCategory) -> String? {
        switch category {
        case .gasStation:
            return "주유소"
        case .parking:
            return "주차장"
        case .hospital:
            return "병원"
        case .pharmacy:
            return "약국"
        case .cafe:
            return "카페"
        case .restaurant, .bakery, .brewery, .foodMarket:
            return "음식"
        default:
            return nil
        }
    }

    private func placeCategory(for category: MKPointOfInterestCategory) -> SearchResult.PlaceCategory {
        switch category {
        case .gasStation:
            return .gas
        case .parking:
            return .parking
        case .hospital:
            return .hospital
        case .pharmacy:
            return .pharmacy
        case .cafe:
            return .cafe
        case .restaurant, .bakery, .brewery, .foodMarket:
            return .restaurant
        default:
            return .other
        }
    }

    private func stringValue(in dictionary: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let value = dictionary[key] as? String, !value.isEmpty {
                return value
            }
            if let value = dictionary[key] as? NSNumber {
                return value.stringValue
            }
        }
        return nil
    }

    private func nonEmptyString(in dictionary: [String: Any], keys: [String]) -> String? {
        stringValue(in: dictionary, keys: keys)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty
    }

    private func doubleValue(in dictionary: [String: Any], keys: [String]) -> Double? {
        for key in keys {
            if let value = dictionary[key] as? Double {
                return value
            }
            if let value = dictionary[key] as? NSNumber {
                return value.doubleValue
            }
            if let value = dictionary[key] as? String, let parsed = Double(value) {
                return parsed
            }
        }
        return nil
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
