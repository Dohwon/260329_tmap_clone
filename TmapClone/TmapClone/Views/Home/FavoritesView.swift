import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject var appState: AppState
    @State private var favorites: [FavoritePlace] = []
    @State private var showAddFavorite: Bool = false
    @State private var showEditHomeSheet: Bool = false
    @State private var showEditWorkSheet: Bool = false

    var body: some View {
        NavigationStack {
            List {
                // Pinned: 집 and 회사 from appState
                Section {
                    PinnedPlaceRow(
                        label: "집",
                        icon: "house.fill",
                        place: appState.homePlace
                    ) {
                        showEditHomeSheet = true
                    }

                    PinnedPlaceRow(
                        label: "회사",
                        icon: "building.2.fill",
                        place: appState.workPlace
                    ) {
                        showEditWorkSheet = true
                    }
                } header: {
                    Text("자주 가는 곳")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.secondary)
                }

                // Other saved favorites
                if !favorites.isEmpty {
                    Section {
                        ForEach(favorites) { place in
                            FavoritePlaceRow(place: place)
                        }
                        .onDelete { indexSet in
                            favorites.remove(atOffsets: indexSet)
                        }
                    } header: {
                        Text("저장된 장소")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.secondary)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("즐겨찾기")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showAddFavorite = true
                    } label: {
                        Image(systemName: "plus")
                            .foregroundColor(TmapColor.primary)
                    }
                }
            }
        }
        .sheet(isPresented: $showEditHomeSheet) {
            QuickSearchSheet(onSelect: { result in
                showEditHomeSheet = false
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
        .sheet(isPresented: $showEditWorkSheet) {
            QuickSearchSheet(onSelect: { result in
                showEditWorkSheet = false
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
}

// MARK: - Pinned Place Row (집/회사)

struct PinnedPlaceRow: View {
    let label: String
    let icon: String
    let place: FavoritePlace?
    let onEdit: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(TmapColor.primary.opacity(0.1))
                    .frame(width: 42, height: 42)
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundColor(TmapColor.primary)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(.system(size: 15, weight: .semibold))
                if let place = place, place.latitude != 0 {
                    Text(place.address)
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                } else {
                    Text("주소를 설정하세요")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary.opacity(0.6))
                }
            }
            Spacer()
            Button(action: onEdit) {
                Image(systemName: "pencil")
                    .font(.system(size: 14))
                    .foregroundColor(TmapColor.primary)
                    .padding(8)
                    .background(TmapColor.primary.opacity(0.1))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
    }
}

struct FavoritePlaceRow: View {
    let place: FavoritePlace

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(TmapColor.primary.opacity(0.1))
                    .frame(width: 42, height: 42)
                Image(systemName: "mappin")
                    .font(.system(size: 18))
                    .foregroundColor(TmapColor.primary)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(place.name)
                    .font(.system(size: 15, weight: .semibold))
                Text(place.address)
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

struct EmptyFavoritesView: View {
    let onAdd: () -> Void
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "heart.slash")
                .font(.system(size: 56))
                .foregroundColor(.secondary.opacity(0.3))
            Text("즐겨찾기한 장소가 없어요")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.secondary)
            Text("자주 가는 장소를 저장해두면\n빠르게 길찾기를 시작할 수 있어요")
                .font(.system(size: 14))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            Button(action: onAdd) {
                Label("장소 추가", systemImage: "plus")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(TmapColor.primary)
                    .cornerRadius(12)
            }
        }
        .padding()
    }
}
