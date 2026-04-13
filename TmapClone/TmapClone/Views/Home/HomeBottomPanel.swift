import SwiftUI
import MapKit
import CoreLocation

struct HomeBottomPanel: View {
    let onDestinationSelected: (SearchResult) -> Void

    @EnvironmentObject var mapVM: MapViewModel
    @EnvironmentObject var appState: AppState

    @State private var showRecentSheet: Bool = false
    @State private var showGasSheet: Bool = false
    @State private var showParkingSheet: Bool = false
    @State private var showSetHomeSheet: Bool = false
    @State private var showSetWorkSheet: Bool = false
    @State private var nearbyResults: [SearchResult] = []
    @State private var currentAddressText: String = "현재 위치"

    var body: some View {
        VStack(spacing: 0) {
            // Handle bar
            Capsule()
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 40, height: 4)
                .padding(.vertical, 10)

            // Current location address row
            HStack(spacing: 8) {
                Image(systemName: "location.fill")
                    .font(.system(size: 13))
                    .foregroundColor(TmapColor.primary)
                Text(currentAddressText)
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 10)

            // Quick action buttons horizontal scroll
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    // 집
                    QuickActionChip(name: "집", icon: "house.fill") {
                        if let home = appState.homePlace, home.latitude != 0 {
                            let result = SearchResult(
                                name: home.name,
                                address: home.address,
                                coordinate: home.coordinate,
                                category: .other,
                                poiID: nil,
                                source: .mapKit
                            )
                            onDestinationSelected(result)
                        } else {
                            showSetHomeSheet = true
                        }
                    }

                    // 회사
                    QuickActionChip(name: "회사", icon: "building.2.fill") {
                        if let work = appState.workPlace, work.latitude != 0 {
                            let result = SearchResult(
                                name: work.name,
                                address: work.address,
                                coordinate: work.coordinate,
                                category: .other,
                                poiID: nil,
                                source: .mapKit
                            )
                            onDestinationSelected(result)
                        } else {
                            showSetWorkSheet = true
                        }
                    }

                    // 최근
                    QuickActionChip(name: "최근", icon: "clock.fill") {
                        showRecentSheet = true
                    }

                    // 주유소
                    QuickActionChip(name: "주유소", icon: "fuelpump.fill") {
                        Task {
                            await mapVM.searchService.searchNearby(
                                category: .gasStation,
                                near: mapVM.locationService.currentLocation?.coordinate
                            )
                            nearbyResults = mapVM.searchService.results
                            showGasSheet = true
                        }
                    }

                    // 주차장
                    QuickActionChip(name: "주차장", icon: "p.square.fill") {
                        Task {
                            await mapVM.searchService.searchNearby(
                                category: .parking,
                                near: mapVM.locationService.currentLocation?.coordinate
                            )
                            nearbyResults = mapVM.searchService.results
                            showParkingSheet = true
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 10)
            }

            // Highway/national road picker: horizontal scroll of KoreanHighway chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Text("고속도로")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                        .padding(.leading, 2)

                    ForEach(KoreanHighway.all) { highway in
                        HighwayChip(
                            highway: highway,
                            isSelected: mapVM.selectedHighway?.id == highway.id
                        ) {
                            mapVM.togglePreferredHighway(highway)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 14)
            }
        }
        .background(
            Color(.systemBackground)
                .cornerRadius(20, corners: [.topLeft, .topRight])
                .shadow(color: .black.opacity(0.1), radius: 12, y: -4)
        )
        .onAppear {
            reverseGeocodeCurrentLocation()
        }
        .onChange(of: mapVM.locationService.currentLocation) { _, _ in
            reverseGeocodeCurrentLocation()
        }
        // Recent sheet
        .sheet(isPresented: $showRecentSheet) {
            RecentSearchesSheet(
                recentSearches: mapVM.searchService.recentSearches,
                onSelect: { result in
                    showRecentSheet = false
                    onDestinationSelected(result)
                }
            )
        }
        // Gas station sheet
        .sheet(isPresented: $showGasSheet) {
            NearbyResultsSheet(
                title: "근처 주유소",
                results: nearbyResults,
                onSelect: { result in
                    showGasSheet = false
                    onDestinationSelected(result)
                }
            )
        }
        // Parking sheet
        .sheet(isPresented: $showParkingSheet) {
            NearbyResultsSheet(
                title: "근처 주차장",
                results: nearbyResults,
                onSelect: { result in
                    showParkingSheet = false
                    onDestinationSelected(result)
                }
            )
        }
        // Set home sheet
        .sheet(isPresented: $showSetHomeSheet) {
            QuickSearchSheet(onSelect: { result in
                showSetHomeSheet = false
                let place = FavoritePlace(
                    id: UUID(),
                    name: "집",
                    address: result.address,
                    latitude: result.coordinate.latitude,
                    longitude: result.coordinate.longitude,
                    isFavorite: true
                )
                appState.saveHomePlace(place)
            })
        }
        // Set work sheet
        .sheet(isPresented: $showSetWorkSheet) {
            QuickSearchSheet(onSelect: { result in
                showSetWorkSheet = false
                let place = FavoritePlace(
                    id: UUID(),
                    name: "회사",
                    address: result.address,
                    latitude: result.coordinate.latitude,
                    longitude: result.coordinate.longitude,
                    isFavorite: true
                )
                appState.saveWorkPlace(place)
            })
        }
    }

    private func reverseGeocodeCurrentLocation() {
        guard let loc = mapVM.locationService.currentLocation else { return }
        let geocoder = CLGeocoder()
        geocoder.reverseGeocodeLocation(loc) { placemarks, _ in
            if let placemark = placemarks?.first {
                let addr = [placemark.thoroughfare, placemark.locality]
                    .compactMap { $0 }
                    .joined(separator: " ")
                DispatchQueue.main.async {
                    currentAddressText = addr.isEmpty ? "현재 위치" : addr
                }
            }
        }
    }
}

