import SwiftUI

struct FavoritesView: View {
    @State private var favorites: [FavoritePlace] = FavoritesView.mockFavorites()
    @State private var showAddFavorite: Bool = false

    var body: some View {
        NavigationStack {
            Group {
                if favorites.isEmpty {
                    EmptyFavoritesView(onAdd: { showAddFavorite = true })
                } else {
                    List {
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
                    .listStyle(.insetGrouped)
                }
            }
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
    }

    static func mockFavorites() -> [FavoritePlace] {
        [
            FavoritePlace(id: UUID(), name: "집", address: "서울시 강남구", latitude: 37.5170, longitude: 127.0473, isFavorite: true),
            FavoritePlace(id: UUID(), name: "회사", address: "서울시 중구 을지로", latitude: 37.5665, longitude: 126.9780, isFavorite: true),
        ]
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
                Image(systemName: place.name == "집" ? "house.fill" : "building.2.fill")
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
