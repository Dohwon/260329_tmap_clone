import SwiftUI
import MapKit

struct SearchMainView: View {
    @EnvironmentObject var mapVM: MapViewModel
    @EnvironmentObject var appState: AppState
    @State private var query: String = ""
    @State private var isSearching: Bool = false
    @FocusState private var searchFocused: Bool

    var body: some View {
        NavigationStack {
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
                                mapVM.searchService.results = []
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
                            mapVM.searchService.results = []
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
            .navigationTitle("")
            .navigationBarHidden(true)
        }
        .onChange(of: query) { _, newVal in
            guard !newVal.isEmpty else { return }
            Task {
                try? await Task.sleep(nanoseconds: 300_000_000)
                await mapVM.searchService.search(
                    query: newVal,
                    near: mapVM.locationService.currentLocation?.coordinate
                )
            }
        }
        .onAppear { searchFocused = true }
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
            await mapVM.startNavigation(to: result)
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

    private let categories: [(String, String, String)] = [
        ("주유소", "fuelpump", "gas"),
        ("주차장", "p.square", "parking"),
        ("편의점", "bag", "convenience"),
        ("카페", "cup.and.saucer", "cafe"),
        ("음식점", "fork.knife", "restaurant"),
        ("병원", "cross.case", "hospital"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Quick category shortcuts
            VStack(alignment: .leading, spacing: 12) {
                Text("빠른 검색")
                    .font(.system(size: 16, weight: .bold))
                    .padding(.horizontal, 16)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 12) {
                    ForEach(categories, id: \.0) { cat in
                        QuickCategoryButton(name: cat.0, icon: cat.1)
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

                    ForEach(mapVM.searchService.recentSearches.prefix(5)) { result in
                        Button { onSelect(result) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "clock")
                                    .foregroundColor(.secondary)
                                    .frame(width: 24)
                                Text(result.name)
                                    .font(.system(size: 15))
                                    .foregroundColor(.primary)
                                Spacer()
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
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

    var body: some View {
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