// MARK: - Quick Action Chip

struct QuickActionChip: View {
    let name: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundColor(TmapColor.primary)
                Text(name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.primary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.systemGray6))
            .cornerRadius(20)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Highway Chip

struct HighwayChip: View {
    let highway: KoreanHighway
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(highway.routeNumber)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 20, height: 20)
                    .background(Color.green)
                    .cornerRadius(4)
                Text(highway.shortName)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(isSelected ? TmapColor.primary : .primary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(isSelected ? TmapColor.primary.opacity(0.1) : Color(.systemGray6))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(isSelected ? TmapColor.primary : Color.clear, lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Recent Searches Sheet

struct RecentSearchesSheet: View {
    let recentSearches: [SearchResult]
    let onSelect: (SearchResult) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if recentSearches.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "clock")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary.opacity(0.4))
                        Text("최근 검색 기록이 없어요")
                            .font(.system(size: 15))
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(recentSearches) { result in
                        Button { onSelect(result) } label: {
                            SearchResultRow(result: result)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets())
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("최근 검색")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Nearby Results Sheet

struct NearbyResultsSheet: View {
    let title: String
    let results: [SearchResult]
    let onSelect: (SearchResult) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if results.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "mappin.slash")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary.opacity(0.4))
                        Text("근처에 결과가 없어요")
                            .font(.system(size: 15))
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(results) { result in
                        Button { onSelect(result) } label: {
                            SearchResultRow(result: result)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets())
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") { dismiss() }
                }
            }
        }
    }
}

// MARK: - QuickDestinationChip (legacy, kept for compatibility)

struct QuickDestinationChip: View {
    let name: String
    let icon: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundColor(TmapColor.primary)
            Text(name)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.primary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(.systemGray6))
        .cornerRadius(20)
    }
}

struct TrafficInfoBanner: View {
    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Color.green)
                .frame(width: 8, height: 8)
            Text("현재 도로 상황이 원활합니다")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
            Spacer()
            Text("실시간 교통정보")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(TmapColor.primary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }
}

struct QuickSearchSheet: View {
    let onSelect: (SearchResult) -> Void
    @State private var query: String = ""
    @StateObject private var searchService = SearchService()
    @FocusState private var isFocused: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("목적지 검색", text: $query)
                        .focused($isFocused)
                        .submitLabel(.search)
                        .onSubmit {
                            Task { await searchService.search(query: query, near: nil) }
                        }
                    if !query.isEmpty {
                        Button { query = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                        }
                    }
                }
                .padding(12)
                .background(Color(.systemGray6))
                .cornerRadius(12)
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 8)

                Divider()

                if searchService.isLoading {
                    ProgressView().padding(.top, 40)
                    Spacer()
                } else if searchService.results.isEmpty && !query.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 40))
                            .foregroundColor(.secondary.opacity(0.3))
                        Text("'\(query)'에 대한 결과가 없어요")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 60)
                    Spacer()
                } else {
                    List(searchService.results) { result in
                        Button { onSelect(result) } label: {
                            SearchResultRow(result: result)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets())
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("목적지 검색")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") { dismiss() }
                }
            }
        }
        .onAppear { isFocused = true }
        .onChange(of: query) { _, val in
            guard !val.isEmpty else {
                searchService.results = []
                return
            }
            searchService.searchWithDebounce(query: val, near: nil)
        }
    }
}
