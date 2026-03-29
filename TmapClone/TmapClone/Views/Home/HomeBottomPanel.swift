import SwiftUI

struct HomeBottomPanel: View {
    let onDestinationSelected: (SearchResult) -> Void
    @State private var showHomeDestinationSearch: Bool = false

    private let quickItems: [(String, String)] = [
        ("집", "house.fill"),
        ("회사", "building.2.fill"),
        ("최근", "clock.fill"),
        ("주유소", "fuelpump.fill"),
        ("주차장", "p.square.fill"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Handle
            Capsule()
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 40, height: 4)
                .padding(.vertical, 10)

            // Quick destination shortcuts
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(quickItems, id: \.0) { item in
                        QuickDestinationChip(name: item.0, icon: item.1)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
            }

            // Search button
            Button {
                showHomeDestinationSearch = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    Text("어디로 갈까요?")
                        .foregroundColor(.secondary)
                        .font(.system(size: 16))
                    Spacer()
                    Image(systemName: "mic.fill")
                        .foregroundColor(TmapColor.primary)
                        .font(.system(size: 18))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(Color(.systemGray6))
                .cornerRadius(14)
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
            }
            .buttonStyle(.plain)

            // Traffic info banner
            TrafficInfoBanner()
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
        }
        .background(
            Color(.systemBackground)
                .cornerRadius(20, corners: [.topLeft, .topRight])
                .shadow(color: .black.opacity(0.1), radius: 12, y: -4)
        )
        .sheet(isPresented: $showHomeDestinationSearch) {
            QuickSearchSheet(onSelect: { result in
                showHomeDestinationSearch = false
                onDestinationSelected(result)
            })
        }
    }
}

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
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("목적지 검색", text: $query)
                        .submitLabel(.search)
                        .onSubmit {
                            Task {
                                await searchService.search(query: query, near: nil)
                            }
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

                if searchService.isLoading {
                    ProgressView().padding(.top, 40)
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
        .onChange(of: query) { _, val in
            guard !val.isEmpty else { return }
            Task {
                try? await Task.sleep(nanoseconds: 300_000_000)
                await searchService.search(query: val, near: nil)
            }
        }
    }
}
