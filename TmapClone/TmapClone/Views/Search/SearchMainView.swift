import SwiftUI
import MapKit

struct SearchMainView: View {
    @EnvironmentObject var mapVM: MapViewModel
    @EnvironmentObject var appState: AppState
    @State private var query: String = ""
    @FocusState private var searchFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Search input
            HStack(spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    TextField("목적지를 검색하세요", text: $query)
                        .focused($searchFocused)
                        .submitLabel(.search)
                        .onSubmit { performSearch() }
                    if !query.isEmpty {
                        Button {
                            query = ""
                            mapVM.searchService.clearResults()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Color(.systemGray6))
                .cornerRadius(12)

                if searchFocused {
                    Button("취소") {
                        query = ""
                        searchFocused = false
                        mapVM.searchService.clearResults()
                    }
                    .foregroundColor(TmapColor.primary)
                    .font(.system(size: 15))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(.systemBackground))

            Divider()

            ScrollView {
                if mapVM.searchService.isLoading {
                    ProgressView()
                        .padding(.top, 40)
                } else if let errorMessage = mapVM.searchService.errorMessage {
                    SearchErrorView(message: errorMessage)
                } else if !mapVM.searchService.results.isEmpty {
                    SearchResultsList(
                        results: mapVM.searchService.results,
                        onSelect: handleSelection
                    )
                } else if query.isEmpty {
                    SearchHomeContent(onSelect: handleSelection)
                } else {
                    EmptySearchView(query: query)
                }
            }
        }
        .onChange(of: query) { _, newVal in
            guard !newVal.isEmpty else {
                mapVM.searchService.clearResults()
                return
            }
            mapVM.searchService.searchWithDebounce(
                query: newVal,
                near: mapVM.locationService.currentLocation?.coordinate
            )
        }
    }

    private func performSearch() {
        Task {
            await mapVM.searchService.search(
                query: query,
                near: mapVM.locationService.currentLocation?.coordinate
            )
        }
    }

    private func handleSelection(_ result: SearchResult) {
        mapVM.searchService.addToRecent(result)
        appState.destination = result
        appState.selectedTab = .home
        Task {
            let didStart = await mapVM.startNavigation(
                to: result,
                profile: appState.driverProfile,
                preferences: appState.routePreferences,
                preferredHighway: mapVM.selectedHighway
            )
            await MainActor.run {
                appState.showRouteSheet = didStart
            }
        }
    }
}

struct SearchResultsList: View {
    let results: [SearchResult]
    let onSelect: (SearchResult) -> Void

    var body: some View {
        LazyVStack(spacing: 0) {
            ForEach(results) { result in
                Button { onSelect(result) } label: {
                    SearchResultRow(result: result)
                }
                .buttonStyle(.plain)
                Divider().padding(.leading, 60)
            }
        }
        .padding(.top, 4)
    }
}

struct SearchResultRow: View {
    let result: SearchResult

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(TmapColor.primary.opacity(0.1))
                    .frame(width: 40, height: 40)
                Image(systemName: result.category.icon)
                    .font(.system(size: 16))
                    .foregroundColor(TmapColor.primary)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(result.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                Text(result.address)
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(.tertiary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

struct SearchHomeContent: View {
    @EnvironmentObject var mapVM: MapViewModel
    let onSelect: (SearchResult) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Quick category shortcuts
            VStack(alignment: .leading, spacing: 12) {
                Text("빠른 검색")
                    .font(.system(size: 16, weight: .bold))
                    .padding(.horizontal, 16)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 12) {
                    QuickCategoryButton(name: "주유소", icon: "fuelpump") {
                        Task {
                            await mapVM.searchService.searchNearby(
                                category: .gasStation,
                                near: mapVM.locationService.currentLocation?.coordinate
                            )
                        }
                    }
                    QuickCategoryButton(name: "주차장", icon: "p.square") {
                        Task {
                            await mapVM.searchService.searchNearby(
                                category: .parking,
                                near: mapVM.locationService.currentLocation?.coordinate
                            )
                        }
                    }
                    QuickCategoryButton(name: "편의점", icon: "bag") {
                        Task {
                            await mapVM.searchService.search(
                                query: "편의점",
                                near: mapVM.locationService.currentLocation?.coordinate
                            )
                        }
                    }
                    QuickCategoryButton(name: "카페", icon: "cup.and.saucer") {
                        Task {
                            await mapVM.searchService.search(
                                query: "카페",
                                near: mapVM.locationService.currentLocation?.coordinate
                            )
                        }
                    }
                    QuickCategoryButton(name: "음식점", icon: "fork.knife") {
                        Task {
                            await mapVM.searchService.search(
                                query: "음식점",
                                near: mapVM.locationService.currentLocation?.coordinate
                            )
                        }
                    }
                    QuickCategoryButton(name: "병원", icon: "cross.case") {
                        Task {
                            await mapVM.searchService.search(
                                query: "병원",
                                near: mapVM.locationService.currentLocation?.coordinate
                            )
                        }
                    }
                }
                .padding(.horizontal, 16)
            }

            // Recent searches
            if !mapVM.searchService.recentSearches.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("최근 검색")
                            .font(.system(size: 16, weight: .bold))
                        Spacer()
                        Button("전체삭제") {
                            mapVM.searchService.recentSearches = []
                        }
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 16)

                    ForEach(Array(mapVM.searchService.recentSearches.enumerated()), id: \.element.id) { index, result in
                        HStack {
                            Button { onSelect(result) } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "clock")
                                        .foregroundColor(.secondary)
                                        .frame(width: 24)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(result.name)
                                            .font(.system(size: 15))
                                            .foregroundColor(.primary)
                                        if !result.address.isEmpty {
                                            Text(result.address)
                                                .font(.system(size: 12))
                                                .foregroundColor(.secondary)
                                        }
                                    }
                                    Spacer()
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)

                            Button {
                                mapVM.searchService.recentSearches.remove(at: index)
                            } label: {
                                Image(systemName: "xmark")
                                    .foregroundColor(.secondary)
                                    .font(.system(size: 12))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                            }
                        }
                        Divider().padding(.leading, 52)
                    }
                }
            }
        }
        .padding(.top, 16)
    }
}

struct QuickCategoryButton: View {
    let name: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(TmapColor.primary.opacity(0.1))
                        .frame(height: 52)
                    Image(systemName: icon)
                        .font(.system(size: 20))
                        .foregroundColor(TmapColor.primary)
                }
                Text(name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.primary)
            }
        }
        .buttonStyle(.plain)
    }
}

struct EmptySearchView: View {
    let query: String
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 48))
                .foregroundColor(.secondary.opacity(0.4))
            Text("'\(query)'에 대한 결과가 없어요")
                .font(.system(size: 15))
                .foregroundColor(.secondary)
        }
        .padding(.top, 80)
    }
}

struct SearchErrorView: View {
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 44))
                .foregroundColor(.secondary.opacity(0.5))
            Text("검색을 완료하지 못했습니다")
                .font(.system(size: 16, weight: .semibold))
            Text(message)
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }
        .padding(.top, 80)
    }
}
