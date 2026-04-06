import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var mapVM = MapViewModel()

    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $appState.selectedTab) {
                HomeMapView()
                    .environmentObject(mapVM)
                    .tag(AppState.TabItem.home)
                    .tabItem {
                        Label("홈", systemImage: "map.fill")
                    }

                SearchMainView()
                    .environmentObject(mapVM)
                    .environmentObject(appState)
                    .tag(AppState.TabItem.search)
                    .tabItem {
                        Label("검색", systemImage: "magnifyingglass")
                    }

                FavoritesView()
                    .environmentObject(appState)
                    .tag(AppState.TabItem.favorites)
                    .tabItem {
                        Label("즐겨찾기", systemImage: "heart.fill")
                    }

                MoreView()
                    .tag(AppState.TabItem.more)
                    .tabItem {
                        Label("더보기", systemImage: "ellipsis")
                    }
            }
            .tint(TmapColor.primary)
        }
        .ignoresSafeArea(edges: .bottom)
        .preferredColorScheme(appState.isNightMode ? .dark : .light)
    }
}
