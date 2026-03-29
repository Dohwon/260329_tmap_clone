import SwiftUI
import MapKit

struct HomeMapView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var mapVM: MapViewModel
    @State private var showSearchBar: Bool = false
    @State private var searchQuery: String = ""
    @State private var showRoutePanel: Bool = false
    @State private var showNavigationMode: Bool = false

    var body: some View {
        ZStack(alignment: .top) {
            // MARK: - Map
            MapLayerView()
                .environmentObject(mapVM)
                .ignoresSafeArea()

            // MARK: - Navigation Overlay
            if showNavigationMode, let route = mapVM.selectedRoute {
                NavigationOverlayView(route: route) {
                    showNavigationMode = false
                    mapVM.selectedRoute = nil
                    mapVM.allRoutes = []
                    mapVM.disable3DMode()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            // MARK: - Top Search Bar (non-nav mode)
            if !showNavigationMode {
                VStack(spacing: 0) {
                    TmapSearchBar(query: $searchQuery, onTap: {
                        appState.selectedTab = .search
                    })
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                    Spacer()
                }
            }

            // MARK: - Right Floating Buttons
            if !showNavigationMode {
                HStack {
                    Spacer()
                    VStack(spacing: 12) {
                        Spacer()
                        MapFloatingButton(icon: "location.fill") {
                            mapVM.centerOnUser()
                        }
                        MapFloatingButton(icon: "camera.fill") {
                            mapVM.enable3DMode()
                        }
                        MapFloatingButton(icon: "map") {
                            // toggle map style
                        }
                    }
                    .padding(.trailing, 16)
                    .padding(.bottom, 160)
                }
            }

            // MARK: - Bottom Quick Panel
            if !showNavigationMode {
                VStack {
                    Spacer()
                    HomeBottomPanel(onDestinationSelected: { result in
                        Task {
                            await mapVM.startNavigation(to: result)
                            showRoutePanel = true
                        }
                    })
                    .padding(.bottom, 88)
                }
            }

            // MARK: - Route Preview Sheet
            if showRoutePanel, !mapVM.allRoutes.isEmpty {
                Color.black.opacity(0.001)
                    .ignoresSafeArea()
                    .onTapGesture { showRoutePanel = false }

                VStack {
                    Spacer()
                    RoutePreviewPanel(
                        routes: mapVM.allRoutes,
                        selectedRoute: $mapVM.selectedRoute,
                        onStart: {
                            showRoutePanel = false
                            showNavigationMode = true
                            mapVM.enable3DMode()
                        },
                        onCancel: {
                            showRoutePanel = false
                            mapVM.selectedRoute = nil
                            mapVM.allRoutes = []
                        }
                    )
                    .transition(.move(edge: .bottom))
                }
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: showRoutePanel)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: showNavigationMode)
    }
}
